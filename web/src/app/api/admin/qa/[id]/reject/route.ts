/**
 * POST /api/admin/qa/[id]/reject — QA 반려 → 크레딧 환불.
 * body: { reason: string }
 * 환불은 credits.refund가 원장에서 referenceId(=편집요청 id)로 차감분을 찾아 +기록.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDataServices } from '@/lib/data';
import { apiError, parseBody, withApiHandler } from '../../../../_lib/http';
import { requireAdminOr403 } from '../../../../_lib/guards';

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  reason: z.string().min(1, '반려 사유를 입력해 주세요.').max(1000),
});

export const POST = withApiHandler<Ctx>(async (request, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const { id } = await params;
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;

  const { editRequests, credits } = getDataServices();
  const editRequest = await editRequests.getById(id);
  if (!editRequest) {
    return apiError(404, 'EDIT_REQUEST_NOT_FOUND', '편집 요청을 찾을 수 없습니다.');
  }
  if (editRequest.status === 'applied' || editRequest.status === 'rejected') {
    return apiError(
      409,
      'INVALID_STATUS',
      `이미 처리된 요청입니다. (현재: ${editRequest.status})`,
    );
  }

  await editRequests.update(id, { status: 'rejected' });
  await credits.refund({ clientId: editRequest.clientId, referenceId: editRequest.id });

  const updated = await editRequests.getById(id);
  return NextResponse.json({ editRequest: updated, reason: body.data.reason });
});
