/**
 * POST /api/onboarding/candidates — 설문 → AI 디자인 후보 3안 (1차 가공).
 * body: { survey: SurveyInput, requestKey?: string }
 */
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { getDataServices } from '@/lib/data';
import { isMockMode } from '@/lib/env';
import { heroImageGenConfig } from '@/lib/onboarding/hero-image-cost';
import { surveyForHeroCandidates } from '@/lib/onboarding/hero-image-options';
import { assetProvenanceConfig } from '@/lib/assets/provenance-flags';
import {
  AssetTruthRequestError,
  verifySurveyAssetTruth,
} from '@/lib/assets/survey-truth';
import {
  CandidateAssetTruthError,
  validateCandidateAssetRef,
} from '@/lib/assets/owned-refs';
import {
  DEFAULT_V2_IMAGE_DIRECTION,
  isAssetTruthGenerationError,
} from '@/lib/ai/image-generation-policy';
import { apiError, parseBody, withApiHandler } from '../../_lib/http';
import { getAuthedClient, getOwnedSite, siteNotFound, unauthorized } from '../../_lib/guards';
import { surveySchema } from '../../_lib/schemas';

export const runtime = 'nodejs';

/** 한 번의 W1 호출이 반환할 수 있는 AI 무드 이미지 후보 상한. */
const HERO_CANDIDATE_LIMIT = 3;
const RATE_WINDOW_MS = 10 * 60_000;
const RATE_KEY = '__anaksHeroImageBatchRateLimit__' as const;
const DEDUP_KEY = '__anaksHeroImageCandidateDedup__' as const;

type DedupEntry =
  | { at: number; promise: Promise<DesignCandidate[]>; result?: never }
  | { at: number; result: DesignCandidate[]; promise?: never };
type GlobalWithCandidateGuards = typeof globalThis & {
  [RATE_KEY]?: Map<string, number[]>;
  [DEDUP_KEY]?: Map<string, DedupEntry>;
};

const bodySchema = z.object({
  survey: surveySchema,
  requestKey: z.string().min(1).max(100).optional(),
  siteId: z.string().min(1).optional(),
});

function rateLimited(clientId: string, max: number): boolean {
  const g = globalThis as GlobalWithCandidateGuards;
  const buckets = (g[RATE_KEY] ??= new Map<string, number[]>());
  const now = Date.now();
  const hits = (buckets.get(clientId) ?? []).filter((at) => now - at < RATE_WINDOW_MS);
  if (hits.length >= max) {
    buckets.set(clientId, hits);
    return true;
  }
  hits.push(now);
  buckets.set(clientId, hits);
  return false;
}

function surveySignature(survey: SurveyInput): string {
  return createHash('sha256').update(JSON.stringify(survey)).digest('hex');
}

function candidateDedupKey(
  clientId: string,
  requestKey: string | undefined,
  survey: SurveyInput,
  siteId?: string,
): string | null {
  if (!requestKey) return null;
  return `${clientId}:${siteId ?? 'new'}:${requestKey}:${surveySignature(survey)}`;
}

function getDedupStore(): Map<string, DedupEntry> {
  const g = globalThis as GlobalWithCandidateGuards;
  const store = (g[DEDUP_KEY] ??= new Map<string, DedupEntry>());
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.at >= RATE_WINDOW_MS) store.delete(key);
  }
  return store;
}

export const POST = withApiHandler(async (request) => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;

  // flag 의존성 오류는 rate 차감·Claude/Gemini 비용 전에 중단한다.
  const provenance = assetProvenanceConfig();
  const targetSiteId = body.data.siteId;
  if (targetSiteId) {
    const site = await getOwnedSite(targetSiteId, client.id);
    if (!site) return siteNotFound();
  }
  const submittedSurvey = body.data.survey as SurveyInput;
  if (submittedSurvey.imageDirectionId && !provenance.assign) {
    return apiError(
      503,
      'ASSET_POLICY_V2_NOT_ACTIVE',
      '새 이미지 방향은 안전한 자산 배정 기능이 활성화된 사이트에서만 사용할 수 있습니다.',
    );
  }
  const policySurvey: SurveyInput = provenance.assign && !submittedSurvey.imageDirectionId
    ? { ...submittedSurvey, imageDirectionId: DEFAULT_V2_IMAGE_DIRECTION }
    : submittedSurvey;
  let verified;
  try {
    verified = await verifySurveyAssetTruth({
      survey: policySurvey,
      clientId: client.id,
      ...(targetSiteId ? { targetSiteId } : {}),
    });
  } catch (error) {
    if (error instanceof AssetTruthRequestError) {
      return apiError(error.status, error.code, error.message);
    }
    throw error;
  }
  // WRITE-only rollout may record registry rows and attestations, but it must
  // not offer a candidate path that can never be assigned to the new site.
  // Keep this preflight ahead of dedup/rate/provider work and fail closed with
  // the same stable code used by final generation.
  if (verified.direction && !provenance.assign) {
    return apiError(
      503,
      'ASSET_POLICY_V2_NOT_ACTIVE',
      '확인된 실제 사진을 사이트에 연결하는 기능이 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.',
    );
  }
  // 실사 방향은 검증된 실제 사진을 그대로 사용한다. 예술 방향만 AI 무드 후보용으로
  // 대표 사진을 제외하며, 원본 설문/최종 사이트 상태는 변경하지 않는다.
  const survey = verified.direction === 'real_photo'
    ? verified.survey
    : surveyForHeroCandidates(verified.survey);
  const dedupKey = candidateDedupKey(client.id, body.data.requestKey, survey, targetSiteId);
  const dedupStore = getDedupStore();

  // 동일 요청의 완료 결과뿐 아니라 진행 중 Promise도 먼저 재사용한다. 비용·rate 횟수를 다시 쓰지 않는다.
  const cached = dedupKey ? dedupStore.get(dedupKey) : undefined;
  if (cached) {
    try {
      const candidates = cached.result ?? await cached.promise;
      return NextResponse.json({ candidates });
    } catch (error) {
      // An in-flight duplicate observes the same provider/policy failure as
      // the original request. It must receive the same stable 422 response,
      // not the generic withApiHandler 500 fallback.
      if (dedupKey) dedupStore.delete(dedupKey);
      if (isAssetTruthGenerationError(error)) {
        return apiError(error.status, error.code, error.message, { guidance: error.guidance });
      }
      if (error instanceof CandidateAssetTruthError) {
        return apiError(error.status, error.code, error.message);
      }
      throw error;
    }
  }

  const cfg = heroImageGenConfig();
  const requiresAiMedia = verified.direction !== 'real_photo';
  // (a) 프로덕션 킬스위치 — mock은 외부 AI 비용이 없으므로 우회
  if (requiresAiMedia && !cfg.enabled && !isMockMode()) {
    return apiError(503, 'HERO_IMAGE_GEN_DISABLED', '히어로 이미지 만들기가 잠시 꺼져 있어요. 잠시 후 다시 시도해 주세요.');
  }
  // (b) 클라이언트당 10분 신규 배치 상한. dedup 조회 뒤에 있어 중복 요청은 횟수를 쓰지 않는다.
  if (requiresAiMedia && rateLimited(client.id, cfg.maxBatchesPerClient)) {
    return apiError(429, 'HERO_IMAGE_RATE_LIMITED', '히어로 이미지 요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.');
  }

  const generation = getDataServices().ai.generateCandidates(
    survey,
    // 서버 인증 결과만 신뢰한다. 설문/request body는 자산 소유권 입력으로 사용하지 않는다.
    { clientId: client.id, ...(targetSiteId ? { siteId: targetSiteId } : {}) },
  ).then(async (items) => {
    const limited = items.slice(0, HERO_CANDIDATE_LIMIT);
    const verifiedDirection = verified.direction;
    if (!verifiedDirection) return limited;
    // 후보 선택 전에도 registry owner·canonical URL·site binding을 다시 확인한다.
    // AI provider 폴백이 URL만 내보내는 경우 v2 후보로 표시하지 않고 fail-closed한다.
    return Promise.all(limited.map((candidate) => validateCandidateAssetRef({
      candidate,
      clientId: client.id,
      ...(targetSiteId ? { targetSiteId } : {}),
      expectedImageDirectionId: verifiedDirection,
      allowedCustomerUploadAssetIds: verified.directUploadAssetRefs.map((ref) => ref.assetId),
    })));
  });
  if (dedupKey) dedupStore.set(dedupKey, { at: Date.now(), promise: generation });

  let candidates: DesignCandidate[];
  try {
    candidates = await generation;
    if (dedupKey) dedupStore.set(dedupKey, { at: Date.now(), result: candidates });
  } catch (error) {
    // 실패 결과는 캐시하지 않는다. 같은 키로 사용자가 안전하게 재시도할 수 있어야 한다.
    if (dedupKey) dedupStore.delete(dedupKey);
    if (isAssetTruthGenerationError(error)) {
      return apiError(error.status, error.code, error.message, { guidance: error.guidance });
    }
    if (error instanceof CandidateAssetTruthError) {
      return apiError(error.status, error.code, error.message);
    }
    throw error;
  }

  // (c) 실제 신규 배치 호출 로그. requestKey 원문은 로그 인젝션·개인정보 방지를 위해 남기지 않는다.
  console.info(`[hero-image-candidates] client=${client.id} direction=${verified.direction ?? 'legacy'} generated=${candidates.length} mock=${isMockMode()}`);

  return NextResponse.json({ candidates });
});
