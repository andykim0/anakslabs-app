import 'server-only';

import Stripe from 'stripe';
import { PRICING } from '@/lib/pricing';
import { stripeCheckoutContract } from './stripe';

export class StripeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StripeConfigurationError';
  }
}

export class StripeWebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StripeWebhookSignatureError';
  }
}

function secretKey(): string | null {
  return process.env.STRIPE_SECRET_KEY?.trim() || null;
}

function webhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

export function stripeSecretKeyConfigured(): boolean {
  return secretKey() !== null;
}

export function stripeWebhookSecretConfigured(): boolean {
  return webhookSecret() !== null;
}

/** Checkout is safe to expose only when its signed completion path is ready too. */
export function stripeLiveCheckoutConfigured(): boolean {
  return stripeSecretKeyConfigured() && stripeWebhookSecretConfigured();
}

function client(): Stripe {
  const key = secretKey();
  if (!key) throw new StripeConfigurationError('Stripe secret key is not configured.');
  return new Stripe(key);
}

export async function createStripeCheckoutSession(input: {
  siteId: string;
  clientId: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string }> {
  if (!stripeLiveCheckoutConfigured()) {
    throw new StripeConfigurationError('Stripe checkout and signed webhooks are not fully configured.');
  }
  const metadata = {
    siteId: input.siteId,
    clientId: input.clientId,
    pricingModelVersion: PRICING.modelVersion,
  };
  const session = await client().checkout.sessions.create(
    {
      mode: 'subscription',
      client_reference_id: input.clientId,
      ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      automatic_tax: { enabled: true },
      metadata,
      subscription_data: { metadata },
      line_items: stripeCheckoutContract.lineItems.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: stripeCheckoutContract.currency,
          unit_amount: item.unitAmountCents,
          product_data: {
            name: item.mode === 'one_time'
              ? 'Anaks Labs Enterprise setup'
              : 'Anaks Labs Enterprise monthly service',
          },
          ...(item.mode === 'recurring'
            ? { recurring: { interval: item.interval } }
            : {}),
        },
      })),
    },
    { idempotencyKey: `publish-checkout:${PRICING.modelVersion}:${input.siteId}` },
  );
  if (!session.url) {
    throw new StripeConfigurationError('Stripe did not return a hosted Checkout URL.');
  }
  return { id: session.id, url: session.url };
}

export function constructStripeWebhookEvent(rawBody: string, signature: string): Stripe.Event {
  const secret = webhookSecret();
  if (!secret) throw new StripeConfigurationError('Stripe webhook secret is not configured.');
  try {
    return Stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    // Do not reflect Stripe's signature parser detail into the route boundary.
    throw new StripeWebhookSignatureError('Stripe webhook signature verification failed.');
  }
}

export function stripeSubscriptionId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value;
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === 'string' && id.trim() ? id : null;
  }
  return null;
}

/** Supports both pre-Basil and Basil Invoice event shapes. */
export function stripeInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const legacy = stripeSubscriptionId(
    (invoice as Stripe.Invoice & { subscription?: unknown }).subscription,
  );
  if (legacy) return legacy;
  const parent = (invoice as Stripe.Invoice & {
    parent?: { subscription_details?: { subscription?: unknown } } | null;
  }).parent;
  return stripeSubscriptionId(parent?.subscription_details?.subscription);
}

/**
 * Stop the recurring charge at the end of the period the customer has already paid for.
 *
 * NOT an immediate cancel, and that is a policy decision rather than a convenience. REFUND_POLICY
 * (credits/constants.ts) is the BUILD FEE policy — it governs the one-time setup, not the monthly
 * subscription, and no pro-rata or refund mechanism for the monthly exists anywhere in this
 * codebase. Cancelling immediately would therefore take back service the customer has paid for
 * with no route to return the money. Do not "simplify" this to subscriptions.cancel().
 *
 * Idempotent by construction: setting cancel_at_period_end on a subscription that already carries
 * it is the same state, not a second act, so a double-click or a retried request is harmless.
 */
export async function cancelStripeSubscriptionAtPeriodEnd(
  subscriptionId: string,
): Promise<{ cancelAtPeriodEnd: boolean; currentPeriodEnd: string | null }> {
  const trimmed = subscriptionId.trim();
  if (!trimmed) {
    throw new StripeConfigurationError('A Stripe subscription id is required to cancel.');
  }
  const updated = await client().subscriptions.update(trimmed, {
    cancel_at_period_end: true,
  });
  const periodEnd = (updated as unknown as { current_period_end?: number }).current_period_end;
  return {
    cancelAtPeriodEnd: updated.cancel_at_period_end === true,
    currentPeriodEnd: typeof periodEnd === 'number'
      ? new Date(periodEnd * 1000).toISOString()
      : null,
  };
}
