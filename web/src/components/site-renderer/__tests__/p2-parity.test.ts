/**
 * [P2] render-static ↔ 라이브 시맨틱 파리티 불변식.
 * renderStaticDocument는 server-only('react-dom/server.edge') — node:test 불가. render-static이
 * 방출하는 본문 컴포넌트 TenantPageContent를 react-dom/server로 직렬화해 동일 마크업을 검증한다
 * (라이브 _shared도 같은 컴포넌트 사용 = 파리티). + 오탐이던 규칙이 파리티 문서에서 사라짐 회귀.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import type { BusinessInfo, SiteConfig } from '@/lib/types/site';
import { emptySiteConfig } from '@/lib/types/site';
import type { DesignCandidate, LivePurposeId, SurveyInput } from '@/lib/types/domain';
import { LIVE_PURPOSE_IDS } from '@/lib/data/purpose-taxonomy';
import { TenantPageContent } from '@/components/site-renderer/TenantPageContent';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';
import { SEO_RULES } from '@/lib/scan/checks/seo';
import { AEO_RULES } from '@/lib/scan/checks/aeo';
import type { RuleContext } from '@/lib/scan/rules';

const BIZ: BusinessInfo = {
  businessName: '소소한자리', ownerName: '김대표', businessNumber: '123-45-67890',
  address: '서울 연희동', phone: '02-000-0000',
};
const candidate: DesignCandidate = {
  id: 'c', label: 'x', style: 'photo', heroImageUrl: '/mock/h.svg', theme: emptySiteConfig('t').theme, description: '',
};
const opts = { heroImageUrl: '/mock/h.svg', imagePool: ['/mock/a.svg', '/mock/b.svg'] };

function cfgFor(purposeId: LivePurposeId, industry: string): SiteConfig {
  const t = resolveTemplate(purposeId, industry);
  const survey = {
    businessName: '소소한자리', purposeId, purpose: '테스트', industry, tone: ['모던'],
    colorPreference: '#c98a5e', referenceImageUrls: [], contentItems: [{ name: '항목1', price: '4,000' }],
    sectionPlan: planFromTemplate(t), pagePlan: pagePlanFromTemplate(t), templateId: t.id,
  } as SurveyInput;
  const cfg = buildSiteConfigFromSurvey(survey, candidate, opts);
  cfg.businessInfo = BIZ;
  return cfg;
}
function parityHtml(cfg: SiteConfig): string {
  return renderToStaticMarkup(createElement(TenantPageContent, { config: cfg, pageSlug: '', interactive: true, animate: true }));
}
function ctxOf(html: string): RuleContext {
  const root = parse(html);
  const clone = parse(root.toString());
  for (const el of clone.querySelectorAll('script, style, noscript, template')) el.remove();
  return {
    root, rawHtml: html, visibleText: clone.text.replace(/\s+/g, ' ').trim(),
    url: new URL('https://x.anakslabs.com'), ttfbMs: 0, robotsTxtOk: true, sitemapOk: true, llmsTxtOk: true,
  };
}
const ruleBy = (rules: typeof SEO_RULES, code: string) => rules.find((r) => r.code === code)!;

describe('P2 — 시맨틱 파리티 (6종 목적)', () => {
  for (const purposeId of LIVE_PURPOSE_IDS) {
    test(`${purposeId} — h1 정확히 1 · main 1 · LegalFooter(사업자정보) 존재`, () => {
      const industry = purposeId === 'edu_membership' ? '입시학원' : '카페';
      const html = parityHtml(cfgFor(purposeId, industry));
      const root = parse(html);
      assert.equal(root.querySelectorAll('h1').length, 1, 'h1 정확히 1개 아님');
      assert.equal(root.querySelectorAll('main').length, 1, 'main 정확히 1개 아님');
      assert.equal(root.querySelectorAll('footer').length, 1, 'footer 없음');
      assert.ok(html.includes('123-45-67890'), '사업자등록번호(LegalFooter) 없음');
    });
  }
});

describe('P2 — 오탐 회귀 (bare 실패 → 파리티 통과)', () => {
  const cfg = cfgFor('local_store', '카페');
  const bareHtml = renderToStaticMarkup(createElement(SiteRenderer, { config: cfg, mode: 'auto', interactive: true, animate: true }));
  const bare = ctxOf(bareHtml);
  const parity = ctxOf(parityHtml(cfg));

  for (const code of ['seo_h1'] as const) {
    test(`${code}: bare 오탐(fail) → 파리티 통과`, () => {
      const rule = ruleBy(SEO_RULES, code);
      assert.equal(rule.failed(bare), true, `bare에서 ${code} 통과(오탐 재현 실패)`);
      assert.equal(rule.failed(parity), false, `파리티에서 ${code} 여전히 실패`);
    });
  }
  for (const code of ['aeo_main_landmark', 'aeo_heading_order', 'aeo_semantic_structure'] as const) {
    test(`${code}: bare 오탐(fail) → 파리티 통과`, () => {
      const rule = ruleBy(AEO_RULES, code);
      assert.equal(rule.failed(bare), true, `bare에서 ${code} 통과(오탐 재현 실패)`);
      assert.equal(rule.failed(parity), false, `파리티에서 ${code} 여전히 실패`);
    });
  }
});
