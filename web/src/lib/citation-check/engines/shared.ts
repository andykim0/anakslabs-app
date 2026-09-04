/**
 * [CITE$] Plumbing every engine adapter shares.
 *
 * Two invariants hold across all four adapters:
 *  - An adapter never throws. A missing key is `not_configured`; anything else is
 *    `error` with a short stable code. The runner must be able to write a row either way.
 *  - A key never reaches a URL, a log line, an error code, or a stored row.
 */
import {
  CITATION_ANSWER_EXCERPT_MAX,
  CITATION_PROBE_TIMEOUT_MS,
  type CitationEngine,
  type CitationSource,
  type ProbeResult,
} from '../types';

/** One retry, only for a rate limit or a server-side failure. Nothing else is retried. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

export interface RetryTiming {
  /** Injected in tests so a retry costs no wall-clock time and no randomness. */
  sleep(ms: number): Promise<void>;
  random(): number;
}

export const defaultRetryTiming: RetryTiming = {
  sleep: (ms) => new Promise((resolve) => { setTimeout(resolve, ms); }),
  random: () => Math.random(),
};

const RETRY_BASE_MS = 500;
const RETRY_JITTER_MS = 750;

/**
 * Run `attempt` once; if it reports a retryable failure, wait a jittered moment and run
 * it exactly one more time. The jitter keeps four concurrent workers from re-colliding.
 */
export async function withSingleRetry<T>(
  attempt: () => Promise<{ value: T; retryable: boolean }>,
  timing: RetryTiming = defaultRetryTiming,
): Promise<T> {
  const first = await attempt();
  if (!first.retryable) return first.value;
  await timing.sleep(RETRY_BASE_MS + Math.floor(timing.random() * RETRY_JITTER_MS));
  return (await attempt()).value;
}

/** A 25 s ceiling per request, enforced client-side so a hung provider cannot own a worker. */
export function probeAbortSignal(timeoutMs: number = CITATION_PROBE_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

/**
 * Map anything thrown into a short stable code. Provider messages can quote the request,
 * so the message itself is deliberately discarded rather than truncated.
 */
export function probeErrorCode(error: unknown): string {
  if (error && typeof error === 'object') {
    const named = error as { name?: unknown; status?: unknown; code?: unknown };
    if (named.name === 'TimeoutError' || named.name === 'AbortError') return 'TIMEOUT';
    if (typeof named.status === 'number') return `HTTP_${named.status}`;
    if (named.code === 'ENOTFOUND' || named.code === 'ECONNREFUSED') return 'NETWORK';
  }
  return 'REQUEST_FAILED';
}

/** Normalize a URL into a source row, dropping anything that is not http(s). */
export function toCitationSource(rawUrl: unknown): CitationSource | null {
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') return null;
  try {
    const url = new URL(rawUrl.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return { url: url.toString(), host: url.hostname.toLowerCase() };
  } catch {
    return null;
  }
}

/** Union the URLs an engine reported, keeping first-seen order and dropping duplicates. */
export function collectCitationSources(rawUrls: readonly unknown[]): CitationSource[] {
  return collectCitationSourcePairs(rawUrls.map((url) => ({ url })));
}

/** A bare hostname, as opposed to a page title. Used to trust a provider's `title` field. */
const BARE_HOSTNAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/iu;

export function looksLikeBareHostname(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 255
    && BARE_HOSTNAME.test(value.trim());
}

/**
 * Like `collectCitationSources`, but lets an engine supply the true host separately from
 * the link. Google's grounded citations are the reason this exists: every `url` is a
 * `vertexaisearch.cloud.google.com` redirect, and the real domain is in `title`.
 * Deriving the host from the URL alone would make LINKED permanently false for Gemini.
 */
export function collectCitationSourcePairs(
  raw: ReadonlyArray<{ url: unknown; host?: unknown }>,
): CitationSource[] {
  const seen = new Set<string>();
  const sources: CitationSource[] = [];
  for (const entry of raw) {
    const source = toCitationSource(entry.url);
    if (!source) continue;
    // The URL's own host stays authoritative unless it is a redirect proxy that hides
    // the real domain. A page title must never be able to become a matched domain.
    const host = isGroundingRedirectHost(source.host) && looksLikeBareHostname(entry.host)
      ? entry.host.trim().toLowerCase()
      : source.host;
    const key = `${source.url}|${host}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({ url: source.url, host });
  }
  return sources;
}

/** Hosts that proxy a real source behind a redirect, hiding the domain we must match. */
export const GROUNDING_REDIRECT_HOSTS = ['vertexaisearch.cloud.google.com'] as const;

export function isGroundingRedirectHost(host: string): boolean {
  return GROUNDING_REDIRECT_HOSTS.some(
    (redirect) => host === redirect || host.endsWith(`.${redirect}`),
  );
}

/** Plain-text excerpt, capped. The full answer is never stored. */
export function answerExcerpt(text: string): string {
  const collapsed = text.replace(/\s+/gu, ' ').trim();
  return collapsed.length <= CITATION_ANSWER_EXCERPT_MAX
    ? collapsed
    : `${collapsed.slice(0, CITATION_ANSWER_EXCERPT_MAX - 1)}…`;
}

export function notConfigured(engine: CitationEngine, model: string): ProbeResult {
  return {
    engine,
    status: 'not_configured',
    model,
    answerText: '',
    sources: [],
    errorCode: 'NO_API_KEY',
  };
}

export function probeError(
  engine: CitationEngine,
  model: string,
  errorCode: string,
): ProbeResult {
  return { engine, status: 'error', model, answerText: '', sources: [], errorCode };
}

/** The one sentence of context every engine gets, so answers stay comparable. */
export function probeSystemPrompt(): string {
  return 'Answer the question as you would for a person searching for a local business. '
    + 'Name specific businesses when you can, and cite your sources.';
}
