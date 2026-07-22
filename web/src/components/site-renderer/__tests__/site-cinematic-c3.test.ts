import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { withSiteCinematicDefault } from '@/lib/motion/site-cinematic';
import { MOTION_RUNTIME } from '@/lib/motion/runtime';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

function quietConfig(): SiteConfig {
  const config = withSiteCinematicDefault(emptySiteConfig('조용히 이어지는 홈'));
  config.pages[0].sections = Array.from({ length: 4 }, (_, index) => ({
    id: `section-${index + 1}`,
    type: index === 0 ? 'hero' : index === 3 ? 'contact' : 'about',
    name: `${index + 1}번`,
    height: index === 0 ? 760 : 600,
    background: { color: index % 2 ? config.theme.palette.surface : config.theme.palette.background },
    elements: [{
      id: `copy-${index + 1}`, kind: 'text' as const, text: `스크롤 장면 ${index + 1}`,
      frame: { x: 120, y: 160, w: 720, h: 120 }, z: 2,
      style: { fontSize: 48, fontFamily: 'heading' as const, color: config.theme.palette.text },
    }],
  }));
  return config;
}

describe('SITECINE C3 — 히어로 이후 조용한 연속 모션', () => {
  test('홈 전 섹션이 하나의 페이지 진행도에 묶인 quiet section으로 표시된다', () => {
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: quietConfig(), mode: 'desktop', interactive: true, animate: true,
    }));
    assert.equal((html.match(/data-site-cine-quiet-section="true"/g) ?? []).length, 4);
    assert.equal((html.match(/data-site-cinematic-continuation="true"/g) ?? []).length, 1);
    assert.match(html, /syncLandingContinuation/);
  });

  test('진입 안무는 ready 후에만 transform·opacity를 소비하고 레이아웃 속성을 쓰지 않는다', () => {
    const renderer = source('src/components/site-renderer/SiteRenderer.tsx');
    assert.match(renderer, /m-cinematic-ready \[data-site-cinematic-continuation\][\s\S]+?--story-chapter-x/);
    assert.match(renderer, /--story-chapter-y/);
    assert.match(renderer, /--story-chapter-scale/);
    assert.match(renderer, /--story-chapter-opacity/);
    const motionRule = renderer.match(/m-cinematic-ready \[data-site-cinematic-continuation\][\s\S]+?\n\}/)?.[0] ?? '';
    assert.doesNotMatch(motionRule, /\b(?:top|left|width|height|padding|margin):/);
  });

  test('각 장면의 현재 위치에서 진행도·시차·모티프를 결정적으로 계산한다', () => {
    assert.match(MOTION_RUNTIME, /local=clamp\(p\*count-index\+\.34\)/);
    assert.match(MOTION_RUNTIME, /--story-chapter-x/);
    assert.match(MOTION_RUNTIME, /--story-light-x/);
    assert.match(MOTION_RUNTIME, /direction=index%2===0\?1:-1/);
    assert.doesNotMatch(MOTION_RUNTIME, /preventDefault\(\)|scrollTo\(/);
  });

  test('no-JS·reduced-motion에서는 전 카피가 보이고 위치가 고정된다', () => {
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: quietConfig(), mode: 'mobile', interactive: false, animate: false,
    }));
    for (let index = 1; index <= 4; index += 1) assert.match(html, new RegExp(`스크롤 장면 ${index}`));
    assert.doesNotMatch(html, /<script\b/);
    assert.match(html, /prefers-reduced-motion:[\s\S]+?opacity:\s*1 !important; transform:\s*none !important/);
  });
});
