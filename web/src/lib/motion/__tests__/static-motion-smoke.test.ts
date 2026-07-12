/**
 * [Q6] 정적 발행물 모션 스모크 — render-static은 SiteRenderer를 animate:true로 직렬화한다
 * (render-static.ts:84-85와 동일 인자·server-only라 여기선 SiteRenderer 직접 렌더로 검증).
 * 발행 HTML에 (a) data-m 부착 (b) 모션 CSS(ken-burns 키프레임) (c) IntersectionObserver 런타임
 * (d) prefers-reduced-motion 가드가 문자열 수준으로 포함되는지 고정한다.
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

function cafeConfig() {
  const t = resolveTemplate('local_store', '카페');
  const survey = {
    businessName: '소소한자리',
    purposeId: 'local_store',
    purpose: '음식점',
    industry: '카페',
    tone: ['친근한'],
    colorPreference: '아이보리',
    referenceImageUrls: [],
    sectionPlan: planFromTemplate(t),
    pagePlan: pagePlanFromTemplate(t),
    templateId: t.id,
  } as SurveyInput;
  const candidate: DesignCandidate = {
    id: 'cand-warm-cozy',
    label: 'x',
    style: 'photo',
    heroImageUrl: '/mock/h.svg',
    theme: emptySiteConfig('t').theme,
    description: '',
  };
  const cfg = buildSiteConfigFromSurvey(survey, candidate, { heroImageUrl: '/mock/h.svg', imagePool: ['/mock/a.svg'] });
  // 생성 저장 직전과 동일 — 업종 매핑 프리셋(cafe-basic) 주입 + sanitize
  return applyGeneratedMotion(cfg, 'local_store', 'basic');
}

describe('정적 발행물 모션 포함 (animate:true — render-static 미러)', () => {
  const html = renderToStaticMarkup(
    createElement(SiteRenderer, { config: cafeConfig(), mode: 'auto', interactive: true, animate: true }),
  );

  test('히어로 ken-burns data-m + 키프레임 CSS 포함', () => {
    assert.ok(html.includes('data-m="kenburns"'), 'hero 배경 ken-burns 미부착');
    assert.ok(html.includes('anaks-kenburns'), 'ken-burns 키프레임 CSS 부재');
  });
  test('비히어로 요소 reveal 스태거 부착(티저 카드 포함)', () => {
    assert.ok(html.includes('data-m="reveal"'), 'reveal 미부착');
    assert.ok(html.includes('data-m-delay'), 'reveal 스태거 delay 부재');
  });
  test('IntersectionObserver 바닐라 런타임 인라인 포함', () => {
    assert.ok(html.includes('IntersectionObserver'), '런타임 JS 부재');
  });
  test('prefers-reduced-motion 가드 포함(CSS+런타임)', () => {
    assert.ok(html.includes('prefers-reduced-motion'), 'reduced-motion 가드 부재');
  });
  test('SSR 마크업은 기본 가시 — 숨김 클래스(m-hide)가 마크업에 선부여되지 않음(no-JS 보임)', () => {
    assert.ok(!/class="[^"]*m-hide/.test(html), 'SSR에 m-hide 선부여(No-JS 빈 화면 위험)');
  });
});

describe('intensity off / animate:false — 모션 미방출', () => {
  test("intensity 'off'면 런타임·키프레임 미방출", () => {
    const cfg = cafeConfig();
    cfg.motion = { presetId: cfg.motion!.presetId, intensity: 'off' };
    const html = renderToStaticMarkup(
      createElement(SiteRenderer, { config: cfg, mode: 'auto', interactive: true, animate: true }),
    );
    assert.ok(!html.includes('IntersectionObserver'));
    assert.ok(!html.includes('anaks-kenburns'));
  });
  test('animate:false(정적 프리뷰 기본)면 data-m 미부착', () => {
    const html = renderToStaticMarkup(
      createElement(SiteRenderer, { config: cafeConfig(), mode: 'desktop', interactive: false, animate: false }),
    );
    assert.ok(!html.includes('data-m="reveal"'));
    assert.ok(!html.includes('IntersectionObserver'));
  });
});
