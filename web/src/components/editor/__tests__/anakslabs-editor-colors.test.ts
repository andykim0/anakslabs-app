import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

function readSourceTree(path: string): string {
  const absolute = join(root, path);
  return readdirSync(absolute)
    .flatMap((name) => {
      const child = join(absolute, name);
      if (statSync(child).isDirectory()) return name === '__tests__' ? [] : readSourceTree(join(path, name));
      return name.endsWith('.tsx') ? readFileSync(child, 'utf8') : [];
    })
    .join('\n');
}

/** 마케팅 아이덴티티: --bg #F6F7F9 · --ink #141A3A · --line-2 #DFE1E6 · --blue #2D63F0. */
const BRAND = ['#F6F7F9', '#141A3A', '#DFE1E6', '#2D63F0'] as const;

describe('Anaks Labs 에디터·운영 셸 색상 불변조건', () => {
  test('에디터 크롬은 마케팅 bg/ink/blue이고 이전 dark/gold 앱 표면을 쓰지 않는다', () => {
    const editor = readSourceTree('src/components/editor');
    const shell = read('src/components/editor/EditorShell.tsx');

    for (const color of BRAND) {
      assert.ok(editor.includes(color), `에디터의 ${color} 브랜드 색상 누락`);
    }
    assert.match(shell, /bg-\[\#F6F7F9\].*text-\[\#141A3A\]/);
    assert.doesNotMatch(
      editor,
      /bg-neutral-(?:950|900)|#(?:c8a96a|d9bc82|d9b878|2a2117|4a3a22|151310|8a95a6)/i,
    );
    // 이전 리브랜딩의 ice-white/navy/옛 파랑·청록도 회귀다.
    assert.doesNotMatch(editor, /#(?:f8fbff|0b1736|dce4f0|174dda|123fb7|08afc5|03bfa9)/i);
  });

  test('캔버스 작업대만 밝게 바꾸고 고객 사이트 프레임은 독립적으로 유지한다', () => {
    const canvas = read('src/components/editor/CanvasStage.tsx');
    assert.match(canvas, /bg-\[\#E8EEF7\]/);
    assert.match(canvas, /bg-black shadow-2xl/);
  });

  test('전역 기본값과 관리자 셸도 system dark mode에 의해 검게 돌아가지 않는다', () => {
    const globals = read('src/app/globals.css');
    const admin = read('src/components/admin/admin-shell.tsx');

    // 공유 루트 기본값은 테넌트/프리뷰 문서 계약이라 그대로 두되, 라이트여야 한다.
    assert.match(globals, /--background:\s*#f8fbff/);
    assert.match(globals, /--foreground:\s*#0b1736/);
    assert.doesNotMatch(globals, /prefers-color-scheme:\s*dark/);
    // 앱 서피스는 마케팅 토큰이다.
    assert.match(globals, /\.anakslabs-app\s*\{[^}]*background:\s*#f6f7f9/i);
    assert.match(admin, /bg-\[\#F6F7F9\].*text-\[\#141A3A\]/);
    assert.match(admin, /<BrandLogo \/>/);
    assert.doesNotMatch(admin, /bg-slate-950|<BrandLogo inverse/);
    assert.doesNotMatch(admin, /#(?:f8fbff|0b1736|dce4f0|174dda)/i);
  });

  test('테넌트 404는 더 이상 앱에 남은 유일한 다크 표면이 아니다', () => {
    const notFound = read('src/app/s/[domain]/not-found.tsx');
    assert.match(notFound, /bg-\[\#F6F7F9\]/);
    assert.doesNotMatch(notFound, /bg-neutral-950|text-neutral-50\b/);
  });
});
