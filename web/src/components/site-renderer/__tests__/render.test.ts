/**
 * [motion-system 2단계] 렌더 통합 — SiteRenderer 산출 HTML의 모션 방출/미방출.
 * (render-static은 이 SiteRenderer를 animate:true로 감싸므로 핵심 방출 로직은 여기서 커버.
 *  server-only 모듈이라 render-static 자체는 node:test 불가 → SiteRenderer 직접 렌더로 검증.)
 * 회귀: (a) Basic 프리셋 사이트에 data-m 존재(Stage-1 게이팅 부활 방지) (b) animate=false면 data-m·CSS 부재.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { emptySiteConfig, type CanvasElement, type Section, type SiteConfig, type MotionIntensity } from '@/lib/types/site';

const txt = (id: string, text: string, y: number): CanvasElement =>
  ({ id, kind: 'text', frame: { x: 100, y, w: 400, h: 50 }, z: 2, text, style: { fontSize: 40, fontWeight: 400, fontFamily: 'heading', align: 'left' } } as CanvasElement);
const img = (id: string, y: number): CanvasElement =>
  ({ id, kind: 'image', frame: { x: 100, y, w: 300, h: 200 }, z: 2, src: '/x.png', style: {} } as CanvasElement);
const sec = (id: string, elements: CanvasElement[], bgImage = false): Section =>
  ({ id, type: 'hero', name: 's', height: 600, background: bgImage ? { image: { src: '/bg.png' } } : {}, elements });

function cfg(presetId: string, intensity: MotionIntensity): SiteConfig {
  return {
    version: 2,
    theme: emptySiteConfig('t').theme,
    meta: { title: 't' },
    pages: [
      {
        id: 'home',
        title: '홈',
        slug: '',
        sections: [
          sec('sec-hero', [txt('h1', '제목', 100), img('hi', 300)], true),
          sec('sec-a', [txt('a1', '소개 본문 문구입니다', 100), txt('a2', '98%', 200), img('ai', 300)]),
        ],
      },
    ],
    motion: { presetId, intensity },
  };
}

const render = (config: SiteConfig, animate: boolean) =>
  renderToStaticMarkup(createElement(SiteRenderer, { config, mode: 'auto', interactive: true, animate } as never));

describe('SiteRenderer 모션 방출', () => {
  test('animate=true + Basic 프리셋 → data-m 존재 (게이팅 부활 방지)', () => {
    const html = render(cfg('academy-basic', 'normal'), true);
    assert.match(html, /data-m="reveal"/, 'reveal data-m 없음');
    assert.match(html, /data-m="countup"/, 'countup data-m 없음');
    assert.match(html, /data-m="kenburns"/, 'kenburns data-m 없음');
    assert.match(html, /data-m-to="98"/, 'count-up 목표값 없음');
  });

  test('CSS·런타임 인라인 포함 (내보낸 HTML 단독 실행)', () => {
    const html = render(cfg('academy-basic', 'normal'), true);
    assert.match(html, /anaks-kenburns/, 'MOTION_CSS 미포함');
    assert.match(html, /IntersectionObserver/, 'MOTION_RUNTIME 미포함');
    assert.match(html, /--m-amp/, 'intensity 커스텀 프로퍼티 없음');
  });

  test('animate=false → data-m·모션 CSS·런타임 부재 (프리뷰/썸네일)', () => {
    const html = render(cfg('academy-basic', 'normal'), false);
    assert.doesNotMatch(html, /data-m=/, 'data-m 잔존');
    assert.doesNotMatch(html, /anaks-kenburns/, 'MOTION_CSS 잔존');
    assert.doesNotMatch(html, /IntersectionObserver/, 'MOTION_RUNTIME 잔존');
  });

  test("intensity 'off' → 모션 미방출", () => {
    const html = render(cfg('academy-basic', 'off'), true);
    assert.doesNotMatch(html, /data-m="reveal"/);
    assert.doesNotMatch(html, /IntersectionObserver/);
  });

  test('에디터 편집 캔버스 클래스는 렌더 산출에 없음', () => {
    const html = render(cfg('academy-basic', 'normal'), true);
    assert.doesNotMatch(html, /data-canvas-bg/);
  });
});
