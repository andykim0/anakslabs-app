/**
 * [§2] POST /api/admin/qa-rules — 유형별 자동화 토글 (관리자 명시 활성화).
 * body: { editType, enabled }. video는 자동화 대상 제외(항상 사람 QA).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { QA_AUTOMATABLE_TYPES } from '@/lib/credits/constants';
import { getDataServices } from '@/lib/data';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { requireAdminOr403 } from '@/app/api/_lib/guards';

const bodySchema = z.object({
  editType: z.enum(['text', 'image', 'video', 'structure']),
  enabled: z.boolean(),
});

export const POST = withApiHandler(async (request) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;
  const { editType, enabled } = body.data;

  if (enabled && !QA_AUTOMATABLE_TYPES.includes(editType)) {
    return apiError(
      400,
      'NOT_AUTOMATABLE',
      '영상(video)은 원가 사유로 자동화 대상이 아닙니다. 항상 사람 QA를 유지합니다.',
    );
  }

  const { qa } = getDataServices();
  await qa.setEnabled(editType, enabled);
  const rules = await qa.listRules();
  return NextResponse.json({ ok: true, rules });
});
