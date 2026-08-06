/**
 * P3 — set-password is authorized by a session cookie alone, so the request must come from us.
 *
 * The comparison is against the `host` header on purpose: proxy.ts states that forwarded host
 * headers are not trusted, and `nextUrl.origin` can disagree with what the browser addressed once
 * a proxy is in front. Using either would make this guard decide on something an attacker or an
 * infrastructure detail controls.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { isSameOriginRequest } from '@/lib/auth/same-origin';

const APP_HOST = 'app.anakslabs.com';

function headers(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe('P3 — a same-origin request is allowed and nothing else is', () => {
  test('Sec-Fetch-Site same-origin passes on its own', () => {
    assert.equal(
      isSameOriginRequest(headers({ 'sec-fetch-site': 'same-origin', host: APP_HOST })),
      true,
    );
  });

  test('a matching Origin passes when Sec-Fetch-Site is absent', () => {
    assert.equal(
      isSameOriginRequest(headers({ origin: `https://${APP_HOST}`, host: APP_HOST })),
      true,
    );
    // Port is part of the host, and a mismatch there is a different origin.
    assert.equal(
      isSameOriginRequest(headers({ origin: 'http://localhost:3000', host: 'localhost:3000' })),
      true,
    );
  });

  test('a cross-origin request is refused however it presents itself', () => {
    const attempts: Record<string, string>[] = [
      { origin: 'https://evil.com', host: APP_HOST },
      { origin: `https://${APP_HOST}.evil.com`, host: APP_HOST },
      { origin: 'https://app.anakslabs.com:8443', host: APP_HOST },
      { 'sec-fetch-site': 'cross-site', origin: 'https://evil.com', host: APP_HOST },
      { 'sec-fetch-site': 'same-site', origin: 'https://other.anakslabs.com', host: APP_HOST },
    ];
    for (const attempt of attempts) {
      assert.equal(isSameOriginRequest(headers(attempt)), false, JSON.stringify(attempt));
    }
  });

  test('a request carrying neither header is refused', () => {
    // Browsers always send Origin on a cross-origin POST, so nothing legitimate lands here.
    assert.equal(isSameOriginRequest(headers({ host: APP_HOST })), false);
    assert.equal(isSameOriginRequest(headers({})), false);
    assert.equal(isSameOriginRequest(headers({ origin: `https://${APP_HOST}` })), false);
    assert.equal(isSameOriginRequest(headers({ origin: 'not a url', host: APP_HOST })), false);
  });

  test('the guard compares against the host header, not the parsed URL', () => {
    const source = readFileSync(`${process.cwd()}/src/lib/auth/same-origin.ts`, 'utf8');
    assert.match(source, /headers\.get\('host'\)/u);
    // Comments stripped: the rule is about what the code reads, and the doc comment names both
    // of these precisely to record that they are not used.
    const code = source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/[^\n]*/gu, '');
    assert.doesNotMatch(code, /nextUrl|x-forwarded-host/u, 'neither may decide this');
  });

  test('set-password refuses before it parses a body', () => {
    const route = readFileSync(
      `${process.cwd()}/src/app/api/auth/set-password/route.ts`,
      'utf8',
    );
    const guardAt = route.indexOf('isSameOriginRequest(request.headers)');
    const parseAt = route.indexOf('parseBody(request');
    assert.ok(guardAt > 0 && guardAt < parseAt, 'nothing cross-origin should reach the parser');
    assert.match(route, /apiError\(403, 'FORBIDDEN'/u);
  });
});
