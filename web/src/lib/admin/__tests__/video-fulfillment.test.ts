import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { applyHeroVideoToConfig } from '@/lib/ai/video-pipeline-core';
import { toAssetRef } from '@/lib/assets/provenance';
import { createMemoryAssetRegistry } from '@/lib/assets/registry-core';
import { DEMO_PREMIUM_ID, HWARODAM_SITE_ID } from '@/lib/data/mock/seed';
import { getMockStore, resetMockStore } from '@/lib/data/mock/store';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';
import {
  deriveVideoQueueItem,
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

    site.siteConfig = applyHeroVideoToConfig(requestedConfig(), VIDEO_URL, POSTER_URL);
    assert.deepEqual(siteVideoFulfillmentState({ site, client }), {
      pending: false,
      reason: 'already-applied',
    });
  });
});

async function repositoryFixture() {
  resetMockStore();
  const store = getMockStore();
  const site = store.sites.get(HWARODAM_SITE_ID)!;
  const client = store.clients.get(DEMO_PREMIUM_ID)!;
  const config = requestedConfig();
  site.assetPolicyVersion = 2;
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
  });

  test('optimistic conflict and non-authoritative video asset are rejected before mutation', async () => {
    const changed = await repositoryFixture();
    changed.store.sites.get(changed.site.id)!.draftConfig!.meta.title = '동시 수정';
    await assert.rejects(changed.repository.complete(changed.input), /CONFIG_CHANGED/);
    assert.equal(await changed.repository.getBySite(changed.site.id), null);

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
    assert.match(migration, /where site_id = p_site_id;[\s\S]*return to_jsonb\(v_existing\)/);
  });

  test('unsafe URL-only completion and unverified recorded timing fail closed', () => {
    assert.match(migration, /video fulfillment canonical URL is unsafe/);
    assert.match(migration, /recorded request timestamp has no server log evidence/);
    assert.match(migration, /site-created fallback timestamp does not match the site/);
  });
});
