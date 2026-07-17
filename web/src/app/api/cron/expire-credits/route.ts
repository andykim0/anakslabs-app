/**
 * GET+POST /api/cron/expire-credits — 크레딧 만료 배치.
 * 만료된 지급 lot 잔여분을 reason='expired'로 상쇄 기록 (credits.expireDue).
 *
 * 인증:
 *  - CRON_SECRET 설정 시: Authorization: Bearer {CRON_SECRET} 필수.
 *    (Vercel Cron은 프로젝트 env에 CRON_SECRET이 있으면 이 헤더를 자동으로 붙인다)
 *  - CRON_SECRET 미설정 시: mock 모드에서만 허용. 실배포는 fail-closed.
 */
import { NextResponse } from 'next/server';
import { getDataServices } from '@/lib/data';
import { apiError, withApiHandler } from '../../_lib/http';
import { isCronAuthorized } from '../_lib/auth';

const handler = withApiHandler(async (request) => {
  if (!isCronAuthorized(request)) {
    return apiError(401, 'UNAUTHORIZED', '크론 인증에 실패했습니다.');
  }

  const expired = await getDataServices().credits.expireDue();
  return NextResponse.json({ expired });
});

export const GET = handler;
export const POST = handler;
