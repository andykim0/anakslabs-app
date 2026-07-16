import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SectionStack } from '@/components/site-renderer/SectionStack';
import { emptySiteConfig, type CanvasElement, type Section } from '@/lib/types/site';

const text = {
  id: 'copy',
  kind: 'text',
  frame: { x: 80, y: 80, w: 720, h: 96 },
  z: 2,
  text: '사진 없이도 사실 문구와 CTA는 남습니다',
  style: {
    fontSize: 40,
    fontFamily: 'heading',
    fontWeight: 700,
  },
} as CanvasElement;

function fallbackShape(assetFallback: boolean): CanvasElement {
  return {
    id: assetFallback ? 'factual-fallback' : 'decorative-shape',
    kind: 'shape',
    shape: 'rect',
    frame: { x: 80, y: 220, w: 640, h: 360 },
    z: 1,
    style: { fill: '#dbeafe', borderRadius: 24 },
    ...(assetFallback ? { assetFallback: true } : {}),
  } as CanvasElement;
}

function renderStack(elements: CanvasElement[]): string {
  const section: Section = {
    id: 'about',
    type: 'about',
    name: '소개',
    height: 720,
    background: {},
    elements,
  };
  return renderToStaticMarkup(createElement(SectionStack, {
    section,
    theme: emptySiteConfig('asset-fallback').theme,
  }));
}

test('mobile stack keeps provenance fallback geometry and semantic copy', () => {
  const html = renderStack([text, fallbackShape(true)]);

  assert.match(html, /사진 없이도 사실 문구와 CTA는 남습니다/);
  assert.match(html, /data-asset-fallback="true"/);
  assert.match(html, /aspect-ratio:640 \/ 360/);
  assert.match(html, /background-color:#dbeafe/);
});

test('mobile stack continues omitting unrelated decorative shapes', () => {
  const html = renderStack([text, fallbackShape(false)]);

  assert.match(html, /사진 없이도 사실 문구와 CTA는 남습니다/);
  assert.doesNotMatch(html, /#dbeafe/);
  assert.doesNotMatch(html, /data-asset-fallback/);
});
