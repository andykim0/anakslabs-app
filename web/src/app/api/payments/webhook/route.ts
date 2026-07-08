/**
 * POST /api/payments/webhook — 결제 웹훅 (토스페이먼츠 / 내부 mock 포맷).
 *
 * 멱등성: payments.handleWebhook이 providerPaymentKey 기준으로 보장(중복 = 크레딧 1회만 지급).
 * 라우트도 중복 웹훅에 200을 재응답해 PG 재시도 루프를 끊는다.
 *
 * 지원 페이로드:
 *  1) 내부 포맷 (mock 모드/시뮬레이터): { providerPaymentKey, clientId, type, amount, tier?, creditsGranted? }
 *  2) 토스 포맷: { eventType: 'PAYMENT_STATUS_CHANGED', data: { paymentKey, orderId, status, totalAmount } }
 *     - status === 'DONE' 만 처리, 그 외는 200 + ignored.
 *     - orderId 인코딩 규약 (구매 라우트와 공유):
 *         cp_{credits}_{clientId}_{nonce}  → credit_pack
 *         bf_{tier}_{clientId}_{nonce}     → build_fee (tier 기반 초기 크레딧 자동 지급)
 *         ms_{clientId}_{nonce}            → maintenance_subscription
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { PaymentType, Tier } from '@/lib/types/domain';
import { getDataServices } from '@/lib/data';
import { apiError, withApiHandler } from '../../_lib/http';

const internalPayloadSchema = z.object({
  providerPaymentKey: z.string().min(1),
  clientId: z.string().min(1),
  type: z.enum(['build_fee', 'maintenance_subscription', 'credit_pack']),
  amount: z.number().nonnegative(),
  tier: z.enum(['basic', 'premium']).optional(),
  creditsGranted: z.number().int().nonnegative().optional(),
});

const tossPayloadSchema = z.object({
  eventType: z.string().optional(),
  data: z.object({
    paymentKey: z.string().min(1),
    orderId: z.string().min(1),
    status: z.string(),
    totalAmount: z.number().nonnegative(),
  }),
});

interface ParsedOrder {
  type: PaymentType;
  clientId: string;
  tier?: Tier;
  creditsGranted?: number;
}

function parseOrderId(orderId: string): ParsedOrder | null {
  const parts = orderId.split('_');
  if (parts.length < 3) return null;

  if (parts[0] === 'cp' && parts.length >= 4) {
    const credits = Number(parts[1]);
    if (!Number.isInteger(credits) || credits <= 0) return null;
    return { type: 'credit_pack', clientId: parts[2], creditsGranted: credits };
  }
  if (parts[0] === 'bf' && parts.length >= 4) {
    const tier = parts[1];
    if (tier !== 'basic' && tier !== 'premium') return null;
    return { type: 'build_fee', clientId: parts[2], tier };
  }
  if (parts[0] === 'ms') {
    return { type: 'maintenance_subscription', clientId: parts[1] };
  }
  return null;
}

export const POST = withApiHandler(async (request) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError(400, 'INVALID_JSON', '웹훅 본문이 올바른 JSON 형식이 아닙니다.');
  }

  const { payments } = getDataServices();

  // 1) 내부 포맷 (mock 모드에선 이 포맷 그대로 수신)
  const internal = internalPayloadSchema.safeParse(raw);
  if (internal.success) {
    const result = await payments.handleWebhook(internal.data);
    return NextResponse.json({ received: true, ...result });
  }

  // 2) 토스 웹훅 포맷
  const toss = tossPayloadSchema.safeParse(raw);
  if (toss.success) {
    const { paymentKey, orderId, status, totalAmount } = toss.data.data;

    if (status !== 'DONE') {
      // 결제 완료 외 상태 변경(취소/실패 등)은 MVP 범위 밖 — 재시도 방지 위해 200
      return NextResponse.json({ received: true, ignored: true, reason: `status=${status}` });
    }

    const order = parseOrderId(orderId);
    if (!order) {
      console.error('[payments/webhook] 알 수 없는 orderId 형식:', orderId);
      return NextResponse.json({ received: true, ignored: true, reason: 'unknown_order_format' });
    }

    const result = await payments.handleWebhook({
      providerPaymentKey: paymentKey,
      clientId: order.clientId,
      type: order.type,
      amount: totalAmount,
      tier: order.tier,
      creditsGranted: order.creditsGranted,
    });
    return NextResponse.json({ received: true, ...result });
  }

  return apiError(400, 'INVALID_PAYLOAD', '지원하지 않는 웹훅 페이로드 형식입니다.');
});
