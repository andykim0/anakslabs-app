import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
  getPostLoginRole,
  resolvePostLoginRedirect,
} from '@/lib/auth/post-login-redirect';

const adminUser = { app_metadata: { role: 'admin' } };
const clientUser = { app_metadata: { role: 'client' } };

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('ADM-fix post-login redirect contract', () => {
  test('admin login defaults to /admin and preserves an allowed admin next path', () => {
    assert.equal(getPostLoginRole(adminUser), 'admin');
    assert.equal(resolvePostLoginRedirect(adminUser), '/admin');
    assert.equal(
      resolvePostLoginRedirect(adminUser, '/admin/search-registration?state=pending#queue'),
      '/admin/search-registration?state=pending#queue',
    );
  });

  test('customer login defaults to /dashboard and preserves allowed customer paths', () => {
    assert.equal(getPostLoginRole(clientUser), 'client');
    assert.equal(resolvePostLoginRedirect(clientUser), '/dashboard');
    assert.equal(resolvePostLoginRedirect(clientUser, '/dashboard/sites/site-1'), '/dashboard/sites/site-1');
    assert.equal(resolvePostLoginRedirect(clientUser, '/onboarding?step=2'), '/onboarding?step=2');
  });

  test('a next path for the other role is rejected to prevent guard loops', () => {
    assert.equal(resolvePostLoginRedirect(adminUser, '/dashboard'), '/admin');
    assert.equal(resolvePostLoginRedirect(clientUser, '/admin'), '/dashboard');
  });

  test('external and encoded redirect bypasses are rejected', () => {
    for (const unsafe of [
      'https://evil.example/admin',
      '//evil.example/admin',
      '/\\evil.example/admin',
      '/%2f%2fevil.example/admin',
      '/admin/%2e%2e/dashboard',
      '/faq',
    ]) {
      assert.equal(resolvePostLoginRedirect(adminUser, unsafe), '/admin', unsafe);
      assert.equal(resolvePostLoginRedirect(clientUser, unsafe), '/dashboard', unsafe);
    }
  });

  test('email, OAuth, and mock login all consume the shared resolver and forward next', () => {
    const emailRoute = read('src/app/api/auth/email-login/route.ts');
    const callbackRoute = read('src/app/api/auth/callback/route.ts');
    const mockRoute = read('src/app/api/auth/mock-login/route.ts');
    const loginPage = read('src/app/(auth)/login/page.tsx');
    const signupPage = read('src/app/(auth)/signup/page.tsx');

    assert.match(emailRoute, /resolvePostLoginRedirect\(result\.data\.user, next\)/);
    assert.match(callbackRoute, /resolvePostLoginRedirect\(data\.user, nextParam\)/);
    assert.match(mockRoute, /resolvePostLoginRedirect\(/);
    assert.match(loginPage, /callbackUrl\.searchParams\.set\('next', next\)/);
    // 로그인 폼은 signin 전용 — 가입은 /signup 별도 화면이 mode:'signup' + 이름/전화를 보낸다.
    assert.match(loginPage, /mode: 'signin', next: requestedNext\(\)/);
    assert.doesNotMatch(loginPage, /mode:\s*'signup'/);
    assert.match(signupPage, /mode: 'signup'/);
    assert.match(signupPage, /name: form\.name/);
    assert.match(signupPage, /phone: form\.phone/);
    // 가입 이메일 확인(2차 인증) 링크는 공용 콜백으로 착지해 clients 보장을 공유한다.
    assert.match(emailRoute, /emailRedirectTo: confirmRedirect\.toString\(\)/);
  });

  test('portal guards return users to the correct role-specific destination', () => {
    const adminLayout = read('src/app/(admin)/admin/layout.tsx');
    const dashboardLayout = read('src/app/(dashboard)/layout.tsx');

    // Both guards now carry the requested path instead of naming their area root, so the
    // destination is the page the visitor asked for. resolvePostLoginRedirect still decides
    // whether that path may be followed.
    assert.match(adminLayout, /loginUrlForRequestedPath\([\s\S]{0,120}'\/admin'/u);
    assert.match(dashboardLayout, /if \(await isAdmin\(\)\) redirect\('\/admin'\)/);
    assert.match(dashboardLayout, /loginUrlForRequestedPath\([\s\S]{0,120}'\/dashboard'/u);
  });
});
