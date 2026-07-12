/**
 * [motion-system 2단계] resolveMotionPlan 불변식 — 순수 계획 산출·한도·히어로 LCP 보호.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMotionPlan, motionFor, parseStatParts, type MotionPlan } from '@/lib/motion/apply';
import { MOTION_PRESETS, type PresetId } from '@/lib/motion/presets';
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
          sec('sec-a', [txt('a1', '소개 문구입니다 길게 이어지는 본문', 100), txt('a2', '98%', 200), img('ai', 300)]),
          sec('sec-b', [txt('b1', '120+', 100), txt('b2', '3배', 200), txt('b3', '50', 300), txt('b4', '5', 400), img('bi1', 500), img('bi2', 600), img('bi3', 700)]),
        ],
      },
    ],
    motion: { presetId, intensity },
  };
}

const countOf = (p: MotionPlan, v: string) => [...p.elementMotion.values()].filter((x) => x === v).length;
const PRESETS = Object.keys(MOTION_PRESETS) as PresetId[];

describe('parseStatParts', () => {
  test('통계형만 파싱', () => {
    assert.deepEqual(parseStatParts('98%'), { to: 98, prefix: '', suffix: '%' });
    assert.deepEqual(parseStatParts('3배'), { to: 3, prefix: '', suffix: '배' });
    assert.deepEqual(parseStatParts('1,200'), { to: 1200, prefix: '', suffix: '' });
    assert.equal(parseStatParts('소개 문구입니다 길게 이어지는 본문'), null);
  });
});

describe('resolveMotionPlan', () => {
  test('전 프리셋 × 강도 산출 (throw 없음)', () => {
    for (const pid of PRESETS) {
      for (const int of ['off', 'subtle', 'normal'] as MotionIntensity[]) {
        const plan = resolveMotionPlan(cfg(pid, int));
        assert.ok(plan.intensity === int);
      }
    }
  });

  test("intensity 'off' → 빈 계획", () => {
    const plan = resolveMotionPlan(cfg('academy-basic', 'off'));
    assert.equal(plan.kenBurnsSections.size, 0);
    assert.equal(plan.elementMotion.size, 0);
  });

  test('히어로에 등장 모션 없음 (reveal/countup/mask 제외), ken-burns만', () => {
    const plan = resolveMotionPlan(cfg('cafe-basic', 'normal'));
    assert.equal(motionFor(plan, 'sec-hero', 'h1'), undefined);
    assert.equal(motionFor(plan, 'sec-hero', 'hi'), undefined);
    assert.ok(plan.kenBurnsSections.has('sec-hero'), 'ken-burns 히어로(배경 이미지) 누락');
  });

  test('scroll-reveal: 비히어로 요소 부여 + 스태거 delay', () => {
    const plan = resolveMotionPlan(cfg('cafe-basic', 'normal'));
    assert.equal(motionFor(plan, 'sec-a', 'a1'), 'reveal');
    assert.ok(plan.revealDelay.has('sec-a::a1'));
  });

  test('count-up: 통계 텍스트 ≤3, reveal 오버라이드 (academy-basic)', () => {
    const plan = resolveMotionPlan(cfg('academy-basic', 'normal'));
    assert.equal(countOf(plan, 'countup'), 3, 'count-up 페이지 상한(3) 클램프 실패');
    assert.equal(motionFor(plan, 'sec-a', 'a2'), 'countup'); // '98%'
    assert.equal(motionFor(plan, 'sec-a', 'a1'), 'reveal'); // 본문은 reveal
  });

  test('mask-reveal: office-basic(hero=mask) → 비히어로 이미지 ≤2, 히어로 미적용', () => {
    const plan = resolveMotionPlan(cfg('office-basic', 'normal'));
    assert.equal(countOf(plan, 'mask'), 2, 'mask 상한(2) 클램프 실패');
    assert.equal(plan.kenBurnsSections.has('sec-hero'), false, 'office는 ken-burns 아님');
    assert.equal(motionFor(plan, 'sec-hero', 'hi'), undefined, '히어로 이미지에 mask 적용됨(LCP 위반)');
  });

  test('미등록 프리셋 → ensureMotion 방어 (빈/무효도 유효 계획)', () => {
    const bad = { ...cfg('does-not-exist', 'normal'), motion: { presetId: 'does-not-exist', intensity: 'normal' as const } };
    const plan = resolveMotionPlan(bad);
    // ensureMotion → cafe-basic 기본 → ken-burns 히어로
    assert.ok(plan.kenBurnsSections.has('sec-hero'));
  });
});
