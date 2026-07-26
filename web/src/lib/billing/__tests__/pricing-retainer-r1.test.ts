import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  needsPublishPayment,
  publishPaymentQuote,
} from '@/lib/billing/publish-payment';
import {
  CURRENT_SUBSCRIPTION_PRICE,
  PRICING,
  PRICING_MODEL_VERSION,
  type SubscriptionPriceContract,
} from '@/lib/pricing';

const read = (path: string): string =>
  readFileSync(join(process.cwd(), path), 'utf8');

describe('PRICE R1 — 월 리테이너 백본·가격표 버전', () => {
  test('신규 발행 견적의 기본 백본은 인테리어 월 490,000원·1개월 자동 갱신이다', () => {
    const quote = publishPaymentQuote({
      clientId: 'client-r1',
      siteId: 'site-r1',
      mock: true,
    });

    assert.equal(PRICING.subscription.amountKrw, 490_000);
    assert.equal(PRICING.subscription.periodMonths, 1);
    assert.equal(PRICING.subscription.billingInterval, 'month');
    assert.equal(PRICING.subscription.automaticRenewal, true);
    assert.equal(quote.amountKrw, 490_000);
    assert.equal(quote.industryProfileId, 'interior');
    assert.equal(quote.vatIncluded, true);
    assert.equal(quote.periodMonths, 1);
    assert.equal(quote.billingInterval, 'month');
    assert.equal(quote.pricingModelVersion, PRICING_MODEL_VERSION);
    assert.equal(PRICING.subscription.annualCommitment.status, 'available');
    assert.equal(PRICING.subscription.annualCommitment.amountKrw, 4_900_000);
    assert.equal(PRICING.subscription.annualCommitment.freeMonths, 2);
  });

  test('가격표 버전을 올리면 신규 견적만 바뀌고 현재 가격표 견적은 바이트 동일하다', () => {
    const input = {
      clientId: 'client-version',
      siteId: 'site-version',
      mock: true,
    } as const;
    const before = publishPaymentQuote(input);
    const beforeBytes = JSON.stringify(before);
    const pilotPrice: SubscriptionPriceContract = {
      modelVersion: 'monthly-retainer-v4-pilot',
      industryProfileId: 'interior',
      amountKrw: 180_000,
      periodMonths: 1,
      billingInterval: 'month',
      automaticRenewal: true,
      vatIncluded: true,
    };

    const pilot = publishPaymentQuote({ ...input, pricing: pilotPrice });
    const currentAgain = publishPaymentQuote(input);

    assert.equal(pilot.amountKrw, 180_000);
    assert.equal(pilot.pricingModelVersion, 'monthly-retainer-v4-pilot');
    assert.equal(pilot.periodMonths, 1);
    assert.notEqual(pilot.quoteId, before.quoteId);
    assert.equal(JSON.stringify(currentAgain), beforeBytes);
    assert.deepEqual(CURRENT_SUBSCRIPTION_PRICE, {
      modelVersion: PRICING_MODEL_VERSION,
      industryProfileId: 'interior',
      amountKrw: 490_000,
      periodMonths: 1,
      billingInterval: 'month',
      automaticRenewal: true,
      vatIncluded: true,
    });
  });

  test('이미 활성인 구독은 가격표 버전 교체와 무관하게 추가 결제를 요구하지 않는다', () => {
    const existingSubscription = Object.freeze({
      status: 'active',
      currentPeriodStart: '2026-07-01T00:00:00.000Z',
      currentPeriodEnd: '2026-08-01T00:00:00.000Z',
      pricingModelVersion: PRICING_MODEL_VERSION,
      amountKrw: 490_000,
      periodMonths: 1,
    });
    const before = JSON.stringify(existingSubscription);

    publishPaymentQuote({
      clientId: 'client-existing',
      siteId: 'site-existing',
      mock: true,
      pricing: {
        modelVersion: 'monthly-retainer-v4-pilot',
        industryProfileId: 'interior',
        amountKrw: 180_000,
        periodMonths: 1,
        billingInterval: 'month',
        automaticRenewal: true,
        vatIncluded: true,
      },
    });

    assert.equal(needsPublishPayment({ publishedAt: null }, true), false);
    assert.equal(JSON.stringify(existingSubscription), before);
  });

  test('0044 RPC는 금액·기간·가격표 버전을 인자로 받고 결제 증거에 고정한다', () => {
    const migration = read('../supabase/migrations/0044_monthly_retainer_pricing.sql');

    assert.match(
      migration,
      /handle_maintenance_payment\(\s*p_client_id uuid,\s*p_provider_payment_key text,\s*p_amount numeric,\s*p_pricing_model_version text,\s*p_period_months integer/,
    );
    assert.match(
      migration,
      /btrim\(p_pricing_model_version\), p_period_months/,
    );
    assert.match(
      migration,
      /public\.renew_site_subscription\([\s\S]*p_period_months/,
    );
    assert.doesNotMatch(migration, /p_amount\s*<>\s*150000/);
    assert.doesNotMatch(migration, /interval\s+'12 months'/);

    const service = read('src/lib/data/supabase/services.ts');
    assert.match(service, /p_amount: payload\.amount/);
    assert.match(service, /p_pricing_model_version: payload\.pricingModelVersion/);
    assert.match(service, /p_period_months: payload\.periodMonths/);
  });

  test('월 성과 관리 카피와 기존 PRICE 안전장치가 함께 유지된다', () => {
    const marketing = [
      read('src/app/(marketing)/page.tsx'),
      read('src/app/(marketing)/pricing/page.tsx'),
      read('src/app/(marketing)/features/page.tsx'),
      read('docs/kmong-product-copy.md'),
    ].join('\n');
    const guaranteeRoute = read('src/app/(marketing)/guarantee/page.tsx');
    const prepublishPolicy = read('src/lib/billing/prepublish-cost-policy.ts');

    assert.match(marketing, /490,000|formatKrw\(PRICING\.subscription\.amountKrw\)/);
    assert.match(marketing, /성과 관리비|전환 리포팅|성과 리포트/);
    assert.doesNotMatch(marketing, /무료 제작|1년 이용|연 390,000원/);
    assert.doesNotMatch(marketing, /아임웹|윅스|Wix|Squarespace/);
    assert.match(guaranteeRoute, /notFound\(\)/);
    assert.match(prepublishPolicy, /externalGenerationAllowed: false/);
  });
});
