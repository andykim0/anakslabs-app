import assert from 'node:assert/strict';
import Module from 'node:module';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { siteConfigSchema } from '@/app/api/_lib/schemas';
import type { CrawlArtifactPayload, CrawlPageArtifact } from '@/lib/crawl/contracts';
import { isAcceptableUsBookingUrl } from '@/lib/connectors/validation';
import {
  DEMO_BASIC_ID,
  DEMO_PREMIUM_ID,
  HWARODAM_SITE_ID,
} from '@/lib/data/mock/seed';
import { HWARODAM_SITE_CONFIG } from '@/lib/data/mock/hwarodam';
import { getMockStore, resetMockStore } from '@/lib/data/mock/store';
import { normalizeSiteConfig } from '@/lib/types/site';
import {
  applyOperatorConnectorInput,
  applyOperatorConnectorPatch,
} from './connectors';
import {
  buildOperatorCrawlSiteConfig,
  buildOperatorMinimalSiteConfig,
} from './site-generation';

function crawlArtifact(): CrawlArtifactPayload {
  const page = {
    url: 'https://clinic.example/',
    status: 200,
    contentType: 'text/html',
    title: 'Source Dental Clinic',
    headings: ['Dental care'],
    text: 'Source Dental Clinic\nDental care by appointment.',
    structured: { contentItems: [] },
    images: [],
    connectors: [{
      kind: 'tel',
      url: 'tel:+13105550000',
      label: 'Crawled phone must not become an operator connector',
    }],
    decay: {},
  } as unknown as CrawlPageArtifact;
  return {
    schemaVersion: 1,
    seedUrl: page.url,
    finalOrigin: 'https://clinic.example',
    observedAt: '2026-08-05T00:00:00.000Z',
    tls: {
      httpsUrl: page.url,
      status: 'valid',
      httpFallbackApproved: false,
      httpFallbackUsed: false,
    },
    robots: {
      url: 'https://clinic.example/robots.txt',
      status: 200,
      sitemaps: [],
      crawlerAllowed: true,
    },
    pages: [page],
    skippedUrls: [],
  };
}

test('US operator booking validation is HTTPS-only and uses the shared safe-href contract', () => {
  assert.equal(isAcceptableUsBookingUrl('https://booking.clinic.example/schedule'), true);
  assert.equal(isAcceptableUsBookingUrl(' http://booking.clinic.example/schedule '), false);
  assert.equal(isAcceptableUsBookingUrl('javascript:alert(1)'), false);
  assert.equal(isAcceptableUsBookingUrl('/schedule'), false);
});

test('operator creation injects only explicit generic contact connectors', () => {
  const base = normalizeSiteConfig(structuredClone(HWARODAM_SITE_CONFIG));
  base.connectors = {
    catalogVersion: 1,
    items: [{
      id: 'instagram',
      label: 'Instagram',
      href: 'https://instagram.com/example',
      username: 'example',
    }],
  };

  const unchanged = applyOperatorConnectorInput(base, {});
  assert.deepEqual(unchanged.connectors?.items.map((item) => item.id), ['instagram']);

  const output = applyOperatorConnectorInput(base, {
    phone: '(310) 555-0199',
    bookingUrl: 'https://booking.clinic.example/schedule',
    address: '100 Wilshire Blvd, Los Angeles, CA',
  });
  assert.deepEqual(output.connectors?.items.map((item) => item.id), [
    'instagram',
    'tel',
    'booking',
    'map',
  ]);
  assert.equal(output.connectors?.items.find((item) => item.id === 'tel')?.href, 'tel:3105550199');
  assert.equal(
    output.connectors?.items.find((item) => item.id === 'booking')?.href,
    'https://booking.clinic.example/schedule',
  );
  assert.equal(
    output.connectors?.items.find((item) => item.id === 'map')?.href,
    'https://maps.google.com/?q=100%20Wilshire%20Blvd%2C%20Los%20Angeles%2C%20CA',
  );
});

test('minimal and crawl operator builders inject only explicit connector inputs', async () => {
  const minimal = await buildOperatorMinimalSiteConfig({
    businessName: 'Operator Dental',
    industry: 'Dental practice',
    tone: 'calm and clinical',
    colorPreference: 'clean blue',
    phone: '+1 310 555 0199',
    bookingUrl: 'https://booking.clinic.example/schedule',
    address: '100 Wilshire Blvd, Los Angeles, CA',
    timezone: 'America/New_York',
  }, 'basic');
  assert.deepEqual(minimal.config.connectors?.items.map((item) => item.id), [
    'tel',
    'booking',
    'map',
  ]);
  assert.equal(minimal.config.meta.timezone, 'America/New_York');
  assert.equal(
    siteConfigSchema.parse(minimal.config).meta.timezone,
    'America/New_York',
    'the generated config schema must not strip the creation-time timezone',
  );

  const crawlWithoutExplicitInput = buildOperatorCrawlSiteConfig(crawlArtifact(), 'basic');
  assert.equal(crawlWithoutExplicitInput.connectors, undefined);
  assert.equal(crawlWithoutExplicitInput.meta.timezone, 'America/Los_Angeles');
  const crawlWithExplicitInput = buildOperatorCrawlSiteConfig(crawlArtifact(), 'basic', {
    phone: '+1 310 555 0199',
    bookingUrl: 'https://booking.clinic.example/schedule',
    timezone: 'America/Phoenix',
  });
  assert.deepEqual(crawlWithExplicitInput.connectors?.items.map((item) => item.id), [
    'tel',
    'booking',
  ]);
  assert.equal(crawlWithExplicitInput.meta.timezone, 'America/Phoenix');
  assert.equal(siteConfigSchema.parse(crawlWithExplicitInput).meta.timezone, 'America/Phoenix');
});

test('operator connector patch preserves omitted, removes null, and keeps branded records', () => {
  const withAll = applyOperatorConnectorInput(
    normalizeSiteConfig(structuredClone(HWARODAM_SITE_CONFIG)), {
    phone: '+1 310 555 0199',
    bookingUrl: 'https://booking.clinic.example/schedule',
    address: '100 Wilshire Blvd, Los Angeles, CA',
    },
  );
  withAll.connectors?.items.unshift({
    id: 'instagram',
    label: 'Instagram',
    href: 'https://instagram.com/example',
    username: 'example',
  });

  const output = applyOperatorConnectorPatch(withAll, {
    bookingUrl: null,
    address: '200 Wilshire Blvd, Los Angeles, CA',
  });
  assert.deepEqual(output.connectors?.items.map((item) => item.id), [
    'instagram',
    'tel',
    'map',
  ]);
  assert.equal(output.connectors?.items.find((item) => item.id === 'tel')?.href, 'tel:+13105550199');
  assert.equal(
    output.connectors?.items.find((item) => item.id === 'map')?.href,
    'https://maps.google.com/?q=200%20Wilshire%20Blvd%2C%20Los%20Angeles%2C%20CA',
  );
});

test('server-authoritative connector update writes draft and published snapshots', async () => {
  resetMockStore();
  const moduleLoader = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = moduleLoader._load;
  moduleLoader._load = function loadForServiceTest(request, parent, isMain) {
    if (request === 'server-only') return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  const { createMockServices } = await import('@/lib/data/mock/services').finally(() => {
    moduleLoader._load = originalLoad;
  });
  const services = createMockServices();
  const manifest = {
    catalogVersion: 1 as const,
    items: [{
      id: 'booking' as const,
      label: 'Book an appointment',
      href: 'https://booking.clinic.example/schedule',
    }],
  };
  await services.sites.setConnectorManifest(HWARODAM_SITE_ID, manifest);
  const site = await services.sites.getById(HWARODAM_SITE_ID);
  assert.deepEqual(site?.draftConfig?.connectors, manifest);
  assert.deepEqual(site?.siteConfig?.connectors, manifest);
});

test('admin connector PATCH is strict, client-bound, and supports explicit null deletion', async () => {
  resetMockStore();
  const store = getMockStore();
  const sourceSite = store.sites.get(HWARODAM_SITE_ID);
  assert.ok(sourceSite?.draftConfig && sourceSite.siteConfig);
  const usSiteId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const usDraft = structuredClone(sourceSite.draftConfig);
  usDraft.meta = { ...usDraft.meta, locale: 'en-US', jurisdiction: 'US' };
  const usPublished = structuredClone(sourceSite.siteConfig);
  usPublished.meta = { ...usPublished.meta, locale: 'en-US', jurisdiction: 'US' };
  store.sites.set(usSiteId, {
    ...structuredClone(sourceSite),
    id: usSiteId,
    clientId: DEMO_PREMIUM_ID,
    name: 'Operator Dental',
    domain: 'operator-dental.anakslabs.com',
    draftConfig: usDraft,
    siteConfig: usPublished,
  });
  const moduleLoader = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = moduleLoader._load;
  let session = 'admin';
  moduleLoader._load = function loadForRouteTest(request, parent, isMain) {
    if (request === 'server-only') return {};
    if (request === 'next/headers') {
      return {
        cookies: async () => ({
          get: (name: string) => name === 'anaks_mock_session' ? { value: session } : undefined,
          getAll: () => [],
          set: () => undefined,
        }),
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  const { PATCH } = await import(
    '@/app/api/admin/clients/[id]/sites/[siteId]/connectors/route'
  ).finally(() => {
    moduleLoader._load = originalLoad;
  });
  const ctx = {
    params: Promise.resolve({ id: DEMO_PREMIUM_ID, siteId: usSiteId }),
  };

  const update = await PATCH(new NextRequest('http://app.anakslabs.com/api/admin/connectors', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      phone: '+1 310 555 0199',
      bookingUrl: 'https://booking.clinic.example/schedule',
      address: '100 Wilshire Blvd, Los Angeles, CA',
    }),
  }), ctx);
  assert.equal(update.status, 200);
  const updated = await update.json() as { items: { id: string }[] };
  assert.deepEqual(updated.items.map((item) => item.id), ['tel', 'booking', 'map']);

  const remove = await PATCH(new NextRequest('http://app.anakslabs.com/api/admin/connectors', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bookingUrl: null }),
  }), ctx);
  assert.equal(remove.status, 200);
  const removed = await remove.json() as { items: { id: string }[] };
  assert.deepEqual(removed.items.map((item) => item.id), ['tel', 'map']);

  const empty = await PATCH(new NextRequest('http://app.anakslabs.com/api/admin/connectors', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  }), ctx);
  assert.equal(empty.status, 400);

  const unsafeBooking = await PATCH(new NextRequest('http://app.anakslabs.com/api/admin/connectors', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bookingUrl: 'javascript:alert(1)' }),
  }), ctx);
  assert.equal(unsafeBooking.status, 400);

  const crossClient = await PATCH(new NextRequest('http://app.anakslabs.com/api/admin/connectors', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '+1 310 555 0100' }),
  }), {
    params: Promise.resolve({ id: DEMO_BASIC_ID, siteId: usSiteId }),
  });
  assert.equal(crossClient.status, 404);

  const koSite = await PATCH(new NextRequest('http://app.anakslabs.com/api/admin/connectors', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '+82 2 1234 5678' }),
  }), {
    params: Promise.resolve({ id: DEMO_PREMIUM_ID, siteId: HWARODAM_SITE_ID }),
  });
  assert.equal(koSite.status, 409);

  session = DEMO_PREMIUM_ID;
  const nonAdmin = await PATCH(new NextRequest('http://app.anakslabs.com/api/admin/connectors', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '+1 310 555 0100' }),
  }), ctx);
  assert.equal(nonAdmin.status, 403);
});
