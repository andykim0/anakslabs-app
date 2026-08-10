/**
 * [v4 #3a] 범용 URL 추출기 — 고객의 기존 홈페이지/블로그에서 텍스트·이미지 후보를 가져온다.
 *
 * 보안(SSRF 방어)이 핵심: http/https만, 사설·루프백·링크로컬 IP 거부(리터럴 + DNS resolve 결과),
 * 리다이렉트 매 hop 재검사(최대 3), 타임아웃 8초, 응답 2MB 상한, content-type text/html만.
 *
 * 순수 로직은 fetch/DNS 주입으로 네트워크 없이 테스트 가능(extractFromUrl opts).
 */
import { parse } from 'node-html-parser';
import { parseMenuItems } from '@/lib/data/content-parse';


/**
 * Read a phone number out of a `tel:` href.
 *
 * The href is a URI, so a space in the number is written `%20` and anything
 * else may be escaped too. Stripping the scheme without decoding puts the
 * escape sequence on screen — a claim card showed `+1%20773-…` for exactly
 * this reason. Decoding is wrapped because a malformed escape throws, and a
 * phone number is never worth failing an import over: fall back to the raw
 * text, which is what was displayed before and is no worse.
 */
export function normalizeTelHref(href: string | null | undefined): string | undefined {
  if (!href) return undefined;
  const raw = href.replace(/^tel:/i, '').trim();
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw).replace(/\s+/g, ' ').trim() || undefined;
  } catch {
    return raw;
  }
}

export interface StructuredImportFacts {
  businessName?: string;
  description?: string;
  phone?: string;
  address?: string;
  openingHours?: string;
  commercialPhrases: string[];
  contentItems: { name: string; price?: string }[];
}

export interface ExtractResult {
  sourceUrl: string;
  title?: string;
  description?: string;
  headings: string[];
  text: string;
  imageUrls: string[];
  structured: StructuredImportFacts;
}

export type ImportErrorCode =
  | 'INVALID_URL'
  | 'BLOCKED_SCHEME'
  | 'BLOCKED_HOST'
  | 'DNS_FAIL'
  | 'TOO_MANY_REDIRECTS'
  | 'FETCH_FAILED'
  | 'NOT_HTML'
  | 'NOT_IMAGE'
  | 'TOO_LARGE';

export class ImportError extends Error {
  constructor(public code: ImportErrorCode, message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

// ---------- SSRF 가드 (순수 함수 — 직접 테스트) ----------

/** IPv4 리터럴이 사설·루프백·링크로컬·CGNAT·멀티캐스트 등 차단 대상인가 */
export function isBlockedIpv4(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return false;
  const o = m.slice(1).map(Number);
  if (o.some((x) => x > 255)) return true; // 형식 오류 → 안전측 차단
  const [a, b] = o;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10/8 사설
  if (a === 127) return true; // 127/8 루프백
  if (a === 169 && b === 254) return true; // 169.254/16 링크로컬
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 사설
  if (a === 192 && b === 168) return true; // 192.168/16 사설
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a >= 224) return true; // 224+ 멀티캐스트/예약
  return false;
}

/** IPv6 리터럴이 루프백/미지정/유니크로컬(fc00::/7)/링크로컬(fe80::/10)인가 */
export function isBlockedIpv6(ip: string): boolean {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (s === '::1' || s === '::') return true;
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(s);
  if (mapped) return isBlockedIpv4(mapped[1]);
  const head = s.split(':')[0];
  if (/^f[cd]/.test(head)) return true; // fc00::/7
  if (/^fe[89ab]/.test(head)) return true; // fe80::/10
  return false;
}

export function isBlockedIp(ip: string): boolean {
  return ip.includes(':') ? isBlockedIpv6(ip) : isBlockedIpv4(ip);
}

function isIpLiteral(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
}

export type LookupFn = (hostname: string) => Promise<{ address: string }[]>;

async function defaultLookup(hostname: string): Promise<{ address: string }[]> {
  const dns = await import('node:dns');
  const all = await dns.promises.lookup(hostname, { all: true });
  return all.map((a) => ({ address: a.address }));
}

/** URL이 fetch 허용 대상인지 검사 — 위반 시 ImportError throw. IP 리터럴/DNS resolve 결과 모두 검사. */
export async function assertUrlAllowed(rawUrl: string, lookupFn: LookupFn = defaultLookup): Promise<URL> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new ImportError('INVALID_URL', 'Enter a valid URL.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new ImportError('BLOCKED_SCHEME', 'Only http and https URLs are supported.');
  }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isIpLiteral(host)) {
    if (isBlockedIp(host)) throw new ImportError('BLOCKED_HOST', 'This address cannot be accessed.');
    return u;
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookupFn(host);
  } catch {
    throw new ImportError('DNS_FAIL', 'The address could not be resolved.');
  }
  if (!addrs.length) throw new ImportError('DNS_FAIL', 'The address could not be resolved.');
  for (const a of addrs) {
    if (isBlockedIp(a.address)) throw new ImportError('BLOCKED_HOST', 'This address cannot be accessed.');
  }
  return u;
}

// ---------- HTML 파싱 (순수) ----------

const ICON_HINT = /(icon|logo|sprite|favicon|avatar|pixel|1x1|tracking|spacer|blank)/i;

/** 이미지가 콘텐츠 사진인지 (아이콘·로고·트래커·svg 제외) */
function isContentImage(src: string): boolean {
  if (!src) return false;
  if (/^data:/i.test(src)) return false;
  if (/\.svg(\?|$)/i.test(src)) return false;
  if (ICON_HINT.test(src)) return false;
  return true;
}

function jsonLdObjects(root: ReturnType<typeof parse>): Record<string, unknown>[] {
  const objects: Record<string, unknown>[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const object = value as Record<string, unknown>;
    objects.push(object);
    if (Array.isArray(object['@graph'])) object['@graph'].forEach(visit);
  };
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      visit(JSON.parse(script.text));
    } catch {
      // Invalid JSON-LD is ignored; visible text extraction remains available.
    }
  }
  return objects;
}

function schemaTypeIncludes(object: Record<string, unknown>, pattern: RegExp): boolean {
  const raw = object['@type'];
  const types = Array.isArray(raw) ? raw : [raw];
  return types.some((type) => typeof type === 'string' && pattern.test(type));
}

function schemaAddress(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (!value || typeof value !== 'object') return undefined;
  const address = value as Record<string, unknown>;
  const joined = ['streetAddress', 'addressLocality', 'addressRegion', 'postalCode']
    .map((key) => typeof address[key] === 'string' ? address[key].trim() : '')
    .filter(Boolean)
    .join(' ');
  return joined || undefined;
}

function schemaHours(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (Array.isArray(value)) {
    const rows = value.flatMap((item) => {
      if (typeof item === 'string') return item.trim() ? [item.trim()] : [];
      if (!item || typeof item !== 'object') return [];
      const row = item as Record<string, unknown>;
      const days = Array.isArray(row.dayOfWeek) ? row.dayOfWeek : [row.dayOfWeek];
      const dayText = days.filter((day): day is string => typeof day === 'string')
        .map((day) => day.replace(/^https?:\/\/schema\.org\//i, ''))
        .join(', ');
      const opens = typeof row.opens === 'string' ? row.opens : '';
      const closes = typeof row.closes === 'string' ? row.closes : '';
      const text = [dayText, opens && closes ? `${opens}-${closes}` : opens || closes].filter(Boolean).join(' ');
      return text ? [text] : [];
    });
    return rows.length ? rows.join(' · ') : undefined;
  }
  return undefined;
}

function shortVisibleBlock(root: ReturnType<typeof parse>, pattern: RegExp): string | undefined {
  const candidates = root.querySelectorAll('p, li, dd, address, span, div')
    .map((element) => element.text.replace(/\s+/g, ' ').trim())
    .filter((value) => value.length >= 3 && value.length <= 180 && pattern.test(value))
    .sort((a, b) => a.length - b.length);
  return candidates[0];
}

function structuredFacts(input: {
  root: ReturnType<typeof parse>;
  title?: string;
  description?: string;
  headings: string[];
  text: string;
}): StructuredImportFacts {
  const entities = jsonLdObjects(input.root);
  const business = entities.find((object) => schemaTypeIncludes(
    object,
    /(LocalBusiness|Organization|Store|Restaurant|Cafe|Medical|Beauty|ProfessionalService|EducationalOrganization)/i,
  ));
  const stringField = (key: string): string | undefined => {
    const value = business?.[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  };
  const phone = stringField('telephone')
    ?? normalizeTelHref(input.root.querySelector('a[href^="tel:"]')?.getAttribute('href'))
    ?? shortVisibleBlock(input.root, /(?:\uC804\uD654|\uBB38\uC758|\uC5F0\uB77D\uCC98)\s*[:\uFF1A]/u)?.replace(/^.*?(?:\uC804\uD654|\uBB38\uC758|\uC5F0\uB77D\uCC98)\s*[:\uFF1A]\s*/u, '').trim();
  const address = schemaAddress(business?.address)
    ?? input.root.querySelector('address')?.text.replace(/\s+/g, ' ').trim()
    ?? shortVisibleBlock(input.root, /(?:\uC8FC\uC18C|\uC624\uC2DC\uB294 \uAE38)\s*[:\uFF1A]/u)?.replace(/^.*?(?:\uC8FC\uC18C|\uC624\uC2DC\uB294 \uAE38)\s*[:\uFF1A]\s*/u, '').trim();
  const openingHours = schemaHours(business?.openingHoursSpecification)
    ?? schemaHours(business?.openingHours)
    ?? shortVisibleBlock(input.root, /(?:\uC601\uC5C5|\uC6B4\uC601|\uC9C4\uB8CC|\uC0C1\uB2F4)\s*\uC2DC\uAC04/u);
  const businessName = stringField('name')
    ?? input.root.querySelector('meta[property="og:site_name"]')?.getAttribute('content')?.trim()
    ?? input.title;
  const description = stringField('description') ?? input.description;
  const commercialPhrases = [description, ...input.headings]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim())
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 12);
  const menuSource = input.root.querySelectorAll('p, li, dd, td')
    .map((element) => element.text.replace(/\s+/g, ' ').trim())
    .filter((value) => /\d[\d,]{1,}\s*\uC6D0?~?$/u.test(value))
    .join('\n');
  return {
    ...(businessName ? { businessName } : {}),
    ...(description ? { description } : {}),
    ...(phone ? { phone } : {}),
    ...(address ? { address } : {}),
    ...(openingHours ? { openingHours } : {}),
    commercialPhrases,
    contentItems: parseMenuItems(menuSource).slice(0, 10).map((item) => ({
      name: item.name,
      ...(item.price ? { price: item.price } : {}),
    })),
  };
}

export function parseHtml(html: string, finalUrl: string): ExtractResult {
  const root = parse(html);
  const metaContent = (sel: string): string | undefined => {
    const el = root.querySelector(sel);
    const v = el?.getAttribute('content')?.trim();
    return v || undefined;
  };

  const title =
    metaContent('meta[property="og:title"]') ||
    root.querySelector('title')?.text.trim() ||
    undefined;
  const description =
    metaContent('meta[property="og:description"]') || metaContent('meta[name="description"]') || undefined;

  const headings = root
    .querySelectorAll('h1, h2, h3')
    .map((h) => h.text.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 30);

  // 가시 텍스트: 스크립트·스타일·노스크립트·템플릿 제거 후
  const clone = parse(root.toString());
  for (const el of clone.querySelectorAll('script, style, noscript, template')) el.remove();
  const text = clone.text.replace(/\s+/g, ' ').trim().slice(0, 8000);

  // 이미지: og:image 우선 + <img src> 절대경로화, 아이콘·트래커·svg 제외, 최대 12
  const abs = (src: string): string | null => {
    try {
      return new URL(src, finalUrl).toString();
    } catch {
      return null;
    }
  };
  const urls: string[] = [];
  const push = (src?: string | null) => {
    if (!src) return;
    const a = abs(src.trim());
    if (a && isContentImage(a) && !urls.includes(a)) urls.push(a);
  };
  push(metaContent('meta[property="og:image"]'));
  for (const img of root.querySelectorAll('img')) {
    if (urls.length >= 12) break;
    push(img.getAttribute('src') || img.getAttribute('data-src'));
  }

  return {
    sourceUrl: finalUrl,
    title,
    description,
    headings,
    text,
    imageUrls: urls.slice(0, 12),
    structured: structuredFacts({ root, title, description, headings, text }),
  };
}

// ---------- 추출 (fetch + 리다이렉트 SSRF 재검사) ----------

const UA = 'Mozilla/5.0 (compatible; AnaksLabsBot/1.0; +https://anakslabs.com)';

export interface ExtractOpts {
  fetchFn?: typeof fetch;
  lookupFn?: LookupFn;
  maxRedirects?: number;
  timeoutMs?: number;
  maxBytes?: number;
}

async function readLimited(res: Response, maxBytes: number): Promise<string> {
  const body = res.body as ReadableStream<Uint8Array> | null;
  if (!body) {
    const t = await res.text();
    if (t.length > maxBytes) throw new ImportError('TOO_LARGE', 'The page is too large.');
    return t;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ImportError('TOO_LARGE', 'The page is too large.');
      }
      chunks.push(value);
    }
  }
  return new TextDecoder().decode(concat(chunks));
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

/**
 * SSRF 가드 + 리다이렉트 매 hop 재검사 + 타임아웃 하에 fetch. body 미소비 Response 반환.
 * (extractFromUrl·ingestExternalImage 공용 — 리다이렉트 우회 SSRF를 둘 다 막는다)
 */
export async function safeFetch(
  rawUrl: string,
  opts: { fetchFn?: typeof fetch; lookupFn?: LookupFn; maxRedirects?: number; timeoutMs?: number; accept?: string } = {},
): Promise<{ res: Response; finalUrl: string }> {
  const fetchFn = opts.fetchFn ?? fetch;
  const lookupFn = opts.lookupFn ?? defaultLookup;
  const maxRedirects = opts.maxRedirects ?? 3;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const accept = opts.accept ?? 'text/html,application/xhtml+xml';

  let url = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await assertUrlAllowed(url, lookupFn); // 매 hop 재검사 (DNS rebinding·리다이렉트 우회 방어)
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchFn(url, { redirect: 'manual', signal: ctrl.signal, headers: { 'user-agent': UA, accept } });
    } catch {
      throw new ImportError('FETCH_FAILED', 'The address could not be loaded.');
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new ImportError('FETCH_FAILED', 'The address could not be loaded.');
      if (hop === maxRedirects) throw new ImportError('TOO_MANY_REDIRECTS', 'Too many redirects.');
      try {
        url = new URL(loc, url).toString();
      } catch {
        throw new ImportError('INVALID_URL', 'Enter a valid URL.');
      }
      continue;
    }
    if (!res.ok) throw new ImportError('FETCH_FAILED', 'The address could not be loaded.');
    return { res, finalUrl: url };
  }
  throw new ImportError('TOO_MANY_REDIRECTS', 'Too many redirects.');
}

/** URL 1개 → 추출 결과. SSRF 가드·리다이렉트 재검사·크기/타입/타임아웃 제한 적용. */
export async function extractFromUrl(rawUrl: string, opts: ExtractOpts = {}): Promise<ExtractResult> {
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024;
  const { res, finalUrl } = await safeFetch(rawUrl, opts);
  const ct = res.headers.get('content-type') ?? '';
  if (!/text\/html|application\/xhtml/i.test(ct)) {
    throw new ImportError('NOT_HTML', 'Only HTML pages can be imported.');
  }
  const html = await readLimited(res, maxBytes);
  return parseHtml(html, finalUrl);
}

/** [이미지 인입용] Response body를 maxBytes까지 읽어 바이트로 (스트리밍 상한). */
export async function readLimitedBytes(res: Response, maxBytes: number): Promise<Uint8Array> {
  const body = res.body as ReadableStream<Uint8Array> | null;
  if (!body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) throw new ImportError('TOO_LARGE', 'The file is too large.');
    return buf;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ImportError('TOO_LARGE', 'The file is too large.');
      }
      chunks.push(value);
    }
  }
  return concat(chunks);
}
