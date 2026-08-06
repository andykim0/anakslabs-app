import 'server-only';
import { z } from 'zod';
import { MEDICAL_AD_POLICY_VERSION } from '@/lib/content/medical-ad-policy';
import {
  CONTENT_HONESTY_POLICY_VERSION,
} from '@/lib/content-fulfillment/honesty';
import {
  ContentPostGenerationError,
  generateContentPostVersion,
  type ContentTextGenerator,
  type GeneratedContentPostVersion,
} from '@/lib/content-fulfillment/generation';
import { loadContentGenerationContext } from '@/lib/content-fulfillment/generation-repository';
import {
  createContentPostTextGenerator,
  type ContentPostGenerationObservation,
} from '@/lib/content-fulfillment/text-generator';
import { submitIndexNow } from '@/lib/seo/indexnow';
import { siteUrlOf } from '@/lib/seo/structured-data';
import {
  contentQueueValidationEvidence,
  storedContentQueueSourceSnapshot,
  validateContentQueueItemForPublish,
} from './content-approval-core';
import {
  ContentQueueError,
  type AdminContentQueueItem,
  type AdminContentQueueVersion,
  type ContentPublishResult,
  type ContentQueueRepository,
} from './content-queue-core';
import { getContentQueueRepository } from './content-queue-repository';
import { safeCatalogApprovalOverrideRequired } from './content-safe-catalog-policy';

const topicSchema = z.string().trim().min(2).max(240);
const rejectionReasonSchema = z.string().trim().min(2).max(2_000);

interface ContentWorkflowDependencies {
  repository: ContentQueueRepository;
  generator: ContentTextGenerator;
  loadContext: typeof loadContentGenerationContext;
  indexNow: typeof submitIndexNow;
}

interface ResolvedContentWorkflowDependencies extends ContentWorkflowDependencies {
  generationObservations: ContentPostGenerationObservation[];
}

function dependencies(
  overrides: Partial<ContentWorkflowDependencies> = {},
): ResolvedContentWorkflowDependencies {
  const generationObservations: ContentPostGenerationObservation[] = [];
  return {
    repository: overrides.repository ?? getContentQueueRepository(),
    generator: overrides.generator ?? createContentPostTextGenerator({
      onObservation: (observation) => generationObservations.push(observation),
    }),
    loadContext: overrides.loadContext ?? loadContentGenerationContext,
    indexNow: overrides.indexNow ?? submitIndexNow,
    generationObservations,
  };
}

function requiredItem(
  item: AdminContentQueueItem | null,
): asserts item is AdminContentQueueItem {
  if (!item) {
    throw new ContentQueueError('CONTENT_POST_NOT_FOUND', 'Content post not found.');
  }
}

/**
 * 승인 버튼 직전 재검사. 저장된 감사값을 신뢰하지 않고 현재 survey/config와 현재 정책으로
 * 같은 공개 문서를 다시 검사한다. source snapshot이 변했으면 새 버전 생성을 요구한다.
 */
export async function revalidateContentQueueItemForPublish(
  item: AdminContentQueueItem,
  options: {
    loadContext?: typeof loadContentGenerationContext;
    clinicFlagValue?: string;
    /** A rework swap revalidates the staged version; everything else the served one. */
    reviewedVersion?: AdminContentQueueVersion | null;
  } = {},
): Promise<GeneratedContentPostVersion> {
  const reviewedVersion = options.reviewedVersion === undefined
    ? item.currentVersion
    : options.reviewedVersion;
  const storedSnapshot = storedContentQueueSourceSnapshot(item, reviewedVersion);
  const loadContext = options.loadContext ?? loadContentGenerationContext;
  const context = await loadContext(item.siteId, {
    capturedAt: storedSnapshot.capturedAt,
  });
  return validateContentQueueItemForPublish({
    item,
    currentSnapshot: context.sourceSnapshot,
    currentConfig: context.config,
    reviewedVersion,
    ...(options.clinicFlagValue !== undefined
      ? { clinicFlagValue: options.clinicFlagValue }
      : {}),
  });
}

/**
 * One generation attempt for one slot: current source material, the policy gates, and the
 * provider evidence the console shows. Shared by the first draft and by a rework, because a
 * reworked post has to clear exactly the gates the original did.
 */
async function generateVersionForItem(
  item: AdminContentQueueItem,
  topic: string,
  deps: ResolvedContentWorkflowDependencies,
): Promise<GeneratedContentPostVersion> {
  const context = await deps.loadContext(item.siteId);
  const generated = await generateContentPostVersion({
    generator: deps.generator,
    snapshot: context.sourceSnapshot,
    config: context.config,
    topic,
    slug: item.slug,
    onAttemptRejected: ({ attempt, code, paths }) => {
      // Paths and gate classes are operationally useful; rejected customer copy is not logged.
      console.warn('[content-generation] attempt rejected', { attempt, code, paths });
    },
  });
  if (deps.generationObservations.length === 0) return generated;
  // The provider transcript is audit evidence beside the pipeline's own metadata, not part of the
  // generation contract, so it is attached after the contract-typed value is built.
  const withProviderEvidence = {
    ...generated,
    generationMetadata: {
      ...generated.generationMetadata,
      provider: {
        name: 'anthropic',
        responses: deps.generationObservations,
      },
    },
  };
  return withProviderEvidence;
}

export async function generateAdminContentPost(input: {
  id: string;
  actorId: string;
  topic: string;
  regeneration: boolean;
  dependencies?: Partial<ContentWorkflowDependencies>;
}): Promise<AdminContentQueueItem> {
  const parsedTopic = topicSchema.safeParse(input.topic);
  if (!parsedTopic.success) {
    throw new ContentQueueError(
      'CONTENT_POST_INPUT_INVALID',
      '생성 주제는 2자 이상 240자 이하여야 합니다.',
    );
  }
  const deps = dependencies(input.dependencies);
  const claim = await deps.repository.claimGeneration({
    id: input.id,
    actorId: input.actorId,
    regeneration: input.regeneration,
  });
  try {
    return await deps.repository.storeGenerated({
      id: input.id,
      actorId: input.actorId,
      generated: await generateVersionForItem(claim.item, parsedTopic.data, deps),
    });
  } catch (error) {
    try {
      await deps.repository.failGeneration({
        id: input.id,
        actorId: input.actorId,
        restoreStatus: claim.previousStatus,
        reason: error instanceof Error ? error.message : 'content generation failed',
      });
    } catch {
      // 원래 생성 실패를 보존한다. DB RPC 자체가 원자적이라 상태 복구 실패는 운영 로그 대상이다.
    }
    if (error instanceof ContentPostGenerationError) {
      throw new ContentQueueError(
        'CONTENT_POST_POLICY_BLOCKED',
        error.message,
      );
    }
    throw error;
  }
}

export async function rejectAdminContentPost(input: {
  id: string;
  expectedVersionId: string;
  actorId: string;
  reason: string;
  repository?: ContentQueueRepository;
}) {
  const parsedReason = rejectionReasonSchema.safeParse(input.reason);
  if (!parsedReason.success) {
    throw new ContentQueueError(
      'CONTENT_POST_INPUT_INVALID',
      '반려 사유는 2자 이상 2,000자 이하여야 합니다.',
    );
  }
  return (input.repository ?? getContentQueueRepository()).reject({
    id: input.id,
    expectedVersionId: input.expectedVersionId,
    actorId: input.actorId,
    reason: parsedReason.data,
  });
}

async function notifyPostPublish(
  result: ContentPublishResult,
  slug: string,
  indexNow: typeof submitIndexNow,
): Promise<void> {
  const base = siteUrlOf(result.siteDomain);
  if (!base || result.duplicated) return;
  try {
    const host = new URL(base).host;
    await indexNow(host, [
      `${base}/blog`,
      `${base}/blog/${encodeURIComponent(slug)}`,
    ]);
  } catch (error) {
    console.warn('[content-publish] IndexNow follow-up failed:', error);
  }
}

export async function approveAdminContentPost(input: {
  id: string;
  expectedVersionId: string;
  actorId: string;
  safeCatalogOverrideConfirmed?: boolean;
  dependencies?: Partial<ContentWorkflowDependencies>;
}): Promise<ContentPublishResult> {
  const deps = dependencies(input.dependencies);
  const item = await deps.repository.getById(input.id);
  requiredItem(item);
  if (safeCatalogApprovalOverrideRequired({
    item,
    expectedVersionId: input.expectedVersionId,
    overrideConfirmed: input.safeCatalogOverrideConfirmed === true,
  })) {
    throw new ContentQueueError(
      'CONTENT_POST_STATE_CONFLICT',
      'Safe-catalog fallback drafts require an explicit operator override before approval.',
    );
  }
  if (item.status === 'published' && item.currentVersionId === input.expectedVersionId) {
    const evidence = contentQueueValidationEvidence(item.currentVersion);
    return deps.repository.approveAndPublish({
      id: input.id,
      expectedVersionId: input.expectedVersionId,
      actorId: input.actorId,
      sourceSnapshotSha256: item.currentVersion?.sourceSnapshotSha256 ?? '',
      honestyPolicyVersion: CONTENT_HONESTY_POLICY_VERSION,
      medicalPolicyVersion: MEDICAL_AD_POLICY_VERSION,
      validatedDocumentSha256: evidence.validatedDocumentSha256,
    });
  }
  if (item.status !== 'pending_approval' || item.currentVersionId !== input.expectedVersionId) {
    throw new ContentQueueError(
      'CONTENT_POST_STATE_CONFLICT',
      '현재 상태에서는 승인·발행할 수 없습니다.',
    );
  }
  const validated = await revalidateContentQueueItemForPublish(item, {
    loadContext: deps.loadContext,
  });
  const result = await deps.repository.approveAndPublish({
    id: input.id,
    expectedVersionId: input.expectedVersionId,
    actorId: input.actorId,
    sourceSnapshotSha256: validated.sourceSnapshotSha256,
    honestyPolicyVersion: CONTENT_HONESTY_POLICY_VERSION,
    medicalPolicyVersion: MEDICAL_AD_POLICY_VERSION,
    validatedDocumentSha256: validated.validationEvidence.validatedDocumentSha256,
  });
  await notifyPostPublish(result, item.slug, deps.indexNow);
  return result;
}

/**
 * Generates a replacement for a post that is already live and stages it.
 *
 * Nothing about what the customer's site is serving changes here, including when generation
 * fails: the status never moves, so there is no state to restore afterwards and no window in
 * which the post is off the air. The claim is recorded once per rework — a second attempt after a
 * refused swap re-stages over the version already sitting there, which is the recovery path, and
 * re-claiming a post that already has one staged is a state conflict in both the RPC and the mock.
 */
export async function reworkAdminContentPost(input: {
  id: string;
  actorId: string;
  topic: string;
  dependencies?: Partial<ContentWorkflowDependencies>;
}): Promise<AdminContentQueueItem> {
  const parsedTopic = topicSchema.safeParse(input.topic);
  if (!parsedTopic.success) {
    throw new ContentQueueError(
      'CONTENT_POST_INPUT_INVALID',
      'The generation topic must be between 2 and 240 characters.',
    );
  }
  const deps = dependencies(input.dependencies);
  const existing = await deps.repository.getById(input.id);
  requiredItem(existing);
  if (existing.status !== 'published') {
    throw new ContentQueueError(
      'CONTENT_POST_STATE_CONFLICT',
      'Only a published post can be reworked.',
    );
  }
  const item = existing.pendingVersionId === null
    ? await deps.repository.claimRework({ id: input.id, actorId: input.actorId })
    : existing;
  try {
    return await deps.repository.storeReworkVersion({
      id: input.id,
      actorId: input.actorId,
      generated: await generateVersionForItem(item, parsedTopic.data, deps),
    });
  } catch (error) {
    if (error instanceof ContentPostGenerationError) {
      throw new ContentQueueError('CONTENT_POST_POLICY_BLOCKED', error.message);
    }
    throw error;
  }
}

/**
 * Swaps a staged rework onto both serving pointers.
 *
 * The staged version is revalidated against today's source material and today's policies exactly
 * as a first publication is — a rework is a publication. The refusals that are specific to
 * replacing live content (the generator's fallback copy, and anything the public projection would
 * drop) live at the swap boundary itself, so they hold whichever repository is behind this call.
 */
export async function approveSwapAdminContentPost(input: {
  id: string;
  expectedVersionId: string;
  actorId: string;
  dependencies?: Partial<ContentWorkflowDependencies>;
}): Promise<ContentPublishResult> {
  const deps = dependencies(input.dependencies);
  const item = await deps.repository.getById(input.id);
  requiredItem(item);
  if (
    item.status !== 'published'
    || item.pendingVersionId !== input.expectedVersionId
    || !item.pendingVersion
  ) {
    throw new ContentQueueError(
      'CONTENT_POST_STATE_CONFLICT',
      'There is no staged rework matching that version.',
    );
  }
  const validated = await revalidateContentQueueItemForPublish(item, {
    loadContext: deps.loadContext,
    reviewedVersion: item.pendingVersion,
  });
  const result = await deps.repository.approveAndSwap({
    id: input.id,
    expectedVersionId: input.expectedVersionId,
    actorId: input.actorId,
    sourceSnapshotSha256: validated.sourceSnapshotSha256,
    honestyPolicyVersion: CONTENT_HONESTY_POLICY_VERSION,
    medicalPolicyVersion: MEDICAL_AD_POLICY_VERSION,
    validatedDocumentSha256: validated.validationEvidence.validatedDocumentSha256,
  });
  await notifyPostPublish(result, item.slug, deps.indexNow);
  return result;
}
