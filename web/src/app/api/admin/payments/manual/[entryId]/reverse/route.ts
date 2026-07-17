import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getManualCollectionsRepository } from '@/lib/payments/manual-collections';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { requireAdminOr403 } from '@/app/api/_lib/guards';

type Ctx = { params: Promise<{ entryId: string }> };

const schema = z.object({
  collectionReference: z.string().trim().min(1).max(160),
  memo: z.string().trim().min(1).max(500),
}).strict();

export const POST = withApiHandler<Ctx>(async (request: NextRequest, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  const body = await parseBody(request, schema);
  if (!body.ok) return body.res;
  const { entryId } = await params;

  try {
    const result = await getManualCollectionsRepository().reverse({ entryId, ...body.data });
    return NextResponse.json({
      ok: true,
      duplicated: result.duplicated,
      entry: result.record.entry,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/NOT_FOUND|original receipt not found/i.test(message)) {
      return apiError(404, 'MANUAL_COLLECTION_NOT_FOUND', '반대 분개할 수금 기록을 찾을 수 없습니다.');
    }
    if (/ALREADY_EXISTS|already has another reversal|REFERENCE_CONFLICT/i.test(message)) {
      return apiError(409, 'MANUAL_REVERSAL_CONFLICT', '이미 반대 분개됐거나 참조번호가 충돌합니다.');
    }
    if (/SUBSCRIPTION_NOT_LATEST|only the latest subscription renewal/i.test(message)) {
      return apiError(
        409,
        'MANUAL_SUBSCRIPTION_REVERSAL_ORDER_REQUIRED',
        '구독 수금은 가장 최근 갱신부터 역순으로만 반대 분개할 수 있습니다.',
      );
    }
    throw error;
  }
});
