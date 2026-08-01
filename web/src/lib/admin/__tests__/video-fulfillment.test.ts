import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { applyHeroVideoToConfig } from '@/lib/ai/video-pipeline-core';
import { toAssetRef } from '@/lib/assets/provenance';
import { createMemoryAssetRegistry } from '@/lib/assets/registry-core';
import { DEMO_PREMIUM_ID, HWARODAM_SITE_ID } from '@/lib/data/mock/seed';
import { getMockStore, resetMockStore } from '@/lib/data/mock/store';
import { PRICING_MODEL_VERSION } from '@/lib/pricing';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';
import {
  deriveVideoQueueItem,
  normalizeCompleteVideoFulfillmentInput,
  siteVideoFulfillmentState,
  type CompleteVideoFulfillmentInput,
  type VideoFulfillmentRecord,
} from '../video-fulfillment-core';
import { MockHeroVideoFulfillmentRepository } from '../video-fulfillment-repository-mock';

const VIDEO_URL = '/generated/admin-hero.mp4';
const POSTER_URL = '/generated/admin-hero-poster.webp';

function requestedConfig(withImage = true): SiteConfig {
  const config = emptySiteConfig('영상 대기 테스트');
  config.meta.purposeId = 'company_brand';
  config.meta.industryClass = 'brand';
  config.motion = {
    presetId: 'brand-editorial',
    intensity: 'normal',
    videoRequested: true,
    videoAddon: true,
    heroImageChoice: 'upload',
    heroMotionId: 'cinematic-scrub',
    videoConceptId: 'space-mood',
  };
  config.pages[0].sections.push({
    id: 'hero',
    type: 'hero',
    name: '히어로',
    height: 800,
    background: withImage ? { image: { src: '/uploads/hero.webp' } } : {},
    elements: [],
  });
  return config;
}

function completion(siteId: string, clientId: string): VideoFulfillmentRecord {
  return {
    id: 'completion-1',
    siteId,
    clientId,
    videoAssetId: 'asset-1',
    canonicalVideoUrl: VIDEO_URL,
    posterUrl: POSTER_URL,
    requestedAt: '2026-07-01T00:00:00.000Z',
    requestedAtSource: 'recorded',
    completedAt: '2026-07-02T00:00:00.000Z',
  };
}

describe('ADM1 video fulfillment queue core', () => {
  test('premium + explicit request + no video is queued with deterministic metadata', () => {
    resetMockStore();
    const store = getMockStore();
    const site = store.sites.get(HWARODAM_SITE_ID)!;
    const client = store.clients.get(DEMO_PREMIUM_ID)!;
    site.assetPolicyVersion = 2;
    site.draftConfig = requestedConfig();
    site.siteConfig = null;
    const item = deriveVideoQueueItem({ site, client });
    assert.ok(item);
    assert.equal(item.fulfillmentStatus, 'ready');
    assert.equal(item.heroImageUrl, '/uploads/hero.webp');
    assert.equal(item.heroMotionId, 'cinematic-scrub');
    assert.equal(item.industryClass, 'brand');
    assert.equal(item.requestedAt, site.createdAt);
    assert.equal(item.requestedAtSource, 'site-created-fallback');
  });

  test('missing hero image remains visible as a blocked queue row', () => {
    resetMockStore();
    const store = getMockStore();
    const site = store.sites.get(HWARODAM_SITE_ID)!;
    const client = store.clients.get(DEMO_PREMIUM_ID)!;
    site.assetPolicyVersion = 2;
    site.draftConfig = requestedConfig(false);
    site.siteConfig = null;
    const item = deriveVideoQueueItem({ site, client });
    assert.ok(item);
    assert.equal(item.fulfillmentStatus, 'blocked');
    assert.equal(item.blockedReason, 'missing-hero-image');
  });

  test('explicit videoAddon=false overrides stale videoRequested=true and never queues', () => {
    resetMockStore();
    const store = getMockStore();
    const site = store.sites.get(HWARODAM_SITE_ID)!;
    const client = store.clients.get(DEMO_PREMIUM_ID)!;
    site.assetPolicyVersion = 2;
    const config = requestedConfig();
    config.motion!.videoAddon = false;
    config.motion!.videoRequested = true;
    site.draftConfig = config;
    site.siteConfig = null;
    assert.deepEqual(siteVideoFulfillmentState({ site, client }), {
      pending: false,
      reason: 'not-requested',
    });
    assert.equal(deriveVideoQueueItem({ site, client }), null);
  });

  test('basic entitlement, applied video, and completion each fail closed', () => {
    resetMockStore();
    const store = getMockStore();
    const site = store.sites.get(HWARODAM_SITE_ID)!;
    const client = store.clients.get(DEMO_PREMIUM_ID)!;
    site.assetPolicyVersion = 2;
    site.draftConfig = requestedConfig();
    site.siteConfig = null;

    assert.equal(siteVideoFulfillmentState({
      site,
      client: { ...client, tier: 'basic' },
    }).pending, false);
    assert.equal(siteVideoFulfillmentState({
      site,
      client,
      completion: completion(site.id, client.id),
    }).pending, false);

    site.draftConfig = applyHeroVideoToConfig(requestedConfig(), VIDEO_URL, POSTER_URL);
    site.siteConfig = applyHeroVideoToConfig(requestedConfig(), VIDEO_URL, POSTER_URL);
    assert.deepEqual(siteVideoFulfillmentState({ site, client }), {
      pending: false,
      reason: 'already-applied',
    });
  });

  test('current V6 basic includes one approval-time video without opening legacy basic sites', () => {
    resetMockStore();
    const store = getMockStore();
    const site = store.sites.get(HWARODAM_SITE_ID)!;
    const client = { ...store.clients.get(DEMO_PREMIUM_ID)!, tier: 'basic' as const };
    site.assetPolicyVersion = 2;
    site.pricingModelVersion = PRICING_MODEL_VERSION;
    site.draftConfig = requestedConfig();
    site.siteConfig = null;

    assert.equal(siteVideoFulfillmentState({ site, client }).pending, true);
    assert.ok(deriveVideoQueueItem({ site, client }));

    site.pricingModelVersion = null;
    assert.deepEqual(siteVideoFulfillmentState({ site, client }), {
      pending: false,
      reason: 'addon-not-owned',
    });
  });

  test('legacy policy, draft/live poster mismatch, and missing source remain blocked rather than ready', () => {
    resetMockStore();
    const store = getMockStore();
    const site = store.sites.get(HWARODAM_SITE_ID)!;
    const client = store.clients.get(DEMO_PREMIUM_ID)!;
    site.assetPolicyVersion = null;
    site.draftConfig = requestedConfig();
    site.siteConfig = null;
    assert.equal(deriveVideoQueueItem({ site, client })?.blockedReason, 'asset-policy-v2-required');

    site.assetPolicyVersion = 2;
    site.siteConfig = requestedConfig();
    site.siteConfig.pages[0].sections[0].background.image = { src: '/uploads/other-hero.webp' };
    assert.equal(deriveVideoQueueItem({ site, client })?.blockedReason, 'hero-poster-mismatch');

    site.siteConfig = null;
    site.draftConfig = requestedConfig(false);
    assert.equal(deriveVideoQueueItem({ site, client })?.blockedReason, 'missing-hero-image');
  });

  test('partial application stays repairable and a stale draft cannot hide a published request', () => {
    resetMockStore();
    const store = getMockStore();
    const site = store.sites.get(HWARODAM_SITE_ID)!;
    const client = store.clients.get(DEMO_PREMIUM_ID)!;
    site.assetPolicyVersion = 2;
    site.draftConfig = applyHeroVideoToConfig(requestedConfig(), VIDEO_URL, POSTER_URL);
    site.siteConfig = requestedConfig();
    const partial = siteVideoFulfillmentState({ site, client });
    assert.equal(partial.pending, true);

    const staleDraft = requestedConfig();
    staleDraft.motion!.videoAddon = false;
    staleDraft.motion!.videoRequested = false;
    site.draftConfig = staleDraft;
    site.siteConfig = requestedConfig();
    const publishedRequest = siteVideoFulfillmentState({ site, client });
    assert.equal(publishedRequest.pending, true);
    if (publishedRequest.pending) assert.equal(publishedRequest.configSource, 'published');
  });
});

async function repositoryFixture() {
  resetMockStore();
  const store = getMockStore();
  const site = store.sites.get(HWARODAM_SITE_ID)!;
  const client = store.clients.get(DEMO_PREMIUM_ID)!;
  const config = requestedConfig();
  site.assetPolicyVersion = 2;
  site.exportStatus = 'ready';
  site.exportUrl = 'exports/stale.zip';
  site.exportRequestedAt = '2026-07-16T00:00:00.000Z';
  site.draftConfig = structuredClone(config);
  site.siteConfig = structuredClone(config);

  const registry = createMemoryAssetRegistry({
    ownsSite: async ({ siteId, clientId }) => siteId === site.id && clientId === client.id,
    idFactory: () => '11111111-1111-4111-8111-111111111111',
    now: () => '2026-07-15T00:00:00.000Z',
  });
  const asset = await registry.register({
    origin: 'ai_generated',
    mediaType: 'video',
    clientId: client.id,
    siteId: site.id,
    storageBucket: 'generated-assets',
    storageKey: 'videos/admin-hero.mp4',
    canonicalUrl: VIDEO_URL,
  });
  const nextDraft = applyHeroVideoToConfig(config, VIDEO_URL, POSTER_URL, toAssetRef(asset));
  const nextSite = structuredClone(nextDraft);
  const input: CompleteVideoFulfillmentInput = {
    siteId: site.id,
    clientId: client.id,
    videoAssetId: asset.id,
    canonicalVideoUrl: VIDEO_URL,
    posterUrl: POSTER_URL,
    expectedDraftConfig: structuredClone(config),
    expectedSiteConfig: structuredClone(config),
    nextDraftConfig: nextDraft,
    nextSiteConfig: nextSite,
    requestedAt: site.createdAt,
    requestedAtSource: 'site-created-fallback',
  };
  return {
    store,
    site,
    client,
    registry,
    input,
    repository: new MockHeroVideoFulfillmentRepository(
      store,
      () => '2026-07-17T00:00:00.000Z',
      registry,
    ),
  };
}

describe('ADM1 video fulfillment repository parity', () => {
  test('completion atomically applies draft/live config, records history, and exact retry is idempotent', async () => {
    const { store, site, input, repository } = await repositoryFixture();
    const first = await repository.complete(input);
    const retry = await repository.complete(input);
    assert.equal(retry.id, first.id);
    assert.equal((await repository.listRecent()).length, 1);
    assert.equal((await repository.getBySite(site.id))?.videoAssetId, input.videoAssetId);
    assert.equal(store.sites.get(site.id)?.draftConfig?.pages[0].sections[0].background.video?.src, VIDEO_URL);
    assert.equal(store.sites.get(site.id)?.siteConfig?.pages[0].sections[0].background.video?.poster, POSTER_URL);
    assert.equal(store.sites.get(site.id)?.exportStatus, 'none');
    assert.equal(store.sites.get(site.id)?.exportUrl, null);
    assert.equal(store.sites.get(site.id)?.exportRequestedAt, null);
  });

  test('optimistic conflict and non-authoritative video asset are rejected before mutation', async () => {
    const changed = await repositoryFixture();
    changed.store.sites.get(changed.site.id)!.draftConfig!.meta.title = '동시 수정';
    await assert.rejects(changed.repository.complete(changed.input), /CONFIG_CHANGED/);
    assert.equal(await changed.repository.getBySite(changed.site.id), null);
    assert.equal(changed.store.sites.get(changed.site.id)?.exportStatus, 'ready');
    assert.equal(changed.store.sites.get(changed.site.id)?.exportUrl, 'exports/stale.zip');

    const untrusted = await repositoryFixture();
    const otherRegistry = createMemoryAssetRegistry({
      ownsSite: async () => true,
      idFactory: () => untrusted.input.videoAssetId,
    });
    await otherRegistry.register({
      origin: 'customer_upload',
      mediaType: 'video',
      clientId: untrusted.client.id,
      siteId: untrusted.site.id,
      storageBucket: 'client-assets',
      storageKey: 'unsafe.mp4',
      canonicalUrl: VIDEO_URL,
    });
    const repository = new MockHeroVideoFulfillmentRepository(
      untrusted.store,
      () => '2026-07-17T00:00:00.000Z',
      otherRegistry,
    );
    await assert.rejects(repository.complete(untrusted.input), /ASSET_PROVENANCE_MISMATCH/);
    assert.equal(await repository.getBySite(untrusted.site.id), null);
  });

  test('a registered UUID bound to another site is rejected without applying either snapshot', async () => {
    const fixture = await repositoryFixture();
    const registry = createMemoryAssetRegistry({
      ownsSite: async () => true,
      idFactory: () => '22222222-2222-4222-8222-222222222222',
    });
    const foreign = await registry.register({
      origin: 'ai_generated',
      mediaType: 'video',
      clientId: fixture.client.id,
      siteId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      storageBucket: 'generated-assets',
      storageKey: 'videos/foreign-site.mp4',
      canonicalUrl: '/generated/foreign-site.mp4',
    });
    const input = {
      ...fixture.input,
      videoAssetId: foreign.id,
      canonicalVideoUrl: foreign.canonicalUrl,
      nextDraftConfig: applyHeroVideoToConfig(
        fixture.input.expectedDraftConfig!,
        foreign.canonicalUrl,
        POSTER_URL,
        toAssetRef(foreign),
      ),
      nextSiteConfig: applyHeroVideoToConfig(
        fixture.input.expectedSiteConfig!,
        foreign.canonicalUrl,
        POSTER_URL,
        toAssetRef(foreign),
      ),
    };
    const repository = new MockHeroVideoFulfillmentRepository(
      fixture.store,
      () => '2026-07-17T00:00:00.000Z',
      registry,
    );
    await assert.rejects(repository.complete(input), /ASSET_PROVENANCE_MISMATCH/);
    assert.equal(await repository.getBySite(fixture.site.id), null);
    assert.equal(fixture.store.sites.get(fixture.site.id)?.draftConfig?.pages[0].sections[0].background.video, undefined);
  });

  test('conflicting retry cannot rewrite immutable completion history', async () => {
    const fixture = await repositoryFixture();
    await fixture.repository.complete(fixture.input);
    const conflicting = {
      ...fixture.input,
      canonicalVideoUrl: '/generated/replacement.mp4',
      nextDraftConfig: applyHeroVideoToConfig(
        fixture.input.expectedDraftConfig!,
        '/generated/replacement.mp4',
        POSTER_URL,
        { assetId: fixture.input.videoAssetId, url: '/generated/replacement.mp4' },
      ),
      nextSiteConfig: applyHeroVideoToConfig(
        fixture.input.expectedSiteConfig!,
        '/generated/replacement.mp4',
        POSTER_URL,
        { assetId: fixture.input.videoAssetId, url: '/generated/replacement.mp4' },
      ),
    };
    await assert.rejects(fixture.repository.complete(conflicting), /RETRY_CONFLICT/);
    assert.equal((await fixture.repository.listRecent()).length, 1);
  });

  test('completion normalization requires the verified assignment and explicit video addon in every next config', async () => {
    const fixture = await repositoryFixture();
    const invalidDraft = structuredClone(fixture.input.nextDraftConfig)!;
    invalidDraft.motion!.videoAddon = false;
    assert.throws(
      () => normalizeCompleteVideoFulfillmentInput({
        ...fixture.input,
        nextDraftConfig: invalidDraft,
      }),
      /NEXT_CONFIG_INVALID/,
    );
  });
});

describe('ADM1 migration contract', () => {
  const migration = readFileSync(
    join(process.cwd(), '../supabase/migrations/0016_admin_video_fulfillments.sql'),
    'utf8',
  );

  test('history is service-only and completion is only exposed through one service RPC', () => {
    assert.match(migration, /alter table public\.hero_video_fulfillments enable row level security/);
    assert.match(migration, /revoke all on table public\.hero_video_fulfillments from public, anon, authenticated, service_role/);
    assert.match(migration, /grant select on table public\.hero_video_fulfillments to service_role/);
    assert.match(migration, /revoke execute on function public\.complete_hero_video_fulfillment[\s\S]*from public, anon, authenticated/);
    assert.match(migration, /grant execute on function public\.complete_hero_video_fulfillment[\s\S]*to service_role/);
  });

  test('RPC validates entitlement, authoritative AI video, optimistic equality, and atomic update+history', () => {
    assert.match(migration, /asset_policy_version is distinct from 2/);
    assert.match(migration, /c\.tier = 'premium'/);
    assert.match(migration, /v_asset\.origin <> 'ai_generated'/);
    assert.match(migration, /v_asset\.media_type <> 'video'/);
    assert.match(migration, /v_asset\.site_id <> p_site_id/);
    assert.match(migration, /v_asset\.canonical_url <> btrim\(p_canonical_video_url\)/);
    assert.match(migration, /draft_config is distinct from p_expected_draft_config/);
    assert.match(migration, /site_config is distinct from p_expected_site_config/);
    assert.match(migration, /update public\.sites[\s\S]*insert into public\.hero_video_fulfillments/);
    assert.match(migration, /export_status = 'none',[\s\S]*export_url = null,[\s\S]*export_requested_at = null/);
    assert.match(migration, /where site_id = p_site_id;[\s\S]*return to_jsonb\(v_existing\)/);
    assert.match(migration, /every config column that exists already[\s\S]*v_site\.draft_config is null or exists[\s\S]*v_site\.site_config is null or exists/);
    assert.match(migration, /draft and published hero poster sources differ/);
    assert.match(migration, /motion,videoAddon\}' <> 'true'/);
  });

  test('unsafe URL-only completion and unverified recorded timing fail closed', () => {
    assert.match(migration, /video fulfillment canonical URL is unsafe/);
    assert.match(migration, /recorded request timestamp has no server log evidence/);
    assert.match(migration, /site-created fallback timestamp does not match the site/);
  });
});

describe('ADM1 route wiring invariants', () => {
  const listRoute = readFileSync(
    join(process.cwd(), 'src/app/api/admin/video-queue/route.ts'),
    'utf8',
  );
  const completeRoute = readFileSync(
    join(process.cwd(), 'src/app/api/admin/video-queue/[siteId]/complete/route.ts'),
    'utf8',
  );

  test('eligibility looks up every site completion instead of trusting the recent-history window', () => {
    assert.match(listRoute, /allSites\.map\(async \(site\) => \[site\.id, await fulfillments\.getBySite\(site\.id\)\]/);
    assert.match(listRoute, /const completionBySite = new Map\(completionsBySite\)/);
  });

  test('the exact next live snapshot passes provenance, artifact scan, and publish gate before completion', () => {
    const provenanceAt = completeRoute.indexOf('resolveStoredBeforeAfterMotionOptions({');
    const scanAt = completeRoute.indexOf('preflightScan(nextSiteConfig');
    const gateAt = completeRoute.indexOf('checkPublish(nextSiteConfig');
    const completeAt = completeRoute.indexOf('await repository.complete({');
    assert.ok(provenanceAt >= 0 && provenanceAt < scanAt);
    assert.ok(scanAt < gateAt && gateAt < completeAt);
    assert.match(completeRoute, /artifact: scan\.publishAudit/);
    assert.match(completeRoute, /VIDEO_FULFILLMENT_PUBLISH_AUDIT_UNAVAILABLE/);
    assert.match(completeRoute, /VIDEO_FULFILLMENT_PUBLISH_QUALITY_BLOCKED/);
  });
});
