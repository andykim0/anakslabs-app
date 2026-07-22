import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import {
  continuousCanvasIsEnabled,
  withContinuousCanvasDefault,
  withSiteCinematicDefault,
} from '@/lib/motion/site-cinematic';
import { MOTION_RUNTIME } from '@/lib/motion/runtime';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';

const source = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

function flowConfig(chapterCount = 5, continuous = true): SiteConfig {
  let config = withSiteCinematicDefault(emptySiteConfig('이어지는 상점'));
  if (continuous) config = withContinuousCanvasDefault(config);
  config.motion = { presetId: 'base-calm-v2', intensity: 'normal' };
  config.pages[0].sections = Array.from({ length: chapterCount }, (_, index) => ({
    id: index === 0 ? 'hero' : `section-${index + 1}`,
    type: index === 0 ? 'hero' as const : index === chapterCount - 1 ? 'contact' as const : 'about' as const,
    name: `${index + 1}번 장면`,
    height: index === 0 ? 820 : 620,
    background: {
      color: index % 2 ? config.theme.palette.surface : config.theme.palette.background,
      ...(index === 0 ? { image: { src: '/customer-hero.webp', overlayColor: '#101820', overlayOpacity: 0.42 } } : {}),
    },
    elements: [
      {
        id: `copy-${index}`, kind: 'text' as const, text: `실제 내용 ${index + 1}`,
        frame: { x: 120, y: 150, w: 760, h: 120 }, z: 2,
        style: { fontSize: 48, fontFamily: 'heading' as const, color: config.theme.palette.text },
      },
      {
        id: `image-${index}`, kind: 'image' as const, src: `/customer-${index + 1}.webp`, alt: `고객 사진 ${index + 1}`,
        frame: { x: 920, y: 150, w: 360, h: 260 }, z: 2,
        style: { objectFit: 'cover' as const },
      },
      ...(index === 0 ? [{
        id: 'hero-cta', kind: 'button' as const, label: '문의하기', href: '/contact',
        frame: { x: 120, y: 330, w: 220, h: 64 }, z: 1,
        style: { variant: 'solid' as const, fontSize: 18 },
      }] : []),
    ],
  }));
  return config;
}

function render(config: SiteConfig, mode: 'desktop' | 'mobile' = 'desktop', animate = true): string {
  return renderToStaticMarkup(createElement(SiteRenderer, {
    config, mode, interactive: animate, animate,
  }));
}

describe('FLOW 연속 애니메이션 캔버스', () => {
  test('MAIN opt-in 홈만 한 톤 필드·히어로 브릿지·실콘텐츠 챕터를 방출한다', () => {
    const config = flowConfig();
    config.pages.push({
      id: 'menu', slug: 'menu', title: '메뉴',
      sections: [structuredClone(config.pages[0].sections[1]!)],
    });
    const home = render(config);
    const root = parse(home);
    assert.equal(root.querySelectorAll('[data-continuous-canvas]').length, 1);
    assert.equal(root.querySelectorAll('[data-continuous-canvas-field]').length, 1);
    assert.equal(root.querySelectorAll('[data-continuous-hero-bridge]').length, 1);
    assert.equal(root.querySelectorAll('[data-story-chapter]').length, 5);
    assert.equal(root.querySelector('[data-continuous-canvas]')?.getAttribute('data-flow-depth'), 'long');
    assert.equal(root.querySelector('[data-continuous-canvas]')?.getAttribute('data-flow-chapter-count'), '5');
    assert.ok(root.querySelectorAll('[data-flow-layer="copy"]').length >= 5);
    assert.ok(root.querySelectorAll('[data-flow-layer="media"]').length >= 5);
    assert.match(home, /background-color:\s*transparent !important; background-image:\s*none !important/);
    assert.match(home, /bottom:\s*clamp\(-140px,-12svh,-76px\)/);
    assert.match(home, /mask-image:\s*linear-gradient\(to bottom,transparent 0%/);

    const heroStage = root.querySelector('[data-flow-hero] [data-continuous-hero-stage]');
    const bridge = heroStage?.querySelector('[data-continuous-hero-bridge]');
    const foreground = heroStage?.querySelectorAll('[data-continuous-hero-foreground]') ?? [];
    assert.ok(heroStage);
    assert.ok(bridge);
    assert.equal(bridge.parentNode, heroStage);
    assert.equal(bridge.getAttribute('aria-hidden'), 'true');
    assert.ok(foreground.length >= 2);
    assert.ok(foreground.some((node) => node.getAttribute('data-continuous-hero-foreground') === 'copy'));
    assert.ok(foreground.some((node) => node.getAttribute('data-continuous-hero-foreground') === 'action'));
    for (const node of foreground) {
      assert.equal(node.closest('[data-continuous-hero-stage]'), heroStage);
      assert.match(node.getAttribute('style') ?? '', /z-index:6/);
    }
    assert.match(home, /\[data-continuous-hero-bridge\]\s*\{[\s\S]+?z-index:\s*5[\s\S]+?pointer-events:\s*none/);

    const mobileRoot = parse(render(config, 'mobile'));
    const mobileStage = mobileRoot.querySelector('[data-flow-hero] [data-continuous-hero-stage]');
    const mobileBridge = mobileStage?.querySelector('[data-continuous-hero-bridge]');
    const mobileForeground = mobileStage?.querySelector('[data-continuous-hero-foreground="stack"]');
    assert.ok(mobileStage);
    assert.equal(mobileBridge?.parentNode, mobileStage);
    assert.equal(mobileForeground?.parentNode, mobileStage);
    assert.match(mobileForeground?.getAttribute('style') ?? '', /z-index:6/);

    const subpage = renderToStaticMarkup(createElement(SiteRenderer, {
      config, pageSlug: 'menu', mode: 'desktop', interactive: true, animate: true,
    }));
    const subpageRoot = parse(subpage);
    assert.equal(subpageRoot.querySelectorAll('[data-continuous-canvas-root]').length, 0);
    assert.equal(subpageRoot.querySelectorAll('[data-continuous-canvas-field]').length, 0);
    assert.equal(subpageRoot.querySelectorAll('[data-flow-layer]').length, 0);
  });

  test('3장 이상만 긴 무대이고 얇은 사이트는 실제 두 장 그대로 우아하게 축소한다', () => {
    const long = parse(render(flowConfig(3)));
    const shortHtml = render(flowConfig(2));
    const short = parse(shortHtml);
    assert.equal(long.querySelector('[data-continuous-canvas]')?.getAttribute('data-flow-depth'), 'long');
    assert.equal(short.querySelector('[data-continuous-canvas]')?.getAttribute('data-flow-depth'), 'short');
    assert.equal(short.querySelectorAll('[data-story-chapter]').length, 2);
    assert.match(shortHtml, /\[data-continuous-canvas\]\[data-flow-depth="long"\]/);
    assert.doesNotMatch(shortHtml, /data-flow-min-height|data-empty-flow-chapter/);
  });

  test('no-JS·reduced-motion은 모든 카피와 사진을 정적 최종 상태로 보존한다', () => {
    const html = render(flowConfig(4), 'mobile', false);
    for (let index = 1; index <= 4; index += 1) {
      assert.match(html, new RegExp(`실제 내용 ${index}`));
      assert.match(html, new RegExp(`고객 사진 ${index}`));
    }
    assert.doesNotMatch(html, /<script\b/);
    assert.match(html, /prefers-reduced-motion:[\s\S]+?\[data-flow-layer\][\s\S]+?opacity:\s*1 !important; transform:\s*none !important/);
    assert.match(html, /position:\s*absolute; inset:\s*0; height:\s*auto; margin:\s*0/);
  });

  test('필드가 없는 기존 SITECINE v1은 FLOW DOM·CSS·레이어를 전혀 받지 않는다', () => {
    const config = flowConfig(4, false);
    assert.equal(continuousCanvasIsEnabled(config), false);
    const html = render(config, 'desktop', false);
    assert.doesNotMatch(html, /data-continuous-canvas-root|data-continuous-canvas-field|data-continuous-hero-bridge|data-flow-layer/);
    assert.doesNotMatch(html, /--flow-canvas-top|syncContinuousCanvas/);
    assert.match(html, /data-site-cinematic="1"/);
  });

  test('진행형 등장은 기존 단일 rAF 스케줄러와 transform·opacity만 사용한다', () => {
    assert.match(MOTION_RUNTIME, /function syncContinuousCanvas\(el,p\)/);
    assert.match(MOTION_RUNTIME, /\[data-flow-layer\]/);
    assert.match(MOTION_RUNTIME, /data-continuous-canvas'\)\)syncContinuousCanvas\(el,p\)/);
    assert.match(MOTION_RUNTIME, /function scheduleProgress\(\)\{if\(progressTick\|\|disposed\)return;progressTick=true;requestAnimationFrame\(progressFrame\);\}/);
    assert.doesNotMatch(MOTION_RUNTIME, /preventDefault\(\)|scrollTo\(/);
    const flowRuntime = MOTION_RUNTIME.match(/function syncContinuousCanvas\(el,p\)\{[\s\S]+?\n    \}/)?.[0] ?? '';
    assert.doesNotMatch(flowRuntime, /style\.(?:top|left|width|height|padding|margin)|setProperty\('--(?:top|left|width|height|padding|margin)/);
  });

  test('서버 생성·후보·모션 프리뷰는 MAIN 선택에만 같은 additive 계약을 고정한다', () => {
    const generation = source('src/app/api/onboarding/generate/route.ts');
    const candidate = source('src/lib/onboarding/candidate-preview.ts');
    const motionPreview = source('src/lib/motion/preview-config.ts');
    for (const value of [generation, candidate, motionPreview]) {
      assert.match(value, /contentDepth\?\.mainStorytelling/);
      assert.match(value, /withContinuousCanvasDefault/);
    }
  });
});
