/**
 * [G5] G-batch 통합 회귀 — 재현 시나리오(카페, 원문 미입력) 역검증:
 * ① serve 목적은 콘텐츠 없으면 S3 게이트에서 멈춤 / 항목 1개면 통과 ② 생성물 메뉴에 입력 항목 반영
 * ③ 프리뷰(animate=true)에서 히어로 ken-burns 체감 ④ 다크 팔레트 주 CTA 가독 ⑤ 발행 진단 guidance 완비.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig } from '@/lib/types/site';
import { contentGateStatus } from '@/lib/onboarding/content-requirements';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';
import { applyGeneratedMotion } from '@/lib/motion/validate';
import { resolveMotionPlan } from '@/lib/motion/apply';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { solidButtonPassesAA } from '@/lib/design/button-contrast';
import { derivePalette } from '@/lib/design/quality-standards';
import { checkPublish } from '@/lib/publish/preflight';
import { allScanCodes, guidanceFor } from '@/lib/scan/guidance';

function cafeSurvey(contentItems?: SurveyInput['contentItems']): SurveyInput {
  const t = resolveTemplate('local_store', '카페');
  return {
    businessName: '소소한자리', purposeId: 'local_store', purpose: '음식점', industry: '카페',
    tone: ['친근한'], colorPreference: '#8a6d3b', referenceImageUrls: [], contentItems,
    sectionPlan: planFromTemplate(t), pagePlan: pagePlanFromTemplate(t), templateId: t.id,
  } as SurveyInput;
}
function darkCandidate(): DesignCandidate {
  return {
    id: 'cand-dark-luxury', label: 'x', style: 'photo', heroImageUrl: '/mock/h.svg',
    theme: { ...emptySiteConfig('t').theme, palette: derivePalette('#8a6d3b', '#1a1712', { dark: true }) },
    description: '',
  };
}
const opts = { heroImageUrl: '/mock/h.svg', imagePool: Array.from({ length: 10 }, (_, i) => `/mock/p${i}.svg`) };

describe('G5 — 재현 시나리오 역검증', () => {
  test('① 최소 입력(콘텐츠 없음) → serve 목적 S3 게이트 차단', () => {
    assert.equal(contentGateStatus('local_store', 0).ok, false);
    assert.equal(contentGateStatus('local_store', 0).needMore, 1);
  });

  test('① 항목 1개 입력 → 게이트 통과 + 권장 부족 힌트', () => {
    const g = contentGateStatus('local_store', 1);
    assert.equal(g.ok, true);
    assert.ok(g.recommendedShort > 0); // 권장 5개 미달 힌트
  });

  test('② 생성물 메뉴 섹션에 입력 항목 반영(구조화 1급 소스)', () => {
    const survey = cafeSurvey([
      { name: '드립커피', price: '5,000' },
      { name: '플랫화이트', price: '5,500' },
      { name: '스콘', price: '3,500' },
    ]);
    const cfg = buildSiteConfigFromSurvey(survey, darkCandidate(), opts);
    const menu = cfg.pages.flatMap((p) => p.sections).find((s) => s.type === 'menu')!;
    assert.equal(menu.elements.filter((el) => el.id.includes('menu-name')).length, 3);
    assert.ok(JSON.stringify(menu).includes('플랫화이트'));
  });

  test('③ 프리뷰(animate=true)에서 히어로 ken-burns 요소 부착', () => {
    const cfg = applyGeneratedMotion(buildSiteConfigFromSurvey(cafeSurvey([{ name: '커피', price: '4,000' }]), darkCandidate(), opts), 'local_store', 'basic');
    const plan = resolveMotionPlan(cfg);
    assert.ok(plan.kenBurnsSections.has(cfg.pages[0].sections[0].id), 'ken-burns 미부착');
    const html = renderToStaticMarkup(createElement(SiteRenderer, { config: cfg, mode: 'desktop', interactive: false, animate: true }));
    assert.match(html, /<img[^>]+data-m="kenburns"/);
  });

  test('④ 다크 팔레트 주 CTA 가독(AA) + 발행 blocker 0', () => {
    // 발행 게이트는 모션 적용된 저장 config 기준(applyGeneratedMotion — 생성 저장 직전 단계)
    const cfg = applyGeneratedMotion(
      buildSiteConfigFromSurvey(cafeSurvey([{ name: '커피', price: '4,000' }]), darkCandidate(), opts),
      'local_store',
      'basic',
    );
    const hero = cfg.pages[0].sections.find((s) => s.type === 'hero')!;
    const cta = hero.elements.find((el) => el.kind === 'button' && el.id.includes('hero-cta') && !el.id.includes('cta2'));
    assert.ok(cta && cta.kind === 'button');
    assert.ok(solidButtonPassesAA(cta!.kind === 'button' ? cta!.style.color! : '', cta!.kind === 'button' ? cta!.style.textColor! : ''));
    assert.deepEqual(checkPublish(cfg, 'basic').blockers, []);
  });

  test('⑤ 발행 진단 — 전 scan 코드가 고객 가이드를 가짐', () => {
    for (const code of allScanCodes()) assert.ok(guidanceFor(code), `${code} guidance 없음`);
  });
});
