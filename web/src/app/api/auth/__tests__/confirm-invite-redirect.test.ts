/**
 * A3 — an invite lands you in the area your role owns.
 *
 * Every other login entry point resolves its destination from the user's role; this one named
 * /dashboard outright, so an invited administrator was sent to the customer dashboard and
 * bounced out of it by that layout's guard. The route handler itself is exercised — only the
 * Supabase verification and the clients-row step are stubbed, since neither is what A3 changes.
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { describe, test } from 'node:test';
import { NextRequest } from 'next/server';

type ModuleLoader = { _load: (r: string, p: unknown, m: boolean) => unknown };

/** Mutated per case: the route module is cached after its first import. */
let verifiedUser: { id: string; app_metadata: Record<string, unknown> } | null = null;

async function confirmInvite(user: typeof verifiedUser): Promise<Response> {
  verifiedUser = user;
  const loader = Module as unknown as ModuleLoader;
  const original = loader._load;
  loader._load = function load(request, parent, isMain) {
    if (request === 'server-only') return {};
    if (request === '@/app/api/_lib/supabase') {
      return {
        createSupabaseRouteClient: async () => ({
          auth: {
            verifyOtp: async () => (verifiedUser
              ? { data: { user: verifiedUser }, error: null }
              : { data: { user: null }, error: new Error('invalid') }),
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
    const route = await import('@/app/api/auth/confirm-invite/route');
    return await route.GET(
      new NextRequest(
        'https://app.anakslabs.com/api/auth/confirm-invite'
        + `?token_hash=${'t'.repeat(32)}&type=invite`,
      ),
      undefined as never,
    );
  } finally {
    loader._load = original;
  }
}

describe('A3 — confirm-invite sends each role to its own area', () => {
  test('an invited administrator goes straight to /admin', async () => {
    const response = await confirmInvite({
      id: '11111111-1111-4111-8111-111111111111',
      app_metadata: { role: 'admin' },
    });
    assert.equal(response.status, 307);
    assert.equal(
      response.headers.get('location'),
      'https://app.anakslabs.com/admin',
      'an administrator must not be routed through the customer dashboard',
    );
  });

  test('an invited customer goes to /dashboard', async () => {
    const response = await confirmInvite({
      id: '22222222-2222-4222-8222-222222222222',
      app_metadata: {},
    });
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('location'), 'https://app.anakslabs.com/dashboard');
  });

  test('the route resolves its destination instead of naming one', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(
      `${process.cwd()}/src/app/api/auth/confirm-invite/route.ts`,
      'utf8',
    );
    assert.match(source, /resolvePostLoginRedirect\(verified\.data\.user\)/u);
    // The error paths still name /login on purpose; the success path must not name a destination.
    assert.doesNotMatch(source, /redirect\(new URL\('\/dashboard'/u);
  });
});
