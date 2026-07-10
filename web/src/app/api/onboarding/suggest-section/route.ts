/**
 * [v3 Phase 2] POST /api/onboarding/suggest-section — 커스텀 섹션 요청 → 섹션 계획 항목.
 * body: { name, description?, survey(요약) } → { mappedType, name, copySeed }
 * mock: 결정적 키워드 매핑 / 실모드: Claude 판정 + 실패 시 결정적 폴백 (AiService.suggestCustomSection).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SitePurposeId, SurveyInput } from '@/lib/types/domain';
import { getDataServices } from '@/lib/data';
import { parseBody, withApiHandler } from '../../_lib/http';
import { getAuthedClient, unauthorized } from '../../_lib/guards';

const bodySchema = z.object({
  name: z.string().min(1, '원하는 섹션을 입력해 주세요.').max(60),
  description: z.string().max(500).optional(),
  survey: z.object({
    businessName: z.string().max(100).default(''),
    industry: z.string().max(100).default(''),
    purpose: z.string().max(200).default(''),
    tone: z.string().max(200).default(''),
    colorPreference: z.string().max(200).default(''),
  }),
});

export const POST = withApiHandler(async (request) => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;
  const { name, description, survey: summary } = body.data;

  // 서비스 계약(suggestCustomSection)은 SurveyInput 전체를 받지만 맥락(업종/목적/톤)만 사용.
  // 이 시점엔 sectionPlan 편집 중이라 최소 필드로 구성한다.
  const survey: SurveyInput = {
    businessName: summary.businessName,
    purposeId: 'company_brand' as SitePurposeId, // 서비스 미사용 — placeholder
    purpose: summary.purpose,
    industry: summary.industry,
    tone: summary.tone,
    colorPreference: summary.colorPreference,
    referenceImageUrls: [],
    sectionPlan: [],
    templateId: '',
  };

  const result = await getDataServices().ai.suggestCustomSection({ name, description, survey });
  return NextResponse.json(result);
});
