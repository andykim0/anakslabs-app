import 'server-only';

import { Agent, request } from 'node:https';
import { Readable } from 'node:stream';

const EXPLICIT_INVALID_TLS_AGENT = new Agent({
  keepAlive: false,
  rejectUnauthorized: false,
  ciphers: 'DEFAULT@SECLEVEL=0',
  minVersion: 'TLSv1',
});

/**
 * Isolated transport for a per-request administrator opt-in. Never use as the
 * default fetch implementation: the caller must record the certificate warning.
 */
export const explicitlyUnverifiedTlsFetch: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.protocol !== 'https:') return fetch(input, init);
  return new Promise<Response>((resolve, reject) => {
    const headers = new Headers(init?.headers);
    const req = request(url, {
      agent: EXPLICIT_INVALID_TLS_AGENT,
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(headers.entries()),
    }, (res) => {
      const responseHeaders = new Headers();
      for (const [key, value] of Object.entries(res.headers)) {
        if (Array.isArray(value)) {
          for (const item of value) responseHeaders.append(key, item);
        } else if (value !== undefined) {
          responseHeaders.set(key, String(value));
        }
      }
      const body = (init?.method ?? 'GET') === 'HEAD'
        ? null
        : Readable.toWeb(res) as ReadableStream<Uint8Array>;
      resolve(new Response(body, {
        status: res.statusCode ?? 500,
        statusText: res.statusMessage,
        headers: responseHeaders,
      }));
    });
    const abort = () => req.destroy(new DOMException('The operation was aborted', 'AbortError'));
    if (init?.signal?.aborted) {
      abort();
      return;
    }
    init?.signal?.addEventListener('abort', abort, { once: true });
    req.once('close', () => init?.signal?.removeEventListener('abort', abort));
    req.once('error', reject);
    if (init?.body) {
      if (
        typeof init.body === 'string'
        || init.body instanceof Uint8Array
        || init.body instanceof ArrayBuffer
      ) {
        req.write(init.body);
      } else {
        req.destroy(new TypeError('Streaming request bodies are not supported'));
        return;
      }
    }
    req.end();
  });
};
