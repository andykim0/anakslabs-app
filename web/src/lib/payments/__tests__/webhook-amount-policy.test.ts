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

describe('PRICE P1 webhook amount policy', () => {
  test('신규 build_fee는 가격 계약을 얻지 못해 발급이 중단된다', () => {
    assert.equal(paymentAmountSubject({ type: 'build_fee' }), null);
  });

  test('연간 구독·프리미엄 애드온·크레딧 팩만 서버 가격과 정확히 일치한다', () => {
    assert.equal(validatePaymentAmount(
      { type: 'maintenance_subscription' },
      PRICING.subscription.annual,
    ).ok, true);
    assert.equal(validatePaymentAmount({ type: 'maintenance_subscription' }, 29_900).ok, false);
    assert.deepEqual(acceptedPaymentAmounts({ type: 'premium_addon' }), [
      PRICING.videoHeroAddon,
    ]);
    assert.equal(
      validatePaymentAmount({ type: 'premium_addon' }, PRICING.videoHeroAddon).ok,
      true,
    );
    assert.equal(validatePaymentAmount({ type: 'premium_addon' }, 200_001).ok, false);

    for (const pack of CREDIT_PACKS) {
      const subject = { type: 'credit_pack' as const, credits: pack.credits };
      assert.equal(validatePaymentAmount(subject, pack.priceKrw).ok, true);
      assert.equal(validatePaymentAmount(subject, pack.priceKrw + 1).ok, false);
    }
    assert.equal(validatePaymentAmount({ type: 'credit_pack', credits: 2 }, 30_000).ok, false);
  });

  test('크레딧 팩 식별값이 없으면 fail-closed한다', () => {
    assert.equal(paymentAmountSubject({ type: 'credit_pack' }), null);
    assert.equal(paymentAmountSubject({ type: 'credit_pack', creditsGranted: 0 }), null);
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
