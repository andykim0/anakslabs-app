import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDataServices } from '@/lib/data';
import { isMockMode } from '@/lib/env';
import { PRICING, PRICING_MODEL_VERSION } from '@/lib/pricing';
import {
  mockPublishPaymentKey,
  needsPublishPayment,
  publishPaymentQuote,
  quoteMatchesSite,
} from '@/lib/billing/publish-payment';
import { resolveSiteSubscription } from '@/lib/subscriptions/service';
import { recordBuildEconomicsEvent } from '@/lib/economics/events';
import { apiError, parseBody, withApiHandler } from '../../../_lib/http';
import {
  getAuthedClient,
  getOwnedSite,
  siteNotFound,
  unauthorized,
} from '../../../_lib/guards';

type Ctx = { params: Promise<{ siteId: string }> };

const bodySchema = z.object({
  quoteId: z.string().length(32),
});

export const POST = withApiHandler<Ctx>(async (request: NextRequest, { params }) => {
  const { siteId } = await params;
  const client = await getAuthedClient();
  if (!client) return unauthorized();
  const site = await getOwnedSite(siteId, client.id);
  if (!site) return siteNotFound();
  if (!site.draftConfig) {
    return apiError(409, 'NO_DRAFT', '결제할 발행 초안이 없습니다.');
  }

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;
  if (!quoteMatchesSite(body.data.quoteId, { clientId: client.id, siteId })) {
    return apiError(409, 'PUBLISH_QUOTE_STALE', '발행 견적이 달라졌습니다. 다시 확인해 주세요.');
  }

  const subscription = await resolveSiteSubscription(client.id);
  if (!needsPublishPayment(site, subscription.active)) {
    return NextResponse.json({
      paid: true,
      duplicated: true,
      quote: publishPaymentQuote({ clientId: client.id, siteId, mock: isMockMode() }),
    });
  }
  if (!isMockMode()) {
    return apiError(
      503,
      'PUBLISH_PAYMENT_UNAVAILABLE',
      '현재 결제 승인을 준비하고 있습니다. 실제 결제는 아직 진행되지 않습니다.',
    );
  }

  const result = await getDataServices().payments.handleWebhook({
    providerPaymentKey: mockPublishPaymentKey(siteId),
    clientId: client.id,
    type: 'maintenance_subscription',
    amount: PRICING.subscription.amountKrw,
    pricingModelVersion: PRICING.modelVersion,
    periodMonths: PRICING.subscription.periodMonths,
  });
  try {
    await recordBuildEconomicsEvent({
      eventKind: 'publish_payment',
      clientId: client.id,
      siteId,
      costUsdMicros: 0,
      idempotencyKey: `publish-payment:${PRICING_MODEL_VERSION}:${siteId}`,
      metadata: {
        amountKrw: PRICING.subscription.amountKrw,
        periodMonths: PRICING.subscription.periodMonths,
        mode: 'mock',
      },
    });
  } catch (error) {
    console.warn('[build-economics] publish payment evidence failed:', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
  }

  return NextResponse.json({
    paid: true,
    duplicated: result.duplicated,
    quote: publishPaymentQuote({ clientId: client.id, siteId, mock: true }),
  });
});
