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
import { absorbUrlsInContent } from '@/lib/import/absorb-content';
import { isMockMode } from '@/lib/env';
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

  const survey: SurveyInput = body.data.survey;
  const candidate: DesignCandidate = body.data.candidate;

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

  const generated = await ai.generateSiteConfig(survey, candidate);
  const withExtras = applyExtraFeatures(generated, body.data.extras, body.data.extrasOptions ?? {});
  // [motion-system] LLM 출력 motion 무시 → 업종+플랜 매핑 프리셋으로 덮어쓴 뒤 이중 방벽 sanitize
  const draftConfig = applyGeneratedMotion(withExtras, survey.purposeId, client.tier);
  const site = await sites.create({
    clientId: client.id,
    name: survey.businessName,
    draftConfig,
  });

  if (idemK) recentGenerations.set(idemK, { siteId: site.id, at: Date.now() });

  return NextResponse.json({ siteId: site.id, site }, { status: 201 });
});
