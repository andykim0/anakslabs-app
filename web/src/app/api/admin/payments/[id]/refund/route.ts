/**
 * [§3] POST /api/admin/payments/[id]/refund — 관리자 수동 환불.
 * body: { amount } — 환불 금액(KRW, 0..원결제액). payments.refunded_at/refund_amount 기록 +
 * build_fee 환불 시 초기 지급 크레딧 미사용분 회수. 멱등(이미 환불 시 alreadyRefunded).
 *
 * PG 환불 API(토스) 호출은 데이터 계층 refund()의 실모드 TODO — 여기서는 원장/기록 정합만.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDataServices } from '@/lib/data';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { requireAdminOr403 } from '@/app/api/_lib/guards';

const bodySchema = z.object({
  amount: z.number().nonnegative('환불 금액은 0 이상이어야 합니다.'),
});

type Ctx = { params: Promise<{ id: string }> };

export const POST = withApiHandler<Ctx>(async (request, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const { id } = await params;
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;
  const { amount } = body.data;

  const { payments } = getDataServices();
  const payment = await payments.getById(id);
  if (!payment) {
    return apiError(404, 'PAYMENT_NOT_FOUND', '결제를 찾을 수 없습니다.');
  }
  if (amount > payment.amount) {
    return apiError(400, 'REFUND_EXCEEDS_AMOUNT', `환불 금액이 결제액(${payment.amount})을 초과할 수 없습니다.`);
  }

  const result = await payments.refund({ paymentId: id, amount });
  return NextResponse.json({
    ok: result.ok,
    alreadyRefunded: result.alreadyRefunded,
    paymentId: id,
    refundAmount: amount,
  });
});
