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

    assert.match(emailRoute, /resolvePostLoginRedirect\(result\.data\.user, next\)/);
    assert.match(callbackRoute, /resolvePostLoginRedirect\(data\.user, nextParam\)/);
    assert.match(mockRoute, /resolvePostLoginRedirect\(/);
    assert.match(loginPage, /callbackUrl\.searchParams\.set\('next', next\)/);
    assert.match(loginPage, /mode: emailMode, next: requestedNext\(\)/);
  });

  test('portal guards return users to the correct role-specific destination', () => {
    const adminLayout = read('src/app/(admin)/admin/layout.tsx');
    const dashboardLayout = read('src/app/(dashboard)/layout.tsx');

    assert.match(adminLayout, /redirect\('\/login\?next=\/admin'\)/);
    assert.match(dashboardLayout, /if \(await isAdmin\(\)\) redirect\('\/admin'\)/);
    assert.match(dashboardLayout, /redirect\('\/login\?next=\/dashboard'\)/);
  });
});
