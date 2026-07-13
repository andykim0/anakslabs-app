/**
 * [R5] 갤러리 선택 → 결정적 생성 배선 — 선택(referenceDesignId)이 뼈대(히어로 형태)를 고정하고,
 * 팔레트는 colorPreference(항목 시드)로 흐른다. 미선택은 후보별 폴백(무회귀).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { REFERENCE_GALLERY, galleryById, heroVariantForSurvey, surveyInputsForDesign } from '@/lib/design/reference-gallery';
import { skeletonById, skeletonForCandidate } from '@/lib/data/skeletons';
import { paletteEntryById } from '@/lib/design/palette-library';

describe('R5 — 선택 배선', () => {
  test('선택 있으면 뼈대(히어로 형태)를 고정 — 후보 id와 무관', () => {
    const design = REFERENCE_GALLERY.find((d) => skeletonById(d.skeletonId)!.heroVariant === 'split')!;
    const expected = skeletonById(design.skeletonId)!.heroVariant;
    for (const cand of ['cand-a', 'cand-b', 'cand-warm-cozy']) {
      assert.equal(heroVariantForSurvey(design.id, design.purpose, cand), expected, '선택이 히어로 형태를 고정 안 함');
    }
  });

  test('선택 없으면 후보별 결정적 폴백(무회귀)', () => {
    const hv = heroVariantForSurvey(undefined, 'local_store', 'cand-warm-cozy');
    assert.equal(hv, skeletonForCandidate('local_store', 'cand-warm-cozy').heroVariant);
  });

  test('미지 선택 id는 폴백(방어)', () => {
    const hv = heroVariantForSurvey('__nope__', 'local_store', 'cand-x');
    assert.equal(hv, skeletonForCandidate('local_store', 'cand-x').heroVariant);
  });

  test('surveyInputsForDesign — colorPreference=팔레트 시드 primary + 선택 id', () => {
    const design = REFERENCE_GALLERY[0];
    const pal = paletteEntryById(design.paletteId)!;
    const inputs = surveyInputsForDesign(design);
    assert.equal(inputs.colorPreference, pal.seed.primary);
    assert.equal(inputs.referenceDesignId, design.id);
    if (pal.seed.secondary) assert.equal(inputs.secondaryColor, pal.seed.secondary);
    assert.ok(galleryById(design.id));
  });
});
