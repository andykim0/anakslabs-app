/**
 * [Q7] 움직임 고르기 — 레지스트리 무결성 + sanitize 강등 + plan 오버라이드 + Veo 컨셉 시드.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SiteConfig } from '@/lib/types/site';
import { emptySiteConfig } from '@/lib/types/site';
import { MOTION_TECHNIQUES } from '@/lib/motion/registry';
import { HERO_MOTION_CHOICES, heroChoicesForTier, isAllowedHeroChoice } from '@/lib/motion/hero-choice';
import { VIDEO_CONCEPTS, findVideoConcept, videoConceptsForGroup } from '@/lib/motion/video-concepts';
import { sanitizeMotion, applyGeneratedMotion } from '@/lib/motion/validate';
import { resolveMotionPlan } from '@/lib/motion/apply';
import { heroVideoContext, buildMotionPrompt } from '@/lib/ai/video-pipeline-core';

function cfgWith(motion: SiteConfig['motion']): SiteConfig {
  const base = emptySiteConfig('t');
  base.pages[0].sections = [
    {
      id: 'sec-hero',
      type: 'hero',
      name: '히어로',
      height: 800,
      background: { image: { src: '/h.jpg', overlayColor: '#0f0e0c', overlayOpacity: 0.6 } },
      elements: [],
    },
    {
      id: 'sec-about',
      type: 'about',
      name: '소개',
      height: 600,
      background: { color: '#111111' },
      elements: [
        { id: 'el-img', kind: 'image', frame: { x: 0, y: 0, w: 300, h: 200 }, z: 1, src: '/a.jpg', style: {} },
      ],
    },
  ];
  return { ...base, motion };
}

describe('HERO_MOTION_CHOICES 레지스트리', () => {
  test("모든 id가 MOTION_TECHNIQUES에 존재('none' 제외) + 티어 규칙 위반 없음", () => {
    for (const tier of ['basic', 'premium'] as const) {
      for (const c of HERO_MOTION_CHOICES[tier]) {
        if (c.id === 'none') continue;
        const spec = MOTION_TECHNIQUES[c.id];
        assert.ok(spec, `${c.id} 미등록 기법`);
        if (tier === 'basic') assert.equal(spec.tier, 'basic', `basic 목록에 premium 기법 ${c.id}`);
        assert.ok(c.label && c.description, `${c.id} 카피 누락`);
      }
    }
    // premium = basic 전체 + video-hero
    const basicIds: readonly string[] = HERO_MOTION_CHOICES.basic.map((c) => c.id);
    const premiumIds: readonly string[] = heroChoicesForTier('premium').map((c) => c.id);
    for (const id of basicIds) assert.ok(premiumIds.includes(id));
    assert.ok(premiumIds.includes('video-hero'));
    assert.ok(!basicIds.includes('video-hero'));
  });
});

describe('VIDEO_CONCEPTS 레지스트리', () => {
  test("4그룹×3컨셉, id 전역 유일, promptSeed에 '#' 없음(각인 아티팩트 방지)", () => {
    const all = Object.values(VIDEO_CONCEPTS).flat();
    assert.equal(all.length, 12);
    assert.equal(new Set(all.map((c) => c.id)).size, 12, 'id 중복');
    for (const group of ['sell', 'serve', 'promote', 'content'] as const) {
      assert.equal(videoConceptsForGroup(group).length, 3, group);
    }
    for (const c of all) {
      assert.ok(!c.promptSeed.includes('#'), `${c.id} promptSeed에 '#'`);
      assert.ok(c.label && c.description && c.promptSeed);
    }
  });
});

describe('sanitizeMotion — heroTechnique/videoConceptId 이중 방벽', () => {
  test('basic이 video-hero를 보내면 강등 + changes[]', () => {
    const { config, changes } = sanitizeMotion(
      cfgWith({ presetId: 'cafe-basic', intensity: 'normal', heroTechnique: 'video-hero' }),
      'basic',
    );
    assert.equal(config.motion?.heroTechnique, undefined, '강등 안 됨');
    assert.ok(changes.some((c) => c.includes('히어로 모션')), changes.join(' / '));
  });
  test('premium의 video-hero 선택은 보존', () => {
    const { config, changes } = sanitizeMotion(
      cfgWith({ presetId: 'dining-premium', intensity: 'normal', heroTechnique: 'video-hero' }),
      'premium',
    );
    assert.equal(config.motion?.heroTechnique, 'video-hero');
    assert.equal(changes.length, 0);
  });
  test("'none'은 양 티어 모두 허용", () => {
    for (const tier of ['basic', 'premium'] as const) {
      assert.ok(isAllowedHeroChoice(tier, 'none'));
    }
  });
  test('미등록 heroTechnique·videoConceptId 제거 + basic의 영상 컨셉 제거', () => {
    const { config, changes } = sanitizeMotion(
      cfgWith({ presetId: 'cafe-basic', intensity: 'normal', heroTechnique: 'flying-cats', videoConceptId: 'space-mood' }),
      'basic',
    );
    assert.equal(config.motion?.heroTechnique, undefined);
    assert.equal(config.motion?.videoConceptId, undefined);
    assert.ok(changes.length >= 2);
  });
});

describe('resolveMotionPlan — heroTechnique 오버라이드', () => {
  test("'none' → 히어로 모션 없음(ken-burns 미부착)", () => {
    const plan = resolveMotionPlan(cfgWith({ presetId: 'cafe-basic', intensity: 'normal', heroTechnique: 'none' }));
    assert.equal(plan.kenBurnsSections.size, 0);
    assert.equal(plan.videoHeroSections.size, 0);
  });
  test('미설정 → 프리셋 기본 히어로(cafe-basic=ken-burns)', () => {
    const plan = resolveMotionPlan(cfgWith({ presetId: 'cafe-basic', intensity: 'normal' }));
    assert.ok(plan.kenBurnsSections.has('sec-hero'));
  });
  test("'mask-reveal' 선택 → ken-burns 대신 비히어로 이미지 mask", () => {
    const plan = resolveMotionPlan(cfgWith({ presetId: 'cafe-basic', intensity: 'normal', heroTechnique: 'mask-reveal' }));
    assert.equal(plan.kenBurnsSections.size, 0);
    assert.equal(plan.elementMotion.get('sec-about::el-img') ?? plan.elementMotion.get('sec-about:el-img'), 'mask');
  });
});

describe('applyGeneratedMotion — 선택 병합 순서(프리셋 주입 → 병합 → sanitize)', () => {
  test('선택이 config에 반영(잔잔하게 + none)', () => {
    const out = applyGeneratedMotion(cfgWith(undefined), 'local_store', 'basic', {
      heroTechnique: 'none',
      intensity: 'subtle',
    });
    assert.equal(out.motion?.presetId, 'cafe-basic');
    assert.equal(out.motion?.intensity, 'subtle');
    assert.equal(out.motion?.heroTechnique, 'none');
  });
  test('choice 미전달 = 기존과 동일(무회귀)', () => {
    const out = applyGeneratedMotion(cfgWith(undefined), 'local_store', 'basic');
    assert.equal(out.motion?.intensity, 'normal');
    assert.equal(out.motion?.heroTechnique, undefined);
  });
});

describe('Veo — videoConceptId → promptSeed 소비', () => {
  test('컨셉 선택 시 heroVideoContext.povMood = promptSeed, 프롬프트에 포함', () => {
    const cfg = cfgWith({ presetId: 'dining-premium', intensity: 'normal', heroTechnique: 'video-hero', videoConceptId: 'space-mood' });
    const ctx = heroVideoContext(cfg);
    assert.ok(ctx, 'ctx null');
    const seed = findVideoConcept('space-mood')!.promptSeed;
    assert.equal(ctx!.povMood, seed);
    assert.ok(buildMotionPrompt(ctx!.povMood, ctx!.subject).includes(seed));
  });
  test('컨셉 없으면 팔레트 폴백(무회귀)', () => {
    const ctx = heroVideoContext(cfgWith({ presetId: 'dining-premium', intensity: 'normal' }));
    assert.ok(ctx!.povMood.length > 0);
  });
});
