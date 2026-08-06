/**
 * POST /api/admin/qa/[id]/reject — QA 반려 → 크레딧 환불.
 * body: { reason: string } → 응답 { ok: true } (components/admin/api.ts 계약).
 * 환불은 credits.refund가 원장에서 referenceId(=편집요청 id)로 차감분을 찾아 +기록 (멱등).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDataServices } from '@/lib/data';
import { apiError, parseBody, withApiHandler } from '../../../../_lib/http';
import { requireAdminOr403 } from '../../../../_lib/guards';
import { getCurrentAdminActorId } from '@/lib/services/auth';
import { getEditRequestWorkflowRepository } from '@/lib/fulfillment/edit-request-workflow-repository';

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  reason: z.string().min(1, '반려 사유를 입력해 주세요.').max(1000),
});

export const POST = withApiHandler<Ctx>(async (request, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const { id } = await params;
  const actorId = await getCurrentAdminActorId();
  if (!actorId) return apiError(403, 'FORBIDDEN', 'Administrator access is required.');
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;

  const { editRequests, credits } = getDataServices();
  const editRequest = await editRequests.getById(id);
  if (!editRequest) {
    return apiError(404, 'EDIT_REQUEST_NOT_FOUND', 'Edit request not found.');
  }
  if (editRequest.status === 'applied' || editRequest.status === 'rejected') {
    return apiError(
      409,
      'INVALID_STATUS',
      `이미 처리된 요청입니다. (현재: ${editRequest.status})`,
    );
  }

  // 환불 먼저, 상태 전이는 그 다음 — 환불이 일시 장애로 실패해도 status가 qa_review로 남아
  // 반려 재시도가 가능하다(refund는 'refund:{referenceId}' 멱등키라 재시도·이중 반려에도 1회만 환불).
  // 반대 순서면 rejected 상태에서 31행 INVALID_STATUS 가드에 막혀 환불 경로가 영구 차단된다.
  await credits.refund({ clientId: editRequest.clientId, referenceId: editRequest.id });
  await getEditRequestWorkflowRepository().transition({
    editRequestId: id,
    expectedStatuses: ['pending', 'ai_processing', 'qa_review'],
    nextStatus: 'rejected',
    actorType: 'admin',
    actorId,
    qaNote: body.data.reason,
    reviewedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
});
