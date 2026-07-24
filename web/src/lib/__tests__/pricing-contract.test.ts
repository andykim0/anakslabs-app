import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import { PublishPrice } from '@/components/marketing/PublishPrice';
import {
  CREDIT_CONSUMING_ACTIONS,
  INCLUDED_ZERO_COST_ASSET_COPY,
  PRICING,
  PUBLISH_PAYMENT_COPY,
  SUBSCRIPTION_BENEFIT_COPY,
  SUBSCRIPTION_VALUE_COPY,
} from '@/lib/pricing';
import { CREDIT_CONTRACT_COPY } from '@/lib/credits/contract-copy';
import { CREDIT_COSTS } from '@/lib/credits/constants';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

function sourceFiles(path: string): string[] {
  const absolute = join(process.cwd(), path);
  if (!statSync(absolute).isDirectory()) return [path];
  return readdirSync(absolute).flatMap((entry) => sourceFiles(join(path, entry)));
}

describe('P$ — 가격·크레딧 단일 계약', () => {
  test('출시 확정 금액과 직접 수정 무료 계약은 각각의 단일 소스에 있다', () => {
    assert.equal(PRICING.modelVersion, 'retainer-two-tier-v4-2026-07');
    assert.deepEqual(PRICING.build, { amountKrw: 0, paymentTiming: 'publish' });
    assert.equal(PRICING.siteCount, 1);
    assert.equal(PRICING.videoHeroAddon, 200_000);
    assert.equal(PRICING.subscription.amountKrw, 150_000);
    assert.equal(PRICING.subscription.periodMonths, 1);
    assert.equal(PRICING.subscription.billingInterval, 'month');
    assert.equal(PRICING.subscription.automaticRenewal, true);
    assert.equal(PRICING.subscription.creditsPerMonth, 2);
    assert.deepEqual(PRICING.subscription.annualCommitment, {
      status: 'available',
      amountKrw: 1_500_000,
      periodMonths: 12,
      freeMonths: 2,
      billingInterval: 'year',
      automaticRenewal: true,
    });
    assert.deepEqual(Object.keys(PRICING.tiers), ['standard', 'premium']);
    assert.equal(PRICING.tiers.premium.availability, 'contact');
    assert.equal(PRICING.selfEdit, 'unlimited-free');
  });

  test('크레딧 사용처는 확정된 네 항목뿐이고 직접 수정은 포함하지 않는다', () => {
    assert.deepEqual([...CREDIT_CONSUMING_ACTIONS], [
      'ai-image-generate',
      'ai-video-regenerate',
      'ai-section-redesign',
      'daboim-edit-service',
    ]);
    assert.equal(CREDIT_CONSUMING_ACTIONS.some((action) => /self|manual|direct/.test(action)), false);
    assert.match(CREDIT_CONTRACT_COPY, /직접 수정은 횟수 제한 없이 무료/);
    assert.match(CREDIT_CONTRACT_COPY, new RegExp(`문구 재생성 ${CREDIT_COSTS.text}크레딧`));
    assert.ok(CREDIT_CONTRACT_COPY.includes(INCLUDED_ZERO_COST_ASSET_COPY));
  });

  test('FAQ와 가격 페이지는 동일한 크레딧 카피·사용처 레지스트리를 소비한다', () => {
    const faq = read('src/app/(marketing)/faq/page.tsx');
    const pricing = read('src/app/(marketing)/pricing/page.tsx');
    assert.match(faq, /a: CREDIT_CONTRACT_COPY/);
    assert.match(pricing, /a: CREDIT_CONTRACT_COPY/);
    assert.match(pricing, /CREDIT_CONSUMING_ACTIONS\.map/);
    assert.doesNotMatch(`${faq}\n${pricing}`, /CREDIT_COSTS/);
  });

  test('구독 혜택과 가치 카피는 pricing.ts 단일 소스를 모든 고객 화면이 소비한다', () => {
    assert.deepEqual(SUBSCRIPTION_BENEFIT_COPY, {
      report: '매월 성과 리포트',
      credits: `매월 ${PRICING.subscription.creditsPerMonth}크레딧`,
      operations: '호스팅·SSL·백업·운영',
      visibility: '검색·AI 노출 최적화',
      conversion: '전환 리포팅',
      selfEdit: '직접 수정 무제한 무료',
    });
    assert.match(SUBSCRIPTION_VALUE_COPY, /프리미엄 작업에만 사용/);
    assert.match(SUBSCRIPTION_VALUE_COPY, new RegExp(`${PRICING.subscription.creditsPerMonth}개`));

    for (const path of [
      'src/app/(marketing)/page.tsx',
      'src/app/(marketing)/pricing/page.tsx',
      'src/app/(marketing)/faq/page.tsx',
      'src/components/dashboard/billing-view.tsx',
      'src/components/dashboard/settings-view.tsx',
    ]) {
      const source = read(path);
      assert.match(source, /SUBSCRIPTION_BENEFIT_COPY/);
      assert.match(source, /SUBSCRIPTION_VALUE_COPY/);
    }
  });

  test('발행 가격은 월 리테이너와 확정 연납 보조 옵션만 렌더하고 희소성·취소선이 없다', () => {
    const markup = renderToStaticMarkup(createElement(PublishPrice));
    assert.ok(markup.includes(PUBLISH_PAYMENT_COPY.monthlyRetainer));
    assert.ok(markup.includes(PUBLISH_PAYMENT_COPY.term));
    assert.ok(markup.includes(PUBLISH_PAYMENT_COPY.renewal));
    assert.ok(markup.includes(PUBLISH_PAYMENT_COPY.annualOption));
    assert.doesNotMatch(markup, /<del|data-launch|선착순|한정/u);
  });
});

describe('P$ — 표시 금액 하드코딩 방지', () => {
  test('마케팅·온보딩·고객 UI에 네 제품 금액 리터럴이나 레거시 가격 소스가 없다', () => {
    const roots = [
      'src/app/(auth)',
      'src/app/(marketing)',
      'src/components/dashboard',
      'src/components/editor',
      'src/components/marketing',
      'src/lib/publish/human-checks.ts',
    ];
    const files = roots
      .flatMap(sourceFiles)
      .filter((path) => /\.tsx?$/.test(path) && !path.includes('/__tests__/'));
    const forbiddenAmounts =
      /(?:590_?000|390_?000|200_?000|150_?000|29_?900|19_?900|590,000|390,000|200,000|150,000|29,900|19,900|59만원|39만원|20만원|15만원)/;

    for (const file of files) {
      const source = read(file);
      assert.doesNotMatch(source, forbiddenAmounts, `${file}: 제품 금액은 PRICING에서 파생해야 합니다.`);
      assert.doesNotMatch(
        source,
        /PRICE_RANGES|VIDEO_ADDON_PRICE_KRW/,
        `${file}: 레거시 표시 가격 소스를 사용하면 안 됩니다.`,
      );
    }
  });
});
