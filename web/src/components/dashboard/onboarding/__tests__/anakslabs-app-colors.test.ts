import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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

/**
 * The application chrome carries the anakslabs.com identity
 * (`../website/assets/site.css`): --bg #F6F7F9 · --ink #141A3A · --blue #2D63F0.
 * The preceding ice-white/navy/cyan set and the gold set before it are both regressions.
 */
describe('Anaks Labs 로그인·온보딩 색상 불변조건', () => {
  test('앱 테마 토큰은 마케팅 사이트의 bg/ink/blue 계열이다', () => {
    const globals = read('src/app/globals.css');
    for (const [token, value] of [
      ['--color-ob-bg', '#f6f7f9'],
      ['--color-ob-ink', '#141a3a'],
      ['--color-ob-border', '#dfe1e6'],
      ['--color-ob-accent', '#2d63f0'],
      ['--color-ob-accent-strong', '#1e4bd1'],
      ['--color-ob-muted', '#545c70'],
    ] as const) {
      assert.ok(
        new RegExp(`${token}:\\s*${value}`, 'i').test(globals),
        `마케팅 토큰 ${token}: ${value} 누락`,
      );
    }
    // 이전 팔레트(다보임 계열 청록·옛 파랑)와 그 이전 골드가 되돌아오지 않는다.
    assert.doesNotMatch(globals, /--color-ob-accent:\s*#(?:174dda|c8a96a)/i);
    assert.doesNotMatch(globals, /--color-ob-bg:\s*#f8fbff/i);
    assert.doesNotMatch(globals, /--color-ob-(?:cyan|mint):\s*#(?:08afc5|03bfa9|08b8e8|03d1b8)/i);
  });

  test('앱 서피스는 라우트 그룹 전용이고 공유 body 계약을 건드리지 않는다', () => {
    const globals = read('src/app/globals.css');
    // 테넌트(app/s)·공유 프리뷰 루트도 읽는 계약 — 값이 바뀌면 고객 문서가 다시 칠해진다.
    assert.match(globals, /--background:\s*#f8fbff/i);
    assert.match(globals, /--foreground:\s*#0b1736/i);
    assert.match(globals, /font-family: Arial, Helvetica, sans-serif;/);
    // 앱 전용 서피스는 별도 클래스로만 존재한다.
    assert.match(globals, /\.anakslabs-app\s*\{[^}]*background:\s*#f6f7f9/i);
    assert.match(globals, /\.anakslabs-app\s*\{[^}]*var\(--font-anaks-sans\)/i);
  });

  test('로그인은 라이트 Anaks Labs 락업을 쓰고 이전 팔레트를 복원하지 않는다', () => {
    const login = read('src/app/(auth)/login/page.tsx');
    assert.match(login, /bg-\[#F6F7F9\]/);
    assert.match(login, /<BrandLogo \/>/);
    assert.doesNotMatch(login, /<BrandLogo inverse/);
    assert.doesNotMatch(login, /#(?:174dda|0b1736|f8fbff|dce4f0|0a0a0b|c8a96a|a98844|d9bc82|8b95a7|7a8496)/i);
  });

  test('온보딩 소스에는 이전 골드·옛 파랑 팔레트가 남지 않는다', () => {
    const onboarding = readSourceTree('src/components/dashboard/onboarding');
    assert.doesNotMatch(onboarding, /#(?:c8a96a|a98844|f3ecdd|d9bc82|2a2117)/i);
    assert.doesNotMatch(onboarding, /#(?:174dda|0b1736|dce4f0)/i);
  });

  test('브랜드 마크는 마케팅 사이트의 실제 PNG 아트워크다', () => {
    const brand = read('src/components/brand/BrandLogo.tsx');
    assert.match(brand, /\/anakslabs-mark\.png/);
    // 청록 그라디언트 인라인 마크와 그 SVG 복제본은 전부 사라졌다.
    assert.doesNotMatch(brand, /linearGradient|#(?:174dda|08b8e8|03d1b8)/i);
    for (const dead of ['public/anakslabs-logo.svg', 'public/anakslabs-mark.svg', 'src/app/icon.svg']) {
      assert.equal(existsSync(join(root, dead)), false, `${dead} 는 청록 마크 복제본 — 남아 있으면 안 된다`);
    }
    for (const asset of ['public/anakslabs-mark.png', 'public/anakslabs-logo.png', 'src/app/icon.png', 'src/app/apple-icon.png']) {
      assert.ok(existsSync(join(root, asset)), `${asset} 누락`);
    }
  });

  test('favicon.ico 는 Next 기본 아이콘이 아니라 아낙스 마크다', () => {
    // 테넌트 라이브(app/s/[domain]/_shared.tsx)와 Export 셸이 /favicon.ico 를 참조한다.
    const ico = readFileSync(join(root, 'src/app/favicon.ico'));
    assert.equal(ico.readUInt16LE(0), 0);
    assert.equal(ico.readUInt16LE(2), 1);
    const count = ico.readUInt16LE(4);
    assert.ok(count >= 2, `아이콘 크기가 ${count}종 — 16/32 이상을 담아야 한다`);
    // Next.js 기본 favicon 은 25kB 대의 단일 삼각형 아이콘이다.
    assert.ok(ico.length < 12_000, 'favicon.ico 가 기본 아이콘 크기대로 남아 있다');
    assert.match(read('src/app/s/[domain]/_shared.tsx'), /icons: \{ icon: '\/favicon\.ico' \}/);
  });
});
