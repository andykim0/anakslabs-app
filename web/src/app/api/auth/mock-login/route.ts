/**
 * POST /api/auth/mock-login — mock 모드 전용 데모 로그인.
 * body: { as: 'premium' | 'basic' | 'admin' } → 세션 쿠키에 mock client id 세팅.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isMockMode } from '@/lib/env';
import { resolvePostLoginRedirect } from '@/lib/auth/post-login-redirect';
import { apiError, parseBody, withApiHandler } from '../../_lib/http';
import { MOCK_CLIENT_IDS, MOCK_SESSION_COOKIE } from '../../_lib/guards';
import { claimPendingScan } from '../../_lib/scan-claim';

const bodySchema = z.object({
  as: z.enum(['premium', 'basic', 'admin']),
  next: z.string().max(2_048).nullish(),
});

export const POST = withApiHandler(async (request) => {
  if (!isMockMode()) {
    return apiError(403, 'MOCK_ONLY', 'This is available in mock mode only.');
  }

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;

  const clientId = MOCK_CLIENT_IDS[body.data.as];
  const redirect = resolvePostLoginRedirect(
    { app_metadata: { role: body.data.as === 'admin' ? 'admin' : 'client' } },
    body.data.next,
  );
  const res = NextResponse.json({
    ok: true,
    clientId,
    redirect,
  });
  res.cookies.set(MOCK_SESSION_COOKIE, clientId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7일
  });
  // [v3 Phase 7] 로그인 직전 익명 스캔이 있으면 이 client에 귀속
  await claimPendingScan(request, res, clientId);
  return res;
});
