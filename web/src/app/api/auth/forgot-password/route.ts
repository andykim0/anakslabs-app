/**
 * POST /api/auth/forgot-password — send a password reset email.
 *
 * The response is identical whether or not the address has an account. Telling the caller which
 * emails exist would turn this into an account-enumeration oracle, and this endpoint is
 * unauthenticated by nature, so it is the wrong place to be helpful.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isEmailLoginEnabled, isMockMode } from '@/lib/env';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { createSupabaseRouteClient } from '@/app/api/_lib/supabase';

/**
 * Instance-local throttle, matching /api/auth/email-login. It is a courtesy limiter only: it
 * lives in one process's memory and does not survive a restart or span instances, so the real
 * defense against reset-mail abuse is Supabase's own per-address rate limiting.
 */
const RL_LIMIT = 5;
const RL_WINDOW_MS = 60_000;
const RL_KEY = '__anaksForgotPasswordRateLimit__' as const;
type GlobalWithRl = typeof globalThis & { [RL_KEY]?: Map<string, number[]> };

function rateLimited(ip: string): boolean {
  const g = globalThis as GlobalWithRl;
  const buckets = (g[RL_KEY] ??= new Map<string, number[]>());
  const now = Date.now();
  const hits = (buckets.get(ip) ?? []).filter((at) => now - at < RL_WINDOW_MS);
  if (hits.length >= RL_LIMIT) {
    buckets.set(ip, hits);
    return true;
  }
  hits.push(now);
  buckets.set(ip, hits);
  return false;
}

const bodySchema = z.object({
  email: z.string().email('Enter a valid email address.').max(200),
}).strict();

/** Said no matter what happened, so the answer carries no information about the address. */
const NEUTRAL_RESULT = {
  ok: true as const,
  message: 'If that email has an account, a reset link is on its way.',
};

export const POST = withApiHandler(async (request: NextRequest) => {
  if (!isEmailLoginEnabled()) {
    return apiError(404, 'NOT_FOUND', 'The requested resource was not found.');
  }
  if (isMockMode()) {
    return apiError(
      400,
      'REAL_MODE_ONLY',
      'Password reset is available only with a configured database.',
    );
  }
  const ip = (request.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim() || 'local';
  if (rateLimited(ip)) {
    return apiError(429, 'RATE_LIMITED', 'Too many requests. Try again shortly.');
  }

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;

  const supabase = await createSupabaseRouteClient();
  const { error } = await supabase.auth.resetPasswordForEmail(body.data.email, {
    redirectTo: new URL('/api/auth/confirm-recovery', request.nextUrl.origin).toString(),
  });
  // Logged, never returned: the caller gets the same answer either way.
  if (error) console.warn('[forgot-password] reset request failed:', error.message);

  return NextResponse.json(NEUTRAL_RESULT);
});
