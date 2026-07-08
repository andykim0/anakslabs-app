/**
 * POST /api/auth/mock-login — mock 모드 전용 데모 로그인.
 * body: { as: 'premium' | 'basic' | 'admin' } → 세션 쿠키에 mock client id 세팅.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isMockMode } from '@/lib/env';
import { apiError, parseBody, withApiHandler } from '../../_lib/http';
import { MOCK_CLIENT_IDS, MOCK_SESSION_COOKIE } from '../../_lib/guards';

const bodySchema = z.object({
  as: z.enum(['premium', 'basic', 'admin']),
});

export const POST = withApiHandler(async (request) => {
  if (!isMockMode()) {
    return apiError(403, 'MOCK_ONLY', 'mock 모드에서만 사용할 수 있는 기능입니다.');
  }

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;

  const clientId = MOCK_CLIENT_IDS[body.data.as];
  const res = NextResponse.json({
    ok: true,
    clientId,
    redirect: body.data.as === 'admin' ? '/admin' : '/dashboard',
  });
  res.cookies.set(MOCK_SESSION_COOKIE, clientId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7일
  });
  return res;
});
