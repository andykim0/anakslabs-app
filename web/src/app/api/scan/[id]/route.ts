/**
 * [v3 Phase 6] GET /api/scan/[id] — 진단 결과 재조회/공유 (비로그인 허용, id는 uuid).
 */
import { NextResponse } from 'next/server';
import { getDataServices } from '@/lib/data';
import { apiError, withApiHandler } from '@/app/api/_lib/http';
import { isScanExpired } from '@/lib/scan/retention';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApiHandler<Ctx>(async (_request, { params }) => {
  const { id } = await params;
  const scan = await getDataServices().scans.getById(id);
  if (!scan || isScanExpired(scan.createdAt)) return apiError(404, 'SCAN_NOT_FOUND', '진단 결과를 찾을 수 없습니다.');
  return NextResponse.json({ scan });
});
