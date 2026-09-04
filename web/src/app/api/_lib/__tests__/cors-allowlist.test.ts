/**
 * CORS — the allowlist that decides which pages may read these endpoints.
 *
 * The free check on anakslabs.com is a page on one origin talking to an API on
 * another, and the browser is the party that enforces the rule. So the assertions
 * here are about response headers, both ways: an allowed origin is reflected back,
 * and an origin nobody vouched for gets an answer with nothing that lets the
 * calling page read it.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { applyCors, corsHeaders, corsPreflight, isAllowedOrigin, withCors } from '@/app/api/_lib/cors';

const SITE = 'https://anakslabs.com';

describe('CORS allowlist — the origins the marketing site is served from', () => {
  test('both apex forms of anakslabs.com are allowed and reflected verbatim', () => {
    for (const origin of ['https://anakslabs.com', 'https://www.anakslabs.com']) {
      assert.equal(isAllowedOrigin(origin), true, origin);
      assert.equal(corsHeaders(origin)['Access-Control-Allow-Origin'], origin);
    }
  });

  test('local review is allowed on any port, and with no port at all', () => {
    for (const origin of [
      'http://localhost',
      'http://localhost:3000',
      'http://localhost:8080',
      'http://localhost:52341',
      'http://127.0.0.1:5500',
      'http://127.0.0.1',
    ]) {
      assert.equal(isAllowedOrigin(origin), true, origin);
      assert.equal(corsHeaders(origin)['Access-Control-Allow-Origin'], origin, origin);
    }
  });

  test('an origin nobody vouched for gets no Access-Control-Allow-Origin', () => {
    for (const origin of [
      'https://evil.com',
      // the allowlist is matched whole, so neither a prefix nor a suffix gets in
      'https://anakslabs.com.evil.com',
      'https://evil.com/https://anakslabs.com',
      'http://anakslabs.com',
      'https://localhost:3000',
      'http://localhost.evil.com',
      'null',
      '',
    ]) {
      assert.equal(isAllowedOrigin(origin), false, origin);
      assert.equal(corsHeaders(origin)['Access-Control-Allow-Origin'], undefined, origin);
    }
    assert.equal(isAllowedOrigin(null), false);
    assert.equal(isAllowedOrigin(undefined), false);
  });

  test('a refused origin still gets a complete answer — the browser declines it, not the server', () => {
    const headers = corsHeaders('https://evil.com');
    assert.equal(headers['Access-Control-Allow-Methods'], 'POST, OPTIONS');
    assert.equal(headers['Access-Control-Allow-Headers'], 'Content-Type');
    assert.equal(headers.Vary, 'Origin');
  });

  test('every response says Vary: Origin, because the answer depends on it', () => {
    for (const origin of [SITE, 'https://evil.com', null]) {
      assert.equal(corsHeaders(origin).Vary, 'Origin');
    }
  });

  test('the preflight is cacheable and names what it permits', () => {
    const headers = corsHeaders(SITE);
    assert.equal(headers['Access-Control-Allow-Headers'], 'Content-Type');
    assert.equal(headers['Cache-Control'], 'no-store');
    assert.ok(Number(headers['Access-Control-Max-Age']) > 0);
  });
});

describe('CORS helpers — applied to a response, not rebuilt at each call site', () => {
  test('applyCors keeps the status and body it was handed', async () => {
    const response = applyCors(
      new Response(JSON.stringify({ error: { code: 'RATE_LIMITED' } }), { status: 429 }),
      SITE,
    );
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('access-control-allow-origin'), SITE);
    assert.deepEqual(await response.json(), { error: { code: 'RATE_LIMITED' } });
  });

  test('the preflight handler answers 204 with the headers and no body', async () => {
    const response = corsPreflight()(new Request('https://preview.anakslabs.com/api/scan', {
      method: 'OPTIONS',
      headers: { origin: SITE },
    }));
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), SITE);
    assert.equal(await response.text(), '');
  });

  test('withCors reads the origin off the request, so one wrapper covers every branch', async () => {
    const handler = withCors(async () => new Response(null, { status: 400 }));
    const allowed = await handler(
      new Request('https://preview.anakslabs.com/api/scan', { headers: { origin: SITE } }),
      undefined,
    );
    assert.equal(allowed.headers.get('access-control-allow-origin'), SITE);

    const refused = await handler(
      new Request('https://preview.anakslabs.com/api/scan', { headers: { origin: 'https://evil.com' } }),
      undefined,
    );
    assert.equal(refused.status, 400);
    assert.equal(refused.headers.get('access-control-allow-origin'), null);
  });

  test('a method other than POST can be declared without touching the allowlist', () => {
    assert.equal(corsHeaders(SITE, 'GET, OPTIONS')['Access-Control-Allow-Methods'], 'GET, OPTIONS');
  });
});
