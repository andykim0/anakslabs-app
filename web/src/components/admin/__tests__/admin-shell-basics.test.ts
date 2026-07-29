import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import { BrandLogo } from '@/components/brand/BrandLogo';

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(`${ROOT}/${relativePath}`, 'utf8');
}

describe('ADMIN UI — shell navigation and session basics', () => {
  test('공용 브랜드명은 모든 좁은 셸에서 한 줄과 고정 폭을 유지한다', () => {
    const html = renderToStaticMarkup(createElement(BrandLogo));
    assert.match(
      html,
      /data-brand-name="daboim"[^>]*class="[^"]*shrink-0[^"]*whitespace-nowrap/u,
    );
    assert.match(
      html,
      /<span class="[^"]*shrink-0[^"]*whitespace-nowrap[^"]*"[^>]*data-brand-bilingual="logo"/u,
    );
  });

  test('admin 로고는 /admin 링크이고 하단 로그아웃은 공용 API 뒤 /login으로 이동한다', () => {
    const shell = read('src/components/admin/admin-shell.tsx');
    assert.match(shell, /<Link[\s\S]*href="\/admin"[\s\S]*<BrandLogo \/>[\s\S]*<\/Link>/u);
    assert.match(shell, /import \{ logout \} from '@\/components\/dashboard\/api'/u);
    assert.match(shell, /<LogOut size=\{15\} aria-hidden \/>/u);
    assert.match(shell, /await logout\(\)/u);
    assert.match(shell, /window\.location\.href = '\/login'/u);
    assert.match(shell, /<LogoutConfirmDialog/u);
  });

  test('dashboard는 로고 /dashboard 링크와 셸 로그아웃 표면을 함께 유지한다', () => {
    const shell = read('src/components/dashboard/shell.tsx');
    assert.match(shell, /<Link[\s\S]*href="\/dashboard"[\s\S]*<BrandLogo \/>[\s\S]*<\/Link>/u);
    assert.match(shell, /function LogoutButton\(\)/u);
    assert.match(shell, /await logout\(\)/u);
    assert.match(shell, /window\.location\.href = '\/login'/u);
    assert.match(shell, /<LogoutConfirmDialog/u);
  });

  test('admin·dashboard·설정 로그아웃은 세션 종료 전 공용 확인 창을 거친다', () => {
    const dialog = read('src/components/auth/LogoutConfirmDialog.tsx');
    const settings = read('src/components/dashboard/settings-view.tsx');
    assert.match(dialog, /role="alertdialog"/u);
    assert.match(dialog, /aria-modal="true"/u);
    assert.match(dialog, /로그아웃할까요\?/u);
    assert.match(dialog, /현재 세션을 종료하고 로그인 화면으로 이동합니다/u);
    assert.match(dialog, /event\.key !== 'Escape'/u);
    assert.match(settings, /<LogoutConfirmDialog/u);
  });

  test('마케팅·로그인·가입 로고의 기존 / 링크는 바뀌지 않는다', () => {
    const sources = [
      read('src/components/marketing/MarketingHeader.tsx'),
      read('src/app/(auth)/login/page.tsx'),
      read('src/app/(auth)/signup/page.tsx'),
    ];
    for (const source of sources) {
      assert.match(source, /<Link href="\/"[\s\S]*<BrandLogo \/>[\s\S]*<\/Link>/u);
    }
  });

  test('logout route는 mock 쿠키를 항상 지우고 실모드에서 Supabase 세션도 종료한다', () => {
    const route = read('src/app/api/auth/logout/route.ts');
    assert.match(route, /if \(!isMockMode\(\)\)[\s\S]*supabase\.auth\.signOut\(\)/u);
    assert.match(route, /res\.cookies\.set\(MOCK_SESSION_COOKIE, ''/u);
    assert.match(route, /maxAge:\s*0/u);
  });
});
