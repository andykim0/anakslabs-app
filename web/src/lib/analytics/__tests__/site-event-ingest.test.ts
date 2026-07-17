import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
  SITE_EVENT_TYPES,
  TRAFFIC_SOURCES,
  canCollectSiteEvents,
  createSiteRateLimiter,
  isLikelyBotUserAgent,
  kstDateString,
} from '../site-event-ingest';

describe('RPT1 site event ingest invariants', () => {
  test('uses closed event/source enums and no identifying fields', () => {
    assert.deepEqual(SITE_EVENT_TYPES, ['pageview', 'tel', 'reserve', 'directions', 'form']);
    assert.deepEqual(TRAFFIC_SOURCES, ['naver', 'google', 'instagram', 'direct', 'other']);
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
