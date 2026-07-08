/**
 * POST /api/edit-requests — 편집 요청 제출 (크레딧 차감 → AI 생성 → QA 대기).
 *   body: { siteId, type, requestedContent, confirmUpsell? }
 *   - Basic 티어 + video + confirmUpsell 미확인 → 402 UPSELL_REQUIRED (차감 없음)
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
import { CREDIT_COSTS } from '@/lib/credits/constants';
import { getDataServices } from '@/lib/data';
import { apiError, parseBody, withApiHandler } from '../_lib/http';
import { getAuthedClient, getOwnedSite, siteNotFound, unauthorized } from '../_lib/guards';

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

export const POST = withApiHandler(async (request) => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;
  const { siteId, type, requestedContent, confirmUpsell } = body.data;

  const site = await getOwnedSite(siteId, client.id);
  if (!site) return siteNotFound();

  const creditCost = CREDIT_COSTS[type];

  // 불변식: Basic 티어의 영상 편집 요청은 차감 전에 업셀 안내를 먼저 노출한다.
  if (client.tier === 'basic' && type === 'video' && !confirmUpsell) {
    return apiError(
      402,
      'UPSELL_REQUIRED',
      `영상 편집은 Premium 전용 기능입니다. 크레딧 ${creditCost}개를 사용해 1회 진행하시거나, Premium 업그레이드를 이용해 주세요.`,
      {
        creditCost,
        options: [
          { action: 'confirm_upsell', label: `크레딧 ${creditCost}개 사용하고 진행` },
          { action: 'upgrade_premium', label: 'Premium 업그레이드 상담' },
        ],
      },
    );
  }

  const { credits, editRequests, ai } = getDataServices();

  const editRequest = await editRequests.create({
    clientId: client.id,
    siteId,
    type,
    creditCost,
    requestedContent,
  });

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

  await editRequests.update(editRequest.id, { status: 'ai_processing' });

  let aiOutput: unknown;
  try {
    switch (type) {
      case 'text':
        aiOutput = { text: await ai.generateText({ prompt: requestedContent }) };
        break;
      case 'image':
        aiOutput = await ai.generateImage({ prompt: requestedContent });
        break;
      case 'video':
        aiOutput = await ai.generateVideo({ prompt: requestedContent });
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
    // 산출물 없이 과금되지 않도록 환불 후 반려 처리
    await credits.refund({ clientId: client.id, referenceId: editRequest.id });
    await editRequests.update(editRequest.id, { status: 'rejected' });
    return apiError(
      502,
      'AI_GENERATION_FAILED',
      'AI 생성에 실패했습니다. 사용된 크레딧은 환불되었습니다. 잠시 후 다시 시도해 주세요.',
    );
  }

  await editRequests.update(editRequest.id, { aiOutput, status: 'qa_review' });
  const updated = await editRequests.getById(editRequest.id);

  return NextResponse.json(
    { editRequest: updated ?? editRequest, balance: consumed.newBalance },
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
