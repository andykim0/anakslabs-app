/**
 * [motion 3단계] Premium 7종 계획(resolveMotionPlan) 불변식.
 * video-hero 폴백 체인 / spotlight 다크 판정 / hover-video 상한 / 티어 강등 방어(defense-in-depth) /
 * split-text·parallax·stacking 방출 / marquee 이중조건·최소치 / basic에 video 필드 무해.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySiteConfig, type CanvasElement, type Section, type SiteConfig, type MotionIntensity, type SectionBackground } from '@/lib/types/site';
import { resolveMotionPlan } from '@/lib/motion/apply';
import { MOTION_PRESETS, type PresetId } from '@/lib/motion/presets';

const THEME = emptySiteConfig('t').theme;

const txt = (id: string, text: string, size = 40, y = 100): CanvasElement =>
  ({ id, kind: 'text', frame: { x: 100, y, w: 400, h: 60 }, z: 1, text, style: { fontSize: size } } as CanvasElement);
const img = (id: string, y = 100, z = 1): CanvasElement =>
  ({ id, kind: 'image', frame: { x: 100, y, w: 300, h: 200 }, z, src: '/x.png', style: {} } as CanvasElement);
const vid = (id: string): CanvasElement =>
  ({ id, kind: 'video', frame: { x: 100, y: 100, w: 300, h: 200 }, z: 1, src: '/v.mp4', poster: '/p.jpg', style: {} } as CanvasElement);
const sec = (id: string, elements: CanvasElement[], background: SectionBackground = {}, layout?: 'canvas' | 'marquee'): Section =>
  ({ id, type: 'hero', name: id, height: 600, background, elements, ...(layout ? { layout } : {}) } as Section);

function cfg(presetId: string, sections: Section[], intensity: MotionIntensity = 'normal'): SiteConfig {
  return { version: 2, theme: THEME, meta: { title: 't' }, pages: [{ id: 'home', title: '홈', slug: '', sections }], motion: { presetId, intensity } };
}

describe('premium 프리셋 × 강도 — 무예외 + off 빈 계획', () => {
  const premiumPresets = (Object.keys(MOTION_PRESETS) as PresetId[]).filter((p) => MOTION_PRESETS[p].tier === 'premium');
  for (const pid of premiumPresets) {
    for (const it of ['subtle', 'normal'] as MotionIntensity[]) {
      test(`${pid} / ${it} — 방출 무예외`, () => {
        const c = cfg(pid, [sec('hero', [txt('h', '제목')], { video: { src: '/v.mp4', poster: '/p.jpg' } }), sec('a', [txt('a1', '소개'), img('a2')], { color: '#101010' })], it);
        assert.doesNotThrow(() => resolveMotionPlan(c));
      });
    }
    test(`${pid} / off — 빈 계획`, () => {
      const p = resolveMotionPlan(cfg(pid, [sec('hero', [txt('h', '제목')])], 'off'));
      assert.equal(p.videoHeroSections.size, 0);
      assert.equal(p.elementMotion.size, 0);
    });
  }
});

describe('video-hero 폴백 체인 (Q1.2)', () => {
  test('영상+poster 有 → video-hero 방출', () => {
    const p = resolveMotionPlan(cfg('clinic-premium', [sec('hero', [txt('h', '제목')], { video: { src: '/v.mp4', poster: '/p.jpg' } })]));
    assert.ok(p.videoHeroSections.has('hero'));
    assert.equal(p.kenBurnsSections.size, 0);
  });
  test('src 有·poster 無 → ken-burns 폴백(배경 이미지 존재 시)', () => {
    const p = resolveMotionPlan(cfg('clinic-premium', [sec('hero', [txt('h', '제목')], { video: { src: '/v.mp4' }, image: { src: '/bg.png' } })]));
    assert.equal(p.videoHeroSections.size, 0);
    assert.ok(p.kenBurnsSections.has('hero'));
  });
  test('video 필드 없음 → ken-burns 폴백(배경 이미지)', () => {
    const p = resolveMotionPlan(cfg('clinic-premium', [sec('hero', [txt('h', '제목')], { image: { src: '/bg.png' } })]));
    assert.equal(p.videoHeroSections.size, 0);
    assert.ok(p.kenBurnsSections.has('hero'));
  });
});

describe('spotlight — darkSectionOnly', () => {
  test('다크 비히어로 섹션에만 방출', () => {
    const p = resolveMotionPlan(cfg('dining-premium', [
      sec('hero', [txt('h', '제목')], { video: { src: '/v.mp4', poster: '/p.jpg' } }),
      sec('dark', [txt('d', '어두운'), img('di')], { color: '#0a0a0a' }),
    ]));
    assert.ok(p.spotlightSections.has('dark'));
  });
  test('다크 섹션 없으면 조용히 제외', () => {
    const p = resolveMotionPlan(cfg('dining-premium', [
      sec('hero', [txt('h', '제목')], { video: { src: '/v.mp4', poster: '/p.jpg' } }),
      sec('light', [txt('l', '밝은')], { color: '#f5f5f5' }),
    ]));
    assert.equal(p.spotlightSections.size, 0);
  });
});

describe('hover-video 상한(4) 클램프', () => {
  test('video 6개 → 4개만 hovervideo', () => {
    const vids = Array.from({ length: 6 }, (_, i) => vid(`v${i}`));
    const p = resolveMotionPlan(cfg('beauty-premium', [
      sec('hero', [txt('h', '제목')], { video: { src: '/v.mp4', poster: '/p.jpg' } }),
      sec('gallery', vids, { color: '#101010' }),
    ]));
    const count = [...p.elementMotion.values()].filter((m) => m === 'hovervideo').length;
    assert.equal(count, 4);
  });
});

describe('split-text / parallax / stacking 방출', () => {
  test('split-text → 히어로 최대 fontSize 텍스트', () => {
    const p = resolveMotionPlan(cfg('dining-premium', [
      sec('hero', [txt('small', '작은', 20), txt('big', '헤드라인', 72)], { video: { src: '/v.mp4', poster: '/p.jpg' } }),
    ]));
    assert.ok(p.splitTextElements.has('hero::big'));
    assert.ok(!p.splitTextElements.has('hero::small'));
  });
  test('parallax → 레이어 ≥2 섹션 + depth 배정', () => {
    const p = resolveMotionPlan(cfg('beauty-premium', [
      sec('hero', [txt('h', '제목')], { video: { src: '/v.mp4', poster: '/p.jpg' } }),
      sec('layers', [img('l1', 100, 0), img('l2', 200, 1), img('l3', 300, 2)], { color: '#101010' }),
    ]));
    assert.ok(p.parallaxSections.has('layers'));
    assert.equal(p.parallaxDepth.get('layers::l1'), 1); // 뒤 레이어(z 낮음) 깊이 큼
  });
  test('stacking → 카드 ≥3 섹션', () => {
    const p = resolveMotionPlan(cfg('clinic-premium', [
      sec('hero', [txt('h', '제목')], { video: { src: '/v.mp4', poster: '/p.jpg' } }),
      sec('cards', [img('c1'), img('c2'), img('c3')], { color: '#101010' }),
    ]));
    assert.ok(p.stackingSections.has('cards'));
  });
});

describe('marquee — 이중조건(프리셋 marquee AND layout marquee) + 최소치 3 (Q2)', () => {
  test('layout marquee + 아이템 ≥3 → 방출', () => {
    const p = resolveMotionPlan(cfg('cafe-basic', [
      sec('hero', [txt('h', '제목')], { image: { src: '/bg.png' } }),
      sec('logos', [img('l1'), img('l2'), img('l3')], { color: '#101010' }, 'marquee'),
    ]));
    assert.ok(p.marqueeSections.has('logos'));
  });
  test('layout marquee지만 아이템 <3 → 미방출(정적)', () => {
    const p = resolveMotionPlan(cfg('cafe-basic', [
      sec('hero', [txt('h', '제목')], { image: { src: '/bg.png' } }),
      sec('logos', [img('l1'), img('l2')], { color: '#101010' }, 'marquee'),
    ]));
    assert.equal(p.marqueeSections.size, 0);
  });
  test('프리셋에 marquee 없으면(academy-basic) layout marquee여도 미방출', () => {
    const p = resolveMotionPlan(cfg('academy-basic', [
      sec('hero', [txt('h', '제목')], { image: { src: '/bg.png' } }),
      sec('logos', [img('l1'), img('l2'), img('l3')], { color: '#101010' }, 'marquee'),
    ]));
    assert.equal(p.marqueeSections.size, 0);
  });
});

describe('티어 방어 — basic 플랜 + premium 프리셋 → 강등(defense-in-depth)', () => {
  test('tier=basic 주면 premium 프리셋 강등 → video-hero 미방출', () => {
    const c = cfg('clinic-premium', [sec('hero', [txt('h', '제목')], { video: { src: '/v.mp4', poster: '/p.jpg' } }), sec('a', [txt('a1', '소개')], { color: '#101010' })]);
    const guarded = resolveMotionPlan(c, { tier: 'basic' });
    assert.equal(guarded.videoHeroSections.size, 0);
    // 강등 프리셋(office-basic)은 scroll-reveal → 비히어로 요소 reveal 존재
    assert.ok(guarded.elementMotion.size > 0);
    // tier 미지정이면 프리셋 신뢰 → video-hero 방출
    const trusted = resolveMotionPlan(c);
    assert.ok(trusted.videoHeroSections.has('hero'));
  });
});

describe('basic 프리셋에 video 필드 남아도 무해 (Q1.3)', () => {
  test('cafe-basic(hero=ken-burns) + hero.background.video → video-hero 미방출, config 불변', () => {
    const c = cfg('cafe-basic', [sec('hero', [txt('h', '제목')], { video: { src: '/v.mp4', poster: '/p.jpg' }, image: { src: '/bg.png' } })]);
    const before = JSON.stringify(c);
    const p = resolveMotionPlan(c);
    assert.equal(p.videoHeroSections.size, 0); // 프리셋 hero가 video-hero 아님
    assert.ok(p.kenBurnsSections.has('hero')); // ken-burns는 방출(bg image)
    assert.equal(JSON.stringify(c), before); // 원본 불변(순수)
  });
});
