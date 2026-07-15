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
import { resolveBeforeAfterMotionOptions } from '@/lib/motion/before-after-activation';
import { authoritativeHeroVideoChoice } from '@/lib/onboarding/hero-video-selection';
import { canonicalizeSurveyTemplate } from '@/lib/onboarding/site-classification';
import { applySectionDirections } from '@/lib/onboarding/section-directions';
import { absorbUrlsInContent } from '@/lib/import/absorb-content';
import { isMockMode } from '@/lib/env';
import {
  validateCandidateAssetRef,
} from '@/lib/assets/owned-refs';
import { assetProvenanceConfig } from '@/lib/assets/provenance-flags';
import { assetPolicyVersionForNewSite } from '@/lib/assets/provenance-flags-core';
import { parseBody, withApiHandler } from '../../_lib/http';
import { getAuthedClient, unauthorized } from '../../_lib/guards';
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
 * (완전 동시 요청까지 막으려면 DB 유니크 제약이 필요 — 백로그.)
 */
const recentGenerations = new Map<string, { siteId: string; at: number }>();
const GEN_IDEM_TTL_MS = 60_000;

export const POST = withApiHandler(async (request) => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;

  // [SS5] templateId는 클라이언트 힌트일 뿐. purpose+industry의 서버 레지스트리 결과가 권위다.
  const survey: SurveyInput = canonicalizeSurveyTemplate(body.data.survey as SurveyInput);
  const candidate: DesignCandidate = await validateCandidateAssetRef({
    candidate: body.data.candidate,
    clientId: client.id,
  });
  // Cohort membership is derived exclusively from server-owned launch flags.
  // Invalid WRITE -> ASSIGN -> ENFORCE dependencies throw here before any AI
  // generation or site mutation; they must never silently downgrade to legacy.
  const provenance = assetProvenanceConfig();
  const assetPolicyVersion = assetPolicyVersionForNewSite(provenance);

  const { ai, sites } = getDataServices();

  // [멱등] 같은 키로 최근 생성된 사이트가 있으면 그대로 반환(2번째 create·AI 생성 비용 방지).
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

  // [v4 #3e] providedContent 내 URL 텍스트 흡수 (실모드만 — mock은 providedContent 미소비)
  if (!isMockMode() && survey.providedContent) {
    survey.providedContent = await absorbUrlsInContent(survey.providedContent);
  }

  const generated = applySectionDirections(
    // 사이트 row 생성 전 단계라 siteId는 아직 없다. 인증된 clientId만 provenance owner로 전달한다.
    await ai.generateSiteConfig(survey, candidate, { clientId: client.id }),
    survey.directions,
  );
  const withExtras = applyExtraFeatures(generated, body.data.extras, body.data.extrasOptions ?? {});
  // [motion-system] LLM 출력 motion 무시 → 업종+플랜 매핑 프리셋 주입 → [Q7] 사용자 선택 병합 → sanitize
  const motionChoice = authoritativeHeroVideoChoice(survey, body.data.motionChoice);
  let draftConfig = applyGeneratedMotion(
    withExtras,
    survey.purposeId,
    client.tier,
    motionChoice,
    survey,
  );
  let site = await sites.create({
    clientId: client.id,
    name: survey.businessName,
    draftConfig,
    ...(assetPolicyVersion ? { assetPolicyVersion } : {}),
    ...(draftConfig.assetRefs?.length ? { assetRefsToBind: draftConfig.assetRefs } : {}),
  });

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
        withExtras,
        survey.purposeId,
        client.tier,
        motionChoice,
        survey,
        provenance.options,
      );
      await sites.saveDraft(site.id, draftConfig);
      site = await sites.getById(site.id) ?? site;
    } else {
      motionWarning = { code: provenance.code, message: provenance.message };
    }
  }

  if (idemK) recentGenerations.set(idemK, { siteId: site.id, at: Date.now() });

  return NextResponse.json({ siteId: site.id, site, ...(motionWarning ? { motionWarning } : {}) }, { status: 201 });
});
