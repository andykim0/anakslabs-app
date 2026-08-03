/**
 * [v3] 로그인 완료 공용 처리 — OAuth 콜백과 이메일 로그인이 공유한다.
 *
 * 세션이 성립한 뒤(카카오/구글 code exchange 또는 이메일 signIn/signUp) 반드시 실행:
 *  1) clients row 보장(upsertFromAuth) — 없으면 auth.users ↔ clients 연결 생성
 *  2) 로그인 전 익명 스캔 귀속(claimPendingScan) — anaks_scan_id → 이 client
 *
 * ⚠️ 이메일 로그인은 /api/auth/callback code-exchange 경로를 타지 않으므로,
 *    이 로직이 콜백에만 있으면 clients row 미생성·scan claim 누락 버그가 난다 → 공용화.
 */
import type { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import type { AuthProvider } from '@/lib/types/domain';
import { getDataServices } from '@/lib/data';
import { claimPendingScan } from './scan-claim';

export function resolveAuthProvider(provider: unknown): AuthProvider {
  return provider === 'google' ? provider : 'email';
}

/** 세션 성립 후 clients 보장 + 스캔 귀속. res 에 스캔 쿠키 세팅. */
export async function completePostLogin(
  request: NextRequest,
  res: NextResponse,
  user: User,
): Promise<void> {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    (typeof meta.name === 'string' && meta.name) ||
    (typeof meta.full_name === 'string' && meta.full_name) ||
    user.email?.split('@')[0] ||
    '고객';

  await getDataServices().clients.upsertFromAuth({
    id: user.id,
    name,
    email: user.email ?? '',
    authProvider: resolveAuthProvider(user.app_metadata?.provider),
  });

  await claimPendingScan(request, res, user.id);
}
