import { parse, type HTMLElement } from 'node-html-parser';
import { parseHtml } from '@/lib/import/extract';
import { isPathAllowed, parseRobotsTxt } from '@/lib/scan/robots';
import {
  APPROVED_TLS_HTTP_FALLBACK_HOSTS,
  CRAWL_ARTIFACT_SCHEMA_VERSION,
  DABOIM_CRAWLER_USER_AGENT,
  DESIGNATED_CRAWL_POLICY,
  type CrawlArtifactPayload,
  type CrawlConnectorCandidate,
  type CrawlImageCandidate,
  type CrawlImageRole,
  type CrawlPageArtifact,
  type CrawlSkippedUrl,
  type CrawlTlsObservation,
} from './contracts';
import {
  isAuthenticationWidget,
  safeSkippedUrl,
  unsafeCrawlUrlReason,
} from './safety';
import { evaluateDecayScore } from '@/lib/scan/decay';
import { extractVisibleText } from '@/lib/scan/document';
import { socialLinkUrls, type SocialLinkObservation } from '@/lib/scan/social-links';
import type { ProbedResource } from '@/lib/scan/fetch-target';

const PLATFORM_MULTI_PAGE_HOSTS = new Set([
  'blog.naver.com',
  'm.blog.naver.com',
  'map.naver.com',
  'm.place.naver.com',
  'place.naver.com',
  'instagram.com',
  'www.instagram.com',
]);

const CERTIFICATE_ERROR_CODES = new Set([
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]);

export type CrawlErrorCode =
  | 'INVALID_URL'
  | 'PLATFORM_HOST_BLOCKED'
  | 'ROBOTS_UNAVAILABLE'
  | 'ROBOTS_BLOCKED'
  | 'FETCH_FAILED'
  | 'NOT_HTML'
  | 'TOO_LARGE'
  | 'CROSS_ORIGIN_REDIRECT'
  | 'TLS_FALLBACK_NOT_APPROVED'
  | 'UNSAFE_URL'
  | 'AUTH_REDIRECT';

export class CrawlError extends Error {
  constructor(public code: CrawlErrorCode, message: string) {
    super(message);
    this.name = 'CrawlError';
  }
}

type ValidateUrl = (url: string) => Promise<URL>;

export interface CrawlDependencies {
  fetchFn?: typeof fetch;
  validateUrl?: ValidateUrl;
  wait?: (milliseconds: number) => Promise<void>;
  now?: () => Date;
  probeSocialLinks?: (urls: readonly string[]) => Promise<SocialLinkObservation[]>;
}

interface FetchedDocument {
  response: Response;
  finalUrl: URL;
  ttfbMs: number;
}

function normalizedHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/u, '');
}

function normalizeCandidate(raw: string, base?: URL): URL | null {
  try {
    const url = base ? new URL(raw, base) : new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function errorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth += 1) {
    const record = current as { code?: unknown; cause?: unknown };
    if (typeof record.code === 'string') return record.code;
    current = record.cause;
  }
  return undefined;
}

function certificateErrorCode(error: unknown): string | undefined {
  const code = errorCode(error);
  return code && CERTIFICATE_ERROR_CODES.has(code) ? code : undefined;
}

async function fetchWithRedirects(
  rawUrl: string,
  input: {
    fetchFn: typeof fetch;
    validateUrl: ValidateUrl;
    accept: string;
    method?: 'GET' | 'HEAD';
    requiredOrigin?: string;
  },
): Promise<FetchedDocument> {
  let current = await input.validateUrl(rawUrl);
  let responseMs = 0;
  for (let hop = 0; hop <= DESIGNATED_CRAWL_POLICY.maxRedirects; hop += 1) {
    if (input.requiredOrigin && current.origin !== input.requiredOrigin) {
      throw new CrawlError('CROSS_ORIGIN_REDIRECT', '지정한 사이트 밖으로 이동해 크롤을 중단했습니다.');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DESIGNATED_CRAWL_POLICY.requestTimeoutMs);
    let response: Response;
    try {
      const startedAt = performance.now();
      response = await input.fetchFn(current.toString(), {
        method: input.method ?? 'GET',
        redirect: 'manual',
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'user-agent': DABOIM_CRAWLER_USER_AGENT,
          accept: input.accept,
        },
      });
      responseMs += performance.now() - startedAt;
    } finally {
      clearTimeout(timeout);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => undefined);
      if (!location || hop === DESIGNATED_CRAWL_POLICY.maxRedirects) {
        throw new CrawlError('FETCH_FAILED', '리다이렉트 응답을 확인할 수 없습니다.');
      }
      const target = new URL(location, current);
      if (unsafeCrawlUrlReason(target) === 'auth_or_account') {
        throw new CrawlError('AUTH_REDIRECT', '회원 전용 로그인 경로로 이동해 더 따라가지 않았습니다.');
      }
      current = await input.validateUrl(target.toString());
      continue;
    }
    return { response, finalUrl: current, ttfbMs: Math.round(responseMs) };
  }
  throw new CrawlError('FETCH_FAILED', '리다이렉트가 너무 많습니다.');
}

async function readLimited(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > DESIGNATED_CRAWL_POLICY.maxHtmlBytes) {
      await reader.cancel().catch(() => undefined);
      throw new CrawlError('TOO_LARGE', '페이지가 크기 제한을 넘었습니다.');
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(joined);
}

async function inspectTls(
  seed: URL,
  input: {
    fetchFn: typeof fetch;
    validateUrl: ValidateUrl;
    allowTlsHttpFallback: boolean;
  },
): Promise<CrawlTlsObservation> {
  const httpsUrl = new URL(seed.toString());
  httpsUrl.protocol = 'https:';
  httpsUrl.port = '';
  const hostApproved = APPROVED_TLS_HTTP_FALLBACK_HOSTS.has(normalizedHost(seed.hostname));
  try {
    const fetched = await fetchWithRedirects(httpsUrl.toString(), {
      fetchFn: input.fetchFn,
      validateUrl: input.validateUrl,
      accept: 'text/html,application/xhtml+xml',
      method: 'HEAD',
    });
    await fetched.response.body?.cancel().catch(() => undefined);
    return {
      httpsUrl: httpsUrl.toString(),
      status: 'valid',
      httpFallbackApproved: hostApproved && input.allowTlsHttpFallback,
      httpFallbackUsed: false,
    };
  } catch (error) {
    const code = certificateErrorCode(error);
    if (!code) {
      return {
        httpsUrl: httpsUrl.toString(),
        status: 'unavailable',
        ...(errorCode(error) ? { errorCode: errorCode(error) } : {}),
        httpFallbackApproved: false,
        httpFallbackUsed: false,
      };
    }
    const approved = hostApproved && input.allowTlsHttpFallback;
    return {
      httpsUrl: httpsUrl.toString(),
      status: 'certificate_error',
      errorCode: code,
      httpFallbackApproved: approved,
      httpFallbackUsed: approved && seed.protocol === 'http:',
    };
  }
}

function imageRole(element: HTMLElement): CrawlImageRole {
  const parent = element.parentNode;
  const parentElement = parent && typeof (parent as HTMLElement).getAttribute === 'function'
    ? parent as HTMLElement
    : null;
  const context = [
    element.getAttribute('class'),
    element.getAttribute('id'),
    parentElement?.getAttribute('class'),
    parentElement?.getAttribute('id'),
  ].filter(Boolean).join(' ');
  if (/(hero|visual|banner|background|main.?image|kv\b)/iu.test(context)) return 'atmosphere';
  if (/(product|portfolio|gallery|menu|work|team|profile|staff|item)/iu.test(context)) return 'figure';
  return 'unknown';
}

function positiveInteger(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function pageImages(root: HTMLElement, pageUrl: URL): CrawlImageCandidate[] {
  const images: CrawlImageCandidate[] = [];
  const seen = new Set<string>();
  const add = (element: HTMLElement, raw: string | undefined, role?: CrawlImageRole) => {
    if (!raw || images.length >= 40) return;
    const url = normalizeCandidate(raw, pageUrl);
    if (!url || seen.has(url.toString()) || /\.svg(?:$|\?)/iu.test(url.pathname)) return;
    seen.add(url.toString());
    const width = positiveInteger(element.getAttribute('width'));
    const height = positiveInteger(element.getAttribute('height'));
    images.push({
      url: url.toString(),
      alt: (element.getAttribute('alt') ?? '').trim().slice(0, 300),
      role: role ?? imageRole(element),
      ...(width ? { declaredWidth: width } : {}),
      ...(height ? { declaredHeight: height } : {}),
    });
  };
  const ogImage = root.querySelector('meta[property="og:image"]');
  if (ogImage) add(ogImage, ogImage.getAttribute('content'), 'atmosphere');
  for (const image of root.querySelectorAll('img')) {
    add(image, image.getAttribute('src') || image.getAttribute('data-src'));
  }
  return images;
}

function connectorKind(url: URL): CrawlConnectorCandidate['kind'] | null {
  const host = normalizedHost(url.hostname);
  if (host === 'map.naver.com' || host === 'm.place.naver.com' || host === 'place.naver.com') {
    return 'naver_map';
  }
  if (host === 'booking.naver.com') return 'naver_booking';
  if (host === 'pf.kakao.com') return 'kakao_channel';
  if (host === 'instagram.com' || host === 'www.instagram.com') return 'instagram';
  if (['facebook.com', 'www.facebook.com', 'youtube.com', 'www.youtube.com', 'x.com'].includes(host)) {
    return 'other_social';
  }
  return null;
}

function pageConnectors(root: HTMLElement, pageUrl: URL): CrawlConnectorCandidate[] {
  const candidates: CrawlConnectorCandidate[] = [];
  const seen = new Set<string>();
  for (const anchor of root.querySelectorAll('a[href]')) {
    const raw = anchor.getAttribute('href')?.trim();
    if (!raw) continue;
    if (/^tel:/iu.test(raw)) {
      const normalized = raw.slice(0, 200);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        candidates.push({ kind: 'tel', url: normalized, label: anchor.text.trim().slice(0, 100) || undefined });
      }
      continue;
    }
    const url = normalizeCandidate(raw, pageUrl);
    if (!url) continue;
    const kind = connectorKind(url);
    if (!kind || seen.has(url.toString())) continue;
    seen.add(url.toString());
    candidates.push({
      kind,
      url: url.toString(),
      ...(anchor.text.trim() ? { label: anchor.text.trim().slice(0, 100) } : {}),
    });
    if (candidates.length >= 20) break;
  }
  return candidates;
}

function internalLinks(
  root: HTMLElement,
  pageUrl: URL,
  origin: string,
): { links: string[]; skipped: CrawlSkippedUrl[] } {
  const links: string[] = [];
  const skipped: CrawlSkippedUrl[] = [];
  const seen = new Set<string>();
  for (const anchor of root.querySelectorAll('a[href]')) {
    const url = normalizeCandidate(anchor.getAttribute('href') ?? '', pageUrl);
    if (!url || url.origin !== origin || seen.has(url.toString())) continue;
    const unsafeReason = unsafeCrawlUrlReason(url);
    if (unsafeReason) {
      skipped.push({ url: safeSkippedUrl(url), reason: unsafeReason });
      continue;
    }
    if (/\.(?:avif|css|gif|ico|jpe?g|js|json|mp4|pdf|png|svg|webm|webp|xml)$/iu.test(url.pathname)) continue;
    seen.add(url.toString());
    links.push(url.toString());
  }
  return { links, skipped };
}

function removeFormsAndAuthenticationUi(root: HTMLElement): void {
  for (const element of root.querySelectorAll('form, [class], [id], a[href]')) {
    if (isAuthenticationWidget({
      tagName: element.tagName,
      className: element.getAttribute('class'),
      id: element.getAttribute('id'),
      href: element.getAttribute('href'),
    })) {
      element.remove();
    }
  }
}

function pageArtifact(html: string, fetched: FetchedDocument): {
  page: Omit<CrawlPageArtifact, 'decay'>;
  links: string[];
  skipped: CrawlSkippedUrl[];
} {
  const root = parse(html);
  const links = internalLinks(root, fetched.finalUrl, fetched.finalUrl.origin);
  removeFormsAndAuthenticationUi(root);
  const extracted = parseHtml(root.toString(), fetched.finalUrl.toString());
  return {
    page: {
      url: fetched.finalUrl.toString(),
      status: fetched.response.status,
      contentType: fetched.response.headers.get('content-type') ?? '',
      ...(fetched.response.headers.get('last-modified')
        ? { lastModified: fetched.response.headers.get('last-modified') ?? undefined }
        : {}),
      ...(extracted.title ? { title: extracted.title } : {}),
      ...(extracted.description ? { description: extracted.description } : {}),
      headings: extracted.headings,
      text: extracted.text,
      structured: extracted.structured,
      images: pageImages(root, fetched.finalUrl),
      connectors: pageConnectors(root, fetched.finalUrl),
    },
    links: links.links,
    skipped: links.skipped,
  };
}

function sitemapLocations(xml: string, origin: string): string[] {
  const urls: string[] = [];
  const pattern = /<loc>\s*([^<]+?)\s*<\/loc>/giu;
  for (const match of xml.matchAll(pattern)) {
    const url = normalizeCandidate(match[1]);
    if (!url || url.origin !== origin || urls.includes(url.toString())) continue;
    urls.push(url.toString());
    if (urls.length >= DESIGNATED_CRAWL_POLICY.maxPages) break;
  }
  return urls;
}

/**
 * Admin-designated, same-origin crawl. HTML exists in memory only; the returned
 * artifact stores bounded text and metadata, never raw HTML, response cookies,
 * request IP/user-agent, or image bytes.
 */
export async function crawlDesignatedSite(
  input: { url: string; allowTlsHttpFallback?: boolean },
  dependencies: CrawlDependencies = {},
): Promise<CrawlArtifactPayload> {
  const fetchFn = dependencies.fetchFn ?? fetch;
  const validateUrl = dependencies.validateUrl;
  if (!validateUrl) {
    throw new Error('crawlDesignatedSite requires a server-owned public URL validator');
  }
  const wait = dependencies.wait ?? ((milliseconds: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  }));
  const now = dependencies.now ?? (() => new Date());
  const observedAt = now().toISOString();

  let seed: URL;
  try {
    seed = await validateUrl(input.url);
  } catch {
    throw new CrawlError('INVALID_URL', '공개 HTTP 주소를 확인할 수 없습니다.');
  }
  seed.hash = '';
  if (unsafeCrawlUrlReason(seed)) {
    throw new CrawlError('UNSAFE_URL', '로그인·계정 또는 상태 변경 주소는 수집하지 않습니다.');
  }
  const host = normalizedHost(seed.hostname);
  if (PLATFORM_MULTI_PAGE_HOSTS.has(host)) {
    throw new CrawlError('PLATFORM_HOST_BLOCKED', '플랫폼 페이지는 다페이지 수집 대상이 아닙니다.');
  }

  const tls = await inspectTls(seed, {
    fetchFn,
    validateUrl,
    allowTlsHttpFallback: input.allowTlsHttpFallback === true,
  });
  if (tls.status === 'certificate_error') {
    if (!tls.httpFallbackApproved) {
      throw new CrawlError('TLS_FALLBACK_NOT_APPROVED', '인증서 오류가 있어 승인된 HTTP 폴백 없이는 진행할 수 없습니다.');
    }
    if (seed.protocol === 'https:') {
      seed.protocol = 'http:';
      seed.port = '';
    }
    tls.httpFallbackUsed = true;
  }

  let lastRequestAt = Date.now();
  const throttledFetch = async (
    url: string,
    options: Omit<Parameters<typeof fetchWithRedirects>[1], 'fetchFn' | 'validateUrl'>,
  ) => {
    const elapsed = Date.now() - lastRequestAt;
    if (lastRequestAt > 0 && elapsed < DESIGNATED_CRAWL_POLICY.minRequestIntervalMs) {
      await wait(DESIGNATED_CRAWL_POLICY.minRequestIntervalMs - elapsed);
    }
    const result = await fetchWithRedirects(url, { ...options, fetchFn, validateUrl });
    lastRequestAt = Date.now();
    return result;
  };

  const origin = seed.origin;
  let robotsFetch: FetchedDocument;
  try {
    robotsFetch = await throttledFetch(new URL('/robots.txt', origin).toString(), {
      accept: 'text/plain',
      requiredOrigin: origin,
    });
  } catch {
    throw new CrawlError('ROBOTS_UNAVAILABLE', 'robots.txt를 확인할 수 없어 보수적으로 중단했습니다.');
  }
  if (robotsFetch.response.status < 200 || robotsFetch.response.status >= 300) {
    await robotsFetch.response.body?.cancel().catch(() => undefined);
    throw new CrawlError('ROBOTS_UNAVAILABLE', 'robots.txt가 정상 응답하지 않아 보수적으로 중단했습니다.');
  }
  const robotsBody = await readLimited(robotsFetch.response);
  if (/text\/html/iu.test(robotsFetch.response.headers.get('content-type') ?? '')) {
    throw new CrawlError('ROBOTS_UNAVAILABLE', 'robots.txt 대신 HTML이 응답해 보수적으로 중단했습니다.');
  }
  const parsedRobots = parseRobotsTxt(robotsBody);
  const crawlerAllowed = isPathAllowed(
    parsedRobots,
    'DaboimCrawler',
    `${seed.pathname}${seed.search}`,
  );
  if (!crawlerAllowed) {
    throw new CrawlError('ROBOTS_BLOCKED', 'robots.txt가 지정 URL 수집을 허용하지 않습니다.');
  }

  const queue: string[] = [seed.toString()];
  const queued = new Set(queue);
  const declaredSitemaps = (parsedRobots.sitemaps.length > 0
    ? parsedRobots.sitemaps
    : [new URL('/sitemap.xml', origin).toString()])
    .map((url) => normalizeCandidate(url))
    .filter((url): url is URL => Boolean(url && url.origin === origin))
    .slice(0, DESIGNATED_CRAWL_POLICY.maxSitemaps);
  let sitemapProbe: ProbedResource = {
    url: declaredSitemaps[0]?.toString() ?? new URL('/sitemap.xml', origin).toString(),
    status: null,
    ok: false,
    body: '',
    contentType: '',
    truncated: false,
  };
  for (const sitemap of declaredSitemaps) {
    try {
      const fetched = await throttledFetch(sitemap.toString(), {
        accept: 'application/xml,text/xml,text/plain',
        requiredOrigin: origin,
      });
      if (fetched.response.ok) {
        const body = await readLimited(fetched.response);
        sitemapProbe = {
          url: fetched.finalUrl.toString(),
          status: fetched.response.status,
          ok: true,
          body,
          contentType: fetched.response.headers.get('content-type') ?? '',
          truncated: false,
        };
        for (const url of sitemapLocations(body, origin)) {
          if (!queued.has(url)) {
            queued.add(url);
            queue.push(url);
          }
        }
      } else {
        sitemapProbe = {
          url: fetched.finalUrl.toString(),
          status: fetched.response.status,
          ok: false,
          body: '',
          contentType: fetched.response.headers.get('content-type') ?? '',
          truncated: false,
        };
        await fetched.response.body?.cancel().catch(() => undefined);
      }
    } catch {
      // A sitemap is discovery help, not permission. robots already granted access.
    }
  }

  const pages: CrawlPageArtifact[] = [];
  const skippedUrls: CrawlSkippedUrl[] = [];
  const skippedKeys = new Set<string>();
  const addSkipped = (item: CrawlSkippedUrl) => {
    const key = `${item.reason}:${item.url}`;
    if (skippedKeys.has(key)) return;
    skippedKeys.add(key);
    skippedUrls.push(item);
  };
  const visited = new Set<string>();
  while (queue.length > 0 && pages.length < DESIGNATED_CRAWL_POLICY.maxPages) {
    const next = queue.shift()!;
    if (visited.has(next)) continue;
    const nextUrl = new URL(next);
    if (!isPathAllowed(parsedRobots, 'DaboimCrawler', `${nextUrl.pathname}${nextUrl.search}`)) {
      visited.add(next);
      continue;
    }
    let fetched: FetchedDocument;
    try {
      fetched = await throttledFetch(next, {
        accept: 'text/html,application/xhtml+xml',
        requiredOrigin: origin,
      });
    } catch (error) {
      if (error instanceof CrawlError && error.code === 'AUTH_REDIRECT') {
        addSkipped({ url: safeSkippedUrl(nextUrl), reason: 'auth_redirect' });
        visited.add(next);
        continue;
      }
      throw new CrawlError('FETCH_FAILED', '페이지 응답을 확인할 수 없어 보수적으로 중단했습니다.');
    }
    visited.add(next);
    if (!fetched.response.ok) {
      await fetched.response.body?.cancel().catch(() => undefined);
      throw new CrawlError('FETCH_FAILED', '페이지가 오류 상태를 반환해 보수적으로 중단했습니다.');
    }
    const contentType = fetched.response.headers.get('content-type') ?? '';
    if (!/(?:text\/html|application\/xhtml\+xml)/iu.test(contentType)) {
      await fetched.response.body?.cancel().catch(() => undefined);
      continue;
    }
    const html = await readLimited(fetched.response);
    const projected = pageArtifact(html, fetched);
    const root = parse(html);
    const socialLinks = dependencies.probeSocialLinks
      ? await dependencies.probeSocialLinks(socialLinkUrls(root, fetched.finalUrl))
      : [];
    const decay = evaluateDecayScore({
      root,
      rawHtml: html,
      visibleText: extractVisibleText(root),
      url: fetched.finalUrl,
      status: fetched.response.status,
      contentType,
      xRobotsTag: fetched.response.headers.get('x-robots-tag') ?? '',
      truncated: false,
      ttfbMs: fetched.ttfbMs,
      robots: {
        url: robotsFetch.finalUrl.toString(),
        status: robotsFetch.response.status,
        ok: true,
        body: robotsBody,
        contentType: robotsFetch.response.headers.get('content-type') ?? '',
        truncated: false,
      },
      sitemap: sitemapProbe,
      observedAt,
      lastModified: fetched.response.headers.get('last-modified') ?? '',
      socialLinks,
    });
    pages.push({ ...projected.page, decay });
    projected.skipped.forEach(addSkipped);
    for (const link of projected.links) {
      if (visited.has(link) || queued.has(link)) continue;
      queued.add(link);
      queue.push(link);
    }
  }

  if (pages.length === 0) {
    throw new CrawlError('NOT_HTML', '수집 가능한 HTML 페이지를 찾지 못했습니다.');
  }
  return {
    schemaVersion: CRAWL_ARTIFACT_SCHEMA_VERSION,
    seedUrl: input.url,
    finalOrigin: origin,
    observedAt,
    tls,
    robots: {
      url: robotsFetch.finalUrl.toString(),
      status: robotsFetch.response.status,
      sitemaps: declaredSitemaps.map((url) => url.toString()),
      crawlerAllowed,
    },
    pages,
    skippedUrls,
    stoppedReason: pages.length >= DESIGNATED_CRAWL_POLICY.maxPages ? 'page_limit' : 'queue_exhausted',
  };
}
