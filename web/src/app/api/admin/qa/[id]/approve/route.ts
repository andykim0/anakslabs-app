/**
 * POST /api/admin/qa/[id]/approve — QA 승인 → 적용 (status='applied', appliedAt 기록).
 * 응답: { ok: true } (components/admin/api.ts 계약). 바디는 사용하지 않는다.
 */
import { NextResponse } from 'next/server';
import { AdminEditQueueError } from '@/lib/admin/edit-queue-core';
import { completeEditFulfillment } from '@/lib/admin/edit-fulfillment-service';
import { getCurrentAdminActorId } from '@/lib/services/auth';
import { apiError, withApiHandler } from '../../../../_lib/http';
import { requireAdminOr403 } from '../../../../_lib/guards';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withApiHandler<Ctx>(async (_request, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const { id } = await params;
  const actorId = await getCurrentAdminActorId();
  if (!actorId) return apiError(403, 'FORBIDDEN', '관리자 권한이 필요합니다.');
  try {
    await completeEditFulfillment({ editRequestId: id, actorType: 'admin', actorId });
  } catch (error) {
    if (error instanceof AdminEditQueueError) {
      const status = error.code === 'ADMIN_EDIT_REQUEST_NOT_FOUND' ? 404 : 409;
      return apiError(status, error.code, '발행본 반영까지 완료할 수 없어 요청 상태를 유지했습니다.');
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
});
