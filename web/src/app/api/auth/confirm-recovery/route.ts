/**
 * GET /api/auth/confirm-recovery — the landing point for a password reset email.
 *
 * Mirrors confirm-invite because the shape is the same: a one-time token hash is exchanged for a
 * session, and the customer is sent to /welcome to choose a password. It deliberately does not
 * reuse /api/auth/callback — that route exchanges an OAuth `code` and would reject a recovery
 * link with `missing_code`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseRouteClient } from '@/app/api/_lib/supabase';
import { completePostLogin } from '@/app/api/_lib/post-login';
import { withApiHandler } from '@/app/api/_lib/http';
import { resolvePostLoginRedirect } from '@/lib/auth/post-login-redirect';

const querySchema = z.object({
  token_hash: z.string().min(20).max(1_000),
  type: z.literal('recovery'),
}).strict();

export const GET = withApiHandler(async (request: NextRequest) => {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.redirect(new URL('/login?error=invalid_recovery', request.nextUrl.origin));
  }
  const supabase = await createSupabaseRouteClient();
  const verified = await supabase.auth.verifyOtp({
    token_hash: parsed.data.token_hash,
    type: parsed.data.type,
  });
  if (verified.error || !verified.data.user) {
    return NextResponse.redirect(new URL('/login?error=invalid_recovery', request.nextUrl.origin));
  }
  const destination = resolvePostLoginRedirect(verified.data.user, '/welcome');
  const response = NextResponse.redirect(new URL(destination, request.nextUrl.origin));
  if (!(await completePostLogin(request, response, verified.data.user))) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/login?error=invite_required', request.nextUrl.origin));
  }
  return response;
});
