import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { creditsEnabled, aiEditEnabled } from '@/lib/product/flags';
import { PRICING, US_ENTERPRISE_PRICING } from '@/lib/pricing';
import { acceptedPaymentAmounts, paymentAmountSubject } from '../amount-policy';
import {
  stripeCheckoutContract,
  stripeCheckoutTotalCents,
  stripePaymentKeys,
} from '../stripe';

describe('US Enterprise payment boundary', () => {
  test('pins pricing, deliverables, and Stripe mock contract', () => {
    assert.equal(PRICING.build.setupUsd, 990);
    assert.equal(PRICING.subscription.amountUsd, 990);
    assert.equal(stripeCheckoutContract.currency, 'usd');
    assert.equal(stripeCheckoutTotalCents(), 198_000);
    assert.deepEqual(US_ENTERPRISE_PRICING.deliverables, [
      'monthly-report', 'blog-posts-8', 'inquiry-booking-tracking', 'hosting-selfedit',
    ]);
  });

  test('retires add-on and credit sales while retaining the monthly contract', () => {
    assert.deepEqual(acceptedPaymentAmounts({ type: 'maintenance_subscription' }), [990]);
    assert.deepEqual(acceptedPaymentAmounts({ type: 'premium_addon' }), []);
    assert.equal(paymentAmountSubject({ type: 'premium_addon' }), null);
    assert.deepEqual(acceptedPaymentAmounts({ type: 'credit_pack', credits: 10 }), []);
    assert.equal(creditsEnabled({}), false);
    assert.equal(aiEditEnabled({}), false);
  });

  test('a retried Stripe checkout deterministically reuses two distinct provider keys', () => {
    const event = { id: 'evt_enterprise_checkout_001' };
    const first = stripePaymentKeys(event);
    const retry = stripePaymentKeys(event);
    assert.deepEqual(first, retry);
    assert.deepEqual(first, {
      setup: 'stripe:evt_enterprise_checkout_001:setup',
      monthly: 'stripe:evt_enterprise_checkout_001:monthly',
    });
    assert.notEqual(first.setup, first.monthly);
  });
});
