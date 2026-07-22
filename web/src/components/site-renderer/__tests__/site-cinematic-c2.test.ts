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

function config(): SiteConfig {
  const next = withSiteCinematicDefault(emptySiteConfig('연결된 홈페이지'));
  next.motion = { presetId: 'base-calm-v2', intensity: 'normal' };
  next.pages[0].sections = ['hero', 'story', 'contact'].map((id, index) => ({
    id,
    type: index === 0 ? 'hero' : index === 2 ? 'contact' : 'about',
    name: id,
    height: index === 0 ? 800 : 560,
    background: { color: index % 2 ? next.theme.palette.surface : next.theme.palette.background },
    elements: [{
      id: `${id}-copy`, kind: 'text' as const, text: `${index + 1}번 섹션`,
      frame: { x: 120, y: 160, w: 720, h: 120 }, z: 2,
      style: { fontSize: 52, fontFamily: 'heading' as const, color: next.theme.palette.text },
    }],
  }));
  return next;
}

describe('SITECINE C2 — 랜딩 공유 번호 진행 척추', () => {
  test('신규 desktop 트리는 레일 1개와 순서가 고정된 01∼03 챕터를 방출한다', () => {
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: config(), mode: 'desktop', interactive: true, animate: true,
    }));
    assert.equal((html.match(/data-site-cinematic-continuation="true"/g) ?? []).length, 1);
    assert.equal((html.match(/data-story-progress-rail="true"/g) ?? []).length, 1);
    assert.deepEqual([...html.matchAll(/data-story-chapter="(\d{2})"/g)].map((match) => match[1]), ['01', '02', '03']);
    assert.match(html, /data-story-progress-fill="true"/);
  });

  test('모바일도 같은 번호 계약을 유지하고 배지는 레일보다 위에 놓인다', () => {
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: config(), mode: 'mobile', interactive: true, animate: true,
    }));
    assert.deepEqual([...html.matchAll(/data-story-chapter="(\d{2})"/g)].map((match) => match[1]), ['01', '02', '03']);
    assert.match(html, /data-story-progress-rail[\s\S]+?z-index:\s*1/);
    assert.match(html, /data-story-chapter[\s\S]+?::after\s*\{[\s\S]+?z-index:\s*4/);
    assert.match(html, /background:\s*var\(--site-cine-bg\)/);
  });

  test('랜딩과 생성 렌더러가 StoryProgressRail DOM과 syncLandingContinuation 엔진을 공유한다', () => {
    const landing = source('src/components/marketing/LandingStoryContinuation.tsx');
    const renderer = source('src/components/site-renderer/SiteRenderer.tsx');
    assert.match(landing, /<StoryProgressRail \/>/);
    assert.match(renderer, /<StoryProgressRail \/>/);
    assert.match(MOTION_RUNTIME, /data-landing-continuation'\)\|\|el\.hasAttribute\('data-site-cinematic-continuation/);
    assert.match(MOTION_RUNTIME, /syncLandingContinuation\(el,p\)/);
    assert.doesNotMatch(MOTION_RUNTIME, /preventDefault\(\)|scrollTo\(/);
  });

  test('레거시 config에는 진행 척추 램퍼·배지가 추가되지 않는다', () => {
    const legacy = config();
    delete legacy.siteCinematic;
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: legacy, mode: 'desktop', interactive: false, animate: false,
    }));
    assert.doesNotMatch(html, /data-site-cinematic-continuation="true"/);
    assert.doesNotMatch(html, /data-story-chapter="01"/);
    assert.doesNotMatch(html, /data-story-progress-rail="true"/);
  });
});
