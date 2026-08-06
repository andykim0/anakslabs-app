import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseRouteClient } from '@/app/api/_lib/supabase';
import { completePostLogin } from '@/app/api/_lib/post-login';
import { withApiHandler } from '@/app/api/_lib/http';
import { resolvePostLoginRedirect } from '@/lib/auth/post-login-redirect';

const querySchema = z.object({
  token_hash: z.string().min(20).max(1_000),
  type: z.literal('invite'),
}).strict();

export const GET = withApiHandler(async (request: NextRequest) => {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.redirect(new URL('/login?error=invalid_invite', request.nextUrl.origin));
  }
  const supabase = await createSupabaseRouteClient();
  const verified = await supabase.auth.verifyOtp({
    token_hash: parsed.data.token_hash,
    type: parsed.data.type,
  });
  if (verified.error || !verified.data.user) {
    return NextResponse.redirect(new URL('/login?error=invalid_invite', request.nextUrl.origin));
  }
  // An invite link carries no `next`, so the destination is the one the role owns. This was the
  // last entry point still naming /dashboard outright, which sent an invited administrator
  // through the customer dashboard only to be redirected out of it.
  const destination = resolvePostLoginRedirect(verified.data.user);
  const response = NextResponse.redirect(new URL(destination, request.nextUrl.origin));
  if (!(await completePostLogin(request, response, verified.data.user))) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/login?error=invite_required', request.nextUrl.origin));
  }
  return response;
});
