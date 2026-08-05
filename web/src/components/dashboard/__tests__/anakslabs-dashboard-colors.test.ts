import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

/** 마케팅 아이덴티티: --bg #F6F7F9 · --ink #141A3A · --line-2 #DFE1E6 · --blue #2D63F0. */
const BRAND = ['#F6F7F9', '#141A3A', '#DFE1E6', '#2D63F0'] as const;

describe('Anaks Labs 대시보드 색상 불변조건', () => {
  test('공통 셸은 라이트 로고와 마케팅 bg/ink/blue 앱 크롬을 사용한다', () => {
    const shell = read('src/components/dashboard/shell.tsx');
    for (const color of BRAND) {
      assert.ok(shell.includes(color), `대시보드 셸의 ${color} 신호색 누락`);
    }
    assert.match(shell, /<BrandLogo \/>/);
    assert.doesNotMatch(shell, /<BrandLogo inverse/);
    assert.doesNotMatch(shell, /bg-neutral-950|#(?:c8a96a|d9b878|2a2117|4a3a22)/i);
    // 이전 리브랜딩의 ice-white/navy/옛 파랑도 회귀다.
    assert.doesNotMatch(shell, /#(?:f8fbff|0b1736|dce4f0|174dda)/i);
  });

  test('이전 페이지 유틸리티는 대시보드에서만 마케팅 팔레트로 재매핑한다', () => {
    const shell = read('src/components/dashboard/shell.tsx');
    const theme = read('src/components/dashboard/dashboard-theme.module.css');

    assert.match(shell, /pathname\.startsWith\('\/dashboard'\)/);
    assert.match(shell, /!pathname\.endsWith\('\/editor'\)/);
    assert.match(shell, /styles\.theme/);
    for (const color of ['#f6f7f9', '#141a3a', '#2d63f0', '#eaeffe']) {
      assert.ok(theme.includes(color), `대시보드 브리지의 ${color} 누락`);
    }
    assert.doesNotMatch(theme, /#8492a6/i);
    assert.doesNotMatch(theme, /#(?:f8fbff|0b1736|dce4f0|174dda|edf4ff)/i);
    // 브리지는 옛 골드/뉴트럴 유틸리티를 키로 삼는다 — 키는 지우면 안 된다.
    assert.match(theme, /bg-neutral-950/);
    assert.match(theme, /bg-\[\#c8a96a\]/);
  });

  test('공통 카드·버튼·배지는 dark surface와 gold CTA를 복원하지 않는다', () => {
    const ui = read('src/components/dashboard/ui.tsx');
    assert.match(ui, /bg-\[#2D63F0\] text-white/);
    assert.match(ui, /border-\[#DFE1E6\] bg-white/);
    assert.doesNotMatch(ui, /bg-neutral-9(?:00|50)|#(?:c8a96a|d9b878|2a2117|4a3a22)/i);
    assert.doesNotMatch(ui, /#(?:f8fbff|0b1736|dce4f0|174dda)/i);
  });
});
