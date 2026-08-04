/**
 * GET /api/auth/callback — Supabase OAuth 콜백 (카카오/구글).
 * code → 세션 교환 → completePostLogin(clients 보장 + 스캔 귀속) → 역할별 앱 리다이렉트.
 * mock 모드에선 OAuth가 없으므로 고객 기본 경로로 보낸다 (데모 로그인은 /api/auth/mock-login).
 */
import { NextResponse } from 'next/server';
import { isMockMode } from '@/lib/env';
import { resolvePostLoginRedirect } from '@/lib/auth/post-login-redirect';
import { withApiHandler } from '../../_lib/http';
import { createSupabaseRouteClient } from '../../_lib/supabase';
import { completePostLogin } from '../../_lib/post-login';

export const GET = withApiHandler(async (request) => {
  const { origin, searchParams } = request.nextUrl;
  const nextParam = searchParams.get('next');

  if (isMockMode()) {
    const nextPath = resolvePostLoginRedirect({ app_metadata: {} }, nextParam);
    return NextResponse.redirect(new URL(nextPath, origin));
  }

  const code = searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', origin));
  }

  const supabase = await createSupabaseRouteClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    console.error('[auth/callback] code exchange failed:', error?.message);
    return NextResponse.redirect(new URL('/login?error=auth_failed', origin));
  }

  const nextPath = resolvePostLoginRedirect(data.user, nextParam);
  const res = NextResponse.redirect(new URL(nextPath, origin));
  // Operator-issued US accounts must already have an exact clients row bound to this auth id.
  if (!(await completePostLogin(request, res, data.user))) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/login?error=invite_required', origin));
  }
  return res;
});
