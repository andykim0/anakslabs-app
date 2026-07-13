/**
 * [R1] 팔레트 라이브러리 불변식 — ≥24 · id 유일 · seed hex 유효 · 전 항목 derivePalette 6토큰 + 본문 AA(4.5:1).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE_LIBRARY, derivedPaletteFor, paletteEntryById, palettesForIndustry } from '@/lib/design/palette-library';
import { contrastRatio } from '@/lib/design/quality-standards';

const HEX = /^#[0-9a-fA-F]{6}$/;

describe('R1 — 팔레트 라이브러리', () => {
  test('≥24개 + id 유일', () => {
    assert.ok(PALETTE_LIBRARY.length >= 24, `팔레트 ${PALETTE_LIBRARY.length}개 (<24)`);
    const ids = PALETTE_LIBRARY.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, 'id 중복');
  });

  test('전 항목: seed hex 유효 + label(한국어)·tone 보유', () => {
    for (const e of PALETTE_LIBRARY) {
      assert.match(e.seed.primary, HEX, `${e.id} primary hex 무효`);
      if (e.seed.secondary) assert.match(e.seed.secondary, HEX, `${e.id} secondary hex 무효`);
      assert.ok(e.label.length > 0, `${e.id} label 없음`);
      assert.ok(e.tone.length > 0, `${e.id} tone 없음`);
    }
  });

  test('전 항목: derivePalette 6토큰 + 본문 AA 4.5:1', () => {
    for (const e of PALETTE_LIBRARY) {
      const p = derivedPaletteFor(e);
      for (const k of ['background', 'surface', 'text', 'muted', 'primary', 'accent'] as const) {
        assert.match(p[k], HEX, `${e.id} ${k} 토큰 무효`);
      }
      assert.ok(contrastRatio(p.text, p.background) >= 4.5, `${e.id} 본문 AA 미달 (${p.text} on ${p.background})`);
    }
  });

  test('대표 스와치 = 파생 색과 정합(WYSIWYG)', () => {
    for (const e of PALETTE_LIBRARY) {
      const p = derivedPaletteFor(e);
      assert.deepEqual(e.swatch, [p.primary, p.background, p.surface, p.text], `${e.id} 스와치 불일치`);
    }
  });

  test('조회·업종 정렬 헬퍼', () => {
    const first = PALETTE_LIBRARY[0];
    assert.equal(paletteEntryById(first.id)?.id, first.id);
    assert.equal(paletteEntryById('__none__'), undefined);
    // 업종 정렬은 전 항목 보존(정렬만)
    assert.equal(palettesForIndustry('카페').length, PALETTE_LIBRARY.length);
  });
});
