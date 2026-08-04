import type Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { getDataServices, getSupabaseDataServices, type DataServices } from '@/lib/data';
import { isMockMode } from '@/lib/env';
import { PRICING, US_ENTERPRISE_PRICING } from '@/lib/pricing';
import {
  stripeCheckoutTotalCents,
  stripeMockEventSchema,
  stripePaymentKeys,
  stripeRenewalPaymentKey,
} from '@/lib/payments/stripe';
import {
  constructStripeWebhookEvent,
  stripeInvoiceSubscriptionId,
  stripeSecretKeyConfigured,
  stripeSubscriptionId,
  stripeWebhookSecretConfigured,
  StripeWebhookSignatureError,
} from '@/lib/payments/stripe-live';
import { getSiteSubscriptionByStripeId } from '@/lib/subscriptions/service';
import { apiError, withApiHandler } from '../../_lib/http';

export const runtime = 'nodejs';

type CheckoutEvent = {
  id: string;
  type: 'checkout.session.completed';
  data: { object: Stripe.Checkout.Session };
};

function checkoutContractError(session: Stripe.Checkout.Session): string | null {
  if (session.currency !== 'usd') return 'The checkout currency is not USD.';
  if (session.amount_subtotal !== stripeCheckoutTotalCents()) {
    return 'The checkout subtotal does not match the Enterprise contract.';
  }
  if (session.payment_status !== 'paid') return 'The checkout session is not paid.';
  return null;
}

async function processCheckout(event: CheckoutEvent, services: DataServices) {
  const session = event.data.object;
  const contractError = checkoutContractError(session);
  if (contractError) return apiError(400, 'AMOUNT_MISMATCH', contractError);
  const siteId = session.metadata?.siteId;
  const clientId = session.client_reference_id;
  const subscriptionId = stripeSubscriptionId(session.subscription);
  if (!siteId || !clientId || !subscriptionId) {
    return apiError(400, 'INVALID_STRIPE_EVENT', 'The checkout contract metadata is incomplete.');
  }

  const site = await services.sites.getById(siteId);
  if (
    !site
    || site.clientId !== clientId
    || (session.metadata?.clientId && session.metadata.clientId !== clientId)
    || session.metadata?.pricingModelVersion !== PRICING.modelVersion
    || site.industryProfileId !== 'clinic'
    || site.pricingModelVersion !== PRICING.modelVersion
  ) {
    return apiError(409, 'SITE_CONTRACT_MISMATCH', 'The Stripe event does not match the site contract.');
  }

  const keys = stripePaymentKeys(event);
  const setup = await services.payments.handleWebhook({
    providerPaymentKey: keys.setup,
    clientId,
    type: 'build_fee',
    amount: US_ENTERPRISE_PRICING.setupUsd,
    currency: 'USD',
  });
  const monthly = await services.payments.handleWebhook({
    providerPaymentKey: keys.monthly,
    clientId,
    siteId,
    industryProfileId: 'clinic',
    pricingModelVersion: PRICING.modelVersion,
    periodMonths: 1,
    type: 'maintenance_subscription',
    amount: US_ENTERPRISE_PRICING.monthlyUsd,
    currency: 'USD',
    stripeSubscriptionId: subscriptionId,
  });

  return NextResponse.json({
    received: true,
    processed: setup.processed || monthly.processed,
    duplicated: setup.duplicated && monthly.duplicated,
    effects: { setup, monthly },
  });
}

async function processRenewal(
  event: Stripe.Event,
  services: DataServices,
  forceSupabase: boolean,
) {
  const invoice = event.data.object as Stripe.Invoice;
  // Checkout owns setup + month one. Processing subscription_create here would
  // extend the same payment twice before the first cycle has elapsed.
  if (invoice.billing_reason !== 'subscription_cycle') {
    return NextResponse.json({ received: true, processed: false, ignored: true });
  }
  if (invoice.currency !== 'usd' || invoice.subtotal !== US_ENTERPRISE_PRICING.monthlyUsd * 100) {
    return apiError(400, 'AMOUNT_MISMATCH', 'The invoice subtotal does not match the Enterprise monthly contract.');
  }
  if (invoice.status !== 'paid') {
    return apiError(400, 'INVALID_STRIPE_EVENT', 'The subscription invoice is not paid.');
  }
  const subscriptionId = stripeInvoiceSubscriptionId(invoice);
  if (!subscriptionId) {
    return apiError(400, 'INVALID_STRIPE_EVENT', 'The invoice has no Stripe subscription reference.');
  }
  const subscription = await getSiteSubscriptionByStripeId(subscriptionId, { forceSupabase });
  if (
    !subscription?.siteId
    || subscription.industryProfileId !== 'clinic'
    || subscription.pricingModelVersion !== PRICING.modelVersion
  ) {
    return apiError(409, 'SUBSCRIPTION_CONTRACT_MISMATCH', 'The invoice does not match a site subscription contract.');
  }
  const site = await services.sites.getById(subscription.siteId);
  if (!site || site.clientId !== subscription.clientId) {
    return apiError(409, 'SUBSCRIPTION_CONTRACT_MISMATCH', 'The invoice subscription owner does not match the site.');
  }
  const result = await services.payments.handleWebhook({
    providerPaymentKey: stripeRenewalPaymentKey(invoice.id),
    clientId: subscription.clientId,
    siteId: subscription.siteId,
    industryProfileId: 'clinic',
    pricingModelVersion: PRICING.modelVersion,
    periodMonths: 1,
    type: 'maintenance_subscription',
    amount: US_ENTERPRISE_PRICING.monthlyUsd,
    currency: 'USD',
    stripeSubscriptionId: subscriptionId,
  });
  return NextResponse.json({ received: true, ...result });
}

export const POST = withApiHandler(async (request) => {
  const rawBody = await request.text();
  let event: Stripe.Event | CheckoutEvent;
  const liveStripeEvent = stripeSecretKeyConfigured();

  if (liveStripeEvent) {
    const signature = request.headers.get('stripe-signature');
    // A configured live account closes the unsigned mock boundary even when
    // MOCK_MODE was accidentally left enabled in production.
    if (!signature || !stripeWebhookSecretConfigured()) {
      return apiError(503, 'STRIPE_SIGNED_WEBHOOK_REQUIRED', 'Signed Stripe webhooks are required.');
    }
    try {
      event = constructStripeWebhookEvent(rawBody, signature);
    } catch (error) {
      if (error instanceof StripeWebhookSignatureError) {
        return apiError(400, 'INVALID_STRIPE_SIGNATURE', 'The Stripe signature is invalid.');
      }
      return apiError(503, 'STRIPE_WEBHOOK_UNAVAILABLE', 'Stripe webhook verification is unavailable.');
    }
  } else {
    if (!isMockMode()) {
      return apiError(503, 'STRIPE_LIVE_DISABLED', 'Stripe is not configured.');
    }
    let parsedJson: unknown = null;
    try {
      parsedJson = JSON.parse(rawBody || 'null') as unknown;
    } catch {
      return apiError(400, 'INVALID_STRIPE_EVENT', 'The Stripe mock event is invalid.');
    }
    const parsed = stripeMockEventSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return apiError(400, 'INVALID_STRIPE_EVENT', 'The Stripe mock event is invalid.');
    }
    event = parsed.data as unknown as CheckoutEvent;
  }

  // A verified provider callback is never allowed to inherit a stray mock flag.
  const services = liveStripeEvent ? getSupabaseDataServices() : getDataServices();
  if (event.type === 'checkout.session.completed') {
    return processCheckout(event as CheckoutEvent, services);
  }
  if (event.type === 'invoice.paid') {
    return processRenewal(event as Stripe.Event, services, liveStripeEvent);
  }
  return NextResponse.json({ received: true, processed: false, ignored: true });
});
