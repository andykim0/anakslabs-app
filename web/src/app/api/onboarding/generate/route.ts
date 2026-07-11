/**
 * POST /api/onboarding/generate — 선택된 후보 + 설문 → SiteConfig 초안 생성 → 사이트(draft) 생성.
 * body: { survey, candidate, extras?, extrasOptions? } → { siteId }
 * [v3 Phase 3] extras(문의 폼·지도·SNS)는 생성 직후 applyExtraFeatures로 대상 섹션에 주입.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { getDataServices } from '@/lib/data';
import { applyExtraFeatures } from '@/lib/data/extras-inject';
import { applyGeneratedMotion } from '@/lib/motion/validate';
import { parseBody, withApiHandler } from '../../_lib/http';
import { getAuthedClient, unauthorized } from '../../_lib/guards';
import {
  designCandidateSchema,
  extraFeatureSelectionSchema,
  extrasOptionsSchema,
  surveySchema,
} from '../../_lib/schemas';

const bodySchema = z.object({
  survey: surveySchema,
  candidate: designCandidateSchema,
  extras: extraFeatureSelectionSchema.optional(),
  extrasOptions: extrasOptionsSchema.optional(),
});

export const POST = withApiHandler(async (request) => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;

  const survey: SurveyInput = body.data.survey;
  const candidate: DesignCandidate = body.data.candidate;

  const { ai, sites } = getDataServices();
  const generated = await ai.generateSiteConfig(survey, candidate);
  const withExtras = applyExtraFeatures(generated, body.data.extras, body.data.extrasOptions ?? {});
  // [motion-system] LLM 출력 motion 무시 → 업종+플랜 매핑 프리셋으로 덮어쓴 뒤 이중 방벽 sanitize
  const draftConfig = applyGeneratedMotion(withExtras, survey.purposeId, client.tier);
  const site = await sites.create({
    clientId: client.id,
    name: survey.businessName,
    draftConfig,
  });

  return NextResponse.json({ siteId: site.id, site }, { status: 201 });
});
