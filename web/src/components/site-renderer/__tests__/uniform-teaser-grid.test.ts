import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { uniformTeaserCards } from '@/components/site-renderer/UniformTeaserGrid';
import { buildCandidateBlueprints } from '@/lib/data/design-candidates';
import { pagePlanFromTemplate, planFromTemplate, resolveTemplate } from '@/lib/data/site-blueprints';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { expandTokens, tokenSetToSiteTheme } from '@/lib/design/dna';
import { withSiteCinematicDefault } from '@/lib/motion/site-cinematic';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';

function mixedConfig(): SiteConfig {
  const template = resolveTemplate('local_store', '카페');
  const survey = {
    businessName: '모과 커피', purposeId: 'local_store', purpose: '음식점·로컬 매장', industry: '카페',
    tagline: '매일의 한 잔', region: '서울', tone: ['따뜻한'], colorPreference: '시스템 추천',
    referenceImageUrls: [], sectionPlan: planFromTemplate(template), pagePlan: pagePlanFromTemplate(template),
    templateId: template.id, imageStyle: 'photo',
  } as SurveyInput;
  const base = buildCandidateBlueprints(survey)[0];
  assert.ok(base);
  const candidate: DesignCandidate = {
    ...base,
    heroImageUrl: '/mock/hero.svg',
    theme: tokenSetToSiteTheme(expandTokens('cafe-warm-editorial', 44)),
  };
  return withSiteCinematicDefault(buildSiteConfigFromSurvey(survey, candidate, {
    heroImageUrl: '/mock/hero.svg', imagePool: ['/mock/a.svg', '/mock/b.svg'],
  }));
}

function teaser(config: SiteConfig) {
  const section = config.pages.find((page) => page.slug === '')?.sections.find((item) => item.id === 'sec-home-teaser');
  assert.ok(section);
  return section;
}

function render(config: SiteConfig, mode: 'desktop' | 'mobile'): string {
  return renderToStaticMarkup(createElement(SiteRenderer, {
    config, mode, interactive: true, animate: false,
  }));
}

describe('FIXCARD — 홈 티저 카드 그룹 통일', () => {
  test('이미지 유·무 혼합 시드도 모든 카드에 같은 크기의 썸네일 슬롯과 카드 프레임을 만든다', () => {
    const cards = uniformTeaserCards(teaser(mixedConfig()));
    assert.ok(cards && cards.length >= 5);
    assert.ok(cards.some((card) => card.thumb.kind === 'image'));
    assert.ok(cards.some((card) => card.thumb.kind === 'shape'));
    for (const card of cards) {
      assert.deepEqual([card.surface.frame.w, card.surface.frame.h], [360, 340]);
      assert.deepEqual([card.thumb.frame.w, card.thumb.frame.h], [360, 150]);
      assert.ok(card.link.frame.y >= card.surface.frame.y);
      assert.ok(card.link.frame.y + card.link.frame.h <= card.surface.frame.y + card.surface.frame.h);
    }
  });

  test('desktop과 mobile 모두 제목·본문·CTA를 같은 카드 컨테이너 안에 소유하고 고아 버튼을 만들지 않는다', () => {
    const config = mixedConfig();
    for (const mode of ['desktop', 'mobile'] as const) {
      const root = parse(render(config, mode));
      const cards = root.querySelectorAll('[data-uniform-teaser-card]');
      assert.ok(cards.length >= 5);
      assert.equal(root.querySelectorAll('[data-uniform-teaser-thumbnail]').length, cards.length);
      assert.equal(root.querySelectorAll('[data-uniform-teaser-card-body]').length, cards.length);
      assert.equal(root.querySelectorAll('[data-uniform-teaser-cta]').length, cards.length);
      for (const card of cards) {
        assert.equal(card.querySelectorAll('[data-uniform-teaser-thumbnail]').length, 1);
        assert.equal(card.querySelectorAll('[data-uniform-teaser-card-body]').length, 1);
        assert.equal(card.querySelectorAll('[data-uniform-teaser-cta]').length, 1);
        assert.match(card.textContent, /View details/u);
      }
    }
  });

  test('사진 없는 카드의 썸네일은 사이트 팔레트 기반 procedural fill이며 빈 surface가 아니다', () => {
    const html = render(mixedConfig(), 'desktop');
    const root = parse(html);
    const procedural = root.querySelectorAll('[data-uniform-teaser-thumbnail="procedural"]');
    assert.ok(procedural.length > 0);
    for (const thumb of procedural) {
      const fill = thumb.querySelector('[data-teaser-procedural-thumbnail]');
      assert.ok(fill);
      assert.match(fill.getAttribute('style') ?? '', /radial-gradient/);
      assert.match(fill.getAttribute('style') ?? '', /linear-gradient/);
    }
  });

  test('신규 마커가 없는 기존 발행 섹션은 종전 자유배치·stackOrder 경로를 유지한다', () => {
    const config = mixedConfig();
    const section = teaser(config);
    for (const element of section.elements) {
      element.id = element.id.replace(/-v2-\d+/u, '');
    }
    assert.equal(uniformTeaserCards(section), undefined);
    assert.doesNotMatch(render(config, 'desktop'), /data-uniform-teaser-section/);
    assert.doesNotMatch(render(config, 'mobile'), /data-uniform-teaser-section/);
  });

  test('반응형 grid 계약은 1440 고정 행·768 균일 행·390 내용 높이를 구분한다', () => {
    const desktop = render(mixedConfig(), 'desktop');
    const mobile = render(mixedConfig(), 'mobile');
    assert.match(desktop, /grid-template-columns:repeat\(auto-fit, minmax\(min\(100%, 320px\), 1fr\)\)/);
    assert.match(desktop, /grid-auto-rows:23\.6111[^;]*cqw/);
    assert.match(mobile, /grid-auto-rows:var\(--uniform-teaser-row, auto\)/);
    assert.match(mobile, /height:var\(--uniform-teaser-card-height, auto\)/);
    assert.match(mobile, /@container \(min-width: 640px\)/);
    assert.match(mobile, /--uniform-teaser-row: 360px/);
    assert.doesNotMatch(mobile, /grid-auto-rows:420px/);
  });

  test('반응형 CTA는 본문 바로 아래 12px이며 1440 캔버스의 바닥 정렬은 유지한다', () => {
    const desktop = parse(render(mixedConfig(), 'desktop'));
    const mobile = parse(render(mixedConfig(), 'mobile'));
    for (const cta of mobile.querySelectorAll('[data-uniform-teaser-cta]')) {
      assert.match(cta.getAttribute('style') ?? '', /margin-top:12px/);
    }
    for (const cta of desktop.querySelectorAll('[data-uniform-teaser-cta]')) {
      assert.match(cta.getAttribute('style') ?? '', /margin-top:auto/);
    }
  });
});
