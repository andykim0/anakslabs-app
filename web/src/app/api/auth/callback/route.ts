/**
 * GET /api/auth/callback — Supabase OAuth 콜백 (카카오/구글).
 * code → 세션 교환 → clients.upsertFromAuth → /dashboard 리다이렉트.
 * mock 모드에선 OAuth가 없으므로 바로 /dashboard 로 보낸다 (데모 로그인은 /api/auth/mock-login).
 */
import { NextResponse } from 'next/server';
import type { AuthProvider } from '@/lib/types/domain';
import { getDataServices } from '@/lib/data';
import { isMockMode } from '@/lib/env';
import { withApiHandler } from '../../_lib/http';
import { createSupabaseRouteClient } from '../../_lib/supabase';
import { claimPendingScan } from '../../_lib/scan-claim';

function resolveAuthProvider(provider: unknown): AuthProvider {
  return provider === 'kakao' || provider === 'google' ? provider : 'email';
}

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

  const user = data.user;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    (typeof meta.name === 'string' && meta.name) ||
    (typeof meta.full_name === 'string' && meta.full_name) ||
    user.email?.split('@')[0] ||
    '고객';

  // 소셜 로그인 직후 clients row 보장 (없으면 생성)
  await getDataServices().clients.upsertFromAuth({
    id: user.id,
    name,
    email: user.email ?? '',
    authProvider: resolveAuthProvider(user.app_metadata?.provider),
  });

  const res = NextResponse.redirect(new URL(nextPath, origin));
  // [v3 Phase 7] 로그인 전 익명 스캔이 있으면 이 client에 귀속
  await claimPendingScan(request, res, user.id);
  return res;
});
