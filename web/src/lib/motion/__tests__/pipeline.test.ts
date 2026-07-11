/**
 * [motion-system] 생성 파이프라인 방벽 테스트 — 할루시네이션의 급소.
 * LLM이 무엇을 뱉든 최종 config.motion은 업종+플랜 매핑 프리셋(유효)이어야 한다.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGeneratedMotion, ensureMotion } from '@/lib/motion/validate';
import { resolvePresetForIndustry, MOTION_PRESETS, DEFAULT_PRESET, isPresetId, type PresetId } from '@/lib/motion/presets';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';
import { PURPOSES } from '@/lib/data/purpose-taxonomy';

const base = (): SiteConfig => emptySiteConfig('테스트');

describe('applyGeneratedMotion (LLM 방벽)', () => {
  test('LLM이 금지 기법을 motion에 주입해도 최종 config는 업종 매핑 프리셋', () => {
    // LLM 출력 오염 시뮬레이션
    const polluted = { ...base(), motion: { presetId: 'webgl-shader', intensity: 'normal' as const } };
    const out = applyGeneratedMotion(polluted, 'local_store', 'premium');
    assert.equal(out.motion?.presetId, resolvePresetForIndustry('local_store', 'premium'));
    assert.equal(out.motion?.presetId, 'dining-premium');
    assert.ok(isPresetId(out.motion!.presetId));
  });

  test('motion 없는 생성물에도 항상 유효 motion 주입 + 전 업종×플랜 tier 일치', () => {
    for (const p of PURPOSES) {
      for (const tier of ['basic', 'premium'] as const) {
        const out = applyGeneratedMotion(base(), p.id, tier);
        assert.ok(out.motion, `${p.id}/${tier}: motion 없음`);
        const pid = out.motion!.presetId as PresetId;
        assert.ok(isPresetId(pid), `${p.id}/${tier}: '${pid}' 무효`);
        assert.equal(MOTION_PRESETS[pid].tier, tier, `${p.id}/${tier}: tier 불일치`);
        assert.equal(out.motion!.intensity, 'normal');
      }
    }
  });

  test('basic 플랜은 premium 매핑이어도 basic 프리셋으로 귀결', () => {
    // dining_premium은 local_store premium 매핑 — basic 플랜이면 강등되어 premium 프리셋이 나오면 안 됨
    const out = applyGeneratedMotion(base(), 'local_store', 'basic');
    assert.equal(MOTION_PRESETS[out.motion!.presetId as PresetId].tier, 'basic');
  });
});

describe('ensureMotion (읽기 마이그레이션)', () => {
  test('motion 없는 레거시 config → 기본 프리셋 주입', () => {
    const out = ensureMotion(base());
    assert.equal(out.motion?.presetId, DEFAULT_PRESET.basic);
    assert.equal(out.motion?.intensity, 'normal');
  });

  test('유효 motion 보유 config → 그대로 (불변)', () => {
    const c = { ...base(), motion: { presetId: 'clinic-premium', intensity: 'subtle' as const } };
    const out = ensureMotion(c);
    assert.equal(out.motion?.presetId, 'clinic-premium');
    assert.equal(out.motion?.intensity, 'subtle');
  });

  test('미등록 presetId 보유 config → 기본 프리셋으로 교정', () => {
    const c = { ...base(), motion: { presetId: 'does-not-exist', intensity: 'normal' as const } };
    const out = ensureMotion(c);
    assert.equal(out.motion?.presetId, DEFAULT_PRESET.basic);
  });
});
