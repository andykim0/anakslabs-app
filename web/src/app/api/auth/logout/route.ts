/**
 * POST /api/auth/logout — 세션 종료.
 * mock 모드: mock 세션 쿠키 제거 / 실모드: Supabase signOut + mock 쿠키 제거.
 */
import { NextResponse } from 'next/server';
import { isMockMode } from '@/lib/env';
import { withApiHandler } from '../../_lib/http';
import { MOCK_SESSION_COOKIE } from '../../_lib/guards';
import { createSupabaseRouteClient } from '../../_lib/supabase';

export const POST = withApiHandler(async () => {
  if (!isMockMode()) {
    const supabase = await createSupabaseRouteClient();
    await supabase.auth.signOut();
  }

  const res = NextResponse.json({ ok: true });
  // mock 세션 쿠키는 모드와 무관하게 항상 제거 (모드 전환 잔여물 방지)
  res.cookies.set(MOCK_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
});
