import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { publishPaymentQuote } from '@/lib/billing/publish-payment';
import {
  CURRENT_PRICING_TABLE,
  LEGACY_PRICING_MODEL_VERSION,
  LEGACY_PRICING_TABLE_CATALOG,
  PRICING,
  PRICING_MODEL_VERSION,
  PUBLISH_PAYMENT_COPY,
  industryProfile,
} from '@/lib/pricing';

describe('INDUSTRY M1 — 업종 단일가·레거시 가격표 격리', () => {
  test('신규 가격표는 인테리어 프로파일 한 축으로 49만원·VAT 포함 계약을 소유한다', () => {
    assert.equal(PRICING_MODEL_VERSION, 'industry-single-2026-07');
    assert.equal(CURRENT_PRICING_TABLE.modelVersion, PRICING_MODEL_VERSION);
    assert.deepEqual(Object.keys(CURRENT_PRICING_TABLE.profiles), ['interior']);
    assert.deepEqual(industryProfile('interior'), {
      id: 'interior',
      label: '인테리어·공간',
      availability: 'public',
      monthlyKrw: 490_000,
      annualKrw: 4_900_000,
      postsPerMonth: 0,
      schemaType: 'HomeAndConstructionBusiness',
      contentRules: [],
      keywordSets: [
        { id: 'region', label: '지역', source: 'region' },
        { id: 'area-size', label: '평형', source: 'business_fact' },
      ],
      included: PRICING.profiles.interior.included,
    });
    assert.equal(PUBLISH_PAYMENT_COPY.vat, '부가세 포함 총액');
  });

  test('402 기본 견적은 인테리어 월 단위이며 연납은 표시 계약만 유지한다', () => {
    const quote = publishPaymentQuote({
      clientId: 'client-industry',
      siteId: 'site-industry',
      mock: true,
    });
    assert.equal(quote.pricingModelVersion, PRICING_MODEL_VERSION);
    assert.equal(quote.industryProfileId, 'interior');
    assert.equal(quote.amountKrw, 490_000);
    assert.equal(quote.periodMonths, 1);
    assert.equal(quote.vatIncluded, true);
    assert.equal(PRICING.subscription.annualCommitment.amountKrw, 4_900_000);
    assert.equal(PRICING.subscription.annualCommitment.freeMonths, 2);
  });

  test('머지된 v4는 동결 해석 자료로만 보존하고 머지되지 않은 v5는 만들지 않는다', () => {
    assert.deepEqual(Object.keys(LEGACY_PRICING_TABLE_CATALOG), [
      LEGACY_PRICING_MODEL_VERSION,
    ]);
    assert.equal(
      LEGACY_PRICING_TABLE_CATALOG[LEGACY_PRICING_MODEL_VERSION]
        .tiers.standard.monthlyPrice.amountKrw,
      150_000,
    );
    assert.equal(
      LEGACY_PRICING_TABLE_CATALOG[LEGACY_PRICING_MODEL_VERSION]
        .tiers.premium.availability,
      'contact',
    );
    assert.equal(
      JSON.stringify(LEGACY_PRICING_TABLE_CATALOG).includes('v5'),
      false,
    );
  });
});
