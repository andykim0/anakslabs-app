import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import MarketingHome from '@/app/(marketing)/page';
import FeaturesPage from '@/app/(marketing)/features/page';
import PricingPage from '@/app/(marketing)/pricing/page';
import { GuaranteeBadge } from '@/components/marketing/GuaranteeBadge';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import {
  buildZeroCostCandidates,
  PREPUBLISH_GENERATION_POLICY,
} from '@/lib/billing/prepublish-cost-policy';
import {
  needsPublishPayment,
  publishPaymentQuote,
} from '@/lib/billing/publish-payment';
import { guaranteeProgramEnabled } from '@/lib/guarantee/flags';
import {
  INCLUDED_ZERO_COST_ASSET_COPY,
  PRICING,
  PRICING_MODEL_VERSION,
  PUBLISH_PAYMENT_COPY,
} from '@/lib/pricing';
import type { SurveyInput } from '@/lib/types/domain';

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');

const MARKETING_OUTPUT = [
  renderToStaticMarkup(createElement(MarketingHome)),
  renderToStaticMarkup(createElement(FeaturesPage)),
  renderToStaticMarkup(createElement(PricingPage)),
  renderToStaticMarkup(createElement(MarketingFooter)),
].join('\n');

function companySurvey(): SurveyInput {
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

describe('PRICE P4 — 모델 개정 통합 회귀', () => {
  test('고객 화면은 연 39만원·12개월·자동 갱신·사이트 1개 단일 계약만 표시한다', () => {
    assert.equal(PRICING.subscription.annual, 390_000);
    assert.equal(PRICING.subscription.periodMonths, 12);
    assert.equal(PRICING.subscription.automaticRenewal, true);
    assert.equal(PRICING.siteCount, 1);
    assert.ok(MARKETING_OUTPUT.includes(PUBLISH_PAYMENT_COPY.firstYear));
    assert.ok(MARKETING_OUTPUT.includes(PUBLISH_PAYMENT_COPY.term));
    assert.ok(MARKETING_OUTPUT.includes(PUBLISH_PAYMENT_COPY.renewal));
    assert.match(MARKETING_OUTPUT, /모든 가격은 홈페이지 1개 기준/);
  });

  test('위험 제거 리드는 무료 제작·선착순·취소선·과거 월 가격 없이 렌더된다', () => {
    assert.equal(
      PUBLISH_PAYMENT_COPY.lead,
      '먼저 만들어 보여드립니다. 발행할 때만 결제하세요.',
    );
    assert.doesNotMatch(
      MARKETING_OUTPUT,
      /무료 제작|선착순|한정 수량|<del|data-launch|29,900|590,000|59만원/u,
    );
  });

  test('성과 보장은 기본 OFF이며 명시적 1에서만 링크·배지를 열 수 있다', () => {
    assert.equal(guaranteeProgramEnabled({}), false);
    assert.equal(guaranteeProgramEnabled({ GUARANTEE_PROGRAM_ENABLED: 'true' }), false);
    assert.equal(guaranteeProgramEnabled({ GUARANTEE_PROGRAM_ENABLED: '1' }), true);
    assert.equal(renderToStaticMarkup(createElement(GuaranteeBadge)), '');
    assert.doesNotMatch(MARKETING_OUTPUT, /href="\/guarantee"|90일 성과 보장/u);

    const guaranteePage = read('src/app/(marketing)/guarantee/page.tsx');
    assert.match(guaranteePage, /if \(!guaranteeProgramEnabled\(\)\) notFound\(\)/);
  });

  test('결제 전 표준 company_brand 빌드는 외부 생성 없이 결정적 시스템 무대만 만든다', async () => {
    assert.deepEqual(PREPUBLISH_GENERATION_POLICY, {
      id: 'standard-zero-variable-cost',
      externalGenerationAllowed: false,
      premiumAssetsAllowed: false,
    });
    const first = await buildZeroCostCandidates(companySurvey());
    const second = await buildZeroCostCandidates(companySurvey());
    assert.deepEqual(first, second);
    assert.equal(first.length, 3);
    assert.ok(first.every((candidate) => candidate.heroPresentation === 'system'));
    assert.ok(first.every((candidate) => candidate.heroAssetRef === undefined));
    assert.ok(MARKETING_OUTPUT.includes(INCLUDED_ZERO_COST_ASSET_COPY));
  });

  test('발행은 첫 회만 서버 견적을 요구하고 활성 구독·재발행은 다시 청구하지 않는다', () => {
    const quote = publishPaymentQuote({
      clientId: 'client-company',
      siteId: 'site-company',
      mock: true,
    });
    assert.deepEqual(quote, {
      quoteId: quote.quoteId,
      pricingModelVersion: PRICING_MODEL_VERSION,
      amountKrw: PRICING.subscription.annual,
      periodMonths: 12,
      automaticRenewal: true,
      siteCount: 1,
      vatIncluded: false,
      checkoutMode: 'mock',
    });
    assert.equal(needsPublishPayment({ publishedAt: null }, false), true);
    assert.equal(needsPublishPayment({ publishedAt: null }, true), false);
    assert.equal(needsPublishPayment({ publishedAt: '2026-07-24T00:00:00.000Z' }, false), false);
  });

  test('발행 검사가 결제 402보다 먼저이고 real 결제는 변경 전에 fail-closed한다', () => {
    const publish = read('src/app/api/sites/[siteId]/publish/route.ts');
    const payment = read('src/app/api/sites/[siteId]/publish-payment/route.ts');
    const auditIndex = publish.indexOf('const preflight = checkPublish');
    const subscriptionIndex = publish.indexOf('resolveSiteSubscription(client.id)');
    const persistIndex = publish.indexOf('publishAuditedSnapshot(');
    assert.ok(auditIndex >= 0 && auditIndex < subscriptionIndex && subscriptionIndex < persistIndex);
    assert.match(publish, /402,[\s\S]*PUBLISH_PAYMENT_ERROR_CODE/);
    assert.ok(
      payment.indexOf('if (!isMockMode())') < payment.indexOf('payments.handleWebhook'),
      'real checkout must fail before any payment mutation',
    );
    assert.match(payment, /type: 'maintenance_subscription'/);
    assert.match(payment, /amount: PRICING\.subscription\.annual/);
  });

  test('0043은 과거 장부를 보존하면서 신규 build_fee만 막고 월 2크레딧을 정확히 한 번 지급한다', () => {
    const migration = read('../supabase/migrations/0043_pricing_v2.sql');
    assert.match(migration, /'build_fee', 'maintenance_subscription', 'premium_addon', 'credit_pack'/);
    assert.match(migration, /New maintenance receipts use the annual contract/);
    assert.match(migration, /retired build products cannot be recorded/);

    const annualHandler = migration.match(
      /create or replace function public\.handle_maintenance_payment\([\s\S]*?\n\$\$;/,
    )?.[0];
    assert.ok(annualHandler);
    assert.equal(
      annualHandler.match(/grant_subscription_month_credits/g)?.length,
      1,
      'annual checkout must grant the monthly credit lot exactly once',
    );
    assert.match(annualHandler, /'payment_webhook',\s*12,/);
    assert.match(annualHandler, /credits_granted', case when v_granted then 2 else 0 end/);
  });

  test('30일 soft-expire와 비용 이벤트 원장은 신규·서버 소유·append-only다', () => {
    const migration = read('../supabase/migrations/0043_pricing_v2.sql');
    const events = read('src/lib/economics/events.ts');
    assert.match(migration, /add column draft_expires_at timestamptz/);
    assert.match(migration, /Null preserves every pre-existing site/);
    assert.match(
      migration,
      /alter column draft_expires_at set default \(now\(\) \+ interval '30 days'\)/,
    );
    assert.match(migration, /draft expiry is server-owned/);
    assert.match(migration, /idempotency_key\s+text not null unique/);
    assert.match(migration, /revoke all on table public\.build_economics_events/);
    assert.doesNotMatch(migration, /grant (?:insert|update|delete) on table public\.build_economics_events/i);
    assert.match(events, /eventKind: 'build_completed'/);
    assert.match(events, /eventKind === 'external_call'/);
    assert.match(events, /\.rpc\('record_build_economics_event'/);
  });

  test('가격·보장 법률 메모는 미확정 항목을 마케팅 약속으로 앞당기지 않는다', () => {
    const terms = read('../docs/legal/terms-draft.md');
    const notices = read('src/lib/legal/notices.ts');
    const kmong = read('docs/kmong-product-copy.md');
    assert.match(terms, /성과 보장 프로그램.*잠정 제외/);
    assert.match(terms, /부가세 별도[\s\S]{0,100}검토/);
    assert.match(terms, /자동 갱신.*법률 검토/);
    assert.match(terms, /신규 계약에는 초기 지급 크레딧이 없으며/);
    assert.match(terms, /과거 계약의 초기 지급 크레딧은 기존 만료 조건을 유지/);
    assert.match(notices, /실제 결제 기능을 열기 전 법률 검토/);
    assert.match(kmong, /발행할 때만 결제/);
    assert.match(kmong, /잠정 제외/);
  });
});
