/**
 * POST /api/admin/credits/adjust — 관리자 크레딧 수동 조정.
 * body: { clientId, amount, memo } — amount>0 지급(grant) / amount<0 차감(consume), reason='admin_adjust'.
 * 차감은 원자적 — 잔액 부족 시 409 (원장에 기록 남지 않음).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDataServices } from '@/lib/data';
import { apiError, parseBody, withApiHandler } from '../../../_lib/http';
import { creditsEnabled } from '@/lib/product/flags';
import { requireAdminOr403 } from '../../../_lib/guards';

const bodySchema = z.object({
  clientId: z.string().min(1),
  amount: z
    .number()
    .int('크레딧은 정수 단위입니다.')
    .refine((v) => v !== 0, '0은 조정할 수 없습니다.'),
  memo: z.string().min(1, '조정 사유(memo)를 입력해 주세요.').max(500),
});

export const POST = withApiHandler(async (request) => {
  if (!creditsEnabled()) {
    return apiError(404, 'CREDITS_DISABLED', 'Credit top-up is not available.');
  }
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;
  const { clientId, amount } = body.data;

  const { clients, credits } = getDataServices();
  const client = await clients.getById(clientId);
  if (!client) {
    return apiError(404, 'CLIENT_NOT_FOUND', 'Client not found.');
  }

  if (amount > 0) {
    await credits.grant({ clientId, amount, reason: 'admin_adjust' });
  } else {
    const consumed = await credits.consume({
      clientId,
      amount: Math.abs(amount),
      reason: 'admin_adjust',
    });
    if (!consumed.ok) {
      return apiError(
        409,
        'INSUFFICIENT_CREDITS',
        `잔액이 부족해 차감할 수 없습니다. (보유 ${consumed.balance}개)`,
        { balance: consumed.balance },
      );
    }
  }

  const balance = await credits.getBalance(clientId);
  // 참고: 원장 계약(grant/consume)에 memo 필드가 없어 memo는 기록되지 않는다 (openIssue 보고됨)
  // 응답: components/admin/api.ts 의 AdjustCreditsResult 계약과 1:1
  return NextResponse.json({ ok: true, newBalance: balance.balance });
});
