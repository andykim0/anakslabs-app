import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import PricingPage from '@/app/(marketing)/pricing/page';
import { publishPaymentQuote } from '@/lib/billing/publish-payment';
import {
  CURRENT_PRICING_TABLE,
  PRICING,
  PRICING_MODEL_VERSION,
  PUBLISH_PAYMENT_COPY,
  RETAINER_COMPLEMENT_COPY,
  RETAINER_SCOPE_COPY,
} from '@/lib/pricing';

const pricingHtml = renderToStaticMarkup(createElement(PricingPage));

describe('PRICE R1 delta — 2티어·연납·성과 범위', () => {
  test('가격표 버전 하나가 스탠다드 공개가와 프리미엄 문의 범위를 함께 소유한다', () => {
    assert.equal(CURRENT_PRICING_TABLE.modelVersion, PRICING_MODEL_VERSION);
    assert.deepEqual(Object.keys(CURRENT_PRICING_TABLE.tiers), ['standard', 'premium']);
    assert.deepEqual(CURRENT_PRICING_TABLE.tiers.standard.monthlyPrice, {
      modelVersion: PRICING_MODEL_VERSION,
      amountKrw: 150_000,
      periodMonths: 1,
      billingInterval: 'month',
      automaticRenewal: true,
    });
    assert.deepEqual(CURRENT_PRICING_TABLE.tiers.premium.monthlyPrice, {
      modelVersion: PRICING_MODEL_VERSION,
      amountKrw: null,
      inquiryRangeKrw: { min: 390_000, max: 490_000 },
      billingInterval: 'month',
    });
  });

  test('티어별 포함 매트릭스는 pricing.ts 데이터로 렌더되고 프리미엄 가격은 문의로 숨긴다', () => {
    assert.ok(
      PRICING.tiers.standard.included.every((item) => pricingHtml.includes(item.label)),
    );
    assert.ok(
      PRICING.tiers.premium.included.every((item) => pricingHtml.includes(item.label)),
    );
    assert.match(pricingHtml, /data-pricing-tier="standard"/);
    assert.match(pricingHtml, /data-pricing-tier="premium"/);
    assert.match(pricingHtml, />문의</);
    assert.doesNotMatch(pricingHtml, /390,000원|490,000원/);
  });

  test('스탠다드 연납은 2개월 무료·연 150만원 보조 옵션이고 402 기본 견적은 월 단위다', () => {
    assert.deepEqual(CURRENT_PRICING_TABLE.annualOptions.standard, {
      status: 'available',
      amountKrw: 1_500_000,
      periodMonths: 12,
      freeMonths: 2,
      billingInterval: 'year',
      automaticRenewal: true,
    });
    assert.ok(pricingHtml.includes(PUBLISH_PAYMENT_COPY.annualOption));

    const quote = publishPaymentQuote({
      clientId: 'client-tier',
      siteId: 'site-tier',
      mock: true,
    });
    assert.equal(quote.amountKrw, 150_000);
    assert.equal(quote.periodMonths, 1);
    assert.equal(quote.billingInterval, 'month');
  });

  test('스탠다드는 현재 이행 범위, 프리미엄은 Phase 2 구조만 정직하게 구분한다', () => {
    assert.deepEqual(
      PRICING.tiers.standard.included.map((item) => item.id),
      [
        'done-for-you-site',
        'conversion-tracking',
        'monthly-report',
        'basic-search-schema',
        'hosting-operations',
        'zero-cost-assets',
        'monthly-credits',
      ],
    );
    assert.deepEqual(
      PRICING.tiers.premium.included.map((item) => item.id),
      [
        'standard-scope',
        'advanced-aeo',
        'ongoing-aeo-content',
        'premium-credits',
        'expanded-edit-service',
      ],
    );
    assert.match(pricingHtml, /지속 AEO 콘텐츠 · Phase 2/);
  });

  test('순위 보장·블로그 대행 대체를 말하지 않고 전환·AI 검색 대비·품질 범위만 약속한다', () => {
    assert.ok(pricingHtml.includes(RETAINER_SCOPE_COPY));
    assert.ok(pricingHtml.includes(RETAINER_COMPLEMENT_COPY));
    assert.doesNotMatch(
      pricingHtml,
      /네이버.{0,16}(?:상위|1위)|(?:상위|1위).{0,16}(?:노출|올려)|반드시.{0,12}노출|블로그.{0,16}(?:대체|필요 없)|대행.{0,16}대체/u,
    );
  });
});
