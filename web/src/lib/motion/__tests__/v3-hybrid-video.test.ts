import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';
import { MOTION_CSS, MOTION_RUNTIME } from '@/lib/motion/runtime';

function config(): SiteConfig {
  const value = emptySiteConfig('하이브리드 영상');
  value.motion = {
    presetId: 'cinematic-hero',
    intensity: 'normal',
    heroTechnique: 'video-hero',
    videoRequested: true,
  };
  value.pages[0].sections = [{
    id: 'hero-hybrid',
    type: 'hero',
    name: '검색에 보이는 브랜드',
    height: 800,
    background: {
      image: { src: '/poster.jpg', overlayColor: '#06142a', overlayOpacity: 0.55 },
      video: { src: '/hero.mp4', poster: '/poster.jpg', bytes: 2_000_000 },
    },
    elements: [{
      id: 'headline',
      kind: 'text',
      frame: { x: 120, y: 220, w: 900, h: 150 },
      z: 2,
      text: '검색과 답변에 모두 보이는 홈페이지',
      style: { fontSize: 72, fontWeight: 700, fontFamily: 'heading', align: 'left', color: '#ffffff' },
    }],
  }];
  return value;
}

describe('V3 — 데스크 scrub / 모바일 pinned loop / 정적 폴백', () => {
  const html = renderToStaticMarkup(createElement(SiteRenderer, {
    config: config(),
    mode: 'auto',
    interactive: true,
    animate: true,
    tier: 'premium',
  }));

  test('desktop과 mobile에 실제 video 요소와 영구 poster를 각각 방출한다', () => {
    assert.match(html, /data-playback="scrub"/);
    assert.match(html, /data-playback="loop"/);
    assert.equal((html.match(/data-m-cinematic-video="true"/g) ?? []).length, 2);
    assert.ok((html.match(/src="\/poster\.jpg"/g) ?? []).length >= 2, 'poster 기저 레이어 누락');
    assert.match(html, /plays[Ii]nline=""/);
    assert.match(html, /muted=""/);
    assert.match(html, /preload="none"/);
  });

  test('SSR/no-JS 기본은 ready·은닉 클래스 없이 poster와 텍스트가 보인다', () => {
    assert.doesNotMatch(html, /class="anaks-site m-cinematic-ready"/);
    assert.doesNotMatch(html, /class="[^"]*m-hide/);
    assert.match(html, /검색과 답변에 모두 보이는 홈페이지/);
  });

  test('런타임은 기능 감지 후 currentTime scrub, 느린 seek는 loop로 폴백한다', () => {
    assert.match(MOTION_RUNTIME, /pointer: fine/);
    assert.match(MOTION_RUNTIME, /saveData/);
    assert.match(MOTION_RUNTIME, /hardwareConcurrency/);
    assert.match(MOTION_RUNTIME, /v\.currentTime=target/);
    assert.match(MOTION_RUNTIME, /__anaksSlowSeeks>=2/);
    assert.match(MOTION_RUNTIME, /startCinematicLoop/);
  });

  test('reduced-motion은 cinematic video를 숨기고 ready pin을 활성화하지 않는다', () => {
    assert.match(MOTION_CSS, /prefers-reduced-motion: reduce/);
    assert.match(MOTION_CSS, /\[data-m="cinematicvideo"\] \{ display: none !important; \}/);
    assert.match(MOTION_RUNTIME, /mm && mm\.matches/);
    assert.match(MOTION_RUNTIME, /classList\.remove\('m-cinematic-ready'\)/);
  });

  test('금지 엔진·스크롤 하이재킹을 도입하지 않는다', () => {
    const source = MOTION_CSS + MOTION_RUNTIME;
    assert.doesNotMatch(source, /WebGL|THREE|Lenis|ScrollTrigger/);
    assert.doesNotMatch(MOTION_RUNTIME, /preventDefault\(\)/);
  });
});
