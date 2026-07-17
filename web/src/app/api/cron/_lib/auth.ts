import type { NextRequest } from 'next/server';
import { env, isMockMode } from '@/lib/env';

/** 모든 크론 라우트가 공유하는 서버 인증 계약. */
export function isCronAuthorized(request: Pick<NextRequest, 'headers'>): boolean {
  if (env.cronSecret) {
    return request.headers.get('authorization') === `Bearer ${env.cronSecret}`;
  }
  if (request.headers.get('x-vercel-cron')) return true;
  return isMockMode();
}
