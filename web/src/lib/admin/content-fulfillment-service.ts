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
import { getDataServices } from '@/lib/data';
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
  type ContentPublishResult,
  type ContentQueueRepository,
} from './content-queue-core';
import { getContentQueueRepository } from './content-queue-repository';

const topicSchema = z.string().trim().min(2).max(240);
const rejectionReasonSchema = z.string().trim().min(2).max(2_000);

interface ContentWorkflowDependencies {
  repository: ContentQueueRepository;
  generator: ContentTextGenerator;
  loadContext: typeof loadContentGenerationContext;
  indexNow: typeof submitIndexNow;
}

function dependencies(
  overrides: Partial<ContentWorkflowDependencies> = {},
): ContentWorkflowDependencies {
  return {
    repository: overrides.repository ?? getContentQueueRepository(),
    generator: overrides.generator ?? getDataServices().ai,
    loadContext: overrides.loadContext ?? loadContentGenerationContext,
    indexNow: overrides.indexNow ?? submitIndexNow,
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
  } = {},
): Promise<GeneratedContentPostVersion> {
  const storedSnapshot = storedContentQueueSourceSnapshot(item);
  const loadContext = options.loadContext ?? loadContentGenerationContext;
  const context = await loadContext(item.siteId, {
    capturedAt: storedSnapshot.capturedAt,
  });
  return validateContentQueueItemForPublish({
    item,
    currentSnapshot: context.sourceSnapshot,
    currentConfig: context.config,
    ...(options.clinicFlagValue !== undefined
      ? { clinicFlagValue: options.clinicFlagValue }
      : {}),
  });
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
    const context = await deps.loadContext(claim.item.siteId);
    const generated = await generateContentPostVersion({
      generator: deps.generator,
      snapshot: context.sourceSnapshot,
      config: context.config,
      topic: parsedTopic.data,
      slug: claim.item.slug,
    });
    return deps.repository.storeGenerated({
      id: input.id,
      actorId: input.actorId,
      generated,
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
  dependencies?: Partial<ContentWorkflowDependencies>;
}): Promise<ContentPublishResult> {
  const deps = dependencies(input.dependencies);
  const item = await deps.repository.getById(input.id);
  requiredItem(item);
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
