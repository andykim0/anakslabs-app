import { CREDIT_PACKS } from '@/lib/credits/constants';
import { PRICING } from '@/lib/pricing';
import type { PaymentType, Tier } from '@/lib/types/domain';

export type PaymentAmountSubject =
  | { type: 'build_fee'; tier: Tier }
  | { type: 'maintenance_subscription' }
  | { type: 'credit_pack'; credits: number };

export interface PaymentAmountValidation {
  ok: boolean;
  expectedKrw: readonly number[];
  message: string | null;
}

function uniqueSorted(values: readonly number[]): readonly number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

/** Exact current product combinations, derived only from the pricing contract. */
export function acceptedPaymentAmounts(subject: PaymentAmountSubject): readonly number[] {
  if (subject.type === 'maintenance_subscription') {
    return [PRICING.subscription.monthly];
  }
  if (subject.type === 'credit_pack') {
    const pack = CREDIT_PACKS.find((candidate) => candidate.credits === subject.credits);
    return pack ? [pack.priceKrw] : [];
  }
  if (subject.tier === 'basic') {
    return uniqueSorted([PRICING.base.launch, PRICING.base.list]);
  }
  return uniqueSorted([
    PRICING.base.launch + PRICING.videoHeroAddon,
    PRICING.base.list + PRICING.videoHeroAddon,
  ]);
}

export function validatePaymentAmount(
  subject: PaymentAmountSubject,
  amountKrw: number,
): PaymentAmountValidation {
  const expectedKrw = acceptedPaymentAmounts(subject);
  if (!Number.isSafeInteger(amountKrw) || amountKrw <= 0) {
    return {
      ok: false,
      expectedKrw,
      message: '결제 금액은 0보다 큰 원 단위 정수여야 합니다.',
    };
  }
  if (!expectedKrw.includes(amountKrw)) {
    return {
      ok: false,
      expectedKrw,
      message: expectedKrw.length
        ? `현재 가격 계약과 일치하지 않습니다. 허용 금액: ${expectedKrw.join(', ')}원`
        : '현재 가격표에 존재하지 않는 결제 조합입니다.',
    };
  }
  return { ok: true, expectedKrw, message: null };
}

export function paymentAmountSubject(input: {
  type: PaymentType;
  tier?: Tier;
  creditsGranted?: number;
}): PaymentAmountSubject | null {
  if (input.type === 'build_fee') {
    return input.tier ? { type: 'build_fee', tier: input.tier } : null;
  }
  if (input.type === 'maintenance_subscription') {
    return { type: 'maintenance_subscription' };
  }
  return Number.isSafeInteger(input.creditsGranted) && (input.creditsGranted ?? 0) > 0
    ? { type: 'credit_pack', credits: input.creditsGranted! }
    : null;
}

