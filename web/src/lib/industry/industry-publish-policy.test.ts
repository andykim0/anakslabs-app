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

describe('Anaks Labs clinic enterprise publish policy', () => {
  test('the current pricing table contains only the clinic enterprise profile', () => {
    assert.deepEqual(Object.keys(INDUSTRY_PROFILES), ['clinic']);
  });

  test('current and previous clinic contracts remain medical-policy gated while pre-profile rows stay legacy', () => {
    const clinic = industryPublishPolicy({
      industryProfileId: 'clinic',
      pricingModelVersion: PRICING_MODEL_VERSION,
    });
    assert.equal(clinic.status, 'gated');
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
    assert.ok(payment.indexOf('industryPublishPolicy(site)') < payment.indexOf('services.payments.handleWebhook'));
  });

  test('/clinic is the permanent public product surface while publishing remains separately gated', () => {
    const page = source('src/app/(marketing)/clinic/page.tsx');
    const sitemap = source('src/app/sitemap.ts');
    const header = source('src/components/marketing/MarketingHeader.tsx');
    const footer = source('src/components/marketing/MarketingFooter.tsx');
    assert.match(page, /Clinic website delivery/u);
    assert.match(sitemap, /['"]\/clinic['"]/u);
    assert.match(header, /href: ['"]\/clinic['"]/u);
    assert.match(footer, /href: ['"]\/clinic['"]/u);
  });
});
