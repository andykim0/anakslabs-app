/**
 * CORS at the routes the static site actually calls.
 *
 * anakslabs.com is a separate deployment. Its free check posts to /api/scan and
 * its rebuild and contact forms post to /api/contact, both cross-origin. Testing
 * the helper alone would not have caught the defect this fixes: the helper was
 * fine on /api/contact and simply absent from /api/scan, so the check page could
 * only ever report that its own check had broken.
 *
 * These drive the real exported handlers. Every branch a visitor can land on —
 * preflight, a rejected body, the rate limit, a crash — has to come back readable
 * to the page, so each is asserted rather than assumed from the wrapper.
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { describe, test } from 'node:test';
import { NextRequest } from 'next/server';
import { withApiHandler } from '@/app/api/_lib/http';
import { withCors } from '@/app/api/_lib/cors';

const SITE = 'https://anakslabs.com';
const STRANGER = 'https://evil.com';

type ModuleLoader = { _load: (r: string, p: unknown, m: boolean) => unknown };
type RouteModule = {
  OPTIONS?: (request: Request) => Response;
  POST?: (request: NextRequest, context: never) => Promise<Response>;
};

/** A stored inquiry, so /api/contact reaches its own branches instead of a missing key. */
const supabaseStub = {
  createClient: () => ({
    from: () => ({ insert: async () => ({ error: null }) }),
  }),
};

/**
 * Loads a route the way the existing route tests do: the data layer is
 * server-only, which throws under a plain node import, so the loader is stubbed
 * for the duration of the import and restored straight after.
 */
async function loadRoute(path: string): Promise<RouteModule> {
  const loader = Module as unknown as ModuleLoader;
  const original = loader._load;
  loader._load = function load(request, parent, isMain) {
    if (request === 'server-only') return {};
    if (request === '@supabase/supabase-js') return supabaseStub;
    return original.call(this, request, parent, isMain);
  };
  try {
    return (await import(path)) as RouteModule;
  } finally {
    loader._load = original;
  }
}

function post(url: string, ip: string, body: string, origin: string | null = SITE): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': ip };
  if (origin) headers.origin = origin;
  return new NextRequest(url, { method: 'POST', headers, body });
}

function preflight(url: string, origin: string): Request {
  return new Request(url, {
    method: 'OPTIONS',
    headers: { origin, 'access-control-request-method': 'POST' },
  });
}

const SCAN = 'https://preview.anakslabs.com/api/scan';
const CONTACT = 'https://preview.anakslabs.com/api/contact';

describe('/api/scan answers the free check on anakslabs.com', () => {
  test('the preflight is answered — without it the browser never sends the POST', async () => {
    const route = await loadRoute('@/app/api/scan/route');
    assert.equal(typeof route.OPTIONS, 'function', '/api/scan must export an OPTIONS handler');
    const response = route.OPTIONS!(preflight(SCAN, SITE));
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), SITE);
    assert.match(response.headers.get('access-control-allow-methods') ?? '', /POST/u);
    assert.equal(response.headers.get('access-control-allow-headers'), 'Content-Type');
    assert.equal(response.headers.get('vary'), 'Origin');
  });

  test('a rejected body still comes back readable, so the page can say what went wrong', async () => {
    const route = await loadRoute('@/app/api/scan/route');
    const response = await route.POST!(post(SCAN, '203.0.113.10', 'not json'), undefined as never);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('access-control-allow-origin'), SITE);
  });

  test('the rate limit is readable too — the check page branches on 429', async () => {
    const route = await loadRoute('@/app/api/scan/route');
    const ip = '203.0.113.11';
    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const response = await route.POST!(post(SCAN, ip, 'not json'), undefined as never);
      statuses.push(response.status);
      assert.equal(
        response.headers.get('access-control-allow-origin'),
        SITE,
        `request ${i + 1} (status ${response.status}) lost its CORS header`,
      );
    }
    assert.ok(statuses.includes(429), `expected a 429 among ${statuses.join(',')}`);
  });

  test('a page nobody vouched for gets an answer it cannot read', async () => {
    const route = await loadRoute('@/app/api/scan/route');
    const options = route.OPTIONS!(preflight(SCAN, STRANGER));
    assert.equal(options.status, 204);
    assert.equal(options.headers.get('access-control-allow-origin'), null);

    const response = await route.POST!(post(SCAN, '203.0.113.12', 'not json', STRANGER), undefined as never);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.equal(response.headers.get('vary'), 'Origin');
  });
});

describe('/api/contact keeps answering the forms it already served', () => {
  test('the preflight still reflects anakslabs.com, as it did before the refactor', async () => {
    const route = await loadRoute('@/app/api/contact/route');
    assert.equal(typeof route.OPTIONS, 'function');
    const response = route.OPTIONS!(preflight(CONTACT, SITE));
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), SITE);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });

  test('an oversized message is refused readably', async () => {
    const route = await loadRoute('@/app/api/contact/route');
    const response = await route.POST!(
      post(CONTACT, '203.0.113.20', JSON.stringify({ site: 'a', email: 'a@b.co', note: 'x'.repeat(9000) })),
      undefined as never,
    );
    assert.equal(response.status, 413);
    assert.equal(response.headers.get('access-control-allow-origin'), SITE);
  });

  test('a malformed body is refused readably', async () => {
    const route = await loadRoute('@/app/api/contact/route');
    const response = await route.POST!(post(CONTACT, '203.0.113.21', 'not json'), undefined as never);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('access-control-allow-origin'), SITE);
  });

  test('an accepted inquiry and the rate limit behind it both stay readable', async () => {
    const route = await loadRoute('@/app/api/contact/route');
    const ip = '203.0.113.22';
    const body = JSON.stringify({ site: 'anakslabs.com', email: 'owner@example.com', note: 'hello' });
    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const response = await route.POST!(post(CONTACT, ip, body), undefined as never);
      statuses.push(response.status);
      assert.equal(
        response.headers.get('access-control-allow-origin'),
        SITE,
        `request ${i + 1} (status ${response.status}) lost its CORS header`,
      );
    }
    assert.ok(statuses.includes(201), `expected an accepted inquiry among ${statuses.join(',')}`);
    assert.ok(statuses.includes(429), `expected a 429 among ${statuses.join(',')}`);
  });

  test('www is served the same site, so it is served the same API', async () => {
    const route = await loadRoute('@/app/api/contact/route');
    const response = route.OPTIONS!(preflight(CONTACT, 'https://www.anakslabs.com'));
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://www.anakslabs.com');
  });
});

describe('CORS sits outside the error boundary', () => {
  test('a crash is reported to the page instead of vanishing as a network error', async () => {
    // The routes compose withCors(withApiHandler(...)) precisely for this: a 500 the
    // page cannot read is indistinguishable from the server never having answered.
    const handler = withCors(withApiHandler(async () => {
      throw new Error('boom');
    }));
    const response = await handler(
      new NextRequest(SCAN, { method: 'POST', headers: { origin: SITE } }),
      undefined as never,
    );
    assert.equal(response.status, 500);
    assert.equal(response.headers.get('access-control-allow-origin'), SITE);
  });
});
