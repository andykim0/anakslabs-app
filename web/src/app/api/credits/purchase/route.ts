/**
 * POST /api/credits/purchase — 크레딧 팩 구매.
 * body: { packCredits: number } — 가격은 서버가 CREDIT_PACKS에서 조회 (클라이언트 금액 신뢰 금지).
 *
 * mock 모드: PG 승인·웹훅 왕복을 생략하고 즉시 웹훅 처리(providerPaymentKey='mock-'+UUID) → 잔액 반영.
 * 실모드: 토스페이먼츠 결제창 파라미터를 반환한다.
 *   프론트: loadTossPayments(clientKey).requestPayment('카드', { amount, orderId, orderName, successUrl, failUrl })
 *   결제 승인 후 토스 웹훅(PAYMENT_STATUS_CHANGED, status=DONE)이 POST /api/payments/webhook 으로 수신되고,
 *   orderId(`cp_{credits}_{clientId}_{nonce}`)를 파싱해 크레딧을 지급한다.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CREDIT_PACKS } from '@/lib/credits/constants';
import { PUBLIC_BRAND_NAMES } from '@/lib/brand/public-names';
import { getDataServices } from '@/lib/data';
import { isMockMode } from '@/lib/env';
import { apiError, parseBody, withApiHandler } from '../../_lib/http';
import { getAuthedClient, unauthorized } from '../../_lib/guards';
import { creditsEnabled } from '@/lib/product/flags';

const bodySchema = z.object({
  packCredits: z.number().int().positive(),
});

export const POST = withApiHandler(async (request) => {
  if (!creditsEnabled()) {
    return apiError(404, 'CREDITS_DISABLED', '크레딧 구매는 현재 제공하지 않습니다.');
  }
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;

  // 서버가 가격의 원본 — 클라이언트가 보낸 가격/금액은 절대 신뢰하지 않는다.
  const pack = CREDIT_PACKS.find((p) => p.credits === body.data.packCredits);
  if (!pack) {
    return apiError(400, 'INVALID_PACK', '존재하지 않는 크레딧 팩입니다.', {
      availablePacks: CREDIT_PACKS.map((p) => p.credits),
    });
  }

  const { payments, credits } = getDataServices();

  if (isMockMode()) {
    const result = await payments.handleWebhook({
      providerPaymentKey: `mock-${crypto.randomUUID()}`,
      clientId: client.id,
      type: 'credit_pack',
      amount: pack.priceKrw,
      creditsGranted: pack.credits,
    });
    const balance = await credits.getBalance(client.id);
    return NextResponse.json(
      {
        paid: true,
        duplicated: result.duplicated,
        credits: pack.credits,
        amount: pack.priceKrw,
        balance: balance.balance,
      },
      { status: 201 },
    );
  }

  // 실모드 — 토스 결제창 호출 파라미터 반환 (결제 확정은 웹훅에서 처리)
  const origin = request.nextUrl.origin;
  const orderId = `cp_${pack.credits}_${client.id}_${Date.now().toString(36)}`;
  return NextResponse.json({
    paid: false,
    checkout: {
      provider: 'toss',
      clientKey: process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? '',
      orderId,
      orderName: `${PUBLIC_BRAND_NAMES.brand} 크레딧 팩 ${pack.label}`,
      amount: pack.priceKrw,
      customerKey: client.id,
      successUrl: `${origin}/dashboard?payment=success&orderId=${orderId}`,
      failUrl: `${origin}/dashboard?payment=fail&orderId=${orderId}`,
    },
  });
});
