import { parse, type HTMLElement } from 'node-html-parser';
import { parseHtml } from '@/lib/import/extract';
import { isPathAllowed, parseRobotsTxt } from '@/lib/scan/robots';
import {
  APPROVED_TLS_HTTP_FALLBACK_HOSTS,
  CRAWL_ARTIFACT_SCHEMA_VERSION,
  DABOIM_CRAWLER_USER_AGENT,
  DESIGNATED_CRAWL_POLICY,
  type CrawlArtifactPayload,
  type CrawlAccessWarning,
  type CrawlConnectorCandidate,
  type CrawlImageCandidate,
  type CrawlImageRole,
  type CrawlPageAccessObservation,
  type CrawlPageArtifact,
  type CrawlPageFailure,
  type CrawlSkippedUrl,
  type CrawlTlsObservation,
} from './contracts';
import {
  buildAiVisibilitySnapshot,
  ruleContextFromServerHtml,
  summarizeAiVisibilitySnapshot,
} from '@/lib/scan/ai-visibility';
import {
  US_MEDICAL_OUTREACH_LOCALE,
  US_MEDICAL_OUTREACH_PROFILE_ID,
} from '@/lib/scan/profiles';
import {
  isAuthenticationWidget,
  safeSkippedUrl,
  unsafeCrawlUrlReason,
} from './safety';
import { evaluateDecayScore } from '@/lib/scan/decay';
import { extractVisibleText } from '@/lib/scan/document';
import { socialLinkUrls, type SocialLinkObservation } from '@/lib/scan/social-links';
import type { ProbedResource } from '@/lib/scan/fetch-target';
import {
  projectClinicPaletteFromHtml,
  type ClinicPaletteProjection,
} from '@/lib/clinic-master/palette-routing';

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
  'ERR_SSL_DH_KEY_TOO_SMALL',
  'DH_KEY_TOO_SMALL',
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
  | 'REDIRECT_LOOP'
  | 'RATE_LIMITED'
  | 'TLS_FALLBACK_NOT_APPROVED'
  | 'TLS_INSECURE_FETCH_UNAVAILABLE'
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
  /**
   * Never supplied by the production default. A caller must pair this explicit
   * transport with allowInvalidTlsCertificate=true for a single audited run.
   */
  invalidTlsFetchFn?: typeof fetch;
  validateUrl?: ValidateUrl;
  wait?: (milliseconds: number) => Promise<void>;
  now?: () => Date;
  /** Server-owned validation override; always capped by the production policy. */
  pageLimit?: number;
  probeSocialLinks?: (urls: readonly string[]) => Promise<SocialLinkObservation[]>;
  renderPage?: (input: {
    url: string;
    rawHtml: string;
  }) => Promise<{
    html: string;
    finalUrl?: string;
    observation: CrawlPageAccessObservation;
  }>;
}

interface FetchedDocument {
  response: Response;
  finalUrl: URL;
  ttfbMs: number;
}

interface TlsInspection {
  observation: CrawlTlsObservation;
  resolvedHttpsUrl?: URL;
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
  const visited = new Set<string>();
  for (let hop = 0; hop <= DESIGNATED_CRAWL_POLICY.maxRedirects; hop += 1) {
    const currentKey = current.toString();
    if (visited.has(currentKey)) {
      throw new CrawlError('REDIRECT_LOOP', '리다이렉트 순환을 감지해 중단했습니다.');
    }
    visited.add(currentKey);
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
): Promise<TlsInspection> {
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
      observation: {
        httpsUrl: httpsUrl.toString(),
        status: 'valid',
        httpFallbackApproved: hostApproved && input.allowTlsHttpFallback,
        httpFallbackUsed: false,
      },
      resolvedHttpsUrl: fetched.finalUrl,
    };
  } catch (error) {
    const code = certificateErrorCode(error);
    if (!code) {
      return {
        observation: {
          httpsUrl: httpsUrl.toString(),
          status: 'unavailable',
          ...(errorCode(error) ? { errorCode: errorCode(error) } : {}),
          httpFallbackApproved: false,
          httpFallbackUsed: false,
        },
      };
    }
    const approved = hostApproved && input.allowTlsHttpFallback;
    return {
      observation: {
        httpsUrl: httpsUrl.toString(),
        status: 'certificate_error',
        errorCode: code,
        httpFallbackApproved: approved,
        httpFallbackUsed: approved && seed.protocol === 'http:',
      },
    };
  }
}

function retryAfterMilliseconds(response: Response, now: Date): number {
  const raw = response.headers.get('retry-after')?.trim();
  if (!raw) return DESIGNATED_CRAWL_POLICY.minRequestIntervalMs;
  if (/^\d+$/u.test(raw)) return Number(raw) * 1_000;
  const retryAt = Date.parse(raw);
  return Number.isFinite(retryAt)
    ? Math.max(0, retryAt - now.getTime())
    : DESIGNATED_CRAWL_POLICY.minRequestIntervalMs;
}

function pageFailureCode(error: unknown): CrawlPageFailure['code'] {
  if (!(error instanceof CrawlError)) return 'fetch_failed';
  if (error.code === 'AUTH_REDIRECT') return 'auth_redirect';
  if (error.code === 'REDIRECT_LOOP') return 'redirect_loop';
  if (error.code === 'RATE_LIMITED') return 'rate_limited';
  if (error.code === 'TOO_LARGE') return 'too_large';
  return 'fetch_failed';
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

function connectorKind(
  url: URL,
  label: string,
): CrawlConnectorCandidate['kind'] | null {
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
  if (
    ['google.com', 'www.google.com', 'maps.google.com', 'maps.app.goo.gl'].includes(host)
    && (host === 'maps.app.goo.gl' || url.pathname.startsWith('/maps'))
  ) {
    return 'google_maps';
  }
  if (
    /\b(?:book|booking|appointment|schedule)\b/iu.test(
      `${label} ${url.pathname.replace(/[-_/]+/gu, ' ')}`,
    )
  ) {
    return 'us_booking';
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
    const label = anchor.text.trim().slice(0, 100);
    const kind = connectorKind(url, label);
    if (!kind || seen.has(url.toString())) continue;
    seen.add(url.toString());
    candidates.push({
      kind,
      url: url.toString(),
      ...(label ? { label } : {}),
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
  input: {
    url: string;
    allowTlsHttpFallback?: boolean;
    allowInvalidTlsCertificate?: boolean;
    scanProfileId?: typeof US_MEDICAL_OUTREACH_PROFILE_ID;
  },
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
  const requestedPageLimit = dependencies.pageLimit;
  const pageLimit = Number.isFinite(requestedPageLimit) && (requestedPageLimit ?? 0) > 0
    ? Math.min(DESIGNATED_CRAWL_POLICY.maxPages, Math.floor(requestedPageLimit!))
    : DESIGNATED_CRAWL_POLICY.maxPages;
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

  const tlsInspection = await inspectTls(seed, {
    fetchFn,
    validateUrl,
    allowTlsHttpFallback: input.allowTlsHttpFallback === true,
  });
  let tls = tlsInspection.observation;
  let crawlFetchFn = fetchFn;
  const accessWarnings: CrawlAccessWarning[] = [];
  if (
    tls.status === 'valid'
    && seed.protocol === 'http:'
    && tlsInspection.resolvedHttpsUrl
  ) {
    seed = new URL(tlsInspection.resolvedHttpsUrl.toString());
  }
  if (tls.status === 'certificate_error') {
    if (input.allowInvalidTlsCertificate === true) {
      if (!dependencies.invalidTlsFetchFn) {
        throw new CrawlError(
          'TLS_INSECURE_FETCH_UNAVAILABLE',
          '인증서 경고 진행이 명시됐지만 격리된 관대 전송기가 제공되지 않았습니다.',
        );
      }
      crawlFetchFn = dependencies.invalidTlsFetchFn;
      seed = new URL(tls.httpsUrl);
      tls = {
        ...tls,
        httpFallbackUsed: false,
        certificateWarningAccepted: true,
      };
      accessWarnings.push({
        code: 'tls_certificate_verification_bypassed',
        url: tls.httpsUrl,
        detail: tls.errorCode ?? 'certificate_error',
      });
    } else if (!tls.httpFallbackApproved) {
      throw new CrawlError('TLS_FALLBACK_NOT_APPROVED', '인증서 오류가 있어 승인된 HTTP 폴백 없이는 진행할 수 없습니다.');
    } else {
      if (seed.protocol === 'https:') {
        seed.protocol = 'http:';
        seed.port = '';
      }
      tls.httpFallbackUsed = true;
    }
  }

  let lastRequestAt = Date.now();
  const throttledFetch = async (
    url: string,
    options: Omit<Parameters<typeof fetchWithRedirects>[1], 'fetchFn' | 'validateUrl'>,
  ) => {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const elapsed = Date.now() - lastRequestAt;
      if (lastRequestAt > 0 && elapsed < DESIGNATED_CRAWL_POLICY.minRequestIntervalMs) {
        await wait(DESIGNATED_CRAWL_POLICY.minRequestIntervalMs - elapsed);
      }
      const result = await fetchWithRedirects(url, {
        ...options,
        fetchFn: crawlFetchFn,
        validateUrl,
      });
      lastRequestAt = Date.now();
      if (result.response.status !== 403 && result.response.status !== 429) return result;
      const delay = retryAfterMilliseconds(result.response, now());
      await result.response.body?.cancel().catch(() => undefined);
      if (attempt === 2 || delay > DESIGNATED_CRAWL_POLICY.maxRateLimitRetryDelayMs) {
        throw new CrawlError(
          'RATE_LIMITED',
          delay > DESIGNATED_CRAWL_POLICY.maxRateLimitRetryDelayMs
            ? '서버 재시도 유예가 안전 상한을 넘어 다음 사이트로 진행합니다.'
            : '접근 제한 응답이 재시도 뒤에도 유지됐습니다.',
        );
      }
      await wait(Math.max(DESIGNATED_CRAWL_POLICY.minRequestIntervalMs, delay));
    }
    throw new CrawlError('RATE_LIMITED', '접근 제한 응답이 유지됐습니다.');
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
  const robotsStatus = robotsFetch.response.status;
  let robotsBody = '';
  if (robotsStatus === 404 || robotsStatus === 410) {
    // RFC 9309 §2.3.1.2: robots.txt 부재(404/410) = 제한 없음. 표준 크롤러(구글봇 포함)와 동일하게
    // 빈 robots 로 진행한다. 5xx·타임아웃·기타 상태는 아래에서 기존대로 보수 중단.
    await robotsFetch.response.body?.cancel().catch(() => undefined);
  } else if (robotsStatus < 200 || robotsStatus >= 300) {
    await robotsFetch.response.body?.cancel().catch(() => undefined);
    throw new CrawlError('ROBOTS_UNAVAILABLE', 'robots.txt가 정상 응답하지 않아 보수적으로 중단했습니다.');
  } else {
    robotsBody = await readLimited(robotsFetch.response);
    if (/text\/html/iu.test(robotsFetch.response.headers.get('content-type') ?? '')) {
      throw new CrawlError('ROBOTS_UNAVAILABLE', 'robots.txt 대신 HTML이 응답해 보수적으로 중단했습니다.');
    }
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
  const pageFailures: CrawlPageFailure[] = [];
  let clinicPaletteProjection: ClinicPaletteProjection | null = null;
  const skippedUrls: CrawlSkippedUrl[] = [];
  const skippedKeys = new Set<string>();
  const addSkipped = (item: CrawlSkippedUrl) => {
    const key = `${item.reason}:${item.url}`;
    if (skippedKeys.has(key)) return;
    skippedKeys.add(key);
    skippedUrls.push(item);
  };
  const visited = new Set<string>();
  while (queue.length > 0 && pages.length < pageLimit) {
    const next = queue.shift()!;
    if (visited.has(next)) continue;
    const nextUrl = new URL(next);
    const unsafeReason = unsafeCrawlUrlReason(nextUrl);
    if (unsafeReason) {
      addSkipped({ url: safeSkippedUrl(nextUrl), reason: unsafeReason });
      visited.add(next);
      continue;
    }
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
      pageFailures.push({
        url: next,
        stage: 'access',
        code: pageFailureCode(error),
        attempts: error instanceof CrawlError && error.code === 'RATE_LIMITED' ? 2 : 1,
      });
      visited.add(next);
      continue;
    }
    visited.add(next);
    if (!fetched.response.ok) {
      pageFailures.push({
        url: fetched.finalUrl.toString(),
        stage: 'access',
        code: 'http_error',
        status: fetched.response.status,
        attempts: 1,
      });
      await fetched.response.body?.cancel().catch(() => undefined);
      continue;
    }
    const contentType = fetched.response.headers.get('content-type') ?? '';
    if (!/(?:text\/html|application\/xhtml\+xml)/iu.test(contentType)) {
      pageFailures.push({
        url: fetched.finalUrl.toString(),
        stage: 'access',
        code: 'not_html',
        status: fetched.response.status,
        attempts: 1,
      });
      await fetched.response.body?.cancel().catch(() => undefined);
      continue;
    }
    let html: string;
    try {
      html = await readLimited(fetched.response);
    } catch (error) {
      pageFailures.push({
        url: fetched.finalUrl.toString(),
        stage: 'access',
        code: pageFailureCode(error),
        status: fetched.response.status,
        attempts: 1,
      });
      continue;
    }
    let accessObservation: CrawlPageAccessObservation | undefined;
    if (dependencies.renderPage) {
      try {
        const rendered = await dependencies.renderPage({
          url: fetched.finalUrl.toString(),
          rawHtml: html,
        });
        if (rendered.finalUrl) {
          const renderedUrl = await validateUrl(rendered.finalUrl);
          if (renderedUrl.origin !== origin) {
            throw new CrawlError(
              'CROSS_ORIGIN_REDIRECT',
              '브라우저 렌더가 지정한 사이트 밖으로 이동했습니다.',
            );
          }
          fetched.finalUrl = renderedUrl;
        }
        html = rendered.html;
        accessObservation = rendered.observation;
      } catch (error) {
        pageFailures.push({
          url: fetched.finalUrl.toString(),
          stage: 'access',
          code: 'render_failed',
          status: fetched.response.status,
          attempts: 2,
          detail: (error instanceof Error ? error.message : String(error)).slice(0, 500),
        });
      }
    }
    if (input.scanProfileId === US_MEDICAL_OUTREACH_PROFILE_ID) {
      const candidate = projectClinicPaletteFromHtml(html);
      if (
        candidate
        && (
          !clinicPaletteProjection
          || (candidate.kind === 'logo' && clinicPaletteProjection.kind === 'css')
        )
      ) {
        clinicPaletteProjection = candidate;
      }
    }
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
    const aiVisibilitySummary = input.scanProfileId === US_MEDICAL_OUTREACH_PROFILE_ID
      ? summarizeAiVisibilitySnapshot(buildAiVisibilitySnapshot(
          ruleContextFromServerHtml({
            html,
            url: fetched.finalUrl.toString(),
            source: 'source-html',
            locale: US_MEDICAL_OUTREACH_LOCALE,
            status: fetched.response.status,
            contentType,
            xRobotsTag: fetched.response.headers.get('x-robots-tag') ?? '',
            ttfbMs: fetched.ttfbMs,
            robotsBody,
          }),
          'source-html',
        ))
      : undefined;
    pages.push({
      ...projected.page,
      ...(aiVisibilitySummary ? { aiVisibilitySummary } : {}),
      ...(accessObservation ? { accessObservation } : {}),
      decay,
    });
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
    ...(input.scanProfileId ? { scanProfileId: input.scanProfileId } : {}),
    ...(clinicPaletteProjection ? { clinicPaletteProjection } : {}),
    tls,
    robots: {
      url: robotsFetch.finalUrl.toString(),
      status: robotsFetch.response.status,
      sitemaps: declaredSitemaps.map((url) => url.toString()),
      crawlerAllowed,
    },
    pages,
    skippedUrls,
    ...(pageFailures.length > 0 ? { pageFailures } : {}),
    ...(accessWarnings.length > 0 ? { accessWarnings } : {}),
    stoppedReason: pages.length >= pageLimit ? 'page_limit' : 'queue_exhausted',
  };
}
