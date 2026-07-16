/**
 * POST /api/edit-requests — 편집 요청 제출 (크레딧 차감 → AI 생성 → QA 대기).
 *   body: { siteId, type, requestedContent, confirmUpsell? }
 *   - video는 편집요청 생성·크레딧 차감 전에 VIDEO_GEN 가드 전체를 통과해야 함
 *   - 잔액 부족 → 409 INSUFFICIENT_CREDITS + balance
 * GET /api/edit-requests — 내 편집 요청 목록 (?siteId= 필터 지원)
 *
 * 처리 순서 주의: 원장 차감 행의 referenceId(=편집요청 id)가 있어야 반려 시
 * credits.refund({ referenceId })가 동작하므로, pending 생성 → 원자적 차감 순서로 처리한다.
 * 차감 실패(잔액 부족) 시 방금 만든 요청은 즉시 rejected 처리되어 과금이 남지 않는다.
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
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;
  const { siteId, type, requestedContent } = body.data;

  const site = await getOwnedSite(siteId, client.id);
  if (!site) return siteNotFound();

  const creditCost = CREDIT_COSTS[type];

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

  const editRequest = await editRequests.create({
    clientId: client.id,
    siteId,
    type,
    creditCost: isInitialRevision ? 0 : creditCost,
    requestedContent,
    isInitialRevision,
    autoApproved: autoApprove,
  });

  let balance: number;
  if (isInitialRevision) {
    // 무료 — 원장 미기록(실변동 없음, 불변식 유지)
    balance = (await credits.getBalance(client.id)).balance;
  } else {
    // 원자적 차감 — 부족 시 어떤 원장 기록도 남지 않는다 (서비스 계약)
    const consumed = await credits.consume({
      clientId: client.id,
      amount: creditCost,
      reason: EDIT_REASONS[type],
      referenceId: editRequest.id,
    });
    if (!consumed.ok) {
      await editRequests.update(editRequest.id, { status: 'rejected' });
      return apiError(
        409,
        'INSUFFICIENT_CREDITS',
        `크레딧이 부족합니다. (필요 ${creditCost}개 / 보유 ${consumed.balance}개)`,
        { balance: consumed.balance, required: creditCost },
      );
    }
    balance = consumed.newBalance;
  }

  await editRequests.update(editRequest.id, { status: 'ai_processing' });

  let aiOutput: unknown;
  try {
    switch (type) {
      case 'text':
        aiOutput = { text: await ai.generateText({ prompt: requestedContent }) };
        break;
      case 'image':
        aiOutput = await ai.generateImage(
          { prompt: requestedContent },
          {
            clientId: client.id,
            siteId,
            ...(site.assetPolicyVersion === 2 ? { assetPolicyVersion: 2 as const } : {}),
          },
        );
        break;
      case 'video':
        aiOutput = await generateGuardedVideo({
          clientId: client.id,
          siteId,
          tier: client.tier,
          prompt: requestedContent,
          model: STANDARD_MODEL,
          stage: 'final',
        });
        break;
      case 'structure':
        aiOutput = {
          text: await ai.generateText({
            prompt: `다음 사이트 구조 변경 요청에 대한 적용 계획을 정리해줘: ${requestedContent}`,
          }),
        };
        break;
    }
  } catch (err) {
    console.error('[edit-requests] AI 생성 실패:', err);
    // 산출물 없이 과금되지 않도록 환불(무료 수정권은 차감이 없어 no-op) 후 반려 처리
    if (!isInitialRevision) {
      await credits.refund({ clientId: client.id, referenceId: editRequest.id });
    }
    await editRequests.update(editRequest.id, { status: 'rejected' });
    return apiError(
      502,
      'AI_GENERATION_FAILED',
      isInitialRevision
        ? 'AI 생성에 실패했습니다. 무료 수정권은 소진되지 않았습니다. 잠시 후 다시 시도해 주세요.'
        : 'AI 생성에 실패했습니다. 사용된 크레딧은 환불되었습니다. 잠시 후 다시 시도해 주세요.',
    );
  }

  if (autoApprove) {
    // [§2] 자동 승인 — QA 큐를 건너 applied 직행. sampleAuditRate 확률로 감사 플래그(qa_note='audit').
    const audit = Math.random() < (qaRule?.sampleAuditRate ?? 0);
    await editRequests.update(editRequest.id, {
      aiOutput,
      status: 'applied',
      appliedAt: new Date().toISOString(),
      reviewedAt: new Date().toISOString(),
      qaNote: audit ? 'audit' : null,
    });
  } else {
    await editRequests.update(editRequest.id, { aiOutput, status: 'qa_review' });
  }
  const updated = await editRequests.getById(editRequest.id);

  return NextResponse.json(
    { editRequest: updated ?? editRequest, balance, isInitialRevision, autoApproved: autoApprove },
    { status: 201 },
  );
});

export const GET = withApiHandler(async (request) => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const siteId = request.nextUrl.searchParams.get('siteId');
  const all = await getDataServices().editRequests.listByClient(client.id);
  const editRequests = siteId ? all.filter((er) => er.siteId === siteId) : all;

  return NextResponse.json({ editRequests });
});
