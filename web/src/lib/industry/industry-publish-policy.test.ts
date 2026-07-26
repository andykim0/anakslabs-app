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
  PRICING_MODEL_VERSION,
} from '@/lib/pricing';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('INDUSTRY M2 clinic 프로파일·게이트', () => {
  test('clinic 계약은 79만원·연 790만원·발행량 0·MedicalClinic으로 고정된다', () => {
    assert.deepEqual(INDUSTRY_PROFILES.clinic, {
      id: 'clinic',
      label: '의원·클리닉',
      availability: 'gated',
      monthlyKrw: 790_000,
      annualKrw: 7_900_000,
      postsPerMonth: 0,
      schemaType: 'MedicalClinic',
      requiredMedicalAdPolicyVersion: 'medical-ad-2026-07-v1',
      contentRules: [
        '현재 의료광고 정책 검사와 공개 활성화 게이트를 모두 통과해야 공개·발행·결제를 허용한다.',
      ],
      keywordSets: [
        { id: 'region', label: '지역', source: 'region' },
        { id: 'medical-specialty', label: '진료과목', source: 'business_fact' },
      ],
      included: INDUSTRY_PROFILES.clinic.included,
    });
  });

  test('clinic은 gated, 현재 미등록 업종은 unavailable, 레거시는 보존된다', () => {
    const clinic = industryPublishPolicy({
      industryProfileId: 'clinic',
      pricingModelVersion: PRICING_MODEL_VERSION,
    });
    assert.equal(clinic.status, 'gated');
    if (clinic.status === 'gated') assert.equal(clinic.code, INDUSTRY_PROFILE_GATED);

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
