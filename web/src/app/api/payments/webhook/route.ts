/**
 * Stripe webhook contract boundary.
 *
 * Live Stripe verification is intentionally not enabled in this fork. In
 * MOCK_MODE the route accepts the same checkout-session shape that a future
 * signed adapter will verify. Each business effect receives its own stable
 * provider key, so delivery retries remain idempotent.
 */
import { NextResponse } from 'next/server';
import { getDataServices } from '@/lib/data';
import { isMockMode } from '@/lib/env';
import { PRICING, US_ENTERPRISE_PRICING } from '@/lib/pricing';
import {
  stripeCheckoutTotalCents,
  stripeMockEventSchema,
  stripePaymentKeys,
} from '@/lib/payments/stripe';
import { apiError, withApiHandler } from '../../_lib/http';

export const POST = withApiHandler(async (request) => {
  if (!isMockMode()) {
    return apiError(
      503,
      'STRIPE_LIVE_DISABLED',
      'Live Stripe webhook verification is not enabled.',
    );
  }

  const raw = await request.json().catch(() => null);
  const parsed = stripeMockEventSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(400, 'INVALID_STRIPE_EVENT', 'The Stripe mock event is invalid.');
  }
  const event = parsed.data;
  const session = event.data.object;
  if (session.amount_total !== stripeCheckoutTotalCents()) {
    return apiError(400, 'AMOUNT_MISMATCH', 'The checkout total does not match the Enterprise contract.');
  }

  const services = getDataServices();
  const site = await services.sites.getById(session.metadata.siteId);
  if (
    !site
    || site.clientId !== session.client_reference_id
    || site.industryProfileId !== 'clinic'
    || site.pricingModelVersion !== PRICING.modelVersion
  ) {
    return apiError(409, 'SITE_CONTRACT_MISMATCH', 'The Stripe event does not match the site contract.');
  }

  const keys = stripePaymentKeys(event);
  const setup = await services.payments.handleWebhook({
    providerPaymentKey: keys.setup,
    clientId: site.clientId,
    type: 'build_fee',
    amount: US_ENTERPRISE_PRICING.setupUsd,
  });
  const monthly = await services.payments.handleWebhook({
    providerPaymentKey: keys.monthly,
    clientId: site.clientId,
    siteId: site.id,
    industryProfileId: 'clinic',
    pricingModelVersion: PRICING.modelVersion,
    periodMonths: 1,
    type: 'maintenance_subscription',
    amount: US_ENTERPRISE_PRICING.monthlyUsd,
  });

  return NextResponse.json({
    received: true,
    processed: setup.processed || monthly.processed,
    duplicated: setup.duplicated && monthly.duplicated,
    effects: { setup, monthly },
  });
});
