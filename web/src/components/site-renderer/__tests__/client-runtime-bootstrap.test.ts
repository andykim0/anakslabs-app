import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';

function motionConfig(): SiteConfig {
  const config = emptySiteConfig('클라이언트 런타임');
  config.pages[0].sections = [
    {
      id: 'hero', type: 'hero', name: '히어로', height: 720, background: {},
      elements: [{
        id: 'title', kind: 'text', frame: { x: 80, y: 120, w: 800, h: 120 }, z: 1,
        text: '스크롤 모션', style: { fontSize: 64, fontFamily: 'heading' },
      }],
    },
    {
      id: 'story', type: 'about', name: '이야기', height: 560, background: {},
      elements: [{
        id: 'body', kind: 'text', frame: { x: 80, y: 120, w: 800, h: 120 }, z: 1,
        text: '클라이언트 내비게이션에서도 움직입니다.', style: { fontSize: 32, fontFamily: 'body' },
      }],
    },
  ];
  config.motion = { presetId: 'base-calm-v2', intensity: 'normal' };
  return config;
}

describe('D1 App Router motion bootstrap', () => {
  test('client delivery keeps executable script tags out of the React render tree', () => {
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: motionConfig(), mode: 'auto', interactive: true, animate: true, runtimeDelivery: 'client',
    }));
    assert.doesNotMatch(html, /<script\b/);
    assert.doesNotMatch(html, /window\.__anaksMotionDispose/);
    assert.match(html, /class="anaks-site"/);
  });

  test('static publishing retains the standalone inline runtime contract', () => {
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: motionConfig(), mode: 'auto', interactive: true, animate: true, runtimeDelivery: 'inline',
    }));
    assert.match(html, /<script>/);
    assert.match(html, /window\.__anaksMotionRuntimeReady/);
    assert.match(html, /window\.__anaksAnchorDispose/);
  });

  test('bootstrap and runtime both guard the already-owned root set', () => {
    const bootstrap = readFileSync('src/components/site-renderer/SiteRuntimeBootstrap.tsx', 'utf8');
    const runtime = readFileSync('src/lib/motion/runtime.ts', 'utf8');
    assert.match(bootstrap, /currentRootsAreBootstrapped/);
    assert.match(bootstrap, /tracked\.includes\(root\)/);
    assert.match(runtime, /__anaksMotionRuntimeReady&&window\.__anaksMotionDispose/);
    assert.match(runtime, /ownedRoots\.indexOf\(root\)>=0/);
  });
});
