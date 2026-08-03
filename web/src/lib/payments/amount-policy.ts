import { CREDIT_PACKS } from '@/lib/credits/constants';
import { PRICING } from '@/lib/pricing';
import type { PaymentType } from '@/lib/types/domain';
import { creditsEnabled } from '@/lib/product/flags';

export type PaymentAmountSubject =
  | { type: 'maintenance_subscription' }
  | { type: 'premium_addon' }
  | { type: 'credit_pack'; credits: number };

export interface PaymentAmountValidation {
  ok: boolean;
  expectedAmounts: readonly number[];
  currency: 'USD';
  message: string | null;
}

/** Exact current product combinations, derived only from the pricing contract. */
export function acceptedPaymentAmounts(subject: PaymentAmountSubject): readonly number[] {
  if (subject.type === 'maintenance_subscription') {
    return [PRICING.subscription.amountUsd];
  }
  if (subject.type === 'premium_addon') {
    return [];
  }
  if (subject.type === 'credit_pack') {
    if (!creditsEnabled()) return [];
    const pack = CREDIT_PACKS.find((candidate) => candidate.credits === subject.credits);
    return pack ? [pack.priceKrw] : [];
  }
  return [];
}

export function validatePaymentAmount(
  subject: PaymentAmountSubject,
  amount: number,
): PaymentAmountValidation {
  const expectedAmounts = acceptedPaymentAmounts(subject);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return {
      ok: false,
      expectedAmounts,
      currency: 'USD',
      message: 'The payment amount must be a positive whole-dollar value.',
    };
  }
  if (!expectedAmounts.includes(amount)) {
    return {
      ok: false,
      expectedAmounts,
      currency: 'USD',
      message: expectedAmounts.length
        ? `The amount does not match the current contract. Allowed amount: $${expectedAmounts.join(', $')}`
        : 'This purchase type is not available in the current contract.',
    };
  }
  return { ok: true, expectedAmounts, currency: 'USD', message: null };
}

export function paymentAmountSubject(input: {
  type: PaymentType;
  creditsGranted?: number;
}): PaymentAmountSubject | null {
  if (input.type === 'maintenance_subscription') {
    return { type: 'maintenance_subscription' };
  }
  if (input.type === 'premium_addon') {
    return null;
  }
  if (input.type === 'build_fee') return null;
  return creditsEnabled()
    && Number.isSafeInteger(input.creditsGranted)
    && (input.creditsGranted ?? 0) > 0
    ? { type: 'credit_pack', credits: input.creditsGranted! }
    : null;
}
