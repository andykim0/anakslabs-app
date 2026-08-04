import { z } from 'zod';
import { PRICING, US_ENTERPRISE_PRICING } from '@/lib/pricing';

export const STRIPE_CURRENCY = 'usd' as const;

export const stripeCheckoutContract = {
  provider: 'stripe',
  mode: 'live-and-mock',
  currency: STRIPE_CURRENCY,
  lineItems: [
    {
      priceKey: 'enterprise-setup',
      mode: 'one_time',
      unitAmountCents: US_ENTERPRISE_PRICING.setupUsd * 100,
      quantity: 1,
    },
    {
      priceKey: 'enterprise-monthly',
      mode: 'recurring',
      interval: 'month',
      unitAmountCents: US_ENTERPRISE_PRICING.monthlyUsd * 100,
      quantity: 1,
    },
  ],
  pricingModelVersion: PRICING.modelVersion,
} as const;

export const stripeMockCheckoutEventSchema = z.object({
  id: z.string().min(1),
  type: z.literal('checkout.session.completed'),
  data: z.object({
    object: z.object({
      id: z.string().min(1),
      client_reference_id: z.string().min(1),
      currency: z.literal(STRIPE_CURRENCY),
      /** Contract price before automatic tax. */
      amount_subtotal: z.number().int().nonnegative(),
      amount_total: z.number().int().nonnegative().optional(),
      payment_status: z.literal('paid'),
      subscription: z.string().min(1),
      metadata: z.object({
        siteId: z.string().min(1),
        clientId: z.string().min(1).optional(),
        pricingModelVersion: z.literal(PRICING.modelVersion),
      }),
    }),
  }),
});

export const stripeMockInvoiceEventSchema = z.object({
  id: z.string().min(1),
  type: z.literal('invoice.paid'),
  data: z.object({
    object: z.object({
      id: z.string().min(1),
      currency: z.literal(STRIPE_CURRENCY),
      subtotal: z.number().int().nonnegative(),
      status: z.literal('paid'),
      billing_reason: z.enum(['subscription_create', 'subscription_cycle']),
      subscription: z.string().min(1),
    }),
  }),
});

export const stripeMockEventSchema = z.union([
  stripeMockCheckoutEventSchema,
  stripeMockInvoiceEventSchema,
]);

export type StripeMockCheckoutEvent = z.infer<typeof stripeMockCheckoutEventSchema>;

export function stripeCheckoutTotalCents(): number {
  return stripeCheckoutContract.lineItems.reduce(
    (sum, item) => sum + item.unitAmountCents * item.quantity,
    0,
  );
}

export function stripePaymentKeys(event: { id: string }): {
  setup: string;
  monthly: string;
} {
  return {
    setup: `stripe:${event.id}:setup`,
    monthly: `stripe:${event.id}:monthly`,
  };
}

export function stripeRenewalPaymentKey(invoiceId: string): string {
  return `stripe:invoice:${invoiceId}:monthly`;
}
