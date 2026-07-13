/**
 * [P4] 파리티 엣지·레거시 안전 + document-shell favicon. 라이브·정적 공유 셸의 회귀 방지.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import type { SiteConfig } from '@/lib/types/site';
import { emptySiteConfig } from '@/lib/types/site';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { TenantPageContent } from '@/components/site-renderer/TenantPageContent';
import { buildDocumentShell } from '@/lib/export/document-shell';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';

const candidate: DesignCandidate = {
  id: 'c', label: 'x', style: 'photo', heroImageUrl: '/mock/h.svg', theme: emptySiteConfig('t').theme, description: '',
};
const opts = { heroImageUrl: '/mock/h.svg', imagePool: ['/mock/a.svg'] };
function multiPageCfg(): SiteConfig {
  const t = resolveTemplate('local_store', '카페');
  const survey = {
    businessName: '소소한자리', purposeId: 'local_store', purpose: '음식점', industry: '카페',
    tone: ['친근한'], colorPreference: '#c98a5e', referenceImageUrls: [], contentItems: [{ name: '커피', price: '4,000' }],
    sectionPlan: planFromTemplate(t), pagePlan: pagePlanFromTemplate(t), templateId: t.id,
  } as SurveyInput;
  return buildSiteConfigFromSurvey(survey, candidate, opts);
}
const html = (cfg: SiteConfig) => renderToStaticMarkup(createElement(TenantPageContent, { config: cfg, pageSlug: '', interactive: true, animate: true }));

describe('P4 — 파리티 엣지·레거시', () => {
  test('businessInfo 없으면 footer 미방출(레거시 안전, 크래시 없음) — main·h1은 유지', () => {
    const cfg = multiPageCfg(); // businessInfo 없음
    const root = parse(html(cfg));
    assert.equal(root.querySelectorAll('footer').length, 0, 'businessInfo 없는데 footer 방출');
    assert.equal(root.querySelectorAll('main').length, 1);
    assert.equal(root.querySelectorAll('h1').length, 1);
  });

  test('단일 페이지(내비<2)면 헤더 없음 — main·h1은 유지(무회귀)', () => {
    const cfg = multiPageCfg();
    // 홈만 남겨 단일 페이지로
    cfg.pages = [cfg.pages[0]];
    const root = parse(html(cfg));
    assert.equal(root.querySelectorAll('header').length, 0, '단일 페이지인데 헤더 방출');
    assert.equal(root.querySelectorAll('main').length, 1);
    assert.equal(root.querySelectorAll('h1').length, 1);
  });

  test('document-shell — favicon link 방출(라이브 tenantMetadata 파리티)', () => {
    const cfg = multiPageCfg();
    const doc = buildDocumentShell({
      config: cfg, pageSlug: '', headerHtml: '', bodyHtml: '<div class="anaks-site"></div>',
      siteUrl: 'https://x.anakslabs.com',
    });
    assert.ok(doc.includes('<link rel="icon" href="/favicon.ico">'), 'favicon 미방출');
    assert.ok(doc.includes('rel="canonical"'), 'canonical 미방출');
    assert.ok(doc.includes('application/ld+json'), 'JSON-LD 미방출');
  });

  test('export 상대 법적 링크 — privacyHref/termsHref가 LegalFooter에 전달', () => {
    const cfg = multiPageCfg();
    cfg.businessInfo = { businessName: 'x', ownerName: 'y', businessNumber: '123-45-67890', address: 'a', phone: '02-0' } as SiteConfig['businessInfo'];
    const out = renderToStaticMarkup(createElement(TenantPageContent, {
      config: cfg, pageSlug: '', interactive: true, animate: true,
      privacyHref: './privacy.html', termsHref: './terms.html',
    }));
    assert.ok(out.includes('./privacy.html'), '상대 privacy 링크 없음');
    assert.ok(out.includes('./terms.html'), '상대 terms 링크 없음');
  });
});
