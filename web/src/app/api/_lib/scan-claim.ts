/**
 * [v3 Phase 7] 스캔→가입 전환: 로그인 시 익명 스캔을 로그인 client에 귀속.
 * anaks_scan_id(익명 스캔) → claim → 삭제, anaks_recent_scan(읽기 가능)으로 전환해
 * 대시보드·온보딩 배너/프리필이 스캔 결과를 재사용한다.
 */
import type { NextRequest, NextResponse } from 'next/server';
import { getDataServices } from '@/lib/data';

export const SCAN_ID_COOKIE = 'anaks_scan_id';
export const RECENT_SCAN_COOKIE = 'anaks_recent_scan';

export async function claimPendingScan(
  request: NextRequest,
  res: NextResponse,
  clientId: string,
): Promise<void> {
  const scanId = request.cookies.get(SCAN_ID_COOKIE)?.value;
  if (!scanId) return;
  try {
    const scan = await getDataServices().scans.getById(scanId);
    if (scan) {
      if (!scan.clientId) await getDataServices().scans.claim(scanId, clientId);
      // 배너·프리필이 읽을 수 있도록 (httpOnly 아님)
      res.cookies.set(RECENT_SCAN_COOKIE, scanId, {
        httpOnly: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      });
    }
  } catch (err) {
    console.warn('[scan-claim] 실패:', err);
  }
  res.cookies.delete(SCAN_ID_COOKIE);
}
