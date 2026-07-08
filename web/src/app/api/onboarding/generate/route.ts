/**
 * POST /api/onboarding/generate — 선택된 후보 + 설문 → SiteConfig 초안 생성 → 사이트(draft) 생성.
 * body: { survey: SurveyInput, candidate: DesignCandidate } → { siteId }
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { getDataServices } from '@/lib/data';
import { parseBody, withApiHandler } from '../../_lib/http';
import { getAuthedClient, unauthorized } from '../../_lib/guards';
import { designCandidateSchema, surveySchema } from '../../_lib/schemas';

const bodySchema = z.object({
  survey: surveySchema,
  candidate: designCandidateSchema,
});

export const POST = withApiHandler(async (request) => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;

  const survey: SurveyInput = body.data.survey;
  const candidate: DesignCandidate = body.data.candidate;

  const { ai, sites } = getDataServices();
  const draftConfig = await ai.generateSiteConfig(survey, candidate);
  const site = await sites.create({
    clientId: client.id,
    name: survey.businessName,
    draftConfig,
  });

  return NextResponse.json({ siteId: site.id, site }, { status: 201 });
});
