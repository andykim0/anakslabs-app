import 'server-only';
import { isMockMode } from '@/lib/env';
import { getServiceRoleClient } from '@/lib/data/supabase/client';
import { MockHeroVideoFulfillmentRepository } from './video-fulfillment-repository-mock';
import {
  normalizeCompleteVideoFulfillmentInput,
  normalizeVideoFulfillmentListLimit,
  type CompleteVideoFulfillmentInput,
  type HeroVideoFulfillmentRepository,
  type VideoFulfillmentRecord,
  type VideoFulfillmentRequestedAtSource,
} from './video-fulfillment-core';

interface VideoFulfillmentRow {
  id: string;
  site_id: string;
  client_id: string;
  video_asset_id: string;
  canonical_video_url: string;
  poster_url: string;
  requested_at: string;
  requested_at_source: VideoFulfillmentRequestedAtSource;
  completed_at: string;
}

function toRecord(row: VideoFulfillmentRow): VideoFulfillmentRecord {
  if (row.requested_at_source !== 'recorded'
    && row.requested_at_source !== 'site-created-fallback') {
    throw new Error('VIDEO_FULFILLMENT_DATABASE_SOURCE_INVALID');
  }
  if (![row.requested_at, row.completed_at].every((value) => Number.isFinite(Date.parse(value)))) {
    throw new Error('VIDEO_FULFILLMENT_DATABASE_TIMESTAMP_INVALID');
  }
  return {
    id: row.id,
    siteId: row.site_id,
    clientId: row.client_id,
    videoAssetId: row.video_asset_id,
    canonicalVideoUrl: row.canonical_video_url,
    posterUrl: row.poster_url,
    requestedAt: row.requested_at,
    requestedAtSource: row.requested_at_source,
    completedAt: row.completed_at,
  };
}

function resultRow(data: unknown): VideoFulfillmentRow {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('VIDEO_FULFILLMENT_DATABASE_RESULT_INVALID');
  }
  return value as VideoFulfillmentRow;
}

export class SupabaseHeroVideoFulfillmentRepository implements HeroVideoFulfillmentRepository {
  async getBySite(siteId: string): Promise<VideoFulfillmentRecord | null> {
    const { data, error } = await getServiceRoleClient()
      .from('hero_video_fulfillments')
      .select('*')
      .eq('site_id', siteId)
      .maybeSingle();
    if (error) throw new Error(`hero video fulfillment lookup failed: ${error.message}`);
    return data ? toRecord(data as VideoFulfillmentRow) : null;
  }

  async listRecent(limit?: number): Promise<VideoFulfillmentRecord[]> {
    const { data, error } = await getServiceRoleClient()
      .from('hero_video_fulfillments')
      .select('*')
      .order('completed_at', { ascending: false })
      .limit(normalizeVideoFulfillmentListLimit(limit));
    if (error) throw new Error(`hero video fulfillment list failed: ${error.message}`);
    return ((data ?? []) as VideoFulfillmentRow[]).map(toRecord);
  }

  async complete(rawInput: CompleteVideoFulfillmentInput): Promise<VideoFulfillmentRecord> {
    const input = normalizeCompleteVideoFulfillmentInput(rawInput);
    const { data, error } = await getServiceRoleClient().rpc('complete_hero_video_fulfillment', {
      p_site_id: input.siteId,
      p_client_id: input.clientId,
      p_video_asset_id: input.videoAssetId,
      p_canonical_video_url: input.canonicalVideoUrl,
      p_poster_url: input.posterUrl,
      p_expected_draft_config: input.expectedDraftConfig,
      p_expected_site_config: input.expectedSiteConfig,
      p_next_draft_config: input.nextDraftConfig,
      p_next_site_config: input.nextSiteConfig,
      p_requested_at: input.requestedAt,
      p_requested_at_source: input.requestedAtSource,
    });
    if (error) throw new Error(`hero video fulfillment completion failed: ${error.message}`);
    const record = toRecord(resultRow(data));
    if (record.siteId !== input.siteId || record.clientId !== input.clientId
      || record.videoAssetId !== input.videoAssetId
      || record.canonicalVideoUrl !== input.canonicalVideoUrl
      || record.posterUrl !== input.posterUrl) {
      throw new Error('VIDEO_FULFILLMENT_DATABASE_IDENTITY_MISMATCH');
    }
    return record;
  }
}

export function getHeroVideoFulfillmentRepository(): HeroVideoFulfillmentRepository {
  return isMockMode()
    ? new MockHeroVideoFulfillmentRepository()
    : new SupabaseHeroVideoFulfillmentRepository();
}

export type {
  CompleteVideoFulfillmentInput,
  HeroVideoFulfillmentRepository,
  VideoFulfillmentRecord,
} from './video-fulfillment-core';
