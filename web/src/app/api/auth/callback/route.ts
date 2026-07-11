/**
 * GET /api/auth/callback — Supabase OAuth 콜백 (카카오/구글).
 * code → 세션 교환 → completePostLogin(clients 보장 + 스캔 귀속) → /dashboard 리다이렉트.
 * mock 모드에선 OAuth가 없으므로 바로 /dashboard 로 보낸다 (데모 로그인은 /api/auth/mock-login).
 */
import { NextResponse } from 'next/server';
import { isMockMode } from '@/lib/env';
import { withApiHandler } from '../../_lib/http';
import { createSupabaseRouteClient } from '../../_lib/supabase';
import { completePostLogin } from '../../_lib/post-login';

export const GET = withApiHandler(async (request) => {
  const { origin, searchParams } = request.nextUrl;
  // open redirect 방지: 내부 경로만 허용
  const nextParam = searchParams.get('next');
  const nextPath = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/dashboard';

  if (isMockMode()) {
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

  const res = NextResponse.redirect(new URL(nextPath, origin));
  // 소셜 로그인 직후 clients row 보장 + 로그인 전 익명 스캔 귀속 (공용 헬퍼 — 이메일 로그인과 공유)
  await completePostLogin(request, res, data.user);
  return res;
});
