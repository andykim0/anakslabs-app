/**
 * [§2] GET /api/admin/qa-stats — 유형별 QA 자동화 규칙 + 최근 승인률.
 * 관리자 대시보드(/admin/qa) 게이지·토글 데이터.
 */
import { NextResponse } from 'next/server';
import { getDataServices } from '@/lib/data';
import { withApiHandler } from '@/app/api/_lib/http';
import { requireAdminOr403 } from '@/app/api/_lib/guards';

export const GET = withApiHandler(async () => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const { qa } = getDataServices();
  const [rules, stats] = await Promise.all([qa.listRules(), qa.approvalStats()]);
  return NextResponse.json({ rules, stats });
});
