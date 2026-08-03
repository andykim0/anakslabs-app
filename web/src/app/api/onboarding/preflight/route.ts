import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSiteRateLimiter } from '@/lib/analytics/site-event-ingest';
import { preflightOnboardingSurvey } from '@/lib/onboarding/nudge-preflight';
import type { SurveyInput } from '@/lib/types/domain';
import { apiError, parseBody, withApiHandler } from '../../_lib/http';
import { getAuthedClient, unauthorized } from '../../_lib/guards';
import { surveySchema } from '../../_lib/schemas';

export const runtime = 'nodejs';

export const ONBOARDING_PREFLIGHT_RATE_LIMIT = 30;
export const ONBOARDING_PREFLIGHT_WINDOW_MS = 60_000;
const RATE_KEY = '__anaksOnboardingPreflightRateLimiter__' as const;
type GlobalWithLimiter = typeof globalThis & {
  [RATE_KEY]?: ReturnType<typeof createSiteRateLimiter>;
};

function limiter() {
  const globalState = globalThis as GlobalWithLimiter;
  return (globalState[RATE_KEY] ??= createSiteRateLimiter({
    limit: ONBOARDING_PREFLIGHT_RATE_LIMIT,
    windowMs: ONBOARDING_PREFLIGHT_WINDOW_MS,
    maxBuckets: 5_000,
  }));
}

const bodySchema = z.object({ survey: surveySchema }).strict();

export const POST = withApiHandler(async (request) => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();
  if (!limiter().allow(client.id)) {
    return apiError(429, 'RATE_LIMITED', '입력이 빠르게 바뀌고 있어요. 잠시 뒤 다시 확인해 주세요.');
  }
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;

  // 임시 config는 메모리에서만 만들고 기존 스캐너에 전달한다. 저장소 쓰기·외부 fetch는 없다.
  const result = preflightOnboardingSurvey(body.data.survey as SurveyInput);
  return NextResponse.json({
    scores: result.scores,
    grade: result.grade,
    issueCodes: result.issueCodes,
    nudges: result.nudges,
  });
});

