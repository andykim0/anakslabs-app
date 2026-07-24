import 'server-only';

import { isMockMode } from '@/lib/env';
import { getServiceRoleClient } from '@/lib/data/supabase/client';
import {
  CRAWL_ARTIFACT_RETENTION_DAYS,
  type CrawlArtifactPayload,
  type CrawlArtifactRecord,
} from './contracts';

const MOCK_KEY = '__daboimCrawlArtifacts__' as const;
type GlobalWithArtifacts = typeof globalThis & {
  [MOCK_KEY]?: Map<string, CrawlArtifactRecord>;
};

function mockArtifacts(): Map<string, CrawlArtifactRecord> {
  const store = globalThis as GlobalWithArtifacts;
  return (store[MOCK_KEY] ??= new Map());
}

interface CrawlArtifactRow {
  id: string;
  seed_url: string;
  final_origin: string;
  artifact: CrawlArtifactPayload;
  decay_result: unknown | null;
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
      decayResult: null,
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

