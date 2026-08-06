/**
 * POST /api/auth/set-password — choose or change the password for the current session.
 *
 * The session is the authorization: it exists only because an invite or recovery link was just
 * verified, or because the customer is already signed in. No email or user id is accepted from
 * the body, so this cannot be pointed at anyone else's account.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isEmailLoginEnabled, isMockMode } from '@/lib/env';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { createSupabaseRouteClient } from '@/app/api/_lib/supabase';
import { newPasswordSchema } from '@/lib/auth/password-policy';
import { resolvePostLoginRedirect } from '@/lib/auth/post-login-redirect';

const bodySchema = z.object({ password: newPasswordSchema }).strict();

export const POST = withApiHandler(async (request: NextRequest) => {
  if (!isEmailLoginEnabled()) {
    return apiError(404, 'NOT_FOUND', 'The requested resource was not found.');
  }
  // Mock mode has no password store and must not pretend to: a fake success here would report a
  // password was set when nothing anywhere could ever check it.
  if (isMockMode()) {
    return apiError(
      400,
      'REAL_MODE_ONLY',
      'Setting a password is available only with a configured database.',
    );
  }

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;

  const supabase = await createSupabaseRouteClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return apiError(401, 'UNAUTHORIZED', 'Sign in to continue.');
  }

  const { error } = await supabase.auth.updateUser({ password: body.data.password });
  if (error) {
    console.warn('[set-password] update failed:', error.message);
    return apiError(400, 'PASSWORD_UPDATE_FAILED', 'That password could not be saved. Try another.');
  }

  return NextResponse.json({ ok: true, redirect: resolvePostLoginRedirect(auth.user) });
});
