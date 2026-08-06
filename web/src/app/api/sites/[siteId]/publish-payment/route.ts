import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDataServices } from '@/lib/data';
import { isMockMode } from '@/lib/env';
import {
  mockPublishPaymentKey,
  mockPublishSetupPaymentKey,
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
import { industryPublishPolicy } from '@/lib/industry/publish-policy';
import { US_ENTERPRISE_PRICING } from '@/lib/pricing';
import {
  createStripeCheckoutSession,
  stripeLiveCheckoutConfigured,
} from '@/lib/payments/stripe-live';

type Ctx = { params: Promise<{ siteId: string }> };

export const runtime = 'nodejs';

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
    return apiError(409, 'NO_DRAFT', 'There is no publish draft to pay for.');
  }
  const industryPolicy = industryPublishPolicy(site);
  if (industryPolicy.status === 'gated' || industryPolicy.status === 'unavailable') {
    return apiError(409, industryPolicy.code, industryPolicy.message);
  }
  const pricing = industryPolicy.pricing;
  const paymentAmount = 'amountUsd' in pricing ? pricing.amountUsd : pricing.amountKrw;
  const paymentCurrency = 'currency' in pricing ? pricing.currency : 'KRW';

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;
  if (!quoteMatchesSite(body.data.quoteId, { clientId: client.id, siteId, pricing })) {
    return apiError(409, 'PUBLISH_QUOTE_STALE', 'The publish quote changed. Review it again.');
  }

  const subscription = await resolveSiteSubscription(client.id);
  const liveStripe = stripeLiveCheckoutConfigured();
  const mockCheckout = isMockMode() && !liveStripe;
  if (!needsPublishPayment(site, subscription.active)) {
    return NextResponse.json({
      paid: true,
      duplicated: true,
      quote: publishPaymentQuote({ clientId: client.id, siteId, mock: mockCheckout, stripe: liveStripe, pricing }),
    });
  }
  // Legacy KRW shapes have no live adapter. Already-published legacy sites
  // returned above and retain no-charge republishing.
  if (industryPolicy.status === 'legacy') {
    return apiError(409, 'LEGACY_PUBLISH_PAYMENT_UNAVAILABLE', 'This legacy payment contract cannot start a new subscription.');
  }
  if (liveStripe) {
    const origin = request.nextUrl.origin;
    try {
      const checkout = await createStripeCheckoutSession({
        siteId,
        clientId: client.id,
        customerEmail: client.email,
        successUrl: new URL(`/dashboard/sites/${siteId}?checkout=success`, origin).toString(),
        cancelUrl: new URL(`/dashboard/sites/${siteId}?checkout=cancelled`, origin).toString(),
      });
      return NextResponse.json({
        paid: false,
        checkoutUrl: checkout.url,
        checkoutSessionId: checkout.id,
        quote: publishPaymentQuote({ clientId: client.id, siteId, mock: false, stripe: true, pricing }),
      });
    } catch (error) {
      console.error('[stripe-checkout] session creation failed:', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      return apiError(503, 'PUBLISH_PAYMENT_UNAVAILABLE', 'Secure checkout is temporarily unavailable.');
    }
  }
  if (!isMockMode() && !liveStripe) {
    return apiError(
      503,
      'PUBLISH_PAYMENT_UNAVAILABLE',
      '현재 결제 승인을 준비하고 있습니다. 실제 결제는 아직 진행되지 않습니다.',
    );
  }

  const services = getDataServices();
  const setupResult = await services.payments.handleWebhook({
    providerPaymentKey: mockPublishSetupPaymentKey(siteId, pricing),
    clientId: client.id,
    type: 'build_fee',
    amount: paymentCurrency === 'USD' ? US_ENTERPRISE_PRICING.setupUsd : 0,
    currency: paymentCurrency,
  });
  const result = await services.payments.handleWebhook({
    providerPaymentKey: mockPublishPaymentKey(siteId, pricing),
    clientId: client.id,
    type: 'maintenance_subscription',
    amount: paymentAmount,
    currency: paymentCurrency,
    pricingModelVersion: pricing.modelVersion,
    periodMonths: pricing.periodMonths,
    ...('industryProfileId' in pricing
      ? {
          siteId,
          industryProfileId: pricing.industryProfileId,
          ...(paymentCurrency === 'USD'
            ? { stripeSubscriptionId: `mock:subscription:${siteId}` }
            : {}),
        }
      : {}),
  });
  try {
    await recordBuildEconomicsEvent({
      eventKind: 'publish_payment',
      clientId: client.id,
      siteId,
      costUsdMicros: 0,
      idempotencyKey: `publish-payment:${pricing.modelVersion}:${siteId}`,
      metadata: {
        amount: paymentAmount,
        currency: paymentCurrency,
        periodMonths: pricing.periodMonths,
        ...('industryProfileId' in pricing
          ? { industryProfileId: pricing.industryProfileId }
          : {}),
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
    duplicated: setupResult.duplicated && result.duplicated,
    quote: publishPaymentQuote({ clientId: client.id, siteId, mock: true, stripe: false, pricing }),
  });
});
