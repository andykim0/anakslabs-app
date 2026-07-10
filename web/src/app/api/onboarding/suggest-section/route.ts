/**
 * [v3 Phase 2] POST /api/onboarding/suggest-section — 커스텀 섹션 요청 → 섹션 계획 항목.
 * body: { name, description?, context } → { mappedType, name, copySeed }
 * mock: 결정적 키워드 매핑 / 실모드: Claude 판정 + 실패 시 결정적 폴백 (AiService.suggestCustomSection).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDataServices } from '@/lib/data';
import { parseBody, withApiHandler } from '../../_lib/http';
import { getAuthedClient, unauthorized } from '../../_lib/guards';

const bodySchema = z.object({
  name: z.string().min(1, '원하는 섹션을 입력해 주세요.').max(60),
  description: z.string().max(500).optional(),
  // [5-b] SuggestSectionContext — 설문 작성 중이므로 판정에 필요한 필드만
  context: z.object({
    businessName: z.string().max(100).default(''),
    industry: z.string().max(100).default(''),
    purpose: z.string().max(200).default(''),
    tone: z.string().max(200).optional(),
  }),
});

export const POST = withApiHandler(async (request) => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;
  const { name, description, context } = body.data;

  const result = await getDataServices().ai.suggestCustomSection({ name, description, context });
  return NextResponse.json(result);
});
