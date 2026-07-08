/**
 * POST /api/admin/qa/[id]/approve — QA 승인 → 적용 (status='applied', appliedAt 기록).
 * 응답: { ok: true } (components/admin/api.ts 계약). 바디는 사용하지 않는다.
 */
import { NextResponse } from 'next/server';
import { getDataServices } from '@/lib/data';
import { apiError, withApiHandler } from '../../../../_lib/http';
import { requireAdminOr403 } from '../../../../_lib/guards';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withApiHandler<Ctx>(async (_request, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const { id } = await params;
  const { editRequests } = getDataServices();
  const editRequest = await editRequests.getById(id);
  if (!editRequest) {
    return apiError(404, 'EDIT_REQUEST_NOT_FOUND', '편집 요청을 찾을 수 없습니다.');
  }
  if (editRequest.status !== 'qa_review' && editRequest.status !== 'ai_processing') {
    return apiError(
      409,
      'INVALID_STATUS',
      `승인할 수 없는 상태입니다. (현재: ${editRequest.status})`,
    );
  }

  await editRequests.update(id, {
    status: 'applied',
    appliedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
});
