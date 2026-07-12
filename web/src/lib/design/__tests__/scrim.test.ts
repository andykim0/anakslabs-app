/**
 * [Q1] 스크림 — 이미지 배경 위 텍스트 AA 보장(최악 배경 가정).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { minOverlayOpacityForAA, resolveScrim, scrimPassesAA } from '@/lib/design/scrim';
import { derivePalette } from '@/lib/design/quality-standards';
import { REFERENCE_SAMPLES } from '@/lib/design/reference-samples';

describe('minOverlayOpacityForAA', () => {
  test('밝은 크림 스크림 + 어두운 텍스트는 0.45보다 큰 opacity 요구 (이번 결함 회귀)', () => {
    const op = minOverlayOpacityForAA('#F6F1E7', '#3B2A24');
    assert.ok(op !== null && op > 0.45, `op=${op} (0.45 이하면 카피가 안 읽히는 결함 재현)`);
  });
  test('충분히 대비되는 오버레이는 낮은 opacity로 충족', () => {
    // 검정 오버레이 + 흰 텍스트 → 낮은 opacity로도 AA
    const op = minOverlayOpacityForAA('#000000', '#ffffff');
    assert.ok(op !== null && op < 0.6);
  });
  test('오버레이색 자체가 텍스트와 AA 미달이면 null', () => {
    // 회색 오버레이 + 회색 텍스트 → opacity 1.0(=오버레이색)에서도 AA 불가
    assert.equal(minOverlayOpacityForAA('#888888', '#999999'), null);
  });
});

describe('resolveScrim — 항상 AA 성립', () => {
  test('derivePalette 시드(12무드 × 다크/라이트) 전부 resolveScrim 결과가 AA', () => {
    for (const s of REFERENCE_SAMPLES) {
      for (const dark of [false, true]) {
        const palette = derivePalette(s.paletteSeed.primary, s.paletteSeed.secondary, { dark });
        const scrim = resolveScrim(palette);
        assert.ok(
          scrimPassesAA(scrim.overlayColor, scrim.overlayOpacity, scrim.textColor),
          `${s.id}/${dark ? 'dark' : 'light'}: 스크림 AA 미달 (op=${scrim.overlayOpacity})`,
        );
        assert.ok(scrim.overlayOpacity > 0 && scrim.overlayOpacity <= 1);
      }
    }
  });
});

describe('scrimPassesAA', () => {
  test('약한 라이트 오버레이(0.25)는 어두운 텍스트에 대해 실패', () => {
    assert.equal(scrimPassesAA('#F6F1E7', 0.25, '#3B2A24'), false);
  });
  test('resolveScrim이 낸 opacity면 통과', () => {
    const scrim = resolveScrim(derivePalette('#c98a5e', '#f7ede2', { dark: false }));
    assert.ok(scrimPassesAA(scrim.overlayColor, scrim.overlayOpacity, scrim.textColor));
  });
});
