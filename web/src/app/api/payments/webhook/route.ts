/**
 * POST /api/payments/webhook — 결제 웹훅 (토스페이먼츠 / 내부 mock 포맷).
 *
 * 멱등성: payments.handleWebhook이 providerPaymentKey 기준으로 보장(중복 = 크레딧 1회만 지급).
 * 라우트도 중복 웹훅에 200을 재응답해 PG 재시도 루프를 끊는다.
 *
 * 보안 (감사 반영):
 *  - 내부 포맷은 mock 모드 전용. 실모드에서는 절대 처리하지 않는다
 *    (무인증 요청으로 임의 clientId에 크레딧 지급이 가능한 벡터였음).
 *  - 실모드 토스 웹훅은 본문(status/totalAmount)을 신뢰하지 않고, TOSS_SECRET_KEY로
 *    토스 결제조회 API(GET /v1/payments/{paymentKey})를 호출해 status=DONE·orderId·totalAmount를
 *    재검증한 뒤에만 지급한다. 검증 실패 시 4xx 거부.
 *  - 지급량은 orderId 파싱값(공격자 통제 가능)만으로 결정하지 않는다:
 *    cp_ 주문은 CREDIT_PACKS 서버 가격표와 credits·금액 정확 일치, bf_ 주문은 티어 최소 계약가
 *    이상인지 검증. 불일치 = 지급 거부(수동 확인 로그).
 *
 * 지원 페이로드:
 *  1) 내부 포맷 (mock 모드 전용): { providerPaymentKey, clientId, type, amount, tier?, creditsGranted? }
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
import { CREDIT_PACKS, PRICE_RANGES } from '@/lib/credits/constants';
import { getDataServices } from '@/lib/data';
import { env, isMockMode } from '@/lib/env';
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

/**
 * 서버 가격표 기준 금액 검증 — orderId는 공격자가 통제 가능하므로
 * 파싱 결과만으로 지급하지 않고 실결제 금액과 대조한다.
 * 반환: 문제 없으면 null, 문제 있으면 거부 사유.
 */
function validateOrderAmount(order: ParsedOrder, totalAmount: number): string | null {
  if (order.type === 'credit_pack') {
    const pack = CREDIT_PACKS.find((p) => p.credits === order.creditsGranted);
    if (!pack) {
      return `존재하지 않는 크레딧 팩 (credits=${order.creditsGranted})`;
    }
    if (totalAmount !== pack.priceKrw) {
      return `크레딧 팩 결제 금액 불일치 (팩 정가 ${pack.priceKrw}원, 실결제 ${totalAmount}원)`;
    }
  }
  if (order.type === 'build_fee' && order.tier) {
    const [minPrice] = PRICE_RANGES.buildFee[order.tier];
    if (totalAmount < minPrice) {
      return `빌드비 결제 금액이 ${order.tier} 최소 계약가(${minPrice}원) 미만 (실결제 ${totalAmount}원)`;
    }
  }
  return null;
}

const TOSS_API_BASE = 'https://api.tosspayments.com';

interface TossPaymentLookup {
  status?: string;
  orderId?: string;
  totalAmount?: number;
}

/**
 * 실모드 웹훅 검증 — 웹훅 본문을 신뢰하지 않고 토스 결제조회 API로
 * status=DONE / orderId / totalAmount 를 재검증한다.
 */
async function verifyWithToss(
  paymentKey: string,
  orderId: string,
  totalAmount: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!env.tossSecretKey) {
    return { ok: false, reason: 'TOSS_SECRET_KEY 미설정 — 웹훅 검증 불가' };
  }

  let res: Response;
  try {
    res = await fetch(`${TOSS_API_BASE}/v1/payments/${encodeURIComponent(paymentKey)}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.tossSecretKey}:`).toString('base64')}`,
      },
      cache: 'no-store',
    });
  } catch {
    return { ok: false, reason: '토스 결제조회 API 호출 실패' };
  }

  if (!res.ok) {
    return { ok: false, reason: `토스 결제조회 실패 (HTTP ${res.status}) — 존재하지 않는 paymentKey 가능성` };
  }

  const payment = (await res.json().catch(() => null)) as TossPaymentLookup | null;
  if (!payment) {
    return { ok: false, reason: '토스 결제조회 응답 파싱 실패' };
  }
  if (payment.status !== 'DONE') {
    return { ok: false, reason: `토스 결제 상태 불일치 (조회 결과: ${payment.status})` };
  }
  if (payment.orderId !== orderId) {
    return { ok: false, reason: 'orderId 불일치 (웹훅 본문 ≠ 토스 조회 결과)' };
  }
  if (payment.totalAmount !== totalAmount) {
    return { ok: false, reason: 'totalAmount 불일치 (웹훅 본문 ≠ 토스 조회 결과)' };
  }
  return { ok: true };
}

export const POST = withApiHandler(async (request) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError(400, 'INVALID_JSON', '웹훅 본문이 올바른 JSON 형식이 아닙니다.');
  }

  // 1) 내부 포맷 — mock 모드 전용 (실모드에서 처리하면 무인증 크레딧 발급 벡터가 된다)
  if (isMockMode()) {
    const internal = internalPayloadSchema.safeParse(raw);
    if (internal.success) {
      const result = await getDataServices().payments.handleWebhook(internal.data);
      return NextResponse.json({ received: true, ...result });
    }
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

    // 서버 가격표 대조 — orderId 변조로 소액 결제에 대량 크레딧/티어 승격 지급 차단
    const amountError = validateOrderAmount(order, totalAmount);
    if (amountError) {
      console.error(
        `[payments/webhook] 금액 검증 실패 — 수동 확인 필요. orderId=${orderId}, paymentKey=${paymentKey}: ${amountError}`,
      );
      return apiError(400, 'AMOUNT_MISMATCH', `결제 금액 검증에 실패했습니다. (${amountError})`);
    }

    // 실모드 — 토스 결제조회 API로 재검증 (웹훅 본문의 status/totalAmount 신뢰 금지)
    if (!isMockMode()) {
      const verified = await verifyWithToss(paymentKey, orderId, totalAmount);
      if (!verified.ok) {
        console.error(
          `[payments/webhook] 토스 검증 실패 — orderId=${orderId}, paymentKey=${paymentKey}: ${verified.reason}`,
        );
        return apiError(401, 'WEBHOOK_VERIFICATION_FAILED', '결제 검증에 실패했습니다.');
      }
    }

    const result = await getDataServices().payments.handleWebhook({
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
