import type {
  ContentPostDocument,
  ContentPostRow,
  ContentPostStatus,
  ContentPostVersionRow,
} from '@/lib/content-fulfillment/contracts';
import {
  CONTENT_POST_STATUSES,
  contentPostDocumentSchema,
} from '@/lib/content-fulfillment/contracts';
import type { GeneratedContentPostVersion } from '@/lib/content-fulfillment/generation';

export const ADMIN_CONTENT_QUEUE_STATUSES = [
  'draft',
  'generating',
  'pending_approval',
  'rejected',
] as const satisfies readonly ContentPostStatus[];

export interface AdminContentQueueVersion {
  id: string;
  versionNumber: number;
  title: string;
  summary: string;
  tags: readonly string[];
  document: ContentPostDocument;
  sourceSnapshot: unknown;
  sourceSnapshotSha256: string;
  sourceRefs: readonly string[];
  policyVersions: Record<string, unknown>;
  validationEvidence: Record<string, unknown>;
  generationMetadata: Record<string, unknown>;
  createdAt: string;
}

export interface AdminContentQueueItem {
  id: string;
  clientId: string;
  siteId: string;
  pricingModelVersion: string;
  periodMonth: string;
  ordinal: number;
  slug: string;
  status: ContentPostStatus;
  currentVersionId: string | null;
  currentVersion: AdminContentQueueVersion | null;
  /** Published pointer. Only ever set together, and only while status is published. */
  publishedVersionId: string | null;
  publishedAt: string | null;
  /**
   * Rework staged against an already-published post (0060). Deliberately a separate field rather
   * than an overwrite of `currentVersion`: this projection is shared by the admin queue, the
   * customer blog screen and the fulfillment counters, and `currentVersion` means one thing
   * everywhere — the version `current_version_id` points at, which is the one the customer's site
   * is serving right now. Loading a staged rework into it would count an unapproved post as
   * delivered and show its title on the customer's dashboard before anyone approved it.
   */
  pendingVersionId: string | null;
  pendingVersion: AdminContentQueueVersion | null;
  createdAt: string;
  updatedAt: string;
}

/** A published row whose replacement is staged and waiting for an operator decision. */
export function hasStagedRework(item: AdminContentQueueItem): boolean {
  return item.status === 'published' && item.pendingVersionId !== null;
}

export interface ContentGenerationClaim {
  item: AdminContentQueueItem;
  previousStatus: 'draft' | 'rejected';
}

export interface ContentPublishResult {
  item: AdminContentQueueItem;
  siteDomain: string | null;
  duplicated: boolean;
}

export interface ContentSlotProvisionInput {
  clientId: string;
  siteId: string;
  pricingModelVersion: string;
  /** Calendar-month key, `YYYY-MM-01`, resolved in the site's own time zone. */
  periodMonth: string;
  /** Slots the contract owes for that month. Ordinals run 1..count. */
  count: number;
  actorId: string;
}

export interface ContentSlotProvisionResult {
  periodMonth: string;
  created: number;
  existing: number;
  items: AdminContentQueueItem[];
}

export interface ContentQueueSiteQuery {
  siteIds: readonly string[];
  /** Optional `YYYY-MM-01` filter. Omit to read a site's whole history. */
  periodMonths?: readonly string[];
  /**
   * Exclusive upper bound on `period_month` (`YYYY-MM-01`). Lets a caller ask for history
   * without the current month, so the current month can be fetched exactly and never competes
   * with old rows for the row budget.
   */
  beforePeriodMonth?: string;
  statuses?: readonly ContentPostStatus[];
  /** `period_month` direction; ordinal always ascends within a month. Defaults to ascending. */
  order?: 'asc' | 'desc';
  limit?: number;
}

export interface ContentQueueRepository {
  listNonterminal(limit?: number): Promise<AdminContentQueueItem[]>;
  countNonterminal(): Promise<number>;
  /**
   * Every status including published — the fulfillment counters and the customer view both need
   * the delivered rows that the admin queue deliberately drops.
   */
  listBySites(query: ContentQueueSiteQuery): Promise<AdminContentQueueItem[]>;
  /** Idempotent: fills only the ordinals this site is still missing for the month. */
  provisionMonthlySlots(input: ContentSlotProvisionInput): Promise<ContentSlotProvisionResult>;
  /**
   * Immutable version rows written for one `period_month`, across every site.
   *
   * The monthly spend cap for the batch is counted from this rather than from a per-run tally:
   * one version row is one paid generation that actually landed, so a crashed run that is retried
   * cannot spend the month's budget twice. Callers treat a throw as "fully spent".
   */
  countGeneratedVersionsForMonth(periodMonth: string): Promise<number>;
  getById(id: string): Promise<AdminContentQueueItem | null>;
  claimGeneration(input: {
    id: string;
    actorId: string;
    regeneration: boolean;
  }): Promise<ContentGenerationClaim>;
  failGeneration(input: {
    id: string;
    actorId: string;
    restoreStatus: 'draft' | 'rejected';
    reason: string;
  }): Promise<void>;
  storeGenerated(input: {
    id: string;
    actorId: string;
    generated: GeneratedContentPostVersion;
  }): Promise<AdminContentQueueItem>;
  reject(input: {
    id: string;
    expectedVersionId: string;
    actorId: string;
    reason: string;
  }): Promise<{ item: AdminContentQueueItem; duplicated: boolean }>;
  approveAndPublish(input: {
    id: string;
    expectedVersionId: string;
    actorId: string;
    sourceSnapshotSha256: string;
    honestyPolicyVersion: string;
    medicalPolicyVersion: string;
    validatedDocumentSha256: string;
  }): Promise<ContentPublishResult>;
  /** Opens a rework on a published post. The status and both serving pointers stay put. */
  claimRework(input: { id: string; actorId: string }): Promise<AdminContentQueueItem>;
  /** Stages a replacement version. The live post keeps serving its current version. */
  storeReworkVersion(input: {
    id: string;
    actorId: string;
    generated: GeneratedContentPostVersion;
  }): Promise<AdminContentQueueItem>;
  /** Moves both serving pointers onto the staged version in one step, or refuses. */
  approveAndSwap(input: {
    id: string;
    expectedVersionId: string;
    actorId: string;
    sourceSnapshotSha256: string;
    honestyPolicyVersion: string;
    medicalPolicyVersion: string;
    validatedDocumentSha256: string;
  }): Promise<ContentPublishResult>;
}

export type ContentQueueErrorCode =
  | 'CONTENT_POST_NOT_FOUND'
  | 'CONTENT_POST_STATE_CONFLICT'
  | 'CONTENT_POST_SOURCE_CONFLICT'
  | 'CONTENT_POST_POLICY_BLOCKED'
  | 'CONTENT_POST_INPUT_INVALID'
  /** A staged rework is the generator's own fallback copy; swapping it in republishes boilerplate. */
  | 'CONTENT_POST_SAFE_CATALOG_REFUSED';

export class ContentQueueError extends Error {
  constructor(readonly code: ContentQueueErrorCode, message: string) {
    super(message);
    this.name = 'ContentQueueError';
  }
}

export const CONTENT_QUEUE_DEFAULT_LIMIT = 200;
export const CONTENT_QUEUE_MAX_LIMIT = 500;

/**
 * A caller asking for more than the ceiling wants as much as it can get, so it is clamped down
 * to the ceiling. A caller passing a nonsensical limit (0, negative, fractional, NaN) has said
 * nothing meaningful, so it falls back to the default. Collapsing the two — as this once did —
 * silently turned "give me 1000" into "give me 200", which is the shape of a truncation bug.
 */
export function normalizeContentQueueLimit(limit = CONTENT_QUEUE_DEFAULT_LIMIT): number {
  if (!Number.isSafeInteger(limit) || limit <= 0) return CONTENT_QUEUE_DEFAULT_LIMIT;
  return Math.min(limit, CONTENT_QUEUE_MAX_LIMIT);
}

export function isAdminContentQueueStatus(
  status: string,
): status is (typeof ADMIN_CONTENT_QUEUE_STATUSES)[number] {
  return (ADMIN_CONTENT_QUEUE_STATUSES as readonly string[]).includes(status);
}

function isContentPostStatus(status: string): status is ContentPostStatus {
  return (CONTENT_POST_STATUSES as readonly string[]).includes(status);
}

export function projectAdminContentVersion(
  row: ContentPostVersionRow & { version_number?: number; created_at?: string },
): AdminContentQueueVersion | null {
  if (
    !Number.isSafeInteger(row.version_number)
    || (row.version_number ?? 0) < 1
    || typeof row.source_snapshot_sha256 !== 'string'
    || !Array.isArray(row.source_refs)
    || !row.source_refs.every((sourceRef) => typeof sourceRef === 'string')
    || !row.policy_versions
    || typeof row.policy_versions !== 'object'
    || Array.isArray(row.policy_versions)
    || !row.validation_evidence
    || typeof row.validation_evidence !== 'object'
    || Array.isArray(row.validation_evidence)
    || !row.generation_metadata
    || typeof row.generation_metadata !== 'object'
    || Array.isArray(row.generation_metadata)
  ) {
    return null;
  }
  const parsedDocument = contentPostDocumentSchema.safeParse(row.document);
  const tags = Array.isArray(row.tags) && row.tags.every((tag) => typeof tag === 'string')
    ? row.tags
    : null;
  if (!parsedDocument.success || !tags) return null;
  return {
    id: row.id,
    versionNumber: row.version_number!,
    title: row.title,
    summary: row.summary,
    tags,
    document: parsedDocument.data,
    sourceSnapshot: row.source_snapshot,
    sourceSnapshotSha256: row.source_snapshot_sha256,
    sourceRefs: row.source_refs,
    policyVersions: row.policy_versions as Record<string, unknown>,
    validationEvidence: row.validation_evidence as Record<string, unknown>,
    generationMetadata: row.generation_metadata as Record<string, unknown>,
    createdAt: row.created_at ?? '',
  };
}

export function projectAdminContentItem(
  row: ContentPostRow & {
    pricing_model_version?: string;
    period_month?: string;
    ordinal?: number;
    created_at?: string;
    /** 0060. Absent on callers that predate rework, which is the same thing as unstaged. */
    pending_version_id?: string | null;
  },
  version: AdminContentQueueVersion | null,
  pendingVersion: AdminContentQueueVersion | null = null,
): AdminContentQueueItem | null {
  if (
    !isContentPostStatus(row.status)
    || typeof row.pricing_model_version !== 'string'
    || typeof row.period_month !== 'string'
    || !Number.isSafeInteger(row.ordinal)
  ) {
    return null;
  }
  if (row.current_version_id && (!version || version.id !== row.current_version_id)) return null;
  const pendingVersionId = row.pending_version_id ?? null;
  // Same discipline as the current pointer: a row pointing at a version this projection could not
  // load is dropped whole rather than shown with a pointer that resolves to nothing.
  if (pendingVersionId && (!pendingVersion || pendingVersion.id !== pendingVersionId)) return null;
  return {
    id: row.id,
    clientId: row.client_id,
    siteId: row.site_id,
    pricingModelVersion: row.pricing_model_version,
    periodMonth: row.period_month,
    ordinal: row.ordinal!,
    slug: row.slug,
    status: row.status,
    currentVersionId: row.current_version_id,
    currentVersion: version,
    publishedVersionId: row.published_version_id,
    publishedAt: row.published_at,
    pendingVersionId,
    pendingVersion: pendingVersionId ? pendingVersion : null,
    createdAt: row.created_at ?? row.updated_at,
    updatedAt: row.updated_at,
  };
}
