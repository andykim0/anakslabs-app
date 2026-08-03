import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { NextRequest } from 'next/server';
import {
  getRedirectUrl,
  getRewrittenUrl,
  isRewrite,
} from 'next/experimental/testing/server';
import { proxy } from '@/proxy';
import {
  APP_ENTRY_SUBDOMAIN,
  RESERVED_APP_SUBDOMAINS,
  ROOT_DOMAIN,
  reservedAppSubdomainForHostname,
} from '@/lib/env';
import {
  DEMO_BASIC_ID,
  DEMO_PREMIUM_ID,
  HWARODAM_SITE_ID,
} from '@/lib/data/mock/seed';

function request(host: string, pathname = '/', session?: string) {
  return new NextRequest(`http://127.0.0.1${pathname}`, {
    headers: {
      host,
      ...(session ? { cookie: `anaks_mock_session=${session}` } : {}),
    },
  });
}

describe('APP-HOST routing contract', () => {
  test('reserved app hosts bypass tenant rewrites and app root enters the authenticated app', async () => {
    assert.deepEqual(RESERVED_APP_SUBDOMAINS, ['app', 'preview']);
    assert.equal(reservedAppSubdomainForHostname(`app.${ROOT_DOMAIN}`), 'app');
    assert.equal(reservedAppSubdomainForHostname(`preview.${ROOT_DOMAIN}`), 'preview');

    const appRoot = await proxy(request(`app.${ROOT_DOMAIN}`));
    assert.equal(new URL(getRedirectUrl(appRoot) ?? '').pathname, '/dashboard');

    const appLogin = await proxy(request(`app.${ROOT_DOMAIN}`, '/login'));
    assert.equal(isRewrite(appLogin), false);
    assert.equal(appLogin.headers.get('x-middleware-next'), '1');

    const preview = await proxy(request(`preview.${ROOT_DOMAIN}`, '/preview/testtoken'));
    assert.equal(isRewrite(preview), false);
    assert.equal(preview.headers.get('x-middleware-next'), '1');
  });

  test('existing app hosts stay app-owned while ordinary root-domain subdomains stay tenants', async () => {
    for (const host of [
      ROOT_DOMAIN,
      `www.${ROOT_DOMAIN}`,
      'localhost',
      '127.0.0.1',
      'deployment.vercel.app',
    ]) {
      const response = await proxy(request(host));
      assert.equal(isRewrite(response), false, host);
    }

    const tenant = await proxy(request(`hwarodam.${ROOT_DOMAIN}`));
    assert.equal(isRewrite(tenant), true);
    assert.equal(
      new URL(getRewrittenUrl(tenant) ?? '').pathname,
      `/s/hwarodam.${ROOT_DOMAIN}`,
    );
  });

  test('only the exact reserved labels are rejected as tenant hostnames', () => {
    assert.equal(reservedAppSubdomainForHostname(`${APP_ENTRY_SUBDOMAIN}.${ROOT_DOMAIN}`), 'app');
    assert.equal(reservedAppSubdomainForHostname(`${APP_ENTRY_SUBDOMAIN}-2.${ROOT_DOMAIN}`), null);
    assert.equal(reservedAppSubdomainForHostname(`clinic.${ROOT_DOMAIN}`), null);
    assert.equal(reservedAppSubdomainForHostname(`app.customer.example`), null);
  });

  test('dashboard site resources return before streaming for foreign and missing ids', async () => {
    const owned = await proxy(request(
      `app.${ROOT_DOMAIN}`,
      `/dashboard/sites/${HWARODAM_SITE_ID}`,
      DEMO_PREMIUM_ID,
    ));
    assert.equal(owned.status, 200);
    assert.equal(owned.headers.get('x-middleware-next'), '1');

    const foreign = await proxy(request(
      `app.${ROOT_DOMAIN}`,
      `/dashboard/sites/${HWARODAM_SITE_ID}`,
      DEMO_BASIC_ID,
    ));
    assert.equal(foreign.status, 404);
    assert.equal(await foreign.text(), 'Not found.');

    const missing = await proxy(request(
      `app.${ROOT_DOMAIN}`,
      '/dashboard/sites/00000000-0000-0000-0000-000000000000',
      DEMO_PREMIUM_ID,
    ));
    assert.equal(missing.status, 404);
    assert.equal(await missing.text(), 'Not found.');
  });

  test('production and mock assignment boundaries consume the shared reservation helper', () => {
    for (const file of [
      'src/lib/data/mock/services.ts',
      'src/lib/data/supabase/services.ts',
    ]) {
      const source = readFileSync(file, 'utf8');
      assert.match(source, /reservedAppSubdomainForHostname\(candidate\)/u);
      assert.match(source, /reservedAppSubdomainForHostname\(domain\)/u);
      assert.match(source, /sites\.publish: 예약 앱 호스트/u);
    }
  });
});
