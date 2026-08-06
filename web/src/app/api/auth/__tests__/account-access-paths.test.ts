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
/** Whether the clients-row binding succeeds; false is the fail-closed branch. */
let postLoginOk = true;
let signedOut = false;

async function runRoute(
  routePath: string,
  query: string,
  user: StubUser | null,
): Promise<Response> {
  verifiedUser = user;
  verifiedType = null;
  signedOut = false;
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
            signOut: async () => {
              signedOut = true;
            },
          },
        }),
      };
    }
    if (request === '@/app/api/_lib/post-login') {
      return { completePostLogin: async () => postLoginOk };
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

describe('P4 — a verified link with no account behind it is closed out', () => {
  test('confirm-recovery signs the session out and says the account is not set up', async () => {
    postLoginOk = false;
    try {
      const response = await runRoute(
        '@/app/api/auth/confirm-recovery/route',
        `?token_hash=${TOKEN}&type=recovery`,
        CLIENT,
      );
      // The OTP verified, so a session exists — leaving it in place would hand out a session for
      // an account the operator never bound.
      assert.equal(signedOut, true, 'the session must be torn down');
      assert.equal(
        response.headers.get('location'),
        'https://app.anakslabs.com/login?error=invite_required',
      );
    } finally {
      postLoginOk = true;
    }
  });

  test('confirm-invite closes out the same way', async () => {
    postLoginOk = false;
    try {
      const response = await runRoute(
        '@/app/api/auth/confirm-invite/route',
        `?token_hash=${TOKEN}&type=invite`,
        CLIENT,
      );
      assert.equal(signedOut, true);
      assert.equal(
        response.headers.get('location'),
        'https://app.anakslabs.com/login?error=invite_required',
      );
    } finally {
      postLoginOk = true;
    }
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

describe('P3 — the route itself refuses a cross-origin password change', () => {
  async function setPassword(headers: Record<string, string>): Promise<Response> {
    const loader = Module as unknown as ModuleLoader;
    const original = loader._load;
    loader._load = function load(request, parent, isMain) {
      if (request === 'server-only') return {};
      if (request === '@/lib/env') {
        // The switch is on and the database is configured; only the origin is in question here.
        return { isEmailLoginEnabled: () => true, isMockMode: () => false };
      }
      if (request === '@/app/api/_lib/supabase') {
        return {
          createSupabaseRouteClient: async () => ({
            auth: {
              getUser: async () => ({ data: { user: CLIENT } }),
              updateUser: async () => ({ error: null }),
            },
          }),
        };
      }
      return original.call(this, request, parent, isMain);
    };
    try {
      const route = await import('@/app/api/auth/set-password/route');
      return await route.POST(
        new NextRequest('https://app.anakslabs.com/api/auth/set-password', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify({ password: 'Clinic1!pass' }),
        }),
        undefined as never,
      );
    } finally {
      loader._load = original;
    }
  }

  test('a request from our own page succeeds', async () => {
    const response = await setPassword({
      'sec-fetch-site': 'same-origin',
      host: 'app.anakslabs.com',
    });
    assert.equal(response.status, 200);
  });

  test('a forged Origin is refused with 403', async () => {
    const response = await setPassword({
      origin: 'https://evil.com',
      host: 'app.anakslabs.com',
    });
    assert.equal(response.status, 403);
    const payload = await response.json() as { error?: { code?: string } };
    assert.equal(payload.error?.code, 'FORBIDDEN');
  });

  test('a request with no origin signal at all is refused', async () => {
    const response = await setPassword({ host: 'app.anakslabs.com' });
    assert.equal(response.status, 403);
  });
});
