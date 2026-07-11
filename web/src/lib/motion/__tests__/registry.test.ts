/**
 * [motion-system] 불변식 테스트 = 문서의 대체물. 규칙을 코드가 강제함을 증명한다.
 * 러너: node:test + tsx (npm test).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOTION_TECHNIQUES,
  FORBIDDEN_TECHNIQUES,
  MOTION_LIMITS,
  type TechniqueId,
} from '@/lib/motion/registry';
import {
  MOTION_PRESETS,
  DEFAULT_PRESET,
  resolvePresetForIndustry,
  isPresetId,
  type PresetId,
} from '@/lib/motion/presets';
import { sanitizeMotion } from '@/lib/motion/validate';
import { emptySiteConfig } from '@/lib/types/site';
import { PURPOSES } from '@/lib/data/purpose-taxonomy';

const techIds = Object.keys(MOTION_TECHNIQUES) as TechniqueId[];
const presetIds = Object.keys(MOTION_PRESETS) as PresetId[];

describe('registry', () => {
  test('premium 기법 전부 basicFallback 보유 + 실존 basic + 순환 없음', () => {
    for (const id of techIds) {
      const spec = MOTION_TECHNIQUES[id];
      if (spec.tier !== 'premium') continue;
      const fb = (spec as { basicFallback?: string }).basicFallback;
      assert.ok(fb, `${id}: premium인데 basicFallback 없음`);
      assert.ok(fb! in MOTION_TECHNIQUES, `${id}.basicFallback '${fb}' 미존재`);
      assert.equal(MOTION_TECHNIQUES[fb as TechniqueId].tier, 'basic', `${id}.basicFallback '${fb}'가 basic 아님(순환 방지)`);
    }
  });

  test('basic 기법은 basicFallback 미보유', () => {
    for (const id of techIds) {
      const spec = MOTION_TECHNIQUES[id];
      if (spec.tier === 'basic') {
        assert.equal((spec as { basicFallback?: string }).basicFallback, undefined, `${id}: basic인데 basicFallback 있음`);
      }
    }
  });

  test('FORBIDDEN ∩ registry = 공집합', () => {
    for (const f of FORBIDDEN_TECHNIQUES) {
      assert.ok(!(f in MOTION_TECHNIQUES), `금지 기법 '${f}'가 레지스트리에 존재`);
    }
  });
});

describe('presets', () => {
  test('전 프리셋 hero/sections/accents가 registry 실존', () => {
    for (const pid of presetIds) {
      const p = MOTION_PRESETS[pid];
      for (const t of [p.hero, p.sections, ...p.accents]) {
        assert.ok(t in MOTION_TECHNIQUES, `${pid}: 기법 '${t}' 미존재`);
      }
    }
  });

  test('basic 프리셋에 premium 기법 없음', () => {
    for (const pid of presetIds) {
      const p = MOTION_PRESETS[pid];
      if (p.tier !== 'basic') continue;
      for (const t of [p.hero, p.sections, ...p.accents]) {
        assert.equal(MOTION_TECHNIQUES[t].tier, 'basic', `basic 프리셋 ${pid}에 premium 기법 '${t}'`);
      }
    }
  });

  test('전 프리셋 MOTION_LIMITS·maxPerPage 자체 위반 없음', () => {
    for (const pid of presetIds) {
      const p = MOTION_PRESETS[pid];
      const used = [p.hero, p.sections, ...p.accents];
      const inf = used.filter((t) => MOTION_TECHNIQUES[t].infinite).length;
      const sig = used.filter((t) => MOTION_TECHNIQUES[t].weight === 'medium').length;
      assert.ok(inf <= MOTION_LIMITS.maxInfinitePerPage, `${pid}: 무한 ${inf} > ${MOTION_LIMITS.maxInfinitePerPage}`);
      assert.ok(sig <= MOTION_LIMITS.maxSignaturePerPage, `${pid}: 시그니처 ${sig} > ${MOTION_LIMITS.maxSignaturePerPage}`);
      const counts = new Map<TechniqueId, number>();
      for (const t of used) counts.set(t, (counts.get(t) ?? 0) + 1);
      for (const [t, c] of counts) {
        assert.ok(c <= MOTION_TECHNIQUES[t].maxPerPage, `${pid}: '${t}' ${c}회 > maxPerPage ${MOTION_TECHNIQUES[t].maxPerPage}`);
      }
    }
  });

  test('resolvePresetForIndustry: 전 업종(taxonomy) → 유효 프리셋 + tier 일치', () => {
    for (const purpose of PURPOSES) {
      for (const tier of ['basic', 'premium'] as const) {
        const pid = resolvePresetForIndustry(purpose.id, tier);
        assert.ok(isPresetId(pid), `${purpose.id}/${tier} → '${pid}' 무효 프리셋`);
        assert.equal(MOTION_PRESETS[pid].tier, tier, `${purpose.id}/${tier} → '${pid}' tier 불일치`);
      }
    }
  });
});

describe('sanitizeMotion', () => {
  const base = () => emptySiteConfig('테스트');

  test('금지/미등록 주입 → 기본 프리셋 치환 + changes + 원본 불변', () => {
    const input = { ...base(), motion: { presetId: 'webgl-shader', intensity: 'normal' as const } };
    const { config, changes } = sanitizeMotion(input, 'premium');
    assert.equal(config.motion?.presetId, DEFAULT_PRESET.premium);
    assert.ok(changes.length >= 1, 'changes 기록 없음');
    assert.deepEqual(input.motion, { presetId: 'webgl-shader', intensity: 'normal' }, '원본 mutate됨');
  });

  test('basic 플랜 + premium 프리셋 → 강등(매핑 정확성)', () => {
    const cases: [PresetId, PresetId][] = [
      ['clinic-premium', 'office-basic'],
      ['dining-premium', 'cafe-basic'],
      ['beauty-premium', 'cafe-basic'],
    ];
    for (const [from, to] of cases) {
      const { config, changes } = sanitizeMotion({ ...base(), motion: { presetId: from, intensity: 'normal' } }, 'basic');
      assert.equal(config.motion?.presetId, to, `${from} → ${to} 강등 실패`);
      assert.ok(changes.some((m) => m.includes(from) && m.includes(to)), `강등 changes 문구 누락(${from}→${to})`);
    }
  });

  test('유효 입력 → 무변경(changes 빈 배열)', () => {
    const { config, changes } = sanitizeMotion({ ...base(), motion: { presetId: 'clinic-premium', intensity: 'subtle' } }, 'premium');
    assert.equal(changes.length, 0, `불필요한 changes: ${changes.join(' / ')}`);
    assert.equal(config.motion?.presetId, 'clinic-premium');
    assert.equal(config.motion?.intensity, 'subtle');
  });
});
