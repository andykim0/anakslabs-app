import { NextResponse } from 'next/server';
import { getManualCollectionsRepository } from '@/lib/payments/manual-collections';
import { apiError, withApiHandler } from '@/app/api/_lib/http';
import { requireAdminOr403 } from '@/app/api/_lib/guards';

type Ctx = { params: Promise<{ entryId: string }> };

export const POST = withApiHandler<Ctx>(async (_request, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  const { entryId } = await params;

  try {
    const result = await getManualCollectionsRepository().reverse({
      entryId,
      collectionReference: `cancel:${entryId}`,
      memo: 'Admin one-click cancellation',
    });
    return NextResponse.json({ ok: true, duplicated: result.duplicated, entry: result.record.entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/NOT_FOUND|original receipt not found/i.test(message)) {
      return apiError(404, 'MANUAL_COLLECTION_NOT_FOUND', '취소할 수금 기록을 찾을 수 없습니다.');
    }
    if (/ALREADY_EXISTS|already has another reversal|REFERENCE_CONFLICT/i.test(message)) {
      return apiError(409, 'MANUAL_COLLECTION_ALREADY_CANCELLED', '이미 취소된 수금 기록입니다.');
    }
    if (/SUBSCRIPTION_NOT_LATEST|only the latest subscription renewal/i.test(message)) {
      return apiError(409, 'MANUAL_SUBSCRIPTION_REVERSAL_ORDER_REQUIRED', '구독 수금은 가장 최근 기록부터 취소해 주세요.');
    }
    throw error;
  }
});
