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
  createdAt: string;
  updatedAt: string;
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
}

export type ContentQueueErrorCode =
  | 'CONTENT_POST_NOT_FOUND'
  | 'CONTENT_POST_STATE_CONFLICT'
  | 'CONTENT_POST_SOURCE_CONFLICT'
  | 'CONTENT_POST_POLICY_BLOCKED'
  | 'CONTENT_POST_INPUT_INVALID';

export class ContentQueueError extends Error {
  constructor(readonly code: ContentQueueErrorCode, message: string) {
    super(message);
    this.name = 'ContentQueueError';
  }
}

export function normalizeContentQueueLimit(limit = 200): number {
  return Number.isSafeInteger(limit) && limit > 0 && limit <= 500 ? limit : 200;
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
  },
  version: AdminContentQueueVersion | null,
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
    createdAt: row.created_at ?? row.updated_at,
    updatedAt: row.updated_at,
  };
}
