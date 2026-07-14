import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPOSITE_SIGNATURES,
  MOTION_LIMITS,
  MOTION_TECHNIQUES,
  countMotionSignatures,
} from '@/lib/motion/registry';
import { MOTION_PRESETS } from '@/lib/motion/presets';
import { applyGeneratedMotion, sanitizeMotion } from '@/lib/motion/validate';
import { emptySiteConfig } from '@/lib/types/site';

describe('V1 — cinematic-hero 합성 시그니처', () => {
  test('네 구성 기법이 모두 등록되고 합성 전체를 시그니처 1개로 센다', () => {
    const composite = COMPOSITE_SIGNATURES['cinematic-hero'];
    for (const child of composite.techniques) {
      assert.ok(child in MOTION_TECHNIQUES, `미등록 구성 기법: ${child}`);
    }
    assert.equal(countMotionSignatures(composite.techniques, 'cinematic-hero'), 1);
    assert.ok(countMotionSignatures(composite.techniques, 'cinematic-hero') <= MOTION_LIMITS.maxSignaturePerPage);
    assert.equal(
      countMotionSignatures(composite.techniques.filter((id) => id !== 'parallax'), 'cinematic-hero'),
      2,
      '구성 누락인데 합성 예산 혜택을 받으면 안 됨',
    );
    assert.equal(
      countMotionSignatures([...composite.techniques, 'scroll-scrub'], 'cinematic-hero'),
      2,
      '추가 medium 기법은 별도 시그니처로 세야 함',
    );
  });

  test('cinematic-hero 프리셋은 합성 구성을 페이지 유일 시그니처로 쓴다', () => {
    const preset = MOTION_PRESETS['cinematic-hero'];
    assert.equal(preset.hero, 'video-hero');
    assert.deepEqual(preset.accents, ['scroll-scrub', 'split-text', 'parallax']);
    assert.equal(countMotionSignatures([preset.hero, preset.sections, ...preset.accents], preset.composite), 1);
  });

  test('애드온 보유는 cinematic-hero 프리셋을 보존하고 미보유는 ken-burns 프리셋 + changes로 강등한다', () => {
    const base = emptySiteConfig('시네마틱 테스트');
    const input = {
      ...base,
      motion: {
        presetId: 'cinematic-hero',
        intensity: 'normal' as const,
        heroTechnique: 'video-hero',
        videoConceptId: 'signature-closeup',
        videoRequested: true,
      },
    };

    const owned = sanitizeMotion(input, 'premium');
    assert.equal(owned.config.motion?.presetId, 'cinematic-hero');
    assert.equal(owned.config.motion?.heroTechnique, 'video-hero');
    assert.equal(owned.changes.length, 0);

    const unowned = sanitizeMotion(input, 'basic');
    assert.equal(unowned.config.motion?.presetId, 'cafe-basic');
    assert.equal(unowned.config.motion?.heroTechnique, undefined);
    assert.equal(unowned.config.motion?.videoConceptId, undefined);
    assert.equal(unowned.config.motion?.videoRequested, true, '요청 표식은 강등 후에도 남아야 함');
    assert.equal(MOTION_PRESETS[unowned.config.motion!.presetId].hero, 'ken-burns');
    assert.ok(unowned.changes.some((change) =>
      change.includes('영상 애드온') && change.includes('cinematic-hero') && change.includes('ken-burns')),
    );
  });

  test('영상 선택은 애드온 보유 시 cinematic-hero 프리셋으로 기록된다', () => {
    const config = applyGeneratedMotion(emptySiteConfig('시네마틱 선택'), 'local_store', 'premium', {
      heroTechnique: 'video-hero',
      intensity: 'normal',
      videoConceptId: 'signature-closeup',
    });
    assert.equal(config.motion?.videoRequested, true);
    assert.equal(config.motion?.presetId, 'cinematic-hero');
    assert.equal(config.motion?.heroTechnique, 'video-hero');
  });

  test('미보유 영상 선택도 합성 프리셋 강등 경로를 거쳐 요청 표식과 안내를 보존한다', () => {
    const selected = applyGeneratedMotion(emptySiteConfig('미보유 선택'), 'local_store', 'basic', {
      heroTechnique: 'video-hero',
      intensity: 'normal',
      videoConceptId: 'signature-closeup',
    });
    assert.equal(selected.motion?.presetId, 'cafe-basic');
    assert.equal(selected.motion?.videoRequested, true);
    assert.equal(MOTION_PRESETS[selected.motion!.presetId].hero, 'ken-burns');
  });
});
