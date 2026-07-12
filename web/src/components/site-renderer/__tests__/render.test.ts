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

// ---------- [3단계] Premium 렌더 통합 ----------

const heroVid = (): Section =>
  ({ id: 'sec-hero', type: 'hero', name: '히어로', height: 900,
     background: { video: { src: '/v.mp4', poster: '/p.jpg' } },
     elements: [txt('h-title', '큰 헤드라인 문구', 340)] } as never);
const darkCards = (): Section =>
  ({ id: 'sec-cards', type: 'features', name: '카드', height: 700, background: { color: '#0a0a0a' },
     elements: [img('c1', 100), img('c2', 200), img('c3', 300)] } as never);

function premiumCfg(presetId: string, intensity: MotionIntensity = 'normal'): SiteConfig {
  return { version: 2, theme: emptySiteConfig('t').theme, meta: { title: 't' },
    pages: [{ id: 'home', title: '홈', slug: '', sections: [heroVid(), darkCards()] }],
    motion: { presetId, intensity } };
}

// 인라인 <style>/<script> 제거 — MOTION_CSS/RUNTIME이 셀렉터로 data-m="…"를 포함하므로,
// 실제 요소 속성만 검사하려면 인라인 블록을 제거하고 남은 마크업에서 매칭한다.
const stripInline = (html: string) =>
  html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '').replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');

describe('SiteRenderer Premium 방출', () => {
  test('clinic-premium(video-hero+stacking) → premium data-m + poster 폴백 + 런타임', () => {
    const html = render(premiumCfg('clinic-premium'), true);
    const markup = stripInline(html);
    assert.match(markup, /<video data-m="videohero"/, 'video-hero 요소 미방출');
    assert.match(markup, /data-m="stacking"/, 'stacking 섹션 미방출');
    assert.match(markup, /data-m="stackcard"/, 'stackcard 미방출');
    assert.match(markup, /<img src="\/p\.jpg"/, 'poster 폴백 이미지 없음');
    assert.match(html, /IntersectionObserver/, '런타임 미포함'); // 런타임은 full html에서
  });

  test('dining-premium(spotlight+split-text) → 다크 spotlight + splitword', () => {
    const markup = stripInline(render(premiumCfg('dining-premium'), true));
    assert.match(markup, /data-m="spotlight"/, 'spotlight 미방출(다크 섹션)');
    assert.match(markup, /data-m="splitword"/, 'split-text 단어 span 미방출');
    assert.match(markup, /aria-label="큰 헤드라인 문구"/, 'split-text 원문 aria-label 보존 안 됨');
  });

  test('animate=false → premium data-m·런타임 부재 (회귀)', () => {
    const html = render(premiumCfg('clinic-premium'), false);
    assert.doesNotMatch(html, /data-m=/, 'data-m 잔존');
    assert.doesNotMatch(html, /IntersectionObserver/, '런타임 잔존');
  });

  test('tier=basic 방어 → premium 프리셋이어도 video-hero 요소 부재(강등)', () => {
    const html = renderToStaticMarkup(
      createElement(SiteRenderer, { config: premiumCfg('clinic-premium'), mode: 'auto', interactive: true, animate: true, tier: 'basic' } as never),
    );
    assert.doesNotMatch(stripInline(html), /<video data-m="videohero"/, 'basic 티어인데 video-hero 요소 방출됨(강등 실패)');
  });
});
