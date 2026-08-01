import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { interiorLandingExampleConfig } from '@/lib/marketing/interior-landing';
import {
  LEGACY_V4_SUBSCRIPTION_PRICE,
  PRICING_MODEL_VERSION,
  subscriptionPriceForProfile,
} from '@/lib/pricing';
import { publishPaymentQuote } from '@/lib/billing/publish-payment';

const read = (path: string): string =>
  readFileSync(join(process.cwd(), path), 'utf8');

describe('INDUSTRY M3 — 업종 랜딩·발행 결제 배선', () => {
  test('인테리어 랜딩 예시는 실제 무비용 생성기를 쓰고 가격을 SiteConfig에 전달하지 않는다', async () => {
    const config = await interiorLandingExampleConfig();
    const bytes = JSON.stringify(config);

    assert.equal(config.meta.industryId, 'interior');
    assert.ok(config.pages[0]?.sections.length >= 3);
    assert.doesNotMatch(bytes, /monthlyKrw|annualKrw|industryProfileId|pricingModelVersion/);

    const landing = read('src/app/(marketing)/interior/page.tsx');
    assert.match(landing, /interiorLandingExampleConfig\(\)/);
    assert.match(landing, /<SiteRenderer/);
    assert.match(landing, /예시 · 실제 고객이 아닙니다/);
    assert.match(landing, /PROFILE\.monthlyKrw/);
    assert.match(landing, /PROFILE\.setupPromotionalKrw/);
    assert.match(landing, /PROFILE\.setupListKrw/);
    assert.match(landing, /PROFILE\.promotionEndsOn/);
    assert.doesNotMatch(landing, /월\s*\d+건|순위.*보장|상위.*올려/);
  });

  test('/interior는 항상 공개되고 clinic은 단일 런타임 가용성 뒤에서만 탐색된다', () => {
    const sitemap = read('src/app/sitemap.ts');
    const layout = read('src/app/(marketing)/layout.tsx');
    const header = read('src/components/marketing/MarketingHeader.tsx');
    const footer = read('src/components/marketing/MarketingFooter.tsx');
    const clinic = read('src/app/(marketing)/clinic/page.tsx');

    for (const source of [sitemap, header, footer]) {
      assert.match(source, /\/interior/);
    }
    assert.match(sitemap, /clinicAvailability\(\)\.available/u);
    assert.match(layout, /clinicAvailability\(\)\.available/u);
    assert.match(clinic, /clinicAvailability\(\)\.available[\s\S]*notFound\(\)/u);
    assert.match(header, /clinicAvailable/u);
    assert.match(footer, /clinicAvailable/u);
  });

  test('402 견적과 결제 mutation은 사이트에 고정된 업종 가격 증거를 같은 값으로 소비한다', () => {
    const pricing = subscriptionPriceForProfile('interior');
    assert.ok(pricing);
    const quote = publishPaymentQuote({
      clientId: 'client-interior',
      siteId: 'site-interior',
      mock: true,
      pricing,
    });
    assert.deepEqual(
      {
        modelVersion: quote.pricingModelVersion,
        profile: quote.industryProfileId,
        amount: quote.amountKrw,
        months: quote.periodMonths,
        vatIncluded: quote.vatIncluded,
      },
      {
        modelVersion: PRICING_MODEL_VERSION,
        profile: 'interior',
        amount: 29_000,
        months: 1,
        vatIncluded: true,
      },
    );

    const route = read('src/app/api/sites/[siteId]/publish-payment/route.ts');
    const service = read('src/lib/data/supabase/services.ts');
    const migration = read('../supabase/migrations/0047_industry_pricing_contract.sql');
    assert.match(route, /industryPublishPolicy\(site\)/);
    assert.match(route, /siteId,[\s\S]*industryProfileId: pricing\.industryProfileId/);
    assert.match(service, /handle_industry_maintenance_payment/);
    assert.match(migration, /site industry contract mismatch/);
    assert.match(migration, /subscription industry contract mismatch/);
  });

  test('동결 v4 견적은 신규 프로파일 견적과 분리되어 기존 금액·VAT 해석을 유지한다', () => {
    const quote = publishPaymentQuote({
      clientId: 'legacy-client',
      siteId: 'legacy-site',
      mock: true,
      pricing: LEGACY_V4_SUBSCRIPTION_PRICE,
    });
    assert.equal(quote.pricingModelVersion, 'retainer-two-tier-v4-2026-07');
    assert.equal(quote.industryProfileId, undefined);
    assert.equal(quote.amountKrw, 150_000);
    assert.equal(quote.periodMonths, 1);
    assert.equal(quote.vatIncluded, false);
  });
});
