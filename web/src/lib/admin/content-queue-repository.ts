import 'server-only';
import { getServiceRoleClient } from '@/lib/data/supabase/client';
import { isMockMode } from '@/lib/env';
import type {
  ContentPostCoverAsset,
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
  type ContentQueueSiteQuery,
  type ContentSlotProvisionInput,
  type ContentSlotProvisionResult,
} from './content-queue-core';
import { CONTENT_REWORK_REFUSAL_MESSAGES } from './content-rework-policy';
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
  'pending_version_id',
  'created_at',
  'updated_at',
].join(',');

/**
 * The queue is every non-terminal row plus the published rows carrying a staged rework (0060).
 * Additive by construction: the existing status list is untouched, and a published row without a
 * staged version is as absent from the queue as it always was.
 */
const QUEUE_FILTER = [
  `status.in.(${ADMIN_CONTENT_QUEUE_STATUSES.join(',')})`,
  'and(status.eq.published,pending_version_id.not.is.null)',
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
  'cover_asset_id',
  'created_at',
].join(',');

type AdminPostRow = ContentPostRow & {
  pricing_model_version: string;
  period_month: string;
  ordinal: number;
  pending_version_id: string | null;
  created_at: string;
};

type AdminVersionRow = ContentPostVersionRow & {
  version_number: number;
  created_at: string;
};

function queueError(error: { message: string; details?: string | null }, operation: string): Error {
  const detail = `${error.message} ${error.details ?? ''}`;
  // Checked ahead of the generic families below: both rework refusals name a specific reason the
  // operator can act on, and both would otherwise be flattened into "input is invalid".
  if (/safe-catalog swap refused/u.test(detail)) {
    return new ContentQueueError(
      'CONTENT_POST_SAFE_CATALOG_REFUSED',
      CONTENT_REWORK_REFUSAL_MESSAGES.safe_catalog,
    );
  }
  if (/public projection precheck failed/u.test(detail)) {
    return new ContentQueueError(
      'CONTENT_POST_POLICY_BLOCKED',
      CONTENT_REWORK_REFUSAL_MESSAGES.public_projection,
    );
  }
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
  /**
   * Cover rows for the versions being projected. Read separately for the same reason the public
   * repository does it: 0049's foreign key is unnamed, so an embed would ride on an auto-generated
   * constraint name. A failed read costs the thumbnail, never the queue.
   */
  private async coverAssetsFor(
    rows: readonly AdminVersionRow[],
  ): Promise<Map<string, ContentPostCoverAsset>> {
    const ids = [...new Set(rows.flatMap((row) => row.cover_asset_id ? [row.cover_asset_id] : []))];
    if (ids.length === 0) return new Map();
    const { data, error } = await getServiceRoleClient()
      .from('asset_records')
      .select('id,canonical_url,width,height')
      .in('id', ids);
    if (error || !data) return new Map();
    return new Map((data as unknown as {
      id: string;
      canonical_url: string;
      width: number | null;
      height: number | null;
    }[]).map((row) => [row.id, {
      assetId: row.id,
      url: row.canonical_url,
      width: row.width,
      height: row.height,
    }] as const));
  }

  private async versionsFor(
    versionIds: readonly string[],
  ): Promise<Map<string, ReturnType<typeof projectAdminContentVersion>>> {
    if (versionIds.length === 0) return new Map();
    const { data, error } = await getServiceRoleClient()
      .from('content_post_versions')
      .select(VERSION_COLUMNS)
      .in('id', [...versionIds]);
    if (error) throw new Error(`content queue version lookup failed: ${error.message}`);
    const rows = (data ?? []) as unknown as AdminVersionRow[];
    const covers = await this.coverAssetsFor(rows);
    return new Map(
      rows.map((row) => [
        row.id,
        projectAdminContentVersion(
          row,
          row.cover_asset_id ? covers.get(row.cover_asset_id) ?? null : null,
        ),
      ]),
    );
  }

  private async projectPosts(rows: readonly AdminPostRow[]): Promise<AdminContentQueueItem[]> {
    const versionIds = rows.flatMap((row) => [
      ...(row.current_version_id ? [row.current_version_id] : []),
      ...(row.pending_version_id ? [row.pending_version_id] : []),
    ]);
    const versions = await this.versionsFor(versionIds);
    return rows.flatMap((row) => {
      const version = row.current_version_id ? versions.get(row.current_version_id) ?? null : null;
      const pending = row.pending_version_id ? versions.get(row.pending_version_id) ?? null : null;
      const item = projectAdminContentItem(row, version, pending);
      return item ? [item] : [];
    });
  }

  async listNonterminal(limit?: number): Promise<AdminContentQueueItem[]> {
    const { data, error } = await getServiceRoleClient()
      .from('content_posts')
      .select(POST_COLUMNS)
      .or(QUEUE_FILTER)
      .order('updated_at', { ascending: true })
      .limit(normalizeContentQueueLimit(limit));
    if (error) throw new Error(`content queue list failed: ${error.message}`);
    return this.projectPosts((data ?? []) as unknown as AdminPostRow[]);
  }

  async countNonterminal(): Promise<number> {
    const { count, error } = await getServiceRoleClient()
      .from('content_posts')
      .select('id', { count: 'exact', head: true })
      .or(QUEUE_FILTER);
    if (error) throw new Error(`content queue count failed: ${error.message}`);
    return count ?? 0;
  }

  async listBySites(query: ContentQueueSiteQuery): Promise<AdminContentQueueItem[]> {
    if (query.siteIds.length === 0) return [];
    let request = getServiceRoleClient()
      .from('content_posts')
      .select(POST_COLUMNS)
      .in('site_id', [...query.siteIds]);
    if (query.periodMonths?.length) {
      request = request.in('period_month', [...query.periodMonths]);
    }
    if (query.beforePeriodMonth) {
      request = request.lt('period_month', query.beforePeriodMonth);
    }
    if (query.statuses?.length) {
      request = request.in('status', [...query.statuses]);
    }
    const { data, error } = await request
      .order('period_month', { ascending: query.order !== 'desc' })
      .order('ordinal', { ascending: true })
      .limit(normalizeContentQueueLimit(query.limit));
    if (error) throw new Error(`content slot list failed: ${error.message}`);
    return this.projectPosts((data ?? []) as unknown as AdminPostRow[]);
  }

  async provisionMonthlySlots(
    input: ContentSlotProvisionInput,
  ): Promise<ContentSlotProvisionResult> {
    const { data, error } = await getServiceRoleClient().rpc('provision_content_post_slots', {
      p_client_id: input.clientId,
      p_site_id: input.siteId,
      p_pricing_model_version: input.pricingModelVersion,
      p_period_month: input.periodMonth,
      p_count: input.count,
      p_actor_id: input.actorId,
    });
    if (error) throw queueError(error, 'content slot provisioning');
    const result = parseRpcObject(data, 'content slot provisioning');
    const created = Number(result.created);
    const existing = Number(result.existing);
    if (!Number.isSafeInteger(created) || !Number.isSafeInteger(existing)) {
      throw new Error('content slot provisioning returned an invalid result.');
    }
    return {
      periodMonth: input.periodMonth,
      created,
      existing,
      items: await this.listBySites({
        siteIds: [input.siteId],
        periodMonths: [input.periodMonth],
      }),
    };
  }

  /**
   * One row per paid generation that landed, for the whole month across every site.
   *
   * Counted on `content_post_versions` and not on `content_posts`, because a slot regenerated
   * after a rejection is one row and two calls. The month is read through the parent slot's
   * `period_month` — the month the post was PROMISED for — not the version's `created_at`, so a
   * generation that runs just after midnight on the 1st is still counted against the month it is
   * fulfilling. `!inner` makes the embed a join filter rather than an optional expansion.
   */
  async countGeneratedVersionsForMonth(periodMonth: string): Promise<number> {
    const { count, error } = await getServiceRoleClient()
      .from('content_post_versions')
      .select('id,content_posts!inner(period_month)', { count: 'exact', head: true })
      .eq('content_posts.period_month', periodMonth);
    if (error) throw new Error(`content generated version count failed: ${error.message}`);
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
      // Deployment ordering, deliberately: the parameter is only sent once a cover actually
      // exists. `CONTENT_COVER_IMAGES_ENABLED` is off by default, so on a database that has not
      // taken migration 0067 the payload stays byte-identical to the pre-cover call and the RPC
      // signature still resolves. Enabling the flag without the migration is what fails, loudly,
      // rather than silently discarding an image the run already paid for.
      ...(generated.cover ? { p_cover_asset_id: generated.cover.assetId } : {}),
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
    return this.publishResult(input.id, parseRpcObject(data, 'content post approval'));
  }

  private async publishResult(
    id: string,
    result: Record<string, unknown>,
  ): Promise<ContentPublishResult> {
    const item = await this.getById(id);
    if (!item) throw new ContentQueueError('CONTENT_POST_NOT_FOUND', 'Content post not found.');
    const site = result.site;
    const siteDomain = site && typeof site === 'object' && !Array.isArray(site)
      && typeof (site as Record<string, unknown>).domain === 'string'
      ? (site as Record<string, unknown>).domain as string
      : null;
    return { item, siteDomain, duplicated: result.duplicated === true };
  }

  async claimRework(input: { id: string; actorId: string }): Promise<AdminContentQueueItem> {
    const { error } = await getServiceRoleClient().rpc('claim_content_post_rework', {
      p_content_post_id: input.id,
      p_actor_id: input.actorId,
    });
    if (error) throw queueError(error, 'content rework claim');
    const item = await this.getById(input.id);
    if (!item) throw new ContentQueueError('CONTENT_POST_NOT_FOUND', 'Content post not found.');
    return item;
  }

  async storeReworkVersion(
    input: Parameters<ContentQueueRepository['storeReworkVersion']>[0],
  ): Promise<AdminContentQueueItem> {
    const generated = input.generated;
    const { error } = await getServiceRoleClient().rpc('store_content_post_rework_version', {
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
    if (error) throw queueError(error, 'content rework version store');
    const item = await this.getById(input.id);
    if (!item) throw new ContentQueueError('CONTENT_POST_NOT_FOUND', 'Content post not found.');
    return item;
  }

  async approveAndSwap(
    input: Parameters<ContentQueueRepository['approveAndSwap']>[0],
  ): Promise<ContentPublishResult> {
    const { data, error } = await getServiceRoleClient().rpc('approve_and_swap_content_post', {
      p_content_post_id: input.id,
      p_expected_version_id: input.expectedVersionId,
      p_actor_id: input.actorId,
      p_source_snapshot_sha256: input.sourceSnapshotSha256,
      p_honesty_policy_version: input.honestyPolicyVersion,
      p_medical_policy_version: input.medicalPolicyVersion,
      p_validated_document_sha256: input.validatedDocumentSha256,
    });
    if (error) throw queueError(error, 'content rework swap');
    return this.publishResult(input.id, parseRpcObject(data, 'content rework swap'));
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
