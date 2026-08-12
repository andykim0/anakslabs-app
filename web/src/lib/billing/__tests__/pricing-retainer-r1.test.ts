import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { needsPublishPayment, publishPaymentQuote } from '@/lib/billing/publish-payment';
import {
  CURRENT_SUBSCRIPTION_PRICE,
  PRICING,
  PRICING_MODEL_VERSION,
  US_ENTERPRISE_PRICING,
} from '@/lib/pricing';

describe('Anaks Labs US Enterprise billing backbone', () => {
  test('pins the $990 setup and $1,490 monthly USD contract', () => {
    const quote = publishPaymentQuote({ clientId: 'client-r1', siteId: 'site-r1', mock: true });
    assert.equal(PRICING_MODEL_VERSION, 'enterprise-us-v6-2026-08');
    assert.equal(PRICING.build.setupUsd, 990);
    assert.equal(PRICING.subscription.amountUsd, 1_490);
    assert.equal(quote.setupAmount, 990);
    assert.equal(quote.amount, 1_490);
    assert.equal(quote.currency, 'USD');
    assert.equal(quote.taxIncluded, false);
    assert.equal(quote.industryProfileId, 'clinic');
    assert.deepEqual(US_ENTERPRISE_PRICING.deliverables, [
      'monthly-report',
      'blog-posts-8',
      'inquiry-booking-tracking',
      'hosting-selfedit',
    ]);
  });

  test('quote bytes are deterministic and subscriptions suppress duplicate publish payment', () => {
    const input = { clientId: 'client-version', siteId: 'site-version', mock: true } as const;
    assert.equal(JSON.stringify(publishPaymentQuote(input)), JSON.stringify(publishPaymentQuote(input)));
    assert.equal(needsPublishPayment({ publishedAt: null }, true), false);
    assert.equal(needsPublishPayment({ publishedAt: null }, false), true);
    assert.equal(CURRENT_SUBSCRIPTION_PRICE.amountUsd, 1_490);
  });
});
