import 'server-only';

import { isMockMode } from '@/lib/env';
import { getServiceRoleClient } from '@/lib/data/supabase/client';
import {
  CRAWL_ARTIFACT_RETENTION_DAYS,
  type CrawlArtifactPayload,
  type CrawlArtifactRecord,
  sharedPreviewRetentionDays,
  type SharedSitePreviewRecord,
} from './contracts';
import type { DecayScoreResult } from '@/lib/scan/decay-contract';
import type { SiteConfig } from '@/lib/types/site';
import {
  hashPreviewBearerToken,
  IMPORT_PREVIEW_NOTICE_VERSION,
} from './preview-contract';

const MOCK_KEY = '__daboimCrawlArtifacts__' as const;
const MOCK_PREVIEW_KEY = '__daboimSharedSitePreviews__' as const;
type GlobalWithArtifacts = typeof globalThis & {
  [MOCK_KEY]?: Map<string, CrawlArtifactRecord>;
  [MOCK_PREVIEW_KEY]?: Map<string, SharedSitePreviewRecord>;
};

function mockArtifacts(): Map<string, CrawlArtifactRecord> {
  const store = globalThis as GlobalWithArtifacts;
  return (store[MOCK_KEY] ??= new Map());
}

function mockPreviews(): Map<string, SharedSitePreviewRecord> {
  const store = globalThis as GlobalWithArtifacts;
  return (store[MOCK_PREVIEW_KEY] ??= new Map());
}

interface CrawlArtifactRow {
  id: string;
  seed_url: string;
  final_origin: string;
  artifact: CrawlArtifactPayload;
  decay_result: DecayScoreResult | null;
  created_by: string;
  created_at: string;
  expires_at: string;
}

function rowToRecord(row: CrawlArtifactRow): CrawlArtifactRecord {
  return {
    id: row.id,
    seedUrl: row.seed_url,
    finalOrigin: row.final_origin,
    artifact: row.artifact,
    decayResult: row.decay_result,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export async function createCrawlArtifact(input: {
  artifact: CrawlArtifactPayload;
  decayResult: DecayScoreResult;
  createdBy: string;
  now?: Date;
}): Promise<CrawlArtifactRecord> {
  const createdAt = input.now ?? new Date();
  const expiresAt = new Date(
    createdAt.getTime() + CRAWL_ARTIFACT_RETENTION_DAYS * 86_400_000,
  );
  if (isMockMode()) {
    const record: CrawlArtifactRecord = {
      id: crypto.randomUUID(),
      seedUrl: input.artifact.seedUrl,
      finalOrigin: input.artifact.finalOrigin,
      artifact: structuredClone(input.artifact),
      decayResult: structuredClone(input.decayResult),
      createdBy: input.createdBy,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    mockArtifacts().set(record.id, record);
    return structuredClone(record);
  }
  const { data, error } = await getServiceRoleClient()
    .from('crawl_artifacts')
    .insert({
      seed_url: input.artifact.seedUrl,
      final_origin: input.artifact.finalOrigin,
      artifact: input.artifact,
      decay_result: input.decayResult,
      created_by: input.createdBy,
      expires_at: expiresAt.toISOString(),
    })
    .select('*')
    .single();
  if (error) throw new Error(`crawl artifact create failed: ${error.message}`);
  return rowToRecord(data as CrawlArtifactRow);
}

export async function getCrawlArtifact(id: string): Promise<CrawlArtifactRecord | null> {
  if (isMockMode()) {
    const record = mockArtifacts().get(id);
    return record ? structuredClone(record) : null;
  }
  const { data, error } = await getServiceRoleClient()
    .from('crawl_artifacts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`crawl artifact lookup failed: ${error.message}`);
  return data ? rowToRecord(data as CrawlArtifactRow) : null;
}

/** Operator rebuild lookup. Exact normalized seed URL only; no discovery crawl is triggered here. */
export async function getLatestCrawlArtifactBySeedUrl(
  seedUrl: string,
): Promise<CrawlArtifactRecord | null> {
  const normalized = new URL(seedUrl).toString();
  if (isMockMode()) {
    return [...mockArtifacts().values()]
      .filter((record) => record.seedUrl === normalized)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((record) => structuredClone(record))[0] ?? null;
  }
  const { data, error } = await getServiceRoleClient()
    .from('crawl_artifacts')
    .select('*')
    .eq('seed_url', normalized)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`crawl artifact seed lookup failed: ${error.message}`);
  return data ? rowToRecord(data as CrawlArtifactRow) : null;
}

interface SharedSitePreviewRow {
  id: string;
  crawl_artifact_id: string | null;
  token_hash: string;
  source_url: string;
  site_config: SiteConfig;
  render_mode: SharedSitePreviewRecord['renderMode'];
  notice_version: 1;
  created_by: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  compilation_audit: unknown;
}

function previewRowToRecord(row: SharedSitePreviewRow): SharedSitePreviewRecord {
  return {
    id: row.id,
    crawlArtifactId: row.crawl_artifact_id ?? null,
    tokenHash: row.token_hash,
    sourceUrl: row.source_url,
    siteConfig: row.site_config,
    renderMode: row.render_mode,
    noticeVersion: row.notice_version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    compilationAudit: row.compilation_audit ?? null,
  };
}

export async function createSharedSitePreview(input: {
  crawlArtifactId: string;
  sourceUrl: string;
  token: string;
  siteConfig: SiteConfig;
  renderMode?: SharedSitePreviewRecord['renderMode'];
  compilationAudit?: unknown;
  createdBy: string;
  now?: Date;
}): Promise<SharedSitePreviewRecord> {
  const createdAt = input.now ?? new Date();
  const renderMode = input.renderMode ?? 'standard';
  const retentionDays = sharedPreviewRetentionDays({
    renderMode,
    siteConfig: input.siteConfig,
  });
  const expiresAt = new Date(createdAt.getTime() + retentionDays * 86_400_000);
  const tokenHash = hashPreviewBearerToken(input.token);
  if (isMockMode()) {
    const record: SharedSitePreviewRecord = {
      id: crypto.randomUUID(),
      crawlArtifactId: input.crawlArtifactId,
      tokenHash,
      sourceUrl: input.sourceUrl,
      siteConfig: structuredClone(input.siteConfig),
      renderMode,
      noticeVersion: IMPORT_PREVIEW_NOTICE_VERSION,
      createdBy: input.createdBy,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      revokedAt: null,
      compilationAudit: input.compilationAudit === undefined
        ? null
        : structuredClone(input.compilationAudit),
    };
    mockPreviews().set(tokenHash, record);
    return structuredClone(record);
  }
  const { data, error } = await getServiceRoleClient()
    .from('shared_site_previews')
    .insert({
      crawl_artifact_id: input.crawlArtifactId,
      token_hash: tokenHash,
      source_url: input.sourceUrl,
      site_config: input.siteConfig,
      render_mode: renderMode,
      notice_version: IMPORT_PREVIEW_NOTICE_VERSION,
      created_by: input.createdBy,
      expires_at: expiresAt.toISOString(),
      ...(input.compilationAudit === undefined
        ? {}
        : { compilation_audit: input.compilationAudit }),
    })
    .select('*')
    .single();
  if (error) throw new Error(`shared preview create failed: ${error.message}`);
  return previewRowToRecord(data as SharedSitePreviewRow);
}

export async function getSharedSitePreviewByToken(
  token: string,
  now = new Date(),
): Promise<SharedSitePreviewRecord | null> {
  const tokenHash = hashPreviewBearerToken(token);
  let record: SharedSitePreviewRecord | null;
  if (isMockMode()) {
    const found = mockPreviews().get(tokenHash);
    record = found ? structuredClone(found) : null;
  } else {
    const { data, error } = await getServiceRoleClient()
      .from('shared_site_previews')
      .select('*')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (error) throw new Error(`shared preview lookup failed: ${error.message}`);
    record = data ? previewRowToRecord(data as SharedSitePreviewRow) : null;
  }
  if (!record || record.revokedAt || new Date(record.expiresAt) <= now) return null;
  return record;
}

/** Service-only lookup used by the first-party US demo heartbeat ingest. */
export async function getSharedSitePreviewById(
  id: string,
  now = new Date(),
): Promise<SharedSitePreviewRecord | null> {
  let record: SharedSitePreviewRecord | null;
  if (isMockMode()) {
    const found = [...mockPreviews().values()].find((preview) => preview.id === id);
    record = found ? structuredClone(found) : null;
  } else {
    const { data, error } = await getServiceRoleClient()
      .from('shared_site_previews')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`shared preview lookup failed: ${error.message}`);
    record = data ? previewRowToRecord(data as SharedSitePreviewRow) : null;
  }
  if (!record || record.revokedAt || new Date(record.expiresAt) <= now) return null;
  return record;
}

export async function revokeSharedSitePreview(id: string, now = new Date()): Promise<void> {
  if (isMockMode()) {
    for (const [hash, record] of mockPreviews()) {
      if (record.id !== id) continue;
      mockPreviews().set(hash, { ...record, revokedAt: now.toISOString() });
      return;
    }
    return;
  }
  const { error } = await getServiceRoleClient()
    .from('shared_site_previews')
    .update({ revoked_at: now.toISOString() })
    .eq('id', id)
    .is('revoked_at', null);
  if (error) throw new Error(`shared preview revoke failed: ${error.message}`);
}

export async function purgeExpiredCrawlerRecords(
  now = new Date(),
): Promise<{ artifacts: number; previews: number }> {
  if (!Number.isFinite(now.getTime())) throw new TypeError('A valid crawler retention date is required');
  if (isMockMode()) {
    let previews = 0;
    let artifacts = 0;
    for (const [hash, record] of mockPreviews()) {
      if (new Date(record.expiresAt) > now) continue;
      mockPreviews().delete(hash);
      previews += 1;
    }
    for (const [id, record] of mockArtifacts()) {
      if (new Date(record.expiresAt) > now) continue;
      mockArtifacts().delete(id);
      artifacts += 1;
      // 0066 turned the cascade into `on delete set null`: a preview the customer approved
      // outlives the raw material it was compiled from, so purging the artifact here must
      // detach the surviving previews rather than take them with it.
      for (const [hash, preview] of mockPreviews()) {
        if (preview.crawlArtifactId !== id) continue;
        mockPreviews().set(hash, { ...preview, crawlArtifactId: null });
      }
    }
    return { artifacts, previews };
  }
  const { data, error } = await getServiceRoleClient().rpc(
    'purge_expired_crawler_records',
    { p_before: now.toISOString() },
  );
  if (error) throw new Error(`crawler retention purge failed: ${error.message}`);
  const value = data as { artifacts?: unknown; previews?: unknown } | null;
  const artifacts = Number(value?.artifacts);
  const previews = Number(value?.previews);
  if (
    !Number.isSafeInteger(artifacts)
    || artifacts < 0
    || !Number.isSafeInteger(previews)
    || previews < 0
  ) {
    throw new Error('CRAWLER_RETENTION_PURGE_RESULT_INVALID');
  }
  return { artifacts, previews };
}
