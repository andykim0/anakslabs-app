/**
 * [§3] POST /api/onboarding/regenerate — 온보딩 무료 재생성 (사이트당 1회).
 * body: { siteId, survey, candidate } → 선택 후보/설문으로 draft를 재생성 교체.
 *
 * 규칙:
 *  - 소유권 검증
 *  - free_regens_used >= FREE_REGEN_LIMIT → 409 REGEN_LIMIT
 *  - 카운터 증가는 생성 성공(saveDraft) 이후 (AI 실패 시 무료 기회 소진 금지)
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { FREE_REGEN_LIMIT } from '@/lib/credits/constants';
import { getDataServices } from '@/lib/data';
import { applyExtraFeatures } from '@/lib/data/extras-inject';
import { applyGeneratedMotion } from '@/lib/motion/validate';
import { authoritativeHeroVideoChoice } from '@/lib/onboarding/hero-video-selection';
import { absorbUrlsInContent } from '@/lib/import/absorb-content';
import { isMockMode } from '@/lib/env';
import { apiError, parseBody, withApiHandler } from '../../_lib/http';
import { getAuthedClient, getOwnedSite, siteNotFound, unauthorized } from '../../_lib/guards';
import {
  designCandidateSchema,
  extraFeatureSelectionSchema,
  extrasOptionsSchema,
  motionChoiceSchema,
  surveySchema,
} from '../../_lib/schemas';

const bodySchema = z.object({
  siteId: z.string().min(1),
  survey: surveySchema,
  candidate: designCandidateSchema,
  // [v3 Phase 3] 재생성 시에도 부가기능 유지 가능
  extras: extraFeatureSelectionSchema.optional(),
  extrasOptions: extrasOptionsSchema.optional(),
  // [Q7] 재생성에도 움직임 선택 유지
  motionChoice: motionChoiceSchema.optional(),
});

export const POST = withApiHandler(async (request) => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;
  const { siteId } = body.data;
  const survey: SurveyInput = body.data.survey;
  const candidate: DesignCandidate = body.data.candidate;

  const site = await getOwnedSite(siteId, client.id);
  if (!site) return siteNotFound();

  const used = site.freeRegensUsed ?? 0;
  if (used >= FREE_REGEN_LIMIT) {
    return apiError(
      409,
      'REGEN_LIMIT',
      `무료 재생성은 사이트당 ${FREE_REGEN_LIMIT}회까지 제공됩니다. 이후에는 캔버스 에디터에서 직접 다듬거나 편집 크레딧을 이용해 주세요.`,
      { freeRegensUsed: used, limit: FREE_REGEN_LIMIT },
    );
  }

  const { ai, sites } = getDataServices();
  // [v4 #3e] providedContent 내 URL 텍스트 흡수 (실모드만)
  if (!isMockMode() && survey.providedContent) {
    survey.providedContent = await absorbUrlsInContent(survey.providedContent);
  }
  // 생성 성공 후에만 카운터 증가 (AI 실패 시 무료 기회 보존)
  const generated = await ai.generateSiteConfig(survey, candidate);
  const withExtras = applyExtraFeatures(generated, body.data.extras, body.data.extrasOptions ?? {});
  // [motion-system] LLM 출력 motion 무시 → 업종+플랜 매핑 프리셋 + 이중 방벽 sanitize
  const draftConfig = applyGeneratedMotion(
    withExtras,
    survey.purposeId,
    client.tier,
    authoritativeHeroVideoChoice(survey, body.data.motionChoice),
  );
  await sites.saveDraft(siteId, draftConfig);
  await sites.incrementFreeRegens(siteId);

  const updated = await sites.getById(siteId);
  return NextResponse.json({
    siteId,
    site: updated ?? site,
    freeRegensUsed: used + 1,
    freeRegenLimit: FREE_REGEN_LIMIT,
  });
});
