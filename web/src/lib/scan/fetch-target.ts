/**
 * [v3 Phase 6] 스캔 대상 fetch — URL 정규화 + SSRF 방어 + 제한된 다운로드.
 *  - 전체 5s 타임아웃, 본문 1MB 캡(스트림 절단), redirect 최대 3회
 *  - redirect 각 hop마다 assertPublicHttpUrl 재검증 (사설망 우회 차단)
 *  - SSRF 검증 시간을 제외한 TTFB 2회 측정 중 빠른 값 — 참고 SEO 지표용
 */
import 'server-only';
import { assertPublicHttpUrl, ScanError } from './ssrf';
import { retryTransientProbe } from './probe-retry';
import { fastestTtfb } from './ttfb';

const TIMEOUT_MS = 5_000;
const MAX_BYTES = 1_000_000; // 1MB
const AUX_MAX_BYTES = 256_000;
const MAX_REDIRECTS = 3;
const UA = 'Mozilla/5.0 (compatible; AnaksScan/1.0; +https://anakslabs.com)';

export interface FetchedTarget {
  /** redirect 추적 후 최종 URL */
  finalUrl: URL;
  status: number;
  html: string;
  /** 응답 헤더 도착까지 ms */
  ttfbMs: number;
  /** 본문이 1MB 캡으로 잘렸는지 */
  truncated: boolean;
  contentType: string;
  xRobotsTag: string;
  lastModified: string;
}

export interface ProbedResource {
  url: string;
  status: number | null;
  ok: boolean;
  body: string;
  contentType: string;
  truncated: boolean;
}

/** 입력 정규화: 스킴 없으면 https:// 부여, 해시 제거, 공백 정리 */
export function normalizeScanUrl(input: string): string {
  let raw = input.trim();
  if (!raw) throw new ScanError('INVALID_URL', 'Enter a URL to scan.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ScanError('INVALID_URL', 'Enter a valid URL.');
  }
  url.hash = '';
  return url.toString();
}

/** 본문을 지정 cap까지 읽기 (초과 시 절단) */
async function readCapped(
  res: Response,
  signal: AbortSignal,
  maxBytes = MAX_BYTES,
): Promise<{ text: string; truncated: boolean }> {
  const reader = res.body?.getReader();
  if (!reader) return { text: '', truncated: false };
  const chunks: Uint8Array[] = [];
  let received = 0;
  let truncated = false;
  for (;;) {
    if (signal.aborted) throw new ScanError('TIMEOUT', 'The response took longer than 5 seconds.');
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      received += value.byteLength;
      if (received > maxBytes) {
        chunks.push(value.slice(0, value.byteLength - (received - maxBytes)));
        truncated = true;
        await reader.cancel().catch(() => undefined);
        break;
      }
      chunks.push(value);
    }
  }
  const merged = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.byteLength;
  }
  return { text: new TextDecoder('utf-8', { fatal: false }).decode(merged), truncated };
}

/**
 * 대상 HTML 문서 1회 fetch. SSRF/DNS 검증은 각 hop에서 그대로 수행하되
 * 진단기 자체 검증 시간은 TTFB 시계에 넣지 않는다.
 */
async function fetchTargetSample(rawUrl: string, includeBody: boolean): Promise<FetchedTarget> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let current = await assertPublicHttpUrl(rawUrl);
    let responseMs = 0;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      let res: Response;
      try {
        const requestStarted = performance.now();
        res = await fetch(current.toString(), {
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
        });
        responseMs += performance.now() - requestStarted;
      } catch (err) {
        if (controller.signal.aborted) throw new ScanError('TIMEOUT', 'The response took longer than 5 seconds.');
        throw new ScanError('FETCH_FAILED', `The site could not be reached. (${err instanceof Error ? err.message : 'Connection failed'})`);
      }

      // redirect — 다음 hop도 SSRF 재검증
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        await res.body?.cancel().catch(() => undefined);
        if (!loc) throw new ScanError('FETCH_FAILED', 'The redirect response is invalid.');
        if (hop === MAX_REDIRECTS) throw new ScanError('TOO_MANY_REDIRECTS', 'The URL redirected more than three times.');
        current = await assertPublicHttpUrl(new URL(loc, current).toString());
        continue;
      }

      const body = includeBody
        ? await readCapped(res, controller.signal)
        : { text: '', truncated: false };
      if (!includeBody) await res.body?.cancel().catch(() => undefined);
      return {
        finalUrl: current,
        status: res.status,
        html: body.text,
        ttfbMs: Math.round(responseMs),
        truncated: body.truncated,
        contentType: res.headers.get('content-type') ?? '',
        xRobotsTag: res.headers.get('x-robots-tag') ?? '',
        lastModified: res.headers.get('last-modified') ?? '',
      };
    }
    throw new ScanError('TOO_MANY_REDIRECTS', 'The URL redirected too many times.');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 본문을 읽는 첫 요청과 헤더만 재확인하는 둘째 요청 중 빠른 값을 쓴다.
 * 둘째 요청의 일시 오류는 진단 전체를 막지 않고 첫 측정값을 유지한다.
 */
export async function fetchTarget(rawUrl: string): Promise<FetchedTarget> {
  const first = await fetchTargetSample(rawUrl, true);
  let secondTtfb = first.ttfbMs;
  try {
    secondTtfb = (await fetchTargetSample(rawUrl, false)).ttfbMs;
  } catch {
    // 추가 샘플은 참고값 보정용이므로 첫 실제 문서 결과를 버리지 않는다.
  }
  return { ...first, ttfbMs: fastestTtfb([first.ttfbMs, secondTtfb]) };
}

/**
 * 보조 리소스(robots.txt/sitemap.xml) fetch — 내용·상태·content-type까지 진단한다.
 * redirect 각 hop도 공개 URL인지 재검증한다. 실패/타임아웃은 status=null로 반환해
 * 메인 페이지 스캔 자체를 막지 않는다.
 */
export async function probeResource(origin: string, path: string): Promise<ProbedResource> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  try {
    let current = await assertPublicHttpUrl(new URL(path, origin).toString());
    for (let hop = 0; hop <= 2; hop++) {
      const res = await fetch(current.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': UA, accept: 'text/plain,application/xml,text/xml,*/*;q=0.5' },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        await res.body?.cancel().catch(() => undefined);
        if (!location || hop === 2) {
          return {
            url: current.toString(),
            status: res.status,
            ok: false,
            body: '',
            contentType: res.headers.get('content-type') ?? '',
            truncated: false,
          };
        }
        current = await assertPublicHttpUrl(new URL(location, current).toString());
        continue;
      }
      const { text, truncated } = await readCapped(res, controller.signal, AUX_MAX_BYTES);
      return {
        url: current.toString(),
        status: res.status,
        ok: res.status >= 200 && res.status < 300,
        body: text,
        contentType: res.headers.get('content-type') ?? '',
        truncated,
      };
    }
    return { url: `${origin}${path}`, status: null, ok: false, body: '', contentType: '', truncated: false };
  } catch {
    return { url: `${origin}${path}`, status: null, ok: false, body: '', contentType: '', truncated: false };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * robots.txt 429/5xx는 일시 오류일 수 있으므로 한 번만 짧게 기다렸다 재확인한다.
 * 재시도도 같은 probeResource 경계를 사용해 redirect hop SSRF 검증을 유지한다.
 */
export async function probeResourceWithRetry(
  origin: string,
  path: string,
  options: {
    probe?: typeof probeResource;
    wait?: (milliseconds: number) => Promise<void>;
  } = {},
): Promise<ProbedResource> {
  const probe = options.probe ?? probeResource;
  const wait = options.wait ?? ((milliseconds: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  }));
  return retryTransientProbe(() => probe(origin, path), wait);
}

/** 이전 호출부 호환용 boolean wrapper. */
export async function probeExists(origin: string, path: string): Promise<boolean> {
  return (await probeResource(origin, path)).ok;
}
