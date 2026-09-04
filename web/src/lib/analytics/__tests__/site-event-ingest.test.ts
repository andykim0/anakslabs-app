import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import { describe, test } from 'node:test';
import { NextRequest } from 'next/server';
import {
  SITE_EVENT_TYPES,
  TRAFFIC_SOURCES,
  canCollectSiteEvents,
  createSiteRateLimiter,
  isLikelyBotUserAgent,
  kstDateString,
  siteEventDateString,
  usSiteDateString,
} from '../site-event-ingest';
import { DEFAULT_US_SITE_TIMEZONE, type SiteConfig } from '@/lib/types/site';

function datedConfig(meta: SiteConfig['meta']): SiteConfig {
  return {
    version: 2,
    theme: {
      fonts: { heading: 'serif', body: 'sans-serif' },
      palette: {
        background: '#fff',
        surface: '#fff',
        text: '#111',
        muted: '#555',
        primary: '#000',
        accent: '#333',
      },
      radius: 0,
    },
    meta,
    pages: [{ id: 'home', title: 'Home', slug: '', sections: [] }],
  };
}

describe('RPT1 site event ingest invariants', () => {
  test('uses closed event/source enums and no identifying fields', () => {
    assert.deepEqual(SITE_EVENT_TYPES, [
      'pageview',
      'tel',
      'reserve',
      'directions',
      'form',
      'chat',
      'instagram',
    ]);
    // [CITE$] `ai` is APPENDED, never inserted: the existing wire values keep their
    // order so a published beacon and this ingest enum can never disagree.
    assert.deepEqual(TRAFFIC_SOURCES, ['naver', 'google', 'instagram', 'direct', 'other', 'ai']);
    const serialized = JSON.stringify({ SITE_EVENT_TYPES, TRAFFIC_SOURCES });
    assert.doesNotMatch(serialized, /ip|email|phone|name|session|cookie|referrerUrl/i);
  });

  test('filters bots without persisting a UA and fails closed when missing', () => {
    assert.equal(isLikelyBotUserAgent('Mozilla/5.0 Chrome/126 Safari/537.36'), false);
    assert.equal(isLikelyBotUserAgent('Googlebot/2.1'), true);
    assert.equal(isLikelyBotUserAgent('HeadlessChrome monitoring'), true);
    assert.equal(isLikelyBotUserAgent(null), true);
  });

  test('only published live or pending-dns sites are collectible', () => {
    const base = { siteConfig: {} as never, publishedAt: '2026-07-17T00:00:00Z' };
    assert.equal(canCollectSiteEvents({ ...base, status: 'live' }), true);
    assert.equal(canCollectSiteEvents({ ...base, status: 'pending_dns' }), true);
    assert.equal(canCollectSiteEvents({ ...base, status: 'suspended' }), false);
    assert.equal(canCollectSiteEvents({ ...base, status: 'draft' }), false);
    assert.equal(canCollectSiteEvents({ ...base, status: 'live', publishedAt: null }), false);
  });

  test('uses server KST date at the UTC boundary', () => {
    assert.equal(kstDateString(new Date('2026-07-16T14:59:59.000Z')), '2026-07-16');
    assert.equal(kstDateString(new Date('2026-07-16T15:00:00.000Z')), '2026-07-17');
  });

  test('uses the server-owned US site timezone and keeps KR on the KST branch', () => {
    const now = new Date('2026-08-01T03:30:00.000Z');
    assert.equal(
      siteEventDateString(datedConfig({
        title: 'New York clinic',
        locale: 'en-US',
        jurisdiction: 'US',
        timezone: 'America/New_York',
      }), now),
      '2026-07-31',
    );
    assert.equal(
      siteEventDateString(datedConfig({ title: '한국 사이트' }), now),
      '2026-08-01',
    );
  });

  test('defaults a half-pinned en-US site to Los Angeles without accepting a client claim', () => {
    const now = new Date('2026-08-01T06:30:00.000Z');
    const halfPinned = datedConfig({
      title: 'Legacy US clinic',
      locale: 'en-US',
      jurisdiction: 'US',
    });
    assert.equal(DEFAULT_US_SITE_TIMEZONE, 'America/Los_Angeles');
    assert.equal(siteEventDateString(halfPinned, now), '2026-07-31');
    assert.equal(usSiteDateString(DEFAULT_US_SITE_TIMEZONE, now), '2026-07-31');

    const route = readFileSync(
      new URL('../../../app/api/site-events/route.ts', import.meta.url),
      'utf8',
    );
    const payloadContract = route.slice(
      route.indexOf('const payloadSchema'),
      route.indexOf('const CORS_HEADERS'),
    );
    assert.match(payloadContract, /\.strict\(\)/u);
    assert.doesNotMatch(payloadContract, /timezone/u);
    assert.match(route, /siteEventDateString\(site\.siteConfig\)/u);
  });

  test('public ingest rejects a browser-claimed timezone at the strict wire boundary', async () => {
    const moduleLoader = Module as unknown as {
      _load: (request: string, parent: unknown, isMain: boolean) => unknown;
    };
    const originalLoad = moduleLoader._load;
    moduleLoader._load = function loadForRouteTest(request, parent, isMain) {
      if (request === 'server-only') return {};
      return originalLoad.call(this, request, parent, isMain);
    };
    const { POST } = await import('@/app/api/site-events/route').finally(() => {
      moduleLoader._load = originalLoad;
    });
    const response = await POST(new NextRequest('http://app.anakslabs.com/api/site-events', {
      method: 'POST',
      headers: {
        'content-type': 'text/plain;charset=UTF-8',
        'user-agent': 'Mozilla/5.0 Chrome/140 Safari/537.36',
      },
      body: JSON.stringify({
        siteId: 'demo-premium-site',
        event: 'pageview',
        source: 'direct',
        timezone: 'America/New_York',
      }),
    }), undefined as never);
    assert.equal(response.status, 400);
    const payload = await response.json() as { error?: { code?: string } };
    assert.equal(payload.error?.code, 'VALIDATION_ERROR');
  });

  test('rate limits by site only and resets after the window', () => {
    const limiter = createSiteRateLimiter({ limit: 2, windowMs: 1_000 });
    assert.equal(limiter.allow('site-a', 0), true);
    assert.equal(limiter.allow('site-a', 100), true);
    assert.equal(limiter.allow('site-a', 200), false);
    assert.equal(limiter.allow('site-b', 200), true);
    assert.equal(limiter.allow('site-a', 1_001), true);
  });

  test('limiter storage is TTL-cleaned and globally bounded', () => {
    const limiter = createSiteRateLimiter({ limit: 2, windowMs: 1_000, maxBuckets: 2 });
    assert.equal(limiter.allow('site-a', 0), true);
    assert.equal(limiter.allow('site-b', 100), true);
    assert.equal(limiter.bucketCount(), 2);

    assert.equal(limiter.allow('site-c', 200), true);
    assert.equal(limiter.bucketCount(), 2, 'oldest bucket is evicted at the global cap');

    assert.equal(limiter.allow('site-d', 1_500), true);
    assert.equal(limiter.bucketCount(), 1, 'expired buckets are removed before allocating a new one');
  });

  test('public route validates a published site before allocating its limiter bucket', () => {
    const route = readFileSync(
      new URL('../../../app/api/site-events/route.ts', import.meta.url),
      'utf8',
    );
    const lookup = route.indexOf('services.sites.getById(parsed.data.siteId)');
    const eligibility = route.indexOf('canCollectSiteEvents(site)');
    const allocation = route.indexOf('limiter.allow(parsed.data.siteId)');
    assert.ok(lookup >= 0 && eligibility > lookup && allocation > eligibility);
  });
});
