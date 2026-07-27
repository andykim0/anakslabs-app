import 'server-only';
import { getServiceRoleClient } from '@/lib/data/supabase/client';
import { isMockMode } from '@/lib/env';
import type {
  ContentPostRow,
  ContentPostVersionRow,
} from '@/lib/content-fulfillment/contracts';
import {
  ADMIN_CONTENT_QUEUE_STATUSES,
  ContentQueueError,
  normalizeContentQueueLimit,
  projectAdminContentItem,
  projectAdminContentVersion,
  type AdminContentQueueItem,
  type ContentGenerationClaim,
  type ContentPublishResult,
  type ContentQueueRepository,
} from './content-queue-core';
import { MockContentQueueRepository } from './content-queue-repository-mock';

const POST_COLUMNS = [
  'id',
  'client_id',
  'site_id',
  'pricing_model_version',
  'period_month',
  'ordinal',
  'slug',
  'status',
  'current_version_id',
  'published_version_id',
  'published_at',
  'created_at',
  'updated_at',
].join(',');

const VERSION_COLUMNS = [
  'id',
  'post_id',
  'version_number',
  'title',
  'summary',
  'tags',
  'document',
  'source_snapshot',
  'source_snapshot_sha256',
  'source_refs',
  'policy_versions',
  'validation_evidence',
  'generation_metadata',
  'created_at',
].join(',');

type AdminPostRow = ContentPostRow & {
  pricing_model_version: string;
  period_month: string;
  ordinal: number;
  created_at: string;
};

type AdminVersionRow = ContentPostVersionRow & {
  version_number: number;
  created_at: string;
};

function queueError(error: { message: string; details?: string | null }, operation: string): Error {
  const detail = `${error.message} ${error.details ?? ''}`;
  if (/not found/u.test(detail)) {
    return new ContentQueueError('CONTENT_POST_NOT_FOUND', 'Content post not found.');
  }
  if (/evidence conflict|source conflict/u.test(detail)) {
    return new ContentQueueError(
      'CONTENT_POST_SOURCE_CONFLICT',
      'The current source or validation evidence changed.',
    );
  }
  if (/state conflict/u.test(detail)) {
    return new ContentQueueError(
      'CONTENT_POST_STATE_CONFLICT',
      'The content post state changed.',
    );
  }
  if (/invalid|required|missing/u.test(detail)) {
    return new ContentQueueError(
      'CONTENT_POST_INPUT_INVALID',
      'The content post operation input is invalid.',
    );
  }
  return new Error(`${operation} failed: ${error.message}`);
}

function parseRpcObject(
  data: unknown,
  operation: string,
): Record<string, unknown> {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${operation} returned an invalid result.`);
  }
  return value as Record<string, unknown>;
}

export class SupabaseContentQueueRepository implements ContentQueueRepository {
  private async versionsFor(
    versionIds: readonly string[],
  ): Promise<Map<string, ReturnType<typeof projectAdminContentVersion>>> {
    if (versionIds.length === 0) return new Map();
    const { data, error } = await getServiceRoleClient()
      .from('content_post_versions')
      .select(VERSION_COLUMNS)
      .in('id', [...versionIds]);
    if (error) throw new Error(`content queue version lookup failed: ${error.message}`);
    return new Map(
      ((data ?? []) as unknown as AdminVersionRow[]).map((row) => [
        row.id,
        projectAdminContentVersion(row),
      ]),
    );
  }

  private async projectPosts(rows: readonly AdminPostRow[]): Promise<AdminContentQueueItem[]> {
    const versionIds = rows.flatMap((row) =>
      row.current_version_id ? [row.current_version_id] : []);
    const versions = await this.versionsFor(versionIds);
    return rows.flatMap((row) => {
      const version = row.current_version_id ? versions.get(row.current_version_id) ?? null : null;
      const item = projectAdminContentItem(row, version);
      return item ? [item] : [];
    });
  }

  async listNonterminal(limit?: number): Promise<AdminContentQueueItem[]> {
    const { data, error } = await getServiceRoleClient()
      .from('content_posts')
      .select(POST_COLUMNS)
      .in('status', [...ADMIN_CONTENT_QUEUE_STATUSES])
      .order('updated_at', { ascending: true })
      .limit(normalizeContentQueueLimit(limit));
    if (error) throw new Error(`content queue list failed: ${error.message}`);
    return this.projectPosts((data ?? []) as unknown as AdminPostRow[]);
  }

  async countNonterminal(): Promise<number> {
    const { count, error } = await getServiceRoleClient()
      .from('content_posts')
      .select('id', { count: 'exact', head: true })
      .in('status', [...ADMIN_CONTENT_QUEUE_STATUSES]);
    if (error) throw new Error(`content queue count failed: ${error.message}`);
    return count ?? 0;
  }

  async getById(id: string): Promise<AdminContentQueueItem | null> {
    const { data, error } = await getServiceRoleClient()
      .from('content_posts')
      .select(POST_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`content queue post lookup failed: ${error.message}`);
    if (!data) return null;
    return (await this.projectPosts([data as unknown as AdminPostRow]))[0] ?? null;
  }

  async claimGeneration(input: {
    id: string;
    actorId: string;
    regeneration: boolean;
  }): Promise<ContentGenerationClaim> {
    const client = getServiceRoleClient();
    const { data, error } = await client.rpc('claim_content_post_generation', {
      p_content_post_id: input.id,
      p_actor_id: input.actorId,
      p_regeneration: input.regeneration,
    });
    if (error) throw queueError(error, 'content generation claim');
    const result = parseRpcObject(data, 'content generation claim');
    const previousStatus = result.previousStatus;
    if (previousStatus !== 'draft' && previousStatus !== 'rejected') {
      throw new ContentQueueError(
        'CONTENT_POST_STATE_CONFLICT',
        'The generation claim returned an invalid previous state.',
      );
    }
    const item = await this.getById(input.id);
    if (!item) throw new ContentQueueError('CONTENT_POST_NOT_FOUND', 'Content post not found.');
    return { item, previousStatus };
  }

  async failGeneration(input: {
    id: string;
    actorId: string;
    restoreStatus: 'draft' | 'rejected';
    reason: string;
  }): Promise<void> {
    const { error } = await getServiceRoleClient().rpc('fail_content_post_generation', {
      p_content_post_id: input.id,
      p_actor_id: input.actorId,
      p_restore_status: input.restoreStatus,
      p_reason: input.reason,
    });
    if (error) throw queueError(error, 'content generation failure');
  }

  async storeGenerated(
    input: Parameters<ContentQueueRepository['storeGenerated']>[0],
  ): Promise<AdminContentQueueItem> {
    const generated = input.generated;
    const { error } = await getServiceRoleClient().rpc('store_content_post_generated', {
      p_content_post_id: input.id,
      p_actor_id: input.actorId,
      p_title: generated.post.title,
      p_summary: generated.post.summary,
      p_tags: [...generated.post.tags],
      p_document: generated.post.document,
      p_source_snapshot: generated.sourceSnapshot,
      p_source_snapshot_sha256: generated.sourceSnapshotSha256,
      p_source_refs: [...generated.sourceRefs],
      p_policy_versions: generated.policyVersions,
      p_validation_evidence: generated.validationEvidence,
      p_generation_metadata: generated.generationMetadata,
    });
    if (error) throw queueError(error, 'content generated version store');
    const item = await this.getById(input.id);
    if (!item) throw new ContentQueueError('CONTENT_POST_NOT_FOUND', 'Content post not found.');
    return item;
  }

  async reject(
    input: Parameters<ContentQueueRepository['reject']>[0],
  ): Promise<{ item: AdminContentQueueItem; duplicated: boolean }> {
    const { data, error } = await getServiceRoleClient().rpc('reject_content_post_version', {
      p_content_post_id: input.id,
      p_expected_version_id: input.expectedVersionId,
      p_actor_id: input.actorId,
      p_reason: input.reason,
    });
    if (error) throw queueError(error, 'content post rejection');
    const result = parseRpcObject(data, 'content post rejection');
    const item = await this.getById(input.id);
    if (!item) throw new ContentQueueError('CONTENT_POST_NOT_FOUND', 'Content post not found.');
    return { item, duplicated: result.duplicated === true };
  }

  async approveAndPublish(
    input: Parameters<ContentQueueRepository['approveAndPublish']>[0],
  ): Promise<ContentPublishResult> {
    const { data, error } = await getServiceRoleClient().rpc(
      'approve_and_publish_content_post',
      {
        p_content_post_id: input.id,
        p_expected_version_id: input.expectedVersionId,
        p_actor_id: input.actorId,
        p_source_snapshot_sha256: input.sourceSnapshotSha256,
        p_honesty_policy_version: input.honestyPolicyVersion,
        p_medical_policy_version: input.medicalPolicyVersion,
        p_validated_document_sha256: input.validatedDocumentSha256,
      },
    );
    if (error) throw queueError(error, 'content post approval');
    const result = parseRpcObject(data, 'content post approval');
    const item = await this.getById(input.id);
    if (!item) throw new ContentQueueError('CONTENT_POST_NOT_FOUND', 'Content post not found.');
    const site = result.site;
    const siteDomain = site && typeof site === 'object' && !Array.isArray(site)
      && typeof (site as Record<string, unknown>).domain === 'string'
      ? (site as Record<string, unknown>).domain as string
      : null;
    return { item, siteDomain, duplicated: result.duplicated === true };
  }
}

const GLOBAL_KEY = '__daboimContentQueueRepository__' as const;
type GlobalWithContentQueue = typeof globalThis & {
  [GLOBAL_KEY]?: ContentQueueRepository;
};

export function getContentQueueRepository(): ContentQueueRepository {
  const global = globalThis as GlobalWithContentQueue;
  global[GLOBAL_KEY] ??= isMockMode()
    ? new MockContentQueueRepository()
    : new SupabaseContentQueueRepository();
  return global[GLOBAL_KEY];
}

export type {
  AdminContentQueueItem,
  ContentQueueRepository,
} from './content-queue-core';
