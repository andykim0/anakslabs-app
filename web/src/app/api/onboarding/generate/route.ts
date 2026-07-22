/**
 * POST /api/onboarding/generate — 선택된 후보 + 설문 → SiteConfig 초안 생성 → 사이트(draft) 생성.
 * body: { survey, candidate, extras?, extrasOptions? } → { siteId }
 * [v3 Phase 3] extras(예약 CTA·문의 폼·지도·SNS)는 생성 직후 applyExtraFeatures로 대상 섹션에 주입.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { DesignCandidate, Site, SurveyInput } from '@/lib/types/domain';
import { getDataServices } from '@/lib/data';
import { applyExtraFeatures } from '@/lib/data/extras-inject';
import { applyGeneratedMotion } from '@/lib/motion/validate';
import { withSiteCinematicDefault } from '@/lib/motion/site-cinematic';
import { resolveBeforeAfterMotionOptions } from '@/lib/motion/before-after-activation';
import { authoritativeHeroVideoChoice } from '@/lib/onboarding/hero-video-selection';
import { canonicalizeSurveyTemplate } from '@/lib/onboarding/site-classification';
import { applySectionDirections } from '@/lib/onboarding/section-directions';
import { absorbUrlsInContent } from '@/lib/import/absorb-content';
import { isMockMode } from '@/lib/env';
import {
  CandidateAssetTruthError,
  validateCandidateAssetRef,
} from '@/lib/assets/owned-refs';
import { assetProvenanceConfig } from '@/lib/assets/provenance-flags';
import { assetPolicyVersionForNewSite } from '@/lib/assets/provenance-flags-core';
import {
  AssetTruthRequestError,
  mergeCanonicalAssetRefs,
  verifySurveyAssetTruth,
} from '@/lib/assets/survey-truth';
import { resolveSiteAssetPolicy } from '@/lib/assets/assignment';
import { apiError, parseBody, withApiHandler } from '../../_lib/http';
import {
  DEFAULT_V2_IMAGE_DIRECTION,
  isAssetTruthGenerationError,
} from '@/lib/ai/image-generation-policy';
import { getAuthedClient, unauthorized } from '../../_lib/guards';
import {
  accountHasSite,
  isAccountSiteLimitError,
  SITE_LIMIT_ERROR_CODE,
  SITE_LIMIT_MESSAGE,
} from '@/lib/billing/site-limit';
import {
  designCandidateSchema,
  extraFeatureSelectionSchema,
  extrasOptionsSchema,
  motionChoiceSchema,
  surveySchema,
} from '../../_lib/schemas';

const bodySchema = z.object({
  survey: surveySchema,
  candidate: designCandidateSchema,
  extras: extraFeatureSelectionSchema.optional(),
  extrasOptions: extrasOptionsSchema.optional(),
  // [Q7] 온보딩 '움직임 고르기' 선택 — 프리셋 주입 후 병합·sanitize
  motionChoice: motionChoiceSchema.optional(),
  // [멱등] 같은 온보딩 시도의 중복 generate가 사이트를 2개 만들지 않도록 dedup 키(클라 생성)
  idempotencyKey: z.string().min(1).max(100).optional(),
});

/**
 * [멱등] 최근 생성 dedup — `${clientId}:${idempotencyKey}` → {siteId, at}. 프로세스 인메모리(짧은 TTL).
 * StrictMode 이중 발화는 클라 in-flight dedup이 주로 막고, 이건 순차 중복(탭 재시도 등) 백스톱.
 * 완전 동시 요청은 DB의 계정별 사이트 유니크 제약이 최종 저장 경계에서 차단한다.
 */
const recentGenerations = new Map<string, { siteId: string; at: number }>();
const GEN_IDEM_TTL_MS = 60_000;

export const POST = withApiHandler(async (request) => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;

  const { ai, sites } = getDataServices();

  // [멱등] 같은 키로 최근 생성된 사이트가 있으면 그대로 반환한다. 첫 요청에서 onboarding
  // attestation이 site scope로 원자 결합된 뒤에도 안전하게 재시도할 수 있어야 한다.
  const idemK = body.data.idempotencyKey ? `${client.id}:${body.data.idempotencyKey}` : null;
  if (idemK) {
    const prev = recentGenerations.get(idemK);
    if (prev && Date.now() - prev.at < GEN_IDEM_TTL_MS) {
      const existing = await sites.getById(prev.siteId);
      if (existing && existing.clientId === client.id) {
        return NextResponse.json({ siteId: existing.id, site: existing, deduped: true }, { status: 200 });
      }
    }
  }

  // [BILL$] One paid account owns one self-service site. This explicit guard
  // runs after idempotent retry recovery but before asset checks or AI cost.
  // A second homepage is handled as a separate production contract.
  if (accountHasSite(await sites.listByClient(client.id), client.id)) {
    return apiError(409, SITE_LIMIT_ERROR_CODE, SITE_LIMIT_MESSAGE);
  }

  // [SS5] templateId는 클라이언트 힌트일 뿐. purpose+industry의 서버 레지스트리 결과가 권위다.
  const submittedSurvey: SurveyInput = canonicalizeSurveyTemplate(body.data.survey as SurveyInput);
  // Cohort membership is derived exclusively from server-owned launch flags.
  // Invalid WRITE -> ASSIGN -> ENFORCE dependencies throw here before any AI
  // generation or site mutation; they must never silently downgrade to legacy.
  const provenance = assetProvenanceConfig();
  const assetPolicyVersion = assetPolicyVersionForNewSite(provenance);
  if (submittedSurvey.imageDirectionId && !provenance.assign) {
    return apiError(
      503,
      'ASSET_POLICY_V2_NOT_ACTIVE',
      '새 이미지 방향은 안전한 자산 배정 기능이 활성화된 사이트에서만 사용할 수 있습니다.',
    );
  }
  // ASSIGN cohort membership is server-owned. Omitting the optional client
  // field cannot reopen the legacy photoreal path for a new v2 site.
  const canonicalSurvey: SurveyInput = provenance.assign && !submittedSurvey.imageDirectionId
    ? { ...submittedSurvey, imageDirectionId: DEFAULT_V2_IMAGE_DIRECTION }
    : submittedSurvey;
  let truth;
  try {
    truth = await verifySurveyAssetTruth({ survey: canonicalSurvey, clientId: client.id });
  } catch (error) {
    if (error instanceof AssetTruthRequestError) {
      return apiError(error.status, error.code, error.message);
    }
    throw error;
  }
  const survey = truth.survey;
  if (truth.directUploadAssetRefs.length && assetPolicyVersion !== 2) {
    return apiError(
      503,
      'ASSET_POLICY_V2_NOT_ACTIVE',
      '실제 사진의 안전한 사이트 귀속 기능이 아직 활성화되지 않았습니다. 예술적인 AI 방향을 사용하거나 잠시 후 다시 시도해 주세요.',
    );
  }
  let candidate: DesignCandidate;
  try {
    candidate = await validateCandidateAssetRef({
      candidate: body.data.candidate,
      clientId: client.id,
      expectedImageDirectionId: survey.imageDirectionId,
      allowedCustomerUploadAssetIds: truth.directUploadAssetRefs.map((ref) => ref.assetId),
    });
  } catch (error) {
    if (error instanceof CandidateAssetTruthError) {
      return apiError(error.status, error.code, error.message);
    }
    throw error;
  }

  // [v4 #3e] providedContent 내 URL 텍스트 흡수 (실모드만 — mock은 providedContent 미소비)
  if (!isMockMode() && survey.providedContent) {
    survey.providedContent = await absorbUrlsInContent(survey.providedContent);
  }

  let generatedByAi;
  try {
    // 사이트 row 생성 전 단계라 siteId는 아직 없다. 인증된 clientId만 provenance owner로 전달한다.
    generatedByAi = await ai.generateSiteConfig(survey, candidate, { clientId: client.id });
  } catch (error) {
    if (isAssetTruthGenerationError(error)) {
      return apiError(error.status, error.code, error.message, { guidance: error.guidance });
    }
    throw error;
  }
  const generated = applySectionDirections(generatedByAi, survey.directions);
  const withExtras = applyExtraFeatures(generated, body.data.extras, body.data.extrasOptions ?? {});
  // SITECINE is server-authored only: old stored configs stay absent/pixel-identical, every new site is pinned.
  const withCinematicDefault = withSiteCinematicDefault(withExtras);
  // [motion-system] LLM 출력 motion 무시 → 업종+플랜 매핑 프리셋 주입 → [Q7] 사용자 선택 병합 → sanitize
  const motionChoice = authoritativeHeroVideoChoice(survey, body.data.motionChoice);
  let draftConfig = applyGeneratedMotion(
    withCinematicDefault,
    survey.purposeId,
    client.tier,
    motionChoice,
    survey,
    { customerUploadAssetRefs: truth.directUploadAssetRefs, ownerId: client.id },
  );
  draftConfig = {
    ...draftConfig,
    assetRefs: mergeCanonicalAssetRefs(draftConfig.assetRefs, truth.directUploadAssetRefs),
  };
  let assetPolicy = await resolveSiteAssetPolicy({
    operation: 'assign',
    config: draftConfig,
    clientId: client.id,
    assetPolicyVersion,
    generalAttestationId: survey.generalAssetAttestationId,
    phase: 'generation',
  });
  draftConfig = assetPolicy.config;
  let site: Site;
  try {
    site = await sites.create({
      clientId: client.id,
      name: survey.businessName,
      draftConfig,
      ...(assetPolicyVersion ? { assetPolicyVersion } : {}),
      ...(draftConfig.assetRefs?.length ? { assetRefsToBind: draftConfig.assetRefs } : {}),
      ...(truth.directUploadAssetRefs.length && survey.generalAssetAttestationId
        ? { generalAssetAttestationId: survey.generalAssetAttestationId }
        : {}),
    });
  } catch (error) {
    // The DB uniqueness constraint closes the concurrent-request race left
    // between the early guard and the insert; return the same customer copy.
    if (isAccountSiteLimitError(error)) {
      return apiError(409, SITE_LIMIT_ERROR_CODE, SITE_LIMIT_MESSAGE);
    }
    throw error;
  }

  let motionWarning: { code: string; message: string } | undefined;
  if (motionChoice?.signatureId === 'before-after-scrub') {
    const provenance = await resolveBeforeAfterMotionOptions({
      survey,
      choice: motionChoice,
      clientId: client.id,
      siteId: site.id,
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
      draftConfig = {
        ...draftConfig,
        assetRefs: mergeCanonicalAssetRefs(draftConfig.assetRefs, truth.directUploadAssetRefs),
      };
      assetPolicy = await resolveSiteAssetPolicy({
        operation: 'assign',
        config: draftConfig,
        clientId: client.id,
        siteId: site.id,
        assetPolicyVersion,
        phase: 'generation',
      });
      draftConfig = assetPolicy.config;
      await sites.saveDraft(site.id, draftConfig);
      site = await sites.getById(site.id) ?? site;
    } else {
      motionWarning = { code: provenance.code, message: provenance.message };
    }
  }

  if (idemK) recentGenerations.set(idemK, { siteId: site.id, at: Date.now() });

  return NextResponse.json({
    siteId: site.id,
    site,
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
  }, { status: 201 });
});
