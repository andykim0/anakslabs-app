import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, test } from 'node:test';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import AboutPage from '@/app/(marketing)/about/page';
import CasesPage from '@/app/(marketing)/cases/page';
import FaqPage from '@/app/(marketing)/faq/page';
import FeaturesPage from '@/app/(marketing)/features/page';
import MarketingHome, { metadata as homeMetadata } from '@/app/(marketing)/page';
import PricingPage from '@/app/(marketing)/pricing/page';
import PrivacyPage from '@/app/(marketing)/privacy/page';
import TermsPage from '@/app/(marketing)/terms/page';
import SiteNotFound from '@/app/s/[domain]/not-found';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { SuspendedNotice } from '@/components/site-renderer/SuspendedNotice';
import { HWARODAM_SITE_CONFIG } from '@/lib/data/mock/hwarodam';
import { buildMonthlyReportEmail } from '@/lib/reporting/email';
import { buildMonthlyPerformanceReport } from '@/lib/reporting/monthly-report';
import { previousMonthRangesKst } from '@/lib/reporting/period';
import { normalizeSiteConfig, type SiteConfig } from '@/lib/types/site';
import { PUBLIC_BRAND_NAMES } from '../public-names';

const MARKETING_PAGES = [
  ['home', MarketingHome],
  ['pricing', PricingPage],
  ['faq', FaqPage],
  ['features', FeaturesPage],
  ['about', AboutPage],
  ['cases', CasesPage],
  ['privacy', PrivacyPage],
  ['terms', TermsPage],
] as const satisfies readonly (readonly [string, ComponentType])[];

const ENGLISH_BRAND = /\b(?:Daboim(?:\s+AI)?|DABOIM(?:\s+AI)?)\b/u;
const EXACT_BILINGUAL_TOKENS = [
  PUBLIC_BRAND_NAMES.brandBilingual,
  PUBLIC_BRAND_NAMES.aiBilingual,
] as const;
const BILINGUAL_MARKERS = {
  logo: PUBLIC_BRAND_NAMES.brandBilingual,
  'core-first': PUBLIC_BRAND_NAMES.aiBilingual,
  footer: PUBLIC_BRAND_NAMES.brandBilingual,
  legal: PUBLIC_BRAND_NAMES.brandBilingual,
  'hosted-footer': PUBLIC_BRAND_NAMES.brandBilingual,
} as const;

function stripExactBilingualTokens(value: string): string {
  return EXACT_BILINGUAL_TOKENS.reduce(
    (result, token) => result.split(token).join(''),
    value,
  );
}

function assertOnlyExactBilingualTokens(value: string, label: string): void {
  assert.doesNotMatch(
    stripExactBilingualTokens(value),
    ENGLISH_BRAND,
    `${label}: 영문 Daboim은 승인된 한글 우선 이중 표기 안에서만 허용됩니다.`,
  );
}

function assertRenderedBrandPolicy(html: string, label: string): void {
  const root = parse(html);
  for (const hiddenCode of root.querySelectorAll('script, style')) hiddenCode.remove();

  const marked = root.querySelectorAll('[data-brand-bilingual]');
  for (const element of marked) {
    const marker = element.getAttribute('data-brand-bilingual');
    assert.ok(
      marker && marker in BILINGUAL_MARKERS,
      `${label}: 승인되지 않은 이중 표기 위치 ${marker ?? '(없음)'}`,
    );
    const expected = BILINGUAL_MARKERS[marker as keyof typeof BILINGUAL_MARKERS];
    const exposed = [
      element.textContent,
      element.getAttribute('aria-label') ?? '',
      element.getAttribute('alt') ?? '',
      element.getAttribute('title') ?? '',
    ].join(' ');
    assert.match(exposed, new RegExp(expected.replace(/[()]/g, '\\$&'), 'u'));
    assertOnlyExactBilingualTokens(exposed, `${label}:${marker}`);
    element.remove();
  }

  assert.doesNotMatch(root.textContent, ENGLISH_BRAND, `${label}: 표시 텍스트에 영문 단독 브랜드가 있습니다.`);
  for (const element of root.querySelectorAll('*')) {
    for (const attribute of ['aria-label', 'alt', 'title', 'placeholder']) {
      const value = element.getAttribute(attribute);
      if (value) assert.doesNotMatch(value, ENGLISH_BRAND, `${label}:${attribute}에 영문 단독 브랜드가 있습니다.`);
    }
  }
}

type StaticRenderer = (options: {
  config: SiteConfig;
  pageSlug?: string;
  siteUrl?: string;
}) => string;

async function loadStaticRenderer(): Promise<StaticRenderer> {
  const directory = mkdtempSync(join(tmpdir(), 'daboim-public-brand-static-'));
  const outfile = join(directory, 'render-static.mjs');
  try {
    execFileSync(join(process.cwd(), 'node_modules/.bin/esbuild'), [
      'src/lib/export/render-static.ts',
      '--bundle',
      '--platform=node',
      '--format=esm',
      '--conditions=default',
      '--alias:server-only=./scripts/_empty-server-only.ts',
      `--outfile=${outfile}`,
    ], { cwd: process.cwd(), stdio: 'pipe' });
    const loaded = await import(`${pathToFileURL(outfile).href}?brand=${Date.now()}`) as {
      renderStaticDocument: StaticRenderer;
    };
    return loaded.renderStaticDocument;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('F4 공개 브랜드 언어 계약', () => {
  test('중앙 상수는 한글 기본과 공백 없는 정확한 한글 우선 이중 표기만 제공한다', () => {
    assert.deepEqual(PUBLIC_BRAND_NAMES, {
      brand: '다보임',
      brandBilingual: '다보임(Daboim)',
      ai: '다보임 AI',
      aiBilingual: '다보임 AI(Daboim AI)',
    });
  });

  test('마케팅 실제 렌더의 텍스트·접근성 속성은 허용 위치 밖에서 영문 브랜드를 노출하지 않는다', () => {
    let coreFirstCount = 0;
    for (const [name, Page] of MARKETING_PAGES) {
      const html = renderToStaticMarkup(createElement(Page));
      coreFirstCount += (html.match(/data-brand-bilingual="core-first"/gu) ?? []).length;
      assertRenderedBrandPolicy(html, `marketing:${name}`);
    }
    assert.equal(coreFirstCount, 1, '제품 첫 소개 이중 표기는 마케팅 전체에서 한 번만 허용됩니다.');

    assertRenderedBrandPolicy(renderToStaticMarkup(createElement(BrandLogo)), 'brand-logo');
    assertRenderedBrandPolicy(renderToStaticMarkup(createElement(MarketingFooter)), 'marketing-footer');
    assertOnlyExactBilingualTokens(JSON.stringify(homeMetadata), 'home-metadata');
  });

  test('호스팅 안내와 정적 export는 한글 기본이며 푸터 이중 표기만 유지한다', async () => {
    assertRenderedBrandPolicy(
      renderToStaticMarkup(createElement(SuspendedNotice, { siteName: '테스트 가게' })),
      'hosted:suspended',
    );
    assertRenderedBrandPolicy(renderToStaticMarkup(createElement(SiteNotFound)), 'hosted:not-found');

    const renderStaticDocument = await loadStaticRenderer();
    const html = renderStaticDocument({
      config: normalizeSiteConfig(structuredClone(HWARODAM_SITE_CONFIG)),
      pageSlug: '',
      siteUrl: 'https://hwarodam.example',
    });
    const root = parse(html);
    for (const hiddenCode of root.querySelectorAll('script, style')) hiddenCode.remove();
    const contact = root.querySelector('#sec-contact');
    assert.ok(contact, '정적 export에 고객 사이트 문의/푸터 섹션이 없습니다.');
    assert.match(contact.textContent, new RegExp(PUBLIC_BRAND_NAMES.brandBilingual.replace(/[()]/g, '\\$&'), 'u'));
    assertOnlyExactBilingualTokens(root.textContent, 'static-export');
  });

  test('월간 이메일·공개 SVG·결제 주문명도 영문 단독 브랜드를 만들지 않는다', () => {
    const periods = previousMonthRangesKst(new Date('2026-07-17T00:00:00.000Z'));
    const report = buildMonthlyPerformanceReport({
      siteId: 'site-brand-output',
      period: periods.report,
      comparisonPeriod: periods.comparison,
      current: [{ eventType: 'pageview', source: 'direct', count: 2 }],
      previous: [],
    });
    const email = buildMonthlyReportEmail({
      siteName: '테스트 가게',
      dashboardUrl: 'https://example.com/dashboard/reports/site-brand-output',
      report,
    });
    assertOnlyExactBilingualTokens(`${email.subject}\n${email.html}\n${email.text}`, 'monthly-email');
    assert.match(email.html, /다보임 월간 성과 리포트/u);

    for (const path of ['public/daboim-logo.svg', 'public/mock/video-poster.svg']) {
      const root = parse(readFileSync(join(process.cwd(), path), 'utf8'));
      assertOnlyExactBilingualTokens(root.textContent, path);
    }

    const purchaseRoute = readFileSync(
      join(process.cwd(), 'src/app/api/credits/purchase/route.ts'),
      'utf8',
    );
    assert.doesNotMatch(purchaseRoute, /orderName:\s*`Daboim/u);
    assert.match(purchaseRoute, /orderName:\s*`\$\{PUBLIC_BRAND_NAMES\.brand\}/u);
  });

  test('고객용 auth·dashboard 소스의 공개 문자열에 영문 단독 브랜드 리터럴이 없다', () => {
    for (const path of [
      'src/app/(auth)/login/page.tsx',
      'src/app/(dashboard)/onboarding/page.tsx',
      'src/app/(dashboard)/dashboard/page.tsx',
      'src/app/(dashboard)/dashboard/billing/page.tsx',
      'src/app/(dashboard)/dashboard/credits/page.tsx',
      'src/app/(dashboard)/dashboard/reports/page.tsx',
      'src/app/(dashboard)/dashboard/settings/page.tsx',
      'src/app/(dashboard)/dashboard/sites/[siteId]/page.tsx',
      'src/app/(dashboard)/dashboard/sites/[siteId]/editor/page.tsx',
      'src/components/dashboard/onboarding/generate-step.tsx',
      'src/components/dashboard/onboarding/motion-choice-step.tsx',
      'src/components/dashboard/settings-view.tsx',
      'src/components/dashboard/site-detail.tsx',
    ]) {
      const source = readFileSync(join(process.cwd(), path), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//gu, '')
        .replace(/\/\/.*$/gmu, '');
      assert.doesNotMatch(source, ENGLISH_BRAND, `${path}: 고객 노출 영문 브랜드 리터럴이 남았습니다.`);
    }

    const marketingHeader = readFileSync(
      join(process.cwd(), 'src/components/marketing/MarketingHeader.tsx'),
      'utf8',
    );
    assert.match(marketingHeader, /aria-label=\{`\$\{PUBLIC_BRAND_NAMES\.brand\} 홈`\}/u);
    assert.doesNotMatch(marketingHeader, /aria-label=\{`\$\{PUBLIC_BRAND_NAMES\.brandBilingual\}/u);
  });
});
