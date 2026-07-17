import { isDeepStrictEqual } from 'node:util';
import type { MockStore } from '@/lib/data/mock/store';
import { getMockStore, newId } from '@/lib/data/mock/store';
import type { AssetRecord } from '@/lib/assets/provenance';
import type { AssetRegistry } from '@/lib/assets/registry-core';
import {
  normalizeCompleteVideoFulfillmentInput,
  normalizeVideoFulfillmentListLimit,
  siteVideoFulfillmentState,
  type CompleteVideoFulfillmentInput,
  type HeroVideoFulfillmentRepository,
  type VideoFulfillmentRecord,
} from './video-fulfillment-core';

interface MockVideoFulfillmentState {
  recordsBySite: Map<string, VideoFulfillmentRecord>;
}

const stateByStore = new WeakMap<MockStore, MockVideoFulfillmentState>();

function stateFor(store: MockStore): MockVideoFulfillmentState {
  let state = stateByStore.get(store);
  if (!state) {
    state = { recordsBySite: new Map() };
    stateByStore.set(store, state);
  }
  return state;
}

function copy(record: VideoFulfillmentRecord): VideoFulfillmentRecord {
  return structuredClone(record);
}

function sameRetry(record: VideoFulfillmentRecord, input: CompleteVideoFulfillmentInput): boolean {
  return record.siteId === input.siteId
    && record.clientId === input.clientId
    && record.videoAssetId === input.videoAssetId
    && record.canonicalVideoUrl === input.canonicalVideoUrl
    && record.posterUrl === input.posterUrl
    && record.requestedAt === input.requestedAt
    && record.requestedAtSource === input.requestedAtSource;
}

function assertTrustedVideoAsset(
  asset: AssetRecord | null,
  input: CompleteVideoFulfillmentInput,
): asserts asset is AssetRecord {
  if (!asset || asset.ownerId !== input.clientId || asset.siteId !== input.siteId
    || asset.origin !== 'ai_generated' || asset.mediaType !== 'video'
    || !asset.storageBucket || !asset.storageKey
    || asset.canonicalUrl !== input.canonicalVideoUrl) {
    throw new Error('VIDEO_FULFILLMENT_ASSET_PROVENANCE_MISMATCH');
  }
}

export class MockHeroVideoFulfillmentRepository implements HeroVideoFulfillmentRepository {
  constructor(
    private readonly store: MockStore = getMockStore(),
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly assets?: AssetRegistry,
  ) {}

  async getBySite(siteId: string): Promise<VideoFulfillmentRecord | null> {
    const record = stateFor(this.store).recordsBySite.get(siteId);
    return record ? copy(record) : null;
  }

  async listRecent(limit?: number): Promise<VideoFulfillmentRecord[]> {
    return [...stateFor(this.store).recordsBySite.values()]
      .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
      .slice(0, normalizeVideoFulfillmentListLimit(limit))
      .map(copy);
  }

  async complete(rawInput: CompleteVideoFulfillmentInput): Promise<VideoFulfillmentRecord> {
    const input = normalizeCompleteVideoFulfillmentInput(rawInput);
    const state = stateFor(this.store);
    const existing = state.recordsBySite.get(input.siteId);
    if (existing) {
      if (!sameRetry(existing, input)) throw new Error('VIDEO_FULFILLMENT_RETRY_CONFLICT');
      return copy(existing);
    }

    const site = this.store.sites.get(input.siteId);
    const client = this.store.clients.get(input.clientId);
    if (!site || !client || site.clientId !== input.clientId || client.tier !== 'premium'
      || site.assetPolicyVersion !== 2) {
      throw new Error('VIDEO_FULFILLMENT_SITE_OR_ENTITLEMENT_MISMATCH');
    }
    const eligibility = siteVideoFulfillmentState({ site, client });
    if (!eligibility.pending) throw new Error(`VIDEO_FULFILLMENT_NOT_PENDING:${eligibility.reason}`);

    const assetRegistry = this.assets ?? (await import('@/lib/assets/registry')).getAssetRegistry();
    const asset = await assetRegistry.getById(input.videoAssetId);
    assertTrustedVideoAsset(asset, input);
    if (input.requestedAtSource === 'site-created-fallback'
      && input.requestedAt !== site.createdAt) {
      throw new Error('VIDEO_FULFILLMENT_FALLBACK_TIMESTAMP_MISMATCH');
    }
    if (input.requestedAtSource === 'recorded'
      && !(this.store.videoGenLog ?? []).some((entry) =>
        entry.siteId === input.siteId && new Date(entry.at).toISOString() === input.requestedAt)) {
      throw new Error('VIDEO_FULFILLMENT_RECORDED_TIMESTAMP_UNVERIFIED');
    }
    const completedAt = this.now();
    if (!Number.isFinite(Date.parse(completedAt))
      || Date.parse(input.requestedAt) > Date.parse(completedAt) + 5 * 60_000) {
      throw new Error('VIDEO_FULFILLMENT_TIMESTAMP_INVALID');
    }
    if (!isDeepStrictEqual(site.draftConfig, input.expectedDraftConfig)
      || !isDeepStrictEqual(site.siteConfig, input.expectedSiteConfig)) {
      throw new Error('VIDEO_FULFILLMENT_CONFIG_CHANGED');
    }
    if ((input.expectedDraftConfig === null) !== (input.nextDraftConfig === null)
      || (input.expectedSiteConfig === null) !== (input.nextSiteConfig === null)) {
      throw new Error('VIDEO_FULFILLMENT_CONFIG_COLUMN_MISMATCH');
    }

    const record: VideoFulfillmentRecord = {
      id: newId(this.store, 'video-fulfillment'),
      siteId: input.siteId,
      clientId: input.clientId,
      videoAssetId: input.videoAssetId,
      canonicalVideoUrl: input.canonicalVideoUrl,
      posterUrl: input.posterUrl,
      requestedAt: input.requestedAt,
      requestedAtSource: input.requestedAtSource,
      completedAt,
    };
    this.store.sites.set(site.id, {
      ...site,
      draftConfig: structuredClone(input.nextDraftConfig),
      siteConfig: structuredClone(input.nextSiteConfig),
    });
    state.recordsBySite.set(record.siteId, record);
    return copy(record);
  }
}
