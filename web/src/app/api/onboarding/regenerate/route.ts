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
import {
  recompileDirectionsSectionLayouts,
  recompileGallerySectionLayouts,
} from '@/lib/layout';
import { applyGeneratedMotion } from '@/lib/motion/validate';
import { withContinuousCanvasDefault, withSiteCinematicDefault } from '@/lib/motion/site-cinematic';
import { resolveBeforeAfterMotionOptions } from '@/lib/motion/before-after-activation';
import { authoritativeHeroVideoChoice } from '@/lib/onboarding/hero-video-selection';
import { canonicalizeSurveyTemplate } from '@/lib/onboarding/site-classification';
import { applySectionDirections } from '@/lib/onboarding/section-directions';
import { absorbUrlsInContent } from '@/lib/import/absorb-content';
import { isMockMode } from '@/lib/env';
import {
  bindGeneratedConfigAssetRefs,
  CandidateAssetTruthError,
  validateCandidateAssetRef,
} from '@/lib/assets/owned-refs';
import { assetProvenanceConfig } from '@/lib/assets/provenance-flags';
import {
  AssetTruthRequestError,
  mergeCanonicalAssetRefs,
  verifySurveyAssetTruth,
} from '@/lib/assets/survey-truth';
import { resolveSiteAssetPolicy } from '@/lib/assets/assignment';
import { apiError, parseBody, withApiHandler } from '../../_lib/http';
import {
  DEFAULT_V2_IMAGE_DIRECTION,
  selectRealPhotoAssetRef,
} from '@/lib/ai/image-generation-policy';
import { applyHeroPhotoPromotion } from '@/lib/assets/hero-photo-promotion';
import { applyProceduralBackgroundDefaults } from '@/lib/abstract/application';
import { buildZeroCostSiteConfig } from '@/lib/billing/prepublish-cost-policy';
import { applyConnectorManifest } from '@/lib/connectors/application';
import { candidateMatchesNamedTemplate } from '@/lib/design/templates';
import { getAuthedClient, getOwnedSite, siteNotFound, unauthorized } from '../../_lib/guards';
import {
  designCandidateSchema,
  extraFeatureSelectionSchema,
  extrasOptionsSchema,
  motionChoiceSchema,
  surveySchema,
} from '../../_lib/schemas';
import { applyCategoricalStockSupply } from '@/lib/stock/application';
import { ensureLicensedStockAssetRefs } from '@/lib/stock/registry';

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
  // [SS5] 재생성도 최초 생성과 같은 서버 권위 템플릿 분류를 사용한다.
  const submittedSurvey: SurveyInput = canonicalizeSurveyTemplate(body.data.survey as SurveyInput);
  const candidateInput: DesignCandidate = body.data.candidate;

  const site = await getOwnedSite(siteId, client.id);
  if (!site) return siteNotFound();
  const provenanceFlags = assetProvenanceConfig();
  if ((submittedSurvey.imageDirectionId || site.assetPolicyVersion === 2) && !provenanceFlags.assign) {
    return apiError(
      503,
      'ASSET_POLICY_V2_NOT_ACTIVE',
      '새 이미지 방향은 안전한 자산 배정 기능이 활성화된 사이트에서만 사용할 수 있습니다.',
    );
  }
  // A persisted v2 site remains in the v2 truth path even if an older client
  // omits the additive direction field.
  const canonicalSurvey: SurveyInput = site.assetPolicyVersion === 2 && !submittedSurvey.imageDirectionId
    ? { ...submittedSurvey, imageDirectionId: DEFAULT_V2_IMAGE_DIRECTION }
    : submittedSurvey;
  let truth;
  try {
    truth = await verifySurveyAssetTruth({
      survey: canonicalSurvey,
      clientId: client.id,
      targetSiteId: siteId,
    });
  } catch (error) {
    if (error instanceof AssetTruthRequestError) {
      return apiError(error.status, error.code, error.message);
    }
    throw error;
  }
  const survey = truth.survey;
  if (truth.directUploadAssetRefs.length && site.assetPolicyVersion !== 2) {
    return apiError(
      503,
      'ASSET_POLICY_V2_NOT_ACTIVE',
      '이 사이트는 아직 실제 사진의 안전한 재생성 귀속 대상이 아닙니다. 기존 사진은 에디터에서 직접 유지해 주세요.',
    );
  }
  let candidate: DesignCandidate;
  try {
    candidate = await validateCandidateAssetRef({
      candidate: candidateInput,
      clientId: client.id,
      targetSiteId: siteId,
      expectedImageDirectionId: survey.imageDirectionId,
      allowedCustomerUploadAssetIds: truth.directUploadAssetRefs.map((ref) => ref.assetId),
    });
  } catch (error) {
    if (error instanceof CandidateAssetTruthError) {
      return apiError(error.status, error.code, error.message);
    }
    throw error;
  }
  if (!candidateMatchesNamedTemplate(candidate, survey)) {
    return apiError(
      400,
      'INVALID_NAMED_TEMPLATE',
      '선택한 템플릿 조합을 확인할 수 없습니다. 업종에 맞는 후보를 다시 골라주세요.',
    );
  }

  const used = site.freeRegensUsed ?? 0;
  if (used >= FREE_REGEN_LIMIT) {
    return apiError(
      409,
      'REGEN_LIMIT',
      `무료 재생성은 사이트당 ${FREE_REGEN_LIMIT}회까지 제공됩니다. 이후에는 캔버스 에디터에서 직접 다듬거나 편집 크레딧을 이용해 주세요.`,
      { freeRegensUsed: used, limit: FREE_REGEN_LIMIT },
    );
  }

  const { sites } = getDataServices();
  // [v4 #3e] providedContent 내 URL 텍스트 흡수 (실모드만)
  if (!isMockMode() && survey.providedContent) {
    survey.providedContent = await absorbUrlsInContent(survey.providedContent);
  }
  // 결제 전 재구성도 같은 결정적 표준 빌더만 소비한다.
  const generatedByAi = buildZeroCostSiteConfig(survey, candidate);
  const generated = applySectionDirections(generatedByAi, survey.directions);
  const withLegacyExtras = applyExtraFeatures(generated, body.data.extras, body.data.extrasOptions ?? {});
  const withExtras = applyConnectorManifest(withLegacyExtras, survey, body.data.extras);
  const withCinematicBase = withSiteCinematicDefault(withExtras);
  const withCinematicDefault = survey.contentDepth?.mainStorytelling
    ? withContinuousCanvasDefault(withCinematicBase)
    : withCinematicBase;
  const withRecompiledDirections = recompileDirectionsSectionLayouts(withCinematicDefault);
  // [motion-system] LLM 출력 motion 무시 → 업종+플랜 매핑 프리셋 + 이중 방벽 sanitize
  const motionChoice = authoritativeHeroVideoChoice(survey, body.data.motionChoice);
  let draftConfig = applyGeneratedMotion(
    withRecompiledDirections,
    survey.purposeId,
    client.tier,
    motionChoice,
    survey,
    {
      customerUploadAssetRefs: truth.directUploadAssetRefs,
      ownerId: client.id,
      siteId,
    },
  );
  const selectedRealPhoto = survey.imageDirectionId === 'real_photo'
    ? selectRealPhotoAssetRef(survey).ref
    : null;
  if (selectedRealPhoto) {
    draftConfig = applyHeroPhotoPromotion({
      config: draftConfig,
      candidate,
      customerPhotoRef: selectedRealPhoto,
    });
  }
  draftConfig = {
    ...draftConfig,
    assetRefs: mergeCanonicalAssetRefs(draftConfig.assetRefs, truth.directUploadAssetRefs),
  };
  let motionWarning: { code: string; message: string } | undefined;
  if (motionChoice?.signatureId === 'before-after-scrub') {
    const provenance = await resolveBeforeAfterMotionOptions({
      survey,
      choice: motionChoice,
      clientId: client.id,
      siteId,
      industryClass: draftConfig.meta.industryClass ?? 'other',
    });
    if (provenance.ok) {
      draftConfig = applyGeneratedMotion(
        withCinematicDefault,
        survey.purposeId,
        client.tier,
        motionChoice,
        survey,
        {
          ...provenance.options,
          customerUploadAssetRefs: truth.directUploadAssetRefs,
        },
      );
      if (selectedRealPhoto) {
        draftConfig = applyHeroPhotoPromotion({
          config: draftConfig,
          candidate,
          customerPhotoRef: selectedRealPhoto,
        });
      }
      draftConfig = {
        ...draftConfig,
        assetRefs: mergeCanonicalAssetRefs(draftConfig.assetRefs, truth.directUploadAssetRefs),
      };
    } else {
      motionWarning = { code: provenance.code, message: provenance.message };
    }
  }
  draftConfig = recompileGallerySectionLayouts(draftConfig);
  draftConfig = applyCategoricalStockSupply(draftConfig).config;
  await ensureLicensedStockAssetRefs(draftConfig.assetRefs);
  draftConfig = await bindGeneratedConfigAssetRefs({
    config: draftConfig,
    clientId: client.id,
    siteId,
  });
  const assetPolicy = await resolveSiteAssetPolicy({
    operation: 'assign',
    config: draftConfig,
    clientId: client.id,
    siteId,
    assetPolicyVersion: site.assetPolicyVersion,
    phase: 'regeneration',
  });
  draftConfig = applyProceduralBackgroundDefaults(assetPolicy.config);
  await sites.saveDraft(siteId, draftConfig);
  await sites.incrementFreeRegens(siteId);

  const updated = await sites.getById(siteId);
  return NextResponse.json({
    siteId,
    site: updated ?? site,
    freeRegensUsed: used + 1,
    freeRegenLimit: FREE_REGEN_LIMIT,
    ...(motionWarning ? { motionWarning } : {}),
    ...(assetPolicy.violations.length
      ? {
          assetWarnings: assetPolicy.violations.map(({ slotKey, reason, fallbackIntent }) => ({
            slotKey,
            reason,
            fallbackIntent,
          })),
        }
      : {}),
  });
});
