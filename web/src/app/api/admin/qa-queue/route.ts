/**
 * GET /api/admin/qa-queue — QA 대기 편집 요청 목록 (status in ai_processing, qa_review).
 */
import { NextResponse } from 'next/server';
import { getDataServices } from '@/lib/data';
import { withApiHandler } from '../../_lib/http';
import { requireAdminOr403 } from '../../_lib/guards';

export const GET = withApiHandler(async () => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const queue = await getDataServices().editRequests.listQaQueue();
  return NextResponse.json({ queue });
});
