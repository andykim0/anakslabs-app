import type { NextRequest } from 'next/server';
import { env, isMockMode } from '@/lib/env';

export function cronAuthorizationMatches(input: {
  cronSecret: string;
  authorization: string | null;
  mockMode: boolean;
}): boolean {
  if (input.cronSecret) {
    return input.authorization === `Bearer ${input.cronSecret}`;
  }
  // High-impact jobs fail closed in every real deployment. Local mock mode is
  // the only keyless seam; x-vercel-cron is metadata, not authentication.
  return input.mockMode;
}

/** 모든 크론 라우트가 공유하는 서버 인증 계약. */
export function isCronAuthorized(request: Pick<NextRequest, 'headers'>): boolean {
  return cronAuthorizationMatches({
    cronSecret: env.cronSecret,
    authorization: request.headers.get('authorization'),
    mockMode: isMockMode(),
  });
}
