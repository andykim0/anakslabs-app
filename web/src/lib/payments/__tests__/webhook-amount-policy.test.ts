import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { CREDIT_PACKS } from '@/lib/credits/constants';
import { PRICING } from '@/lib/pricing';
import {
  acceptedPaymentAmounts,
  paymentAmountSubject,
  validatePaymentAmount,
} from '../amount-policy';

describe('OPS O2 webhook amount policy', () => {
  test('accepts only the four current build-price and tier combinations', () => {
    assert.deepEqual(acceptedPaymentAmounts({ type: 'build_fee', tier: 'basic' }), [
      PRICING.base.launch,
      PRICING.base.list,
    ]);
    assert.deepEqual(acceptedPaymentAmounts({ type: 'build_fee', tier: 'premium' }), [
      PRICING.base.launch + PRICING.videoHeroAddon,
      PRICING.base.list + PRICING.videoHeroAddon,
    ]);

    for (const [tier, amount] of [
      ['basic', PRICING.base.launch],
      ['basic', PRICING.base.list],
      ['premium', PRICING.base.launch + PRICING.videoHeroAddon],
      ['premium', PRICING.base.list + PRICING.videoHeroAddon],
    ] as const) {
      assert.equal(validatePaymentAmount({ type: 'build_fee', tier }, amount).ok, true);
    }
  });

  test('rejects the legacy premium range and arbitrary amounts instead of using a minimum', () => {
    for (const amount of [890_000, 1_490_000, 600_000, 900_000]) {
      assert.equal(
        validatePaymentAmount({ type: 'build_fee', tier: 'premium' }, amount).ok,
        false,
        `premium ${amount} must not pass the current exact-price contract`,
      );
    }
    for (const amount of [390_001, 400_000, 590_001]) {
      assert.equal(
        validatePaymentAmount({ type: 'build_fee', tier: 'basic' }, amount).ok,
        false,
        `basic ${amount} must not pass the current exact-price contract`,
      );
    }
  });

  test('keeps subscription and credit packs on exact server-derived prices', () => {
    assert.equal(validatePaymentAmount(
      { type: 'maintenance_subscription' },
      PRICING.subscription.monthly,
    ).ok, true);
    assert.equal(validatePaymentAmount({ type: 'maintenance_subscription' }, 19_900).ok, false);

    for (const pack of CREDIT_PACKS) {
      const subject = { type: 'credit_pack' as const, credits: pack.credits };
      assert.equal(validatePaymentAmount(subject, pack.priceKrw).ok, true);
      assert.equal(validatePaymentAmount(subject, pack.priceKrw + 1).ok, false);
    }
    assert.equal(validatePaymentAmount({ type: 'credit_pack', credits: 2 }, 30_000).ok, false);
  });

  test('fails closed when an order lacks tier or credit-pack identity', () => {
    assert.equal(paymentAmountSubject({ type: 'build_fee' }), null);
    assert.equal(paymentAmountSubject({ type: 'credit_pack' }), null);
    assert.equal(paymentAmountSubject({ type: 'credit_pack', creditsGranted: 0 }), null);
    assert.deepEqual(
      paymentAmountSubject({ type: 'build_fee', tier: 'premium' }),
      { type: 'build_fee', tier: 'premium' },
    );
  });

  test('wires the same exact validator before both mock-internal and Toss processing', () => {
    const route = readFileSync(
      join(process.cwd(), 'src/app/api/payments/webhook/route.ts'),
      'utf8',
    );
    assert.doesNotMatch(route, /PRICE_RANGES|minimum|minPrice|최소 계약가/);

    const internalStart = route.indexOf('if (internal.success)');
    const tossStart = route.indexOf('// 2) 토스 웹훅 포맷');
    assert.ok(internalStart >= 0 && tossStart > internalStart);
    const internalBlock = route.slice(internalStart, tossStart);
    assert.match(
      internalBlock,
      /validateOrderAmount\(internal\.data, internal\.data\.amount\)[\s\S]*payments\.handleWebhook\(internal\.data\)/,
    );

    const tossBlock = route.slice(tossStart);
    assert.match(
      tossBlock,
      /validateOrderAmount\(order, totalAmount\)[\s\S]*payments\.handleWebhook\(\{/,
    );
  });
});
