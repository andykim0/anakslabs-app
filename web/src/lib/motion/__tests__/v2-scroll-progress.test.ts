import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';
import { MOTION_RUNTIME } from '@/lib/motion/runtime';

function cinematicConfig(): SiteConfig {
  const config = emptySiteConfig('시네마틱 진행도');
  config.motion = {
    presetId: 'cinematic-hero',
    intensity: 'normal',
    heroTechnique: 'video-hero',
    videoRequested: true,
  };
  config.pages[0].sections = [{
    id: 'hero-progress',
    type: 'hero',
    name: '시네마틱 히어로',
    height: 800,
    background: {
      image: { src: '/poster.jpg', overlayColor: '#071226', overlayOpacity: 0.5 },
      video: { src: '/hero.mp4', poster: '/poster.jpg', bytes: 2_000_000 },
    },
    elements: [],
  }];
  return config;
}

describe('V2 — sticky pin + 스크롤 진행도 런타임', () => {
  const html = renderToStaticMarkup(createElement(SiteRenderer, {
    config: cinematicConfig(),
    mode: 'desktop',
    interactive: true,
    animate: true,
    tier: 'premium',
  }));

  test('cinematic hero는 네이티브 sticky 진행도 컨테이너를 방출한다', () => {
    assert.match(html, /data-m="cinematic"/);
    assert.match(html, /data-m-progress/);
    assert.match(html, /data-m-pin/);
    assert.match(html, /position:sticky/);
    assert.match(html, /--scroll-progress/);
  });

  test('정적 HTML 런타임에 passive+rAF+IO+reduced-motion 가드가 모두 포함된다', () => {
    assert.match(html, /passive:true/);
    assert.match(html, /requestAnimationFrame/);
    assert.match(html, /IntersectionObserver/);
    assert.match(html, /prefers-reduced-motion/);
    assert.match(html, /scrollRootOf/);
  });

  test('진행도 런타임은 스크롤 하이재킹 없이 CSS 변수만 공개한다', () => {
    assert.match(MOTION_RUNTIME, /style\.setProperty\('--scroll-progress'/);
    assert.doesNotMatch(MOTION_RUNTIME, /preventDefault\(\)/);
    assert.doesNotMatch(MOTION_RUNTIME, /scrollTo\(/);
  });
});
