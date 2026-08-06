/**
 * ACCOUNT-ACCESS — the whole path, not the destination in isolation.
 *
 * Rendering /welcome on its own would prove nothing about whether a one-time link can reach it.
 * These drive the real route handlers end to end: token hash → verification → resolver → landing,
 * for both the invite and recovery entry points and for both roles.
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { describe, test } from 'node:test';
import { NextRequest } from 'next/server';
import {
  getDefaultPostLoginPath,
  resolvePostLoginRedirect,
} from '@/lib/auth/post-login-redirect';

type ModuleLoader = { _load: (r: string, p: unknown, m: boolean) => unknown };
type StubUser = { id: string; app_metadata: Record<string, unknown> };

let verifiedUser: StubUser | null = null;
let verifiedType: string | null = null;

async function runRoute(
  routePath: string,
  query: string,
  user: StubUser | null,
): Promise<Response> {
  verifiedUser = user;
  verifiedType = null;
  const loader = Module as unknown as ModuleLoader;
  const original = loader._load;
  loader._load = function load(request, parent, isMain) {
    if (request === 'server-only') return {};
    if (request === '@/app/api/_lib/supabase') {
      return {
        createSupabaseRouteClient: async () => ({
          auth: {
            verifyOtp: async (input: { type: string }) => {
              verifiedType = input.type;
              return verifiedUser
                ? { data: { user: verifiedUser }, error: null }
                : { data: { user: null }, error: new Error('invalid') };
            },
            signOut: async () => undefined,
          },
        }),
      };
    }
    if (request === '@/app/api/_lib/post-login') {
      return { completePostLogin: async () => true };
    }
    return original.call(this, request, parent, isMain);
  };
  try {
    const route = await import(routePath);
    return await route.GET(
      new NextRequest(`https://app.anakslabs.com${routePath.replace('@/app', '')}${query}`),
      undefined as never,
    );
  } finally {
    loader._load = original;
  }
}

const TOKEN = 't'.repeat(32);
const CLIENT: StubUser = { id: '22222222-2222-4222-8222-222222222222', app_metadata: {} };
const ADMIN: StubUser = {
  id: '11111111-1111-4111-8111-111111111111',
  app_metadata: { role: 'admin' },
};

describe('A3/A1 — an invite link reaches the password screen', () => {
  test('a customer invite lands on /welcome', async () => {
    const response = await runRoute(
      '@/app/api/auth/confirm-invite/route',
      `?token_hash=${TOKEN}&type=invite`,
      CLIENT,
    );
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('location'), 'https://app.anakslabs.com/welcome');
    assert.equal(verifiedType, 'invite');
  });

  test('an administrator invite also lands on /welcome, not /admin', async () => {
    // The allow-list covers both roles precisely so this does not fall back to the role home.
    const response = await runRoute(
      '@/app/api/auth/confirm-invite/route',
      `?token_hash=${TOKEN}&type=invite`,
      ADMIN,
    );
    assert.equal(response.headers.get('location'), 'https://app.anakslabs.com/welcome');
  });

  test('a rejected invite explains itself on the login page', async () => {
    const response = await runRoute(
      '@/app/api/auth/confirm-invite/route',
      `?token_hash=${TOKEN}&type=invite`,
      null,
    );
    assert.equal(
      response.headers.get('location'),
      'https://app.anakslabs.com/login?error=invalid_invite',
    );
  });
});

describe('A3 — neither confirm route names its own destination', () => {
  test('both ask the resolver for /welcome instead of hardcoding it', async () => {
    const { readFileSync } = await import('node:fs');
    for (const path of [
      'src/app/api/auth/confirm-invite/route.ts',
      'src/app/api/auth/confirm-recovery/route.ts',
    ]) {
      const source = readFileSync(`${process.cwd()}/${path}`, 'utf8');
      assert.match(
        source,
        /resolvePostLoginRedirect\(verified\.data\.user, '\/welcome'\)/u,
        `${path} must resolve its landing`,
      );
      // Error paths still name /login deliberately; the success path must not name a landing.
      assert.doesNotMatch(source, /redirect\(new URL\('\/(dashboard|admin|welcome)'/u, path);
    }
  });
});

describe('A2 — a recovery link reaches the same screen', () => {
  test('a recovery token lands on /welcome for either role', async () => {
    for (const user of [CLIENT, ADMIN]) {
      const response = await runRoute(
        '@/app/api/auth/confirm-recovery/route',
        `?token_hash=${TOKEN}&type=recovery`,
        user,
      );
      assert.equal(response.status, 307);
      assert.equal(response.headers.get('location'), 'https://app.anakslabs.com/welcome');
      assert.equal(verifiedType, 'recovery', 'the recovery OTP type must be used');
    }
  });

  test('an invite token is not accepted by the recovery route', async () => {
    const response = await runRoute(
      '@/app/api/auth/confirm-recovery/route',
      `?token_hash=${TOKEN}&type=invite`,
      CLIENT,
    );
    assert.equal(
      response.headers.get('location'),
      'https://app.anakslabs.com/login?error=invalid_recovery',
    );
  });

  test('a rejected recovery link says so with its own code', async () => {
    const response = await runRoute(
      '@/app/api/auth/confirm-recovery/route',
      `?token_hash=${TOKEN}&type=recovery`,
      null,
    );
    assert.equal(
      response.headers.get('location'),
      'https://app.anakslabs.com/login?error=invalid_recovery',
    );
  });
});

describe('A1 — after the password is saved, the role home is the destination', () => {
  test('the resolver returns each role home once /welcome is done', () => {
    assert.equal(resolvePostLoginRedirect(ADMIN), '/admin');
    assert.equal(resolvePostLoginRedirect(CLIENT), '/dashboard');
    assert.equal(getDefaultPostLoginPath('admin'), '/admin');
  });

  test('/welcome is reachable by both roles and nothing else was widened', () => {
    assert.equal(resolvePostLoginRedirect(ADMIN, '/welcome'), '/welcome');
    assert.equal(resolvePostLoginRedirect(CLIENT, '/welcome'), '/welcome');
    // The cross-role and external refusals are unchanged by the addition.
    assert.equal(resolvePostLoginRedirect(CLIENT, '/admin'), '/dashboard');
    assert.equal(resolvePostLoginRedirect(ADMIN, '/dashboard'), '/admin');
    assert.equal(resolvePostLoginRedirect(CLIENT, 'https://evil.com'), '/dashboard');
  });
});
