/**
 * POST /api/edit-requests — 편집 요청 제출 (크레딧 차감 → AI 생성 → QA 대기).
 *   body: { siteId, type, requestedContent, confirmUpsell? }
 *   - video는 편집요청 생성·크레딧 차감 전에 VIDEO_GEN 가드 전체를 통과해야 함
 *   - 잔액 부족 → 409 INSUFFICIENT_CREDITS + balance
 * GET /api/edit-requests — 내 편집 요청 목록 (?siteId= 필터 지원)
 *
 * 요청 row + 원장 차감 + 최초 감사 이벤트는 DB RPC 한 트랜잭션이다.
 * 부족/저장 실패 시 세 가지 모두 0건으로 롤백된다.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { CreditReason, EditType } from '@/lib/types/domain';
import { CREDIT_COSTS, FREE_INITIAL_REVISION_DAYS, QA_AUTOMATABLE_TYPES } from '@/lib/credits/constants';
import { getDataServices } from '@/lib/data';
import { assertVideoGenAllowed, generateGuardedVideo, STANDARD_MODEL } from '@/lib/ai/video-pipeline';
import { apiError, parseBody, withApiHandler } from '../_lib/http';
import { getAuthedClient, getOwnedSite, siteNotFound, unauthorized } from '../_lib/guards';
import { assetProvenanceConfig } from '@/lib/assets/provenance-flags';
import {
  assertAiImageGenerationPolicy,
  isAssetTruthGenerationError,
} from '@/lib/ai/image-generation-policy';
import {
  EditRequestWorkflowError,
  getEditRequestWorkflowRepository,
} from '@/lib/fulfillment/edit-request-workflow-repository';
import { completeEditFulfillment } from '@/lib/admin/edit-fulfillment-service';
import {
  generateMedicalSafeCopy,
  MEDICAL_AD_COPY_BLOCKED,
} from '@/lib/content/medical-ad-enforcement';
import {
  MEDICAL_AD_POLICY_VERSION,
  screenMedicalCopy,
} from '@/lib/content/medical-ad-policy';
import { aiEditEnabled } from '@/lib/product/flags';

const EDIT_REASONS: Record<EditType, CreditReason> = {
  text: 'edit_text',
  image: 'edit_image',
  video: 'edit_video',
  structure: 'edit_structure',
};

const bodySchema = z.object({
  siteId: z.string().min(1),
  type: z.enum(['text', 'image', 'video', 'structure']),
  requestedContent: z.string().min(1, '요청 내용을 입력해 주세요.').max(4000),
  confirmUpsell: z.boolean().optional(),
  target: z.object({
    pageId: z.string().min(1).max(120),
    sectionId: z.string().min(1).max(120).optional(),
    elementId: z.string().min(1).max(120).optional(),
  }).strict(),
});

/** VIDEO_GEN typed prefix를 기존 API 에러 계약으로 변환한다. unknown이면 공통 500 경계로 보낸다. */
function videoGuardResponse(error: unknown, creditCost: number): NextResponse | null {
  const raw = error instanceof Error ? error.message : String(error);
  const separator = raw.indexOf(':');
  const code = separator >= 0 ? raw.slice(0, separator) : raw;
  const message = separator >= 0 ? raw.slice(separator + 1).trim() : raw;

  if (code === 'VIDEO_GEN_ADDON') {
    return apiError(402, 'UPSELL_REQUIRED', 'AI 영상 재생성은 AI 영상 홈페이지가 적용된 사이트에서만 이용할 수 있습니다.', {
      creditCost,
      options: [{ action: 'upgrade_premium', label: 'AI 영상 홈페이지 상담' }],
    });
  }
  if (code === 'VIDEO_GEN_DISABLED') return apiError(503, code, message);
  if (code === 'VIDEO_GEN_SYNC_UNSAFE') return apiError(503, code, message);
  if (code === 'VIDEO_GEN_SITE_CAP' || code === 'VIDEO_GEN_DAILY_CAP') return apiError(429, code, message);
  return null;
}

export const POST = withApiHandler(async (request) => {
  if (!aiEditEnabled()) {
    return apiError(404, 'AI_EDIT_DISABLED', 'AI 편집 요청은 현재 제공하지 않습니다.');
  }
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;
  const { siteId, type, requestedContent, target } = body.data;

  const site = await getOwnedSite(siteId, client.id);
  if (!site) return siteNotFound();

  const creditCost = CREDIT_COSTS[type];
  const industryClass = site.draftConfig?.meta.industryClass ?? site.siteConfig?.meta.industryClass;
  if (industryClass === 'medical' && (type === 'text' || type === 'structure')) {
    const customerCopy = screenMedicalCopy(requestedContent, { scope: 'body' });
    if (customerCopy.violations.length) {
      return apiError(
        422,
        MEDICAL_AD_COPY_BLOCKED,
        '의료광고에 사용할 수 없는 표현이 있습니다. 사실 중심 문장으로 바꿔 주세요.',
        {
          policyVersion: MEDICAL_AD_POLICY_VERSION,
          violations: customerCopy.violations.map((violation) => ({
            path: 'requestedContent',
            severity: violation.severity,
            ruleId: violation.ruleId,
            safeReplacementHint: violation.safeReplacementHint,
          })),
        },
      );
    }
  }

  // 이미지/영상 산출물 provenance flag 오류는 요청 row·크레딧 차감·provider 호출 전에 중단한다.
  if (type === 'image' || type === 'video') assetProvenanceConfig();

  // AI 이미지 편집은 분위기·장식만 허용한다. 사실 피사체/하이퍼리얼 요청은 요청 row,
  // 무료 수정권 조회, 크레딧 차감, provider 호출보다 먼저 안정적인 422로 거부한다.
  if (type === 'image' && site.assetPolicyVersion === 2) {
    try {
      assertAiImageGenerationPolicy({
        imageDirectionId: 'abstract_editorial',
        role: 'decorative',
        subject: 'abstract',
        requestedContent,
        clientId: client.id,
        siteId,
      });
    } catch (error) {
      if (isAssetTruthGenerationError(error)) {
        return apiError(error.status, error.code, error.message, { guidance: error.guidance });
      }
      throw error;
    }
  }

  // 불변식: 애드온·킬스위치·사이트/일일 상한을 요청 생성과 크레딧 차감보다 먼저 검사한다.
  if (type === 'video') {
    try {
      await assertVideoGenAllowed(siteId, client.tier);
    } catch (error) {
      const response = videoGuardResponse(error, creditCost);
      if (response) return response;
      throw error;
    }
  }

  const { credits, editRequests, ai, qa } = getDataServices();

  // [§2] QA 자동화: 유형별 규칙이 enabled면 무수정 자동 승인(applied 직행). video는 항상 제외.
  const qaRule = QA_AUTOMATABLE_TYPES.includes(type) ? await qa.getRule(type) : null;
  const autoApprove = !!qaRule?.enabled;

  // [§3] 최초 발행 후 7일 무료 수정권 1회 판정:
  //  ① 이 사이트의 편집 요청이 0건  ② published_at 존재 && now < +7일  ③ video 아님(원가 사유)
  //  → 크레딧 차감·원장 기록 없이 처리 (isInitialRevision=true).
  const now = Date.now();
  const publishedAtMs = site.publishedAt ? new Date(site.publishedAt).getTime() : null;
  const withinFreeWindow =
    publishedAtMs !== null && now < publishedAtMs + FREE_INITIAL_REVISION_DAYS * 86_400_000;
  // rejected(AI 실패 등)는 카운트 제외 — 실패한 무료 수정권은 소진되지 않는다(재시도 허용).
  const priorForSite = (await editRequests.listByClient(client.id)).filter(
    (er) => er.siteId === siteId && er.status !== 'rejected',
  );
  const isInitialRevision = type !== 'video' && withinFreeWindow && priorForSite.length === 0;

  const workflow = getEditRequestWorkflowRepository();
  let editRequest;
  let balance: number;
  try {
    const submitted = await workflow.submit({
      clientId: client.id,
      siteId,
      type,
      creditCost,
      reason: EDIT_REASONS[type],
      requestedContent,
      isInitialRevision,
      autoApproved: autoApprove,
    });
    editRequest = submitted.request;
    balance = submitted.balance;
  } catch (error) {
    if (error instanceof EditRequestWorkflowError && error.code === 'INSUFFICIENT_CREDITS') {
      return apiError(
        409,
        'INSUFFICIENT_CREDITS',
        `크레딧이 부족합니다. (필요 ${creditCost}개 / 보유 ${error.balance ?? 0}개)`,
        { balance: error.balance ?? 0, required: creditCost },
      );
    }
    if (error instanceof EditRequestWorkflowError) {
      return apiError(
        503,
        'EDIT_REQUEST_SAVE_FAILED',
        '수정 요청을 저장하지 못했습니다. 크레딧은 차감되지 않았습니다. 잠시 후 다시 시도해 주세요.',
      );
    }
    throw error;
  }

  await workflow.transition({
    editRequestId: editRequest.id,
    expectedStatuses: ['pending'],
    nextStatus: 'ai_processing',
    actorType: 'system',
    actorId: 'system:ai-generator',
  });

  let aiOutput: unknown;
  try {
    switch (type) {
      case 'text': {
        const generated = await generateMedicalSafeCopy({
          industryClass,
          prompt: requestedContent,
          scope: 'body',
          generate: (prompt) => ai.generateText({ prompt }),
        });
        aiOutput = {
          text: generated.text,
          medicalSafetyResolution: generated.resolution,
          fulfillmentTarget: target,
        };
        break;
      }
      case 'image':
        aiOutput = {
          ...await ai.generateImage(
          { prompt: requestedContent },
          {
            clientId: client.id,
            siteId,
            ...(site.assetPolicyVersion === 2 ? { assetPolicyVersion: 2 as const } : {}),
          },
          ),
          fulfillmentTarget: target,
        };
        break;
      case 'video':
        aiOutput = {
          ...await generateGuardedVideo({
            clientId: client.id,
            siteId,
            tier: client.tier,
            prompt: requestedContent,
            model: STANDARD_MODEL,
            stage: 'final',
          }),
          fulfillmentTarget: target,
        };
        break;
      case 'structure': {
        const generated = await generateMedicalSafeCopy({
          industryClass,
          prompt: `다음 사이트 구조 변경 요청에 대한 적용 계획을 정리해줘: ${requestedContent}`,
          scope: 'body',
          generate: (prompt) => ai.generateText({ prompt }),
        });
        aiOutput = {
          text: generated.text,
          medicalSafetyResolution: generated.resolution,
          fulfillmentTarget: target,
        };
        break;
      }
    }
  } catch (err) {
    console.error('[edit-requests] AI 생성 실패:', err);
    // 산출물 없이 과금되지 않도록 환불(무료 수정권은 차감이 없어 no-op) 후 반려 처리
    if (!isInitialRevision) {
      await credits.refund({ clientId: client.id, referenceId: editRequest.id });
    }
    await workflow.transition({
      editRequestId: editRequest.id,
      expectedStatuses: ['ai_processing'],
      nextStatus: 'rejected',
      actorType: 'system',
      actorId: 'system:ai-generator',
      qaNote: 'AI_GENERATION_FAILED',
    });
    return apiError(
      502,
      'AI_GENERATION_FAILED',
      isInitialRevision
        ? 'AI 생성에 실패했습니다. 무료 수정권은 소진되지 않았습니다. 잠시 후 다시 시도해 주세요.'
        : 'AI 생성에 실패했습니다. 사용된 크레딧은 환불되었습니다. 잠시 후 다시 시도해 주세요.',
    );
  }

  const audit = autoApprove && Math.random() < (qaRule?.sampleAuditRate ?? 0);
  await workflow.transition({
    editRequestId: editRequest.id,
    expectedStatuses: ['ai_processing'],
    nextStatus: 'qa_review',
    actorType: 'system',
    actorId: 'system:ai-generator',
    aiOutput,
    qaNote: audit ? 'AUTO_APPROVAL_AUDIT_REQUIRED' : null,
  });
  let autoApprovalDeferred = false;
  if (autoApprove && !audit) {
    try {
      await completeEditFulfillment({
        editRequestId: editRequest.id,
        actorType: 'system',
        actorId: 'system:auto-approval',
      });
    } catch (error) {
      console.error('[edit-requests] auto approval application deferred:', error);
      autoApprovalDeferred = true;
    }
  }
  const updated = await editRequests.getById(editRequest.id);

  return NextResponse.json(
    {
      editRequest: updated ?? editRequest,
      balance,
      isInitialRevision,
      autoApproved: autoApprove && !audit && !autoApprovalDeferred,
      autoApprovalDeferred,
    },
    { status: 201 },
  );
});

export const GET = withApiHandler(async (request) => {
  if (!aiEditEnabled()) {
    return apiError(404, 'AI_EDIT_DISABLED', 'AI 편집 요청은 현재 제공하지 않습니다.');
  }
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const siteId = request.nextUrl.searchParams.get('siteId');
  const all = await getDataServices().editRequests.listByClient(client.id);
  const editRequests = siteId ? all.filter((er) => er.siteId === siteId) : all;

  return NextResponse.json({ editRequests });
});
