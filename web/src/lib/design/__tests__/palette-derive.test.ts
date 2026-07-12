/**
 * [F3 #6] derivePalette — 메인 1색(+보조) → 6토큰, 본문 AA 보장, 결정적.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { derivePalette, contrastRatio, validatePalette } from '@/lib/design/quality-standards';

describe('derivePalette', () => {
  test('6토큰을 모두 유효 hex로 산출', () => {
    const p = derivePalette('#2d63f0');
    for (const k of ['background', 'surface', 'text', 'muted', 'primary', 'accent'] as const) {
      assert.match(p[k], /^#[0-9a-f]{6}$/i, `${k}=${p[k]}`);
    }
    assert.equal(p.primary, '#2d63f0', 'primary=메인색 그대로');
  });

  test('본문 text/background 대비 AA(4.5:1) 보장 — 라이트/다크 모두', () => {
    for (const hex of ['#2d63f0', '#c05a3a', '#1f4d3a', '#6d2231', '#111111', '#ece6d8']) {
      const light = derivePalette(hex, undefined, { dark: false });
      assert.ok(contrastRatio(light.text, light.background) >= 4.5, `light ${hex}`);
      const dark = derivePalette(hex, undefined, { dark: true });
      assert.ok(contrastRatio(dark.text, dark.background) >= 4.5, `dark ${hex}`);
    }
  });

  test('브랜드 5색 절제(validatePalette) 통과', () => {
    const p = derivePalette('#157a72', '#c99a2e', { dark: false });
    const r = validatePalette([p.primary, p.accent, p.background, p.surface, p.muted], {
      text: p.text,
      background: p.background,
    });
    assert.ok(r.ok, r.error);
  });

  test('보조색 지정 시 accent = 보조색', () => {
    const p = derivePalette('#2d63f0', '#ff5a3c');
    assert.equal(p.accent, '#ff5a3c');
  });

  test('결정적 — 같은 입력 = 같은 출력', () => {
    assert.deepEqual(derivePalette('#2d63f0', '#ff5a3c', { dark: true }), derivePalette('#2d63f0', '#ff5a3c', { dark: true }));
  });
});
