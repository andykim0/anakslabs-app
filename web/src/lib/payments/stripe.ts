import { z } from 'zod';
import { PRICING, US_ENTERPRISE_PRICING } from '@/lib/pricing';

export const STRIPE_CURRENCY = 'usd' as const;

export const stripeCheckoutContract = {
  provider: 'stripe',
  mode: 'contract-and-mock-only',
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

export const stripeMockEventSchema = z.object({
  id: z.string().min(1),
  type: z.literal('checkout.session.completed'),
  data: z.object({
    object: z.object({
      id: z.string().min(1),
      client_reference_id: z.string().min(1),
      currency: z.literal(STRIPE_CURRENCY),
      amount_total: z.number().int().nonnegative(),
      payment_status: z.literal('paid'),
      metadata: z.object({
        siteId: z.string().min(1),
        pricingModelVersion: z.literal(PRICING.modelVersion),
      }),
    }),
  }),
});

export type StripeMockCheckoutEvent = z.infer<typeof stripeMockEventSchema>;

export function stripeCheckoutTotalCents(): number {
  return stripeCheckoutContract.lineItems.reduce(
    (sum, item) => sum + item.unitAmountCents * item.quantity,
    0,
  );
}

export function stripePaymentKeys(event: Pick<StripeMockCheckoutEvent, 'id'>): {
  setup: string;
  monthly: string;
} {
  return {
    setup: `stripe:${event.id}:setup`,
    monthly: `stripe:${event.id}:monthly`,
  };
}
