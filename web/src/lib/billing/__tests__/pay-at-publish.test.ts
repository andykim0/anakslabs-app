import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import type { SurveyInput } from '@/lib/types/domain';
import {
  mockPublishPaymentKey,
  needsPublishPayment,
  publishPaymentQuote,
  quoteMatchesSite,
} from '@/lib/billing/publish-payment';
import {
  buildZeroCostCandidates,
  PREPUBLISH_GENERATION_POLICY,
} from '@/lib/billing/prepublish-cost-policy';
import { PRICING, PRICING_MODEL_VERSION } from '@/lib/pricing';

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');

function survey(): SurveyInput {
  return {
    businessName: '한결 산업',
    purposeId: 'company_brand',
    purpose: '회사 소개',
    industry: 'B2B 제조업',
    tone: ['신뢰감 있는'],
    colorPreference: '네이비',
    referenceImageUrls: [],
    sectionPlan: [
      { type: 'hero', name: '첫 화면', brief: '', required: true, source: 'template' },
      { type: 'about', name: '회사 소개', brief: '', required: true, source: 'template' },
      { type: 'features', name: '사업 분야', brief: '', required: true, source: 'template' },
    ],
    templateId: 'company_brand.default',
    imageDirectionId: 'abstract_editorial',
  } as SurveyInput;
}

describe('PRICE P2 publish payment contract', () => {
  test('first publish requires payment, active subscription and republish do not', () => {
    assert.equal(needsPublishPayment({ publishedAt: null }, false), true);
    assert.equal(needsPublishPayment({ publishedAt: null }, true), false);
    assert.equal(needsPublishPayment({ publishedAt: '2026-07-24T00:00:00.000Z' }, false), false);
  });

  test('server quote is deterministic and bound to client, site and current price', () => {
    const input = { clientId: 'client-a', siteId: 'site-a', mock: true };
    const first = publishPaymentQuote(input);
    const second = publishPaymentQuote(input);
    assert.deepEqual(first, second);
    assert.equal(first.amount, PRICING.subscription.amountUsd);
    assert.equal(first.setupAmount, PRICING.build.setupUsd);
    assert.equal(first.currency, 'USD');
    assert.equal(first.periodMonths, 1);
    assert.equal(first.billingInterval, 'month');
    assert.equal(first.pricingModelVersion, PRICING_MODEL_VERSION);
    assert.equal(quoteMatchesSite(first.quoteId, input), true);
    assert.equal(quoteMatchesSite(first.quoteId, { ...input, siteId: 'site-b' }), false);
    assert.match(mockPublishPaymentKey(input.siteId), new RegExp(PRICING_MODEL_VERSION));
  });

  test('publish audits precede 402 and mock payment is the only enabled checkout', () => {
    const publish = read('src/app/api/sites/[siteId]/publish/route.ts');
    const audit = publish.indexOf('const preflight = checkPublish');
    const subscription = publish.indexOf('resolveSiteSubscription(client.id)');
    const persist = publish.indexOf('publishAuditedSnapshot(');
    assert.ok(audit >= 0 && audit < subscription && subscription < persist);
    assert.match(publish, /apiError\(\s*402,[\s\S]*PUBLISH_PAYMENT_ERROR_CODE/);

    const payment = read('src/app/api/sites/[siteId]/publish-payment/route.ts');
    assert.match(payment, /if \(!isMockMode\(\)\) \{[\s\S]*PUBLISH_PAYMENT_UNAVAILABLE/);
    assert.match(payment, /type: 'maintenance_subscription'/);
    assert.match(payment, /amount: paymentAmount/);
    assert.match(payment, /industryPublishPolicy\(site\)/);
    assert.ok(
      payment.indexOf('if (!isMockMode())') < payment.indexOf('payments.handleWebhook'),
      'real mode must fail before a payment mutation',
    );
  });

  test('standard candidates are deterministic system stages with no external generation', async () => {
    assert.equal(PREPUBLISH_GENERATION_POLICY.externalGenerationAllowed, false);
    const first = await buildZeroCostCandidates(survey());
    const second = await buildZeroCostCandidates(survey());
    assert.deepEqual(first, second);
    assert.equal(first.length, 3);
    assert.ok(first.every((candidate) => candidate.heroPresentation === 'system'));
    assert.ok(first.every((candidate) => candidate.heroAssetRef === undefined));
  });

  test('every pre-publish generation route consumes the zero-cost compiler', () => {
    const candidates = read('src/app/api/onboarding/candidates/route.ts');
    const generate = read('src/app/api/onboarding/generate/route.ts');
    const regenerate = read('src/app/api/onboarding/regenerate/route.ts');
    const menuOcr = read('src/app/api/onboarding/menu-ocr/route.ts');
    const suggest = read('src/app/api/onboarding/suggest-section/route.ts');

    assert.match(candidates, /buildZeroCostCandidates\(survey\)/);
    assert.doesNotMatch(candidates, /ai\.generateCandidates|generateGeminiImage|generateClaude/);
    for (const source of [generate, regenerate]) {
      assert.match(source, /buildZeroCostSiteConfig\(survey, candidate\)/);
      assert.doesNotMatch(source, /ai\.generateSiteConfig|generateGeminiImage|generateClaude/);
    }
    assert.match(menuOcr, /manualEntryRequired: true/);
    assert.doesNotMatch(menuOcr, /extractMenuFromImageUrl/);
    assert.match(suggest, /mapCustomSectionType/);
    assert.doesNotMatch(suggest, /\.ai\.suggestCustomSection/);
  });

  test('draft TTL is additive for new rows and cleared at publish', () => {
    const migration = read('../supabase/migrations/0043_pricing_v2.sql');
    assert.match(
      migration,
      /alter column draft_expires_at set default \(now\(\) \+ interval '30 days'\)/,
    );
    assert.match(migration, /Null preserves every pre-existing site/);
    assert.match(read('src/lib/data/supabase/services.ts'), /draft_expires_at: null/);
    assert.match(read('src/lib/data/mock/services.ts'), /site\.draftExpiresAt = null/);
  });

  test('build and publish conversion events use the append-only 0043 RPC', () => {
    const events = read('src/lib/economics/events.ts');
    const generate = read('src/app/api/onboarding/generate/route.ts');
    const payment = read('src/app/api/sites/[siteId]/publish-payment/route.ts');
    assert.match(events, /\.rpc\('record_build_economics_event'/);
    assert.match(events, /eventKind: 'build_completed'/);
    assert.match(generate, /recordBuildEvidence\(\{/);
    assert.match(payment, /eventKind: 'publish_payment'/);
    assert.match(payment, /currency: paymentCurrency/);
  });
});
