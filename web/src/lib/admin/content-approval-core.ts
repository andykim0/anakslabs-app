import { z } from 'zod';
import { MEDICAL_AD_POLICY_VERSION } from '@/lib/content/medical-ad-policy';
import {
  contentSourceSnapshotSchema,
  type ContentSourceSnapshot,
} from '@/lib/content-fulfillment/contracts';
import {
  CONTENT_HONESTY_POLICY_VERSION,
  generatedContentPostSchema,
  type GeneratedContentPost,
} from '@/lib/content-fulfillment/honesty';
import {
  validateContentPostForPending,
  type GeneratedContentPostVersion,
} from '@/lib/content-fulfillment/generation';
import { contentSha256 } from '@/lib/content-fulfillment/source-snapshot';
import type { SiteConfig } from '@/lib/types/site';
import {
  ContentQueueError,
  type AdminContentQueueItem,
  type AdminContentQueueVersion,
} from './content-queue-core';

const evidenceSchema = z.object({
  version: z.literal(1),
  honesty: z.object({
    ok: z.literal(true),
    policyVersion: z.literal(CONTENT_HONESTY_POLICY_VERSION),
    usedSourceRefs: z.array(z.string()),
    titleSourceRefs: z.array(z.string()),
    summarySourceRefs: z.array(z.string()),
  }).passthrough(),
  medical: z.object({
    ok: z.literal(true),
    policyVersion: z.literal(MEDICAL_AD_POLICY_VERSION),
  }).passthrough(),
  validatedDocumentSha256: z.string().regex(/^[a-f0-9]{64}$/u),
}).passthrough();

export function contentQueueValidationEvidence(
  version: AdminContentQueueVersion | null,
): z.infer<typeof evidenceSchema> {
  const evidence = evidenceSchema.safeParse(version?.validationEvidence);
  if (!evidence.success) {
    throw new ContentQueueError(
      'CONTENT_POST_POLICY_BLOCKED',
      'The stored validation evidence is invalid.',
    );
  }
  return evidence.data;
}

/**
 * The version an approval is about. Defaults to the one the site is serving; a rework swap passes
 * the staged version instead (0060). Either way it must be a version the row itself points at —
 * an approval never validates a version that is not on one of the two pointers.
 */
function versionUnderReview(
  item: AdminContentQueueItem,
  version: AdminContentQueueVersion | null,
): AdminContentQueueVersion {
  if (!version || (version.id !== item.currentVersionId && version.id !== item.pendingVersionId)) {
    throw new ContentQueueError(
      'CONTENT_POST_STATE_CONFLICT',
      'The immutable content version under review is missing.',
    );
  }
  return version;
}

export function storedContentQueueSourceSnapshot(
  item: AdminContentQueueItem,
  reviewed: AdminContentQueueVersion | null = item.currentVersion,
): ContentSourceSnapshot {
  const version = versionUnderReview(item, reviewed);
  const storedSnapshot = contentSourceSnapshotSchema.safeParse(version.sourceSnapshot);
  if (!storedSnapshot.success) {
    throw new ContentQueueError(
      'CONTENT_POST_SOURCE_CONFLICT',
      'The stored source snapshot is invalid.',
    );
  }
  return storedSnapshot.data;
}

function generatedPostFromQueueItem(
  item: AdminContentQueueItem,
  reviewed: AdminContentQueueVersion | null,
): GeneratedContentPost {
  const version = versionUnderReview(item, reviewed);
  const evidence = contentQueueValidationEvidence(version);
  return generatedContentPostSchema.parse({
    slug: item.slug,
    title: version.title,
    titleSourceRefs: evidence.honesty.titleSourceRefs,
    summary: version.summary,
    summarySourceRefs: evidence.honesty.summarySourceRefs,
    tags: version.tags,
    document: version.document,
  });
}

/**
 * 승인 직전 순수 검증. 저장 감사값 대신 현재 survey에서 다시 만든 snapshot과 현재
 * SiteConfig/정책을 사용한다. 달라진 원료는 새 불변 버전 생성을 요구한다.
 */
export function validateContentQueueItemForPublish(input: {
  item: AdminContentQueueItem;
  currentSnapshot: ContentSourceSnapshot;
  currentConfig: SiteConfig;
  clinicFlagValue?: string;
  /** Defaults to the served version; a rework swap validates the staged one instead. */
  reviewedVersion?: AdminContentQueueVersion | null;
}): GeneratedContentPostVersion {
  const version = versionUnderReview(
    input.item,
    input.reviewedVersion === undefined ? input.item.currentVersion : input.reviewedVersion,
  );
  const storedSnapshot = storedContentQueueSourceSnapshot(input.item, version);
  const currentSnapshotSha256 = contentSha256(input.currentSnapshot);
  if (
    currentSnapshotSha256 !== version.sourceSnapshotSha256
    || currentSnapshotSha256 !== contentSha256(storedSnapshot)
  ) {
    throw new ContentQueueError(
      'CONTENT_POST_SOURCE_CONFLICT',
      '고객 원료가 생성 이후 바뀌었습니다. 현재 원료로 다시 생성해 주세요.',
    );
  }

  let validated: GeneratedContentPostVersion;
  try {
    validated = validateContentPostForPending({
      post: generatedPostFromQueueItem(input.item, version),
      snapshot: input.currentSnapshot,
      config: input.currentConfig,
      ...(input.clinicFlagValue !== undefined
        ? { clinicFlagValue: input.clinicFlagValue }
        : {}),
    });
  } catch (error) {
    throw new ContentQueueError(
      'CONTENT_POST_POLICY_BLOCKED',
      error instanceof Error ? error.message : '현재 공개 정책을 통과하지 못했습니다.',
    );
  }
  const evidence = contentQueueValidationEvidence(version);
  if (
    validated.validationEvidence.validatedDocumentSha256
      !== evidence.validatedDocumentSha256
    || JSON.stringify(validated.sourceRefs) !== JSON.stringify(version.sourceRefs)
  ) {
    throw new ContentQueueError(
      'CONTENT_POST_POLICY_BLOCKED',
      '저장된 버전과 현재 검증 결과가 일치하지 않습니다.',
    );
  }
  return validated;
}
