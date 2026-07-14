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

describe('Daboim 에디터·운영 셸 색상 불변조건', () => {
  test('에디터 크롬은 ice-white/navy/blue이고 이전 dark/gold 앱 표면을 쓰지 않는다', () => {
    const editor = readSourceTree('src/components/editor');
    const shell = read('src/components/editor/EditorShell.tsx');

    for (const color of ['#F8FBFF', '#0B1736', '#DCE4F0', '#174DDA']) {
      assert.ok(editor.includes(color), `에디터의 ${color} 브랜드 색상 누락`);
    }
    assert.match(shell, /bg-\[\#F8FBFF\].*text-\[\#0B1736\]/);
    assert.doesNotMatch(
      editor,
      /bg-neutral-(?:950|900)|#(?:c8a96a|d9bc82|d9b878|2a2117|4a3a22|151310|8a95a6)/i,
    );
  });

  test('캔버스 작업대만 밝게 바꾸고 고객 사이트 프레임은 독립적으로 유지한다', () => {
    const canvas = read('src/components/editor/CanvasStage.tsx');
    assert.match(canvas, /bg-\[\#E8EEF7\]/);
    assert.match(canvas, /bg-black shadow-2xl/);
  });

  test('전역 기본값과 관리자 셸도 system dark mode에 의해 검게 돌아가지 않는다', () => {
    const globals = read('src/app/globals.css');
    const admin = read('src/components/admin/admin-shell.tsx');

    assert.match(globals, /--background:\s*#f8fbff/);
    assert.match(globals, /--foreground:\s*#0b1736/);
    assert.doesNotMatch(globals, /prefers-color-scheme:\s*dark/);
    assert.match(admin, /bg-\[\#F8FBFF\].*text-\[\#0B1736\]/);
    assert.match(admin, /<BrandLogo \/>/);
    assert.doesNotMatch(admin, /bg-slate-950|<BrandLogo inverse/);
  });
});
