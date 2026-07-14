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
import { apiError, parseBody, withApiHandler } from '../../_lib/http';
import { getAuthedClient, unauthorized } from '../../_lib/guards';
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

/** 대표 사진은 W1의 별도 카드다. 후보 서비스에는 사진 없는 복사본을 넘겨 AI 무드 3안을 만든다. */
function withoutHeroPhoto(survey: SurveyInput): SurveyInput {
  const copy = { ...survey };
  delete copy.heroPhotoUrl;
  return copy;
}

function surveySignature(survey: SurveyInput): string {
  return createHash('sha256').update(JSON.stringify(survey)).digest('hex');
}

function candidateDedupKey(clientId: string, requestKey: string | undefined, survey: SurveyInput): string | null {
  if (!requestKey) return null;
  return `${clientId}:${requestKey}:${surveySignature(survey)}`;
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

  const survey = withoutHeroPhoto(body.data.survey as SurveyInput);
  const dedupKey = candidateDedupKey(client.id, body.data.requestKey, survey);
  const dedupStore = getDedupStore();

  // 동일 요청의 완료 결과뿐 아니라 진행 중 Promise도 먼저 재사용한다. 비용·rate 횟수를 다시 쓰지 않는다.
  const cached = dedupKey ? dedupStore.get(dedupKey) : undefined;
  if (cached) {
    const candidates = cached.result ?? await cached.promise;
    return NextResponse.json({ candidates });
  }

  const cfg = heroImageGenConfig();
  // (a) 프로덕션 킬스위치 — mock은 외부 AI 비용이 없으므로 우회
  if (!cfg.enabled && !isMockMode()) {
    return apiError(503, 'HERO_IMAGE_GEN_DISABLED', '히어로 이미지 만들기가 잠시 꺼져 있어요. 잠시 후 다시 시도해 주세요.');
  }
  // (b) 클라이언트당 10분 신규 배치 상한. dedup 조회 뒤에 있어 중복 요청은 횟수를 쓰지 않는다.
  if (rateLimited(client.id, cfg.maxBatchesPerClient)) {
    return apiError(429, 'HERO_IMAGE_RATE_LIMITED', '히어로 이미지 요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.');
  }

  const generation = getDataServices().ai.generateCandidates(survey).then((items) =>
    items.slice(0, HERO_CANDIDATE_LIMIT),
  );
  if (dedupKey) dedupStore.set(dedupKey, { at: Date.now(), promise: generation });

  let candidates: DesignCandidate[];
  try {
    candidates = await generation;
    if (dedupKey) dedupStore.set(dedupKey, { at: Date.now(), result: candidates });
  } catch (error) {
    // 실패 결과는 캐시하지 않는다. 같은 키로 사용자가 안전하게 재시도할 수 있어야 한다.
    if (dedupKey) dedupStore.delete(dedupKey);
    throw error;
  }

  // (c) 실제 신규 배치 호출 로그. requestKey 원문은 로그 인젝션·개인정보 방지를 위해 남기지 않는다.
  console.info(`[hero-image-candidates] client=${client.id} generated=${candidates.length} mock=${isMockMode()}`);

  return NextResponse.json({ candidates });
});
