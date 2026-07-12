/**
 * [v4 #2c] COLOR_FAMILIES — 8계열×5단=40 hex 유효·중복 없음.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { COLOR_FAMILIES } from '@/lib/onboarding/color-families';

describe('COLOR_FAMILIES', () => {
  test('8계열, 각 5단, id 유일', () => {
    assert.equal(COLOR_FAMILIES.length, 8);
    assert.equal(new Set(COLOR_FAMILIES.map((f) => f.id)).size, 8);
    for (const f of COLOR_FAMILIES) {
      assert.equal(f.shades.length, 5, `${f.id} 5단`);
      assert.ok(f.label);
    }
  });

  test('40개 hex 전부 유효(#rrggbb)·중복 없음', () => {
    const all = COLOR_FAMILIES.flatMap((f) => f.shades);
    assert.equal(all.length, 40);
    for (const hex of all) assert.match(hex, /^#[0-9a-f]{6}$/i, `무효 hex: ${hex}`);
    assert.equal(new Set(all.map((h) => h.toLowerCase())).size, 40, '중복 hex 존재');
  });

  test('각 계열은 밝은→어두운 (relative luminance 단조 감소)', () => {
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    };
    for (const f of COLOR_FAMILIES) {
      for (let i = 1; i < f.shades.length; i++) {
        assert.ok(lum(f.shades[i]) < lum(f.shades[i - 1]), `${f.id}: ${f.shades[i - 1]}→${f.shades[i]} 밝기 역전`);
      }
    }
  });
});
