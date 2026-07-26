import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import {
  mockPublishPaymentKey,
  publishPaymentQuote,
} from '@/lib/billing/publish-payment';
import {
  industryPublishPolicy,
} from '@/lib/industry/publish-policy';
import {
  INDUSTRY_PROFILES,
  LEGACY_PRICING_MODEL_VERSION,
  LEGACY_V4_SUBSCRIPTION_PRICE,
  PRICING_MODEL_VERSION,
} from '@/lib/pricing';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');

function legacyPublishedConfig(): SiteConfig {
  const config = emptySiteConfig('기존 일러스트');
  config.pages[0].sections = [{
    id: 'hero',
    type: 'hero',
    name: '첫 화면',
    height: 820,
    background: {
      image: {
        src: '/legacy-illustration.webp',
        overlayColor: '#111111',
        overlayOpacity: 0.4,
      },
    },
    elements: [{
      id: 'title',
      kind: 'text',
      frame: { x: 116, y: 260, w: 720, h: 180 },
      z: 3,
      text: '기존 일러스트 발행본',
      style: {
        fontSize: 68,
        fontFamily: 'heading',
        color: '#ffffff',
      },
    }],
  }];
  return config;
}

function publishedSha(config: SiteConfig): string {
  const html = renderToStaticMarkup(createElement(SiteRenderer, {
    config,
    mode: 'auto',
    interactive: false,
    animate: false,
  }));
  return createHash('sha256').update(html).digest('hex');
}

describe('INDUSTRY M4 — 업종 단일가·게이트 통합 회귀', () => {
  test('인테리어 현재 견적은 월 49만원·1개월·VAT 포함·사이트 1개다', () => {
    const policy = industryPublishPolicy({
      industryProfileId: 'interior',
      pricingModelVersion: PRICING_MODEL_VERSION,
    });
    assert.equal(policy.status, 'available');
    if (policy.status !== 'available') return;

    const quote = publishPaymentQuote({
      clientId: 'industry-client',
      siteId: 'industry-site',
      mock: true,
      pricing: policy.pricing,
    });
    assert.deepEqual(quote, {
      quoteId: quote.quoteId,
      pricingModelVersion: PRICING_MODEL_VERSION,
      industryProfileId: 'interior',
      amountKrw: 490_000,
      periodMonths: 1,
      billingInterval: 'month',
      automaticRenewal: true,
      siteCount: 1,
      vatIncluded: true,
      checkoutMode: 'mock',
    });
    assert.equal(quote.quoteId.length, 32);
    assert.equal(INDUSTRY_PROFILES.interior.annualKrw, 4_900_000);
    assert.equal(INDUSTRY_PROFILES.interior.postsPerMonth, 0);
  });

  test('mock 402 결제는 사이트 고정 계약으로 한 번만 갱신하고 증거를 보존한다', async () => {
    // Mock data services include server-only export helpers. The production
    // Next boundary supplies this marker; the Node test installs its no-op
    // condition before importing that server graph.
    const require = createRequire(import.meta.url);
    const serverOnlyPath = require.resolve('server-only');
    require.cache[serverOnlyPath] = {
      id: serverOnlyPath,
      filename: serverOnlyPath,
      loaded: true,
      exports: {},
      children: [],
      paths: [],
    } as unknown as NodeJS.Module;
    const [{ createMockServices }, { resetMockStore }, { getMockSiteSubscription }] =
      await Promise.all([
        import('@/lib/data/mock/services'),
        import('@/lib/data/mock/store'),
        import('@/lib/subscriptions/mock'),
      ]);
    resetMockStore();
    const services = createMockServices();
    const client = await services.clients.upsertFromAuth({
      id: 'industry-m4-client',
      name: '인테리어 계약 고객',
      email: 'industry-m4@example.test',
      authProvider: 'google',
    });
    const site = await services.sites.create({
      clientId: client.id,
      name: '업종 단일가 계약 사이트',
      draftConfig: emptySiteConfig('업종 단일가 계약 사이트'),
      industryProfileId: 'interior',
      pricingModelVersion: PRICING_MODEL_VERSION,
    });
    const policy = industryPublishPolicy(site);
    assert.equal(policy.status, 'available');
    if (policy.status !== 'available') return;

    const quote = publishPaymentQuote({
      clientId: client.id,
      siteId: site.id,
      mock: true,
      pricing: policy.pricing,
    });
    const providerPaymentKey = mockPublishPaymentKey(site.id, policy.pricing);
    const payload = {
      providerPaymentKey,
      clientId: client.id,
      type: 'maintenance_subscription' as const,
      amount: quote.amountKrw,
      pricingModelVersion: quote.pricingModelVersion,
      periodMonths: quote.periodMonths,
      siteId: site.id,
      industryProfileId: 'interior' as const,
    };
    assert.deepEqual(await services.payments.handleWebhook(payload), {
      processed: true,
      duplicated: false,
    });
    assert.deepEqual(await services.payments.handleWebhook(payload), {
      processed: false,
      duplicated: true,
    });

    const subscription = getMockSiteSubscription(client.id);
    assert.equal(subscription?.status, 'active');
    assert.equal(subscription?.siteId, site.id);
    assert.equal(subscription?.industryProfileId, 'interior');
    assert.equal(subscription?.pricingModelVersion, PRICING_MODEL_VERSION);
    assert.equal(
      [...(await services.payments.listByClient(client.id))]
        .filter((payment) => payment.providerPaymentKey === providerPaymentKey)
        .length,
      1,
    );
    resetMockStore();
  });

  test('clinic은 공개·탐색·발행·결제 여섯 경계에서 닫힌다', () => {
    const clinic = industryPublishPolicy({
      industryProfileId: 'clinic',
      pricingModelVersion: PRICING_MODEL_VERSION,
    });
    assert.equal(INDUSTRY_PROFILES.clinic.availability, 'gated');
    assert.equal(clinic.status, 'gated');
    assert.equal(existsSync(join(process.cwd(), 'src/app/(marketing)/clinic/page.tsx')), false);

    const sitemap = read('src/app/sitemap.ts');
    const header = read('src/components/marketing/MarketingHeader.tsx');
    const footer = read('src/components/marketing/MarketingFooter.tsx');
    const publish = read('src/app/api/sites/[siteId]/publish/route.ts');
    const payment = read('src/app/api/sites/[siteId]/publish-payment/route.ts');
    assert.doesNotMatch(`${sitemap}\n${header}\n${footer}`, /href:\s*['"]\/clinic['"]|['"]\/clinic['"]/u);
    assert.ok(
      publish.indexOf('industryPublishPolicy(site)')
        < publish.indexOf('publishPaymentQuote({'),
    );
    assert.ok(
      payment.indexOf('industryPublishPolicy(site)')
        < payment.indexOf('getDataServices().payments.handleWebhook'),
    );
  });

  test('미등록 신규 업종은 fail-closed이고 동결 v4만 과거 금액으로 해석한다', () => {
    assert.equal(industryPublishPolicy({
      industryProfileId: null,
      pricingModelVersion: PRICING_MODEL_VERSION,
    }).status, 'unavailable');
    const legacy = industryPublishPolicy({
      industryProfileId: null,
      pricingModelVersion: LEGACY_PRICING_MODEL_VERSION,
    });
    assert.equal(legacy.status, 'legacy');
    if (legacy.status !== 'legacy') return;
    assert.deepEqual(legacy.pricing, LEGACY_V4_SUBSCRIPTION_PRICE);
    assert.equal(legacy.pricing.amountKrw, 150_000);
    assert.equal(legacy.pricing.vatIncluded, false);
  });

  test('활성 가격·UI·신규 견적 경로에는 tier 분기와 머지되지 않은 v5가 없다', () => {
    const activeSources = [
      read('src/lib/pricing.ts').split('export const LEGACY_PRICING_TABLE_CATALOG')[0],
      read('src/app/(marketing)/pricing/page.tsx'),
      read('src/app/(marketing)/interior/page.tsx'),
      read('src/app/api/sites/[siteId]/publish/route.ts'),
      read('src/app/api/sites/[siteId]/publish-payment/route.ts'),
      read('src/lib/industry/publish-policy.ts'),
    ].join('\n');
    assert.doesNotMatch(activeSources, /PRICING\.tiers|data-pricing-tier|\.tiers\.(standard|premium)/u);
    assert.doesNotMatch(read('src/lib/pricing.ts'), /retainer-two-tier-v5|industry-single-v5/u);
  });

  test('인테리어 랜딩은 가격 단일 소스·무발행량 약속·정직 카피를 지킨다', () => {
    const page = read('src/app/(marketing)/interior/page.tsx');
    const example = read('src/lib/marketing/interior-landing.ts');
    assert.match(page, /INDUSTRY_PROFILES\.interior/u);
    assert.match(page, /formatKrw\(PROFILE\.monthlyKrw\)/u);
    assert.match(page, /formatKrw\(PROFILE\.annualKrw\)/u);
    assert.match(page, /AI로 원가를 줄이고/u);
    assert.match(page, /품질은 직접 검수합니다/u);
    assert.match(page, /실제 고객이나 프로젝트가 아닙니다/u);
    assert.doesNotMatch(`${page}\n${example}`, /월\s*\d+\s*건|콘텐츠\s*\d+\s*건/u);
    assert.doesNotMatch(`${page}\n${example}`, /상위.*올려|순위.*보장합니다|무료 제작/u);
  });

  test('가격 계약 확장은 기존 무필드 발행 HTML의 바이트를 바꾸지 않는다', () => {
    assert.equal(
      publishedSha(legacyPublishedConfig()),
      '5a9d42c139a341d47759883d4860a99d41162a454a5382bcebc3416e648077e7',
    );
  });
});
