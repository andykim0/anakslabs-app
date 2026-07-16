import { createHmac } from 'node:crypto';

const INDEXNOW_ENDPOINT = 'https://searchadvisor.naver.com/indexnow';
const KEY_PATH = '/indexnow-key.txt';
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_URLS = 10_000;

export interface IndexNowPayload {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

function canonicalHost(rawHost: string): string {
  const candidate = rawHost.trim().toLowerCase().replace(/\.$/, '');
  if (!candidate || /[/:?#@\s]/.test(candidate)) {
    throw new Error('Invalid IndexNow host');
  }
  const parsed = new URL(`https://${candidate}`);
  if (parsed.hostname !== candidate || parsed.port) {
    throw new Error('Invalid IndexNow host');
  }
  return parsed.hostname;
}

function usableSecret(secret: string | undefined): secret is string {
  return Boolean(secret && secret.trim().length >= 16);
}

/** One deploy secret yields a stable, isolated 64-character key per tenant host. */
export function deriveIndexNowKey(host: string, secret: string): string {
  if (!usableSecret(secret)) {
    throw new Error('INDEXNOW_SECRET must contain at least 16 characters');
  }
  return createHmac('sha256', secret.trim()).update(canonicalHost(host)).digest('hex');
}

export function indexNowKeyForHost(
  host: string,
  secret = process.env.INDEXNOW_SECRET,
): string | null {
  if (!usableSecret(secret)) return null;
  try {
    return deriveIndexNowKey(host, secret);
  } catch {
    return null;
  }
}

export function indexNowKeyLocation(host: string): string {
  return `https://${canonicalHost(host)}${KEY_PATH}`;
}

export function buildIndexNowPayload(
  host: string,
  urls: readonly string[],
  secret = process.env.INDEXNOW_SECRET,
): IndexNowPayload | null {
  const normalizedHost = canonicalHost(host);
  const key = indexNowKeyForHost(normalizedHost, secret);
  if (!key) return null;

  const urlList: string[] = [];
  for (const raw of urls) {
    try {
      const url = new URL(raw);
      url.hash = '';
      if (url.protocol !== 'https:' || url.hostname !== normalizedHost) continue;
      urlList.push(url.pathname === '/' && !url.search ? `https://${normalizedHost}` : url.toString());
    } catch {
      // Ignore malformed URLs instead of sending an invalid batch.
    }
  }

  const uniqueUrls = [...new Set(urlList)].slice(0, MAX_URLS);
  if (uniqueUrls.length === 0) return null;
  return {
    host: normalizedHost,
    key,
    keyLocation: indexNowKeyLocation(normalizedHost),
    urlList: uniqueUrls,
  };
}

/**
 * Notify Naver IndexNow after a successful publish.
 * A true result means the endpoint accepted the notification, not that any URL
 * was indexed or ranked.
 */
export async function submitIndexNow(host: string, urls: readonly string[]): Promise<boolean> {
  const payload = buildIndexNowPayload(host, urls);
  if (!payload) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        accept: 'application/json, text/plain, */*',
      },
      body: JSON.stringify(payload),
    });
    if (response.status === 200 || response.status === 202) return true;
    throw new Error(`IndexNow rejected the notification with HTTP ${response.status}`);
  } finally {
    clearTimeout(timer);
  }
}
