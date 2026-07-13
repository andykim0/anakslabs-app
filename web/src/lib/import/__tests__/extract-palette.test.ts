/**
 * [I3] 기존 사이트 팔레트 추출 → 시드 — 대표색 선정 + derivePalette AA + 저채도 폴백.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { extractSitePalette, parseColorsFromCss, pickRepresentativePalette } from '@/lib/import/extract-palette';
import { contrastRatio, derivePalette, hexToHsl } from '@/lib/design/quality-standards';

describe('parseColorsFromCss', () => {
  test('hex(3·6자리)·rgb() 추출 + 정규화 + 중복 제거', () => {
    const html = '<style>.a{color:#C8A96A;background:#161513}.b{color:#c8a96a}</style><div style="border:1px solid rgb(46,99,240)">x</div>';
    const colors = parseColorsFromCss(html);
    assert.ok(colors.includes('#c8a96a'));
    assert.ok(colors.includes('#161513'));
    assert.ok(colors.includes('#2e63f0')); // rgb→hex
    assert.equal(colors.filter((c) => c === '#c8a96a').length, 1, '중복 제거');
  });
  test('3자리 hex 확장', () => {
    assert.ok(parseColorsFromCss('<i style="color:#f80">x</i>').includes('#ff8800'));
  });
});

describe('pickRepresentativePalette', () => {
  test('채도 높은 색 = primary, hue 떨어진 색 = secondary', () => {
    const seed = pickRepresentativePalette(['#ffffff', '#161513', '#c8a96a', '#2e63f0', '#888888']);
    assert.ok(seed, '시드 없음');
    // 골드(#c8a96a s~0.45)와 블루(#2e63f0 s~0.88) 중 채도 높은 블루가 primary
    assert.equal(seed!.primary, '#2e63f0');
    assert.ok(seed!.secondary && hexToHsl(seed!.secondary)!.s >= 0.18);
  });
  test('회색/흑백만 있으면 null(뉴트럴 폴백 유도)', () => {
    assert.equal(pickRepresentativePalette(['#ffffff', '#000000', '#888888', '#eeeeee', '#333333']), null);
  });
  test('단색이면 secondary 없이 primary만', () => {
    const seed = pickRepresentativePalette(['#ffffff', '#c8a96a', '#f0f0f0']);
    assert.equal(seed!.primary, '#c8a96a');
    assert.equal(seed!.secondary, undefined);
  });
});

describe('추출 시드 → derivePalette AA 보장', () => {
  test('여러 추출 시드가 derivePalette에서 본문 AA 성립', () => {
    const htmls = [
      '<style>a{color:#c8a96a}b{background:#161513}c{color:#8a6d3b}</style>',
      '<div style="color:rgb(46,99,240);background:#f6f7f9">x</div>',
      '<style>.x{color:#2e7d32}.y{color:#b71c1c}</style>',
    ];
    for (const html of htmls) {
      const seed = extractSitePalette(html);
      assert.ok(seed, `추출 실패: ${html}`);
      for (const dark of [false, true]) {
        const p = derivePalette(seed!.primary, seed!.secondary, { dark });
        assert.ok(contrastRatio(p.text, p.background) >= 4.5, `AA 미달 ${seed!.primary}/${dark}`);
      }
    }
  });
  test('저채도 사이트 → null → 호출부 뉴트럴 폴백', () => {
    assert.equal(extractSitePalette('<style>a{color:#333;background:#fff}</style>'), null);
  });
});
