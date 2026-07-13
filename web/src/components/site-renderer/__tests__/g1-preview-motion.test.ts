/**
 * [G1] 프리뷰 모션 기본 ON — animate=true면 발행본과 동일하게 data-m+MOTION_CSS+런타임 방출.
 * (프리뷰 컴포넌트의 useState 기본값은 렌더 스모크 대상이 아니므로, 방출 계약을 SiteRenderer로 고정.)
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig } from '@/lib/types/site';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { applyGeneratedMotion } from '@/lib/motion/validate';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';

function cafeCfg(heroTechnique?: string) {
  const t = resolveTemplate('local_store', '카페');
  const survey = {
    businessName: '소소한자리', purposeId: 'local_store', purpose: '음식점', industry: '카페',
    tone: ['친근한'], colorPreference: '#c98a5e', referenceImageUrls: [],
    sectionPlan: planFromTemplate(t), pagePlan: pagePlanFromTemplate(t), templateId: t.id,
  } as SurveyInput;
  const candidate: DesignCandidate = {
    id: 'cand-warm-cozy', label: 'x', style: 'photo', heroImageUrl: '/mock/h.svg',
    theme: emptySiteConfig('t').theme, description: '',
  };
  const cfg = buildSiteConfigFromSurvey(survey, candidate, { heroImageUrl: '/mock/h.svg', imagePool: ['/mock/a.svg'] });
  return applyGeneratedMotion(cfg, 'local_store', 'basic', heroTechnique ? { heroTechnique } : undefined);
}

// 요소 속성만(<img ... data-m="kenburns") — MOTION_CSS 선택자·런타임 쿼리 문자열과 구분
const HERO_KENBURNS_EL = /<img[^>]+data-m="kenburns"/;

describe('G1 — 프리뷰 animate=true 모션 방출', () => {
  test('animate=true면 히어로 배경 이미지에 ken-burns 요소 부착 + MOTION_CSS 방출', () => {
    const html = renderToStaticMarkup(
      createElement(SiteRenderer, { config: cafeCfg(), mode: 'desktop', interactive: false, animate: true }),
    );
    assert.match(html, HERO_KENBURNS_EL, '히어로 ken-burns 요소 미부착');
    assert.ok(html.includes('anaks-kenburns'), 'ken-burns 키프레임 CSS 부재');
    assert.ok(html.includes('IntersectionObserver'), '모션 런타임 미방출');
  });

  test('heroTechnique=none이면 히어로 배경에 ken-burns 요소 없음(선택 반영)', () => {
    const html = renderToStaticMarkup(
      createElement(SiteRenderer, { config: cafeCfg('none'), mode: 'desktop', interactive: false, animate: true }),
    );
    assert.doesNotMatch(html, HERO_KENBURNS_EL, 'none인데 히어로 ken-burns 요소 부착됨');
  });

  test('animate=false(정적)면 모션 런타임·ken-burns 요소 미방출(토글 끄기 무회귀)', () => {
    const html = renderToStaticMarkup(
      createElement(SiteRenderer, { config: cafeCfg(), mode: 'desktop', interactive: false, animate: false }),
    );
    assert.doesNotMatch(html, HERO_KENBURNS_EL);
    assert.ok(!html.includes('IntersectionObserver'));
  });
});
