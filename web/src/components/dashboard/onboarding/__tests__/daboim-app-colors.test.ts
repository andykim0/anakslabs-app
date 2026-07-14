import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

function readSourceTree(path: string): string {
  const absolute = join(root, path);
  return readdirSync(absolute)
    .flatMap((name) => {
      const child = join(absolute, name);
      if (statSync(child).isDirectory()) return name === '__tests__' ? [] : readSourceTree(join(path, name));
      return /\.tsx?$/.test(name) ? readFileSync(child, 'utf8') : [];
    })
    .join('\n');
}

describe('Daboim 로그인·온보딩 색상 불변조건', () => {
  test('온보딩 토큰은 ice-white, navy, blue, cyan, mint 브랜드 계열이다', () => {
    const globals = read('src/app/globals.css');
    for (const color of ['#f8fbff', '#0b1736', '#dce4f0', '#174dda', '#08afc5', '#03bfa9']) {
      assert.ok(globals.includes(color), `Daboim 앱 토큰 ${color} 누락`);
    }
    assert.doesNotMatch(globals, /--color-ob-accent:\s*#c8a96a/i);
  });

  test('로그인은 라이트 Daboim 락업을 쓰고 이전 다크·골드 표면을 복원하지 않는다', () => {
    const login = read('src/app/(auth)/login/page.tsx');
    assert.match(login, /bg-\[#F8FBFF\]/);
    assert.match(login, /<BrandLogo \/>/);
    assert.doesNotMatch(login, /<BrandLogo inverse/);
    assert.doesNotMatch(login, /#(?:0a0a0b|c8a96a|a98844|d9bc82|8b95a7|7a8496)/i);
  });

  test('온보딩 소스에는 이전 골드 팔레트가 남지 않는다', () => {
    const onboarding = readSourceTree('src/components/dashboard/onboarding');
    assert.doesNotMatch(onboarding, /#(?:c8a96a|a98844|f3ecdd|d9bc82|2a2117)/i);
  });
});
