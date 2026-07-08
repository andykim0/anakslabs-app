/**
 * POST /api/onboarding/candidates — 설문 → AI 디자인 후보 3안 (1차 가공).
 * body: { survey: SurveyInput }
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SurveyInput } from '@/lib/types/domain';
import { getDataServices } from '@/lib/data';
import { parseBody, withApiHandler } from '../../_lib/http';
import { getAuthedClient, unauthorized } from '../../_lib/guards';
import { surveySchema } from '../../_lib/schemas';

const bodySchema = z.object({
  survey: surveySchema,
});

export const POST = withApiHandler(async (request) => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;

  const survey: SurveyInput = body.data.survey;
  const candidates = await getDataServices().ai.generateCandidates(survey);

  return NextResponse.json({ candidates });
});
