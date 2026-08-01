import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  INDUSTRY_PROFILE_GATED,
  INDUSTRY_PROFILE_NOT_AVAILABLE,
  industryPublishPolicy,
} from './publish-policy';
import {
  INDUSTRY_PROFILES,
  PREVIOUS_PRICING_MODEL_VERSION,
  PRICING_MODEL_VERSION,
} from '@/lib/pricing';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('PRICE-V6 clinic 과거 계약·게이트', () => {
  test('현재 신규 가격표에서 clinic 판매 프로필은 제거된다', () => {
    assert.equal('clinic' in INDUSTRY_PROFILES, false);
  });

  test('현재 clinic은 unavailable, 과거 clinic 계약은 gated, 레거시는 보존된다', () => {
    const clinic = industryPublishPolicy({
      industryProfileId: 'clinic',
      pricingModelVersion: PRICING_MODEL_VERSION,
    });
    assert.equal(clinic.status, 'unavailable');
    const previousClinic = industryPublishPolicy({
      industryProfileId: 'clinic',
      pricingModelVersion: PREVIOUS_PRICING_MODEL_VERSION,
    });
    assert.equal(previousClinic.status, 'gated');
    if (previousClinic.status === 'gated') assert.equal(previousClinic.code, INDUSTRY_PROFILE_GATED);

    const unavailable = industryPublishPolicy({
      industryProfileId: null,
      pricingModelVersion: PRICING_MODEL_VERSION,
    });
    assert.equal(unavailable.status, 'unavailable');
    if (unavailable.status === 'unavailable') {
      assert.equal(unavailable.code, INDUSTRY_PROFILE_NOT_AVAILABLE);
    }
    assert.equal(industryPublishPolicy({
      industryProfileId: null,
      pricingModelVersion: null,
    }).status, 'legacy');
  });

  test('발행과 결제는 같은 정책 함수를 402·webhook보다 먼저 소비한다', () => {
    const publish = source('src/app/api/sites/[siteId]/publish/route.ts');
    const payment = source('src/app/api/sites/[siteId]/publish-payment/route.ts');
    for (const route of [publish, payment]) {
      const policy = route.indexOf('industryPublishPolicy(site)');
      assert.ok(policy >= 0);
      assert.ok(policy < route.indexOf('needsPublishPayment(', policy));
    }
    assert.ok(publish.indexOf('industryPublishPolicy(site)') < publish.indexOf('publishPaymentQuote({'));
    assert.ok(payment.indexOf('industryPublishPolicy(site)') < payment.indexOf('getDataServices().payments.handleWebhook'));
  });

  test('/clinic 공개 페이지·sitemap·마케팅 내비 링크는 같은 가용성 함수 뒤에 있다', () => {
    const page = source('src/app/(marketing)/clinic/page.tsx');
    const sitemap = source('src/app/sitemap.ts');
    const layout = source('src/app/(marketing)/layout.tsx');
    const header = source('src/components/marketing/MarketingHeader.tsx');
    const footer = source('src/components/marketing/MarketingFooter.tsx');
    assert.match(page, /clinicAvailability\(\)\.available[\s\S]*notFound\(\)/u);
    assert.match(sitemap, /clinicAvailability\(\)\.available[\s\S]*['"]\/clinic['"]/u);
    assert.match(layout, /clinicAvailability\(\)\.available/u);
    assert.match(header, /clinicAvailable[\s\S]*href: ['"]\/clinic['"]/u);
    assert.match(footer, /clinicAvailable[\s\S]*href: ['"]\/clinic['"]/u);
  });
});
