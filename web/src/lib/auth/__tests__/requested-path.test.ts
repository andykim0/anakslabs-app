/**
 * H2 — a signed-out visitor comes back to the page they asked for.
 *
 * Both app layouts hardcoded their area root, so a link to /dashboard/blog dropped the visitor on
 * /dashboard after login. The proxy now carries the requested path; whether that path is safe to
 * follow is still decided by `resolvePostLoginRedirect`, which these tests exercise directly
 * rather than re-implementing.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
  loginUrlForRequestedPath,
  REQUESTED_PATH_HEADER,
} from '@/lib/auth/requested-path';
import { resolvePostLoginRedirect } from '@/lib/auth/post-login-redirect';

const clientUser = { app_metadata: {} };
const adminUser = { app_metadata: { role: 'admin' } };

function nextParamOf(loginUrl: string): string {
  return new URL(loginUrl, 'https://app.anakslabs.com').searchParams.get('next') ?? '';
}

describe('H2 — the login link keeps the destination', () => {
  test('a carried path becomes the next parameter', () => {
    assert.equal(
      loginUrlForRequestedPath('/dashboard/blog', '/dashboard'),
      '/login?next=%2Fdashboard%2Fblog',
    );
    assert.equal(
      loginUrlForRequestedPath('/admin/content-queue', '/admin'),
      '/login?next=%2Fadmin%2Fcontent-queue',
    );
  });

  test('a query string survives the round trip to the resolver', () => {
    const next = nextParamOf(loginUrlForRequestedPath('/dashboard/reports?month=2026-08', '/dashboard'));
    assert.equal(resolvePostLoginRedirect(clientUser, next), '/dashboard/reports?month=2026-08');
  });

  test('a missing or non-path header falls back to the area root', () => {
    for (const value of [null, undefined, '', 'dashboard/blog', 'https://evil.com']) {
      assert.equal(loginUrlForRequestedPath(value, '/dashboard'), '/login?next=%2Fdashboard');
    }
  });

  test('both layouts build the login url from the carried path', () => {
    // The regression this guards is a hardcoded destination, which is what they had.
    for (const path of ['src/app/(dashboard)/layout.tsx', 'src/app/(admin)/admin/layout.tsx']) {
      const source = readFileSync(`${process.cwd()}/${path}`, 'utf8');
      assert.match(source, /loginUrlForRequestedPath\(/u, `${path} must derive next`);
      assert.doesNotMatch(source, /'\/login\?next=/u, `${path} still hardcodes a destination`);
    }
    // The proxy must set the shared constant rather than repeat the literal, so the header
    // name has exactly one definition.
    const proxy = readFileSync(`${process.cwd()}/src/proxy.ts`, 'utf8');
    assert.match(proxy, /headers\.set\(\s*REQUESTED_PATH_HEADER/u, 'the proxy sets the header');
    assert.doesNotMatch(proxy, new RegExp(`'${REQUESTED_PATH_HEADER}'`, 'u'), 'literal duplicated');
  });
});

describe('H2 — a client cannot choose its own requested path', () => {
  test('the proxy overwrites the header rather than trusting an inbound one', () => {
    const proxy = readFileSync(`${process.cwd()}/src/proxy.ts`, 'utf8');
    const fn = proxy.slice(
      proxy.indexOf('function appRequestPassthrough'),
      proxy.indexOf('function appRequestPassthrough') + 400,
    );
    // `set` replaces any inbound value; `append` or a presence check would let a caller
    // choose its own destination. The forwarded headers must also be a copy of the request's.
    assert.match(fn, /new Headers\(request\.headers\)/u);
    assert.match(fn, /headers\.set\(\s*REQUESTED_PATH_HEADER/u);
    assert.doesNotMatch(fn, /headers\.append|\.has\(\s*REQUESTED_PATH_HEADER/u);
    assert.match(fn, /request\.nextUrl\.pathname/u, 'the value comes from the URL, not input');
  });
});

describe('H2 — the existing resolver still refuses a hostile next', () => {
  test('external, protocol-relative and cross-role targets fall back', () => {
    for (const hostile of [
      'https://evil.com',
      '//evil.com',
      '\\\\evil.com',
      '/dashboard/../admin',
      '%2f%2fevil.com',
      '/admin/clients',
    ]) {
      const next = nextParamOf(loginUrlForRequestedPath(hostile, '/dashboard'));
      assert.equal(
        resolvePostLoginRedirect(clientUser, next),
        '/dashboard',
        `${hostile} must not be followed`,
      );
    }
  });

  test('an admin cannot be carried into the customer area, or the reverse', () => {
    assert.equal(resolvePostLoginRedirect(adminUser, '/dashboard/blog'), '/admin');
    assert.equal(resolvePostLoginRedirect(clientUser, '/admin/content-queue'), '/dashboard');
  });
});
