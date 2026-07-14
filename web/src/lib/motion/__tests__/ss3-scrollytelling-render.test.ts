import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { resolveScrimWithOverride, scrimPassesAA } from '@/lib/design/scrim';
import { emptySiteConfig, type ScrollytellingAct, type SiteConfig } from '@/lib/types/site';
import { resolveMotionPlan } from '@/lib/motion/apply';
import { scrollytellingActOpacity, scrollytellingActProgress } from '@/lib/motion/progress';
import { MOTION_CSS, MOTION_RUNTIME } from '@/lib/motion/runtime';

const ACTS: ScrollytellingAct[] = [
  { heading: '조용한 첫인상', body: '절제된 빛과 깊이', kind: 'text', band: [0, 0.25] },
  { heading: '우리의 정체성', body: '고객이 제공한 소개 문장', kind: 'text', band: [0.25, 0.5] },
  { heading: '12.5년의 기록', body: '고객이 제공한 실적', kind: 'stat', band: [0.5, 0.75] },
  { heading: '상담하기', body: '문의하기', kind: 'text', band: [0.75, 1] },
];

function config(): SiteConfig {
  const value = emptySiteConfig('페이지 관통 서사');
  value.meta = {
    ...value.meta,
    purposeId: 'company_brand',
    templateId: 'company_brand.default',
  };
  value.motion = {
    presetId: 'cinematic-hero',
    intensity: 'normal',
    heroTechnique: 'video-hero',
    heroMotionId: 'scrollytelling-manifesto',
    videoRequested: true,
  };
  value.pages[0].sections = [{
    id: 'story-stage',
    type: 'hero',
    name: '브랜드 서사',
    height: 820,
    layout: 'scrollytelling',
    acts: structuredClone(ACTS),
    background: {
      image: { src: '/stage-poster.webp', overlayColor: '#07152a', overlayOpacity: 0.5 },
      video: { src: '/stage.mp4', poster: '/stage-poster.webp', bytes: 2_400_000 },
    },
    elements: [],
  }];
  return value;
}

describe('SS3 — 단일 sticky 무대와 정적 막 HTML', () => {
  const stageConfig = config();
  const plan = resolveMotionPlan(stageConfig, { tier: 'premium' });
  const html = renderToStaticMarkup(createElement(SiteRenderer, {
    config: stageConfig,
    mode: 'auto',
    interactive: true,
    animate: true,
    tier: 'premium',
  }));

  test('다막 합성은 일반 cinematic과 중복 배정되지 않는다', () => {
    assert.deepEqual([...plan.scrollytellingSections], ['story-stage']);
    assert.equal(plan.cinematicHeroSections.size, 0);
    assert.equal(plan.videoHeroSections.size, 1);
  });

  test('무대·poster·video를 한 번만 렌더하고 모든 막을 시맨틱 article로 SSR한다', () => {
    assert.equal((html.match(/data-ss-stage="true"/g) ?? []).length, 1);
    assert.equal((html.match(/<video\b/g) ?? []).length, 1);
    assert.equal((html.match(/<article\b/g) ?? []).length, ACTS.length);
    assert.match(html, /<section id="story-stage"/);
    assert.match(html, /data-ss-mode="auto"/);
    assert.match(html, /<h2 id="story-stage-act-1"/);
    assert.match(html, /<p data-ss-body="true">절제된 빛과 깊이<\/p>/);
    for (const act of ACTS) {
      assert.match(html, new RegExp(act.body));
    }
  });

  test('강제 mobile/desktop 미리보기는 viewport와 별개인 mode 표식을 SSR한다', () => {
    const mobile = renderToStaticMarkup(createElement(SiteRenderer, {
      config: stageConfig, mode: 'mobile', interactive: true, animate: true, tier: 'premium',
    }));
    const desktop = renderToStaticMarkup(createElement(SiteRenderer, {
      config: stageConfig, mode: 'desktop', interactive: true, animate: true, tier: 'premium',
    }));
    assert.match(mobile, /data-ss-mode="mobile"/);
    assert.match(desktop, /data-ss-mode="desktop"/);
    assert.match(MOTION_CSS, /data-ss-mode="mobile"/);
    assert.match(MOTION_CSS, /data-ss-mode="auto"/);
  });

  test('SSR은 band·split-word·count 목표를 내고 video는 preload none이다', () => {
    assert.match(html, /data-act-start="0\.0000"/);
    assert.match(html, /data-act-end="1\.0000"/);
    assert.match(html, /data-ss-word="true"/);
    assert.match(html, /data-ss-count="true" data-count-to="12\.5" data-count-decimals="1"/);
    assert.match(html, /<video[^>]+data-playback="scrub"[^>]+preload="none"/);
    assert.match(html, /src="\/stage-poster\.webp"[^>]*fetchPriority="high"/);
  });

  test('no-JS 기본은 세로 article이고 ready에서만 sticky·opacity 진행도를 소비한다', () => {
    assert.doesNotMatch(html, /class="anaks-site m-cinematic-ready"/);
    assert.match(html, /<noscript><style>\.anaks-site \[data-ss-stage\]\{height:auto!important;contain:none\}<\/style><\/noscript>/);
    assert.match(MOTION_CSS, /\[data-ss-stage\] \{[\s\S]*height: var\(--ss-scroll-height\)/);
    assert.match(MOTION_CSS, /m-scrollytelling-ready \[data-ss-pin\] \{ position: sticky/);
    assert.match(MOTION_RUNTIME, /syncScrollytelling\(el,p\)/);
    assert.match(MOTION_RUNTIME, /--ss-act-opacity/);
    assert.match(MOTION_RUNTIME, /data-ss-count/);
  });
});

describe('SS3 — 막 진행도 경계 불변식', () => {
  test('p=0 첫 막과 p=1 마지막 막은 항상 완전히 보인다', () => {
    assert.equal(scrollytellingActOpacity(0, { start: 0, end: 0.25 }, 0, 4), 1);
    assert.equal(scrollytellingActOpacity(1, { start: 0.75, end: 1 }, 3, 4), 1);
    assert.match(MOTION_RUNTIME, /wordIndex===0\?1/);
  });

  test('인접 band 경계는 0.5씩 crossfade하며 막 내부 진행도는 0..1이다', () => {
    assert.ok(Math.abs(scrollytellingActOpacity(0.25, { start: 0, end: 0.25 }, 0, 4) - 0.5) < 1e-9);
    assert.ok(Math.abs(scrollytellingActOpacity(0.25, { start: 0.25, end: 0.5 }, 1, 4) - 0.5) < 1e-9);
    assert.equal(scrollytellingActProgress(-1, { start: 0.25, end: 0.5 }), 0);
    assert.equal(scrollytellingActProgress(2, { start: 0.25, end: 0.5 }), 1);
  });

  test('런타임에 금지 엔진·스크롤 가로채기가 없다', () => {
    const source = MOTION_CSS + MOTION_RUNTIME;
    assert.doesNotMatch(source, /WebGL|THREE|Lenis|ScrollTrigger/);
    assert.doesNotMatch(MOTION_RUNTIME, /preventDefault\(\)/);
  });

  test('사용자 지정 overlay도 opacity를 올리거나 안전 스크림으로 폴백해 AA를 지킨다', () => {
    const palette = config().theme.palette;
    for (const [color, opacity] of [['#ffffff', 0.1], ['#123456', 0.2]] as const) {
      const scrim = resolveScrimWithOverride(palette, color, opacity);
      assert.equal(scrimPassesAA(scrim.overlayColor, scrim.overlayOpacity, scrim.textColor), true);
    }
  });
});
