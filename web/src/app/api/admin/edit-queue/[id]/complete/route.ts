import { NextResponse } from 'next/server';
import {
  AdminEditQueueError,
} from '@/lib/admin/edit-queue-core';
import { getAdminEditQueueRepository } from '@/lib/admin/edit-queue-repository';
import { apiError, withApiHandler } from '../../../../_lib/http';
import { requireAdminOr403 } from '../../../../_lib/guards';

type Ctx = { params: Promise<{ id: string }> };

function errorResponse(error: AdminEditQueueError): NextResponse {
  if (error.code === 'ADMIN_EDIT_REQUEST_NOT_FOUND') {
    return apiError(404, error.code, '수정 요청을 찾을 수 없습니다.');
  }
  if (error.code === 'ADMIN_EDIT_REQUEST_INPUT_INVALID') {
    return apiError(400, error.code, '수정 요청 ID가 올바르지 않습니다.');
  }
  return apiError(409, error.code, '이미 반려됐거나 현재 상태에서는 완료할 수 없는 요청입니다.');
}

export const POST = withApiHandler<Ctx>(async (_request, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const { id } = await params;
  try {
    const result = await getAdminEditQueueRepository().complete({ editRequestId: id });
    return NextResponse.json({ ok: true, duplicated: result.duplicated });
  } catch (error) {
    if (error instanceof AdminEditQueueError) return errorResponse(error);
    throw error;
  }
});
