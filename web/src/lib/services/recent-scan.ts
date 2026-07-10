/**
 * [v3 Phase 7] 로그인 후 배너·온보딩 프리필용 최근 스캔 로더 (서버 전용).
 * anaks_recent_scan 쿠키(로그인 시 claimPendingScan이 세팅) → scans.getById.
 */
import 'server-only';
import { cookies } from 'next/headers';
import { getDataServices } from '@/lib/data';
import type { ScanResult } from '@/lib/data/types';
import { RECENT_SCAN_COOKIE } from '@/app/api/_lib/scan-claim';

export async function getRecentScan(): Promise<ScanResult | null> {
  const jar = await cookies();
  const scanId = jar.get(RECENT_SCAN_COOKIE)?.value;
  if (!scanId) return null;
  try {
    return await getDataServices().scans.getById(scanId);
  } catch {
    return null;
  }
}

/** 스캔 URL의 호스트에서 상호 추정 (www·TLD 제거 → 첫 라벨) */
export function guessBusinessName(scanUrl: string): string {
  try {
    const host = new URL(scanUrl).hostname.replace(/^www\./, '');
    const label = host.split('.')[0] ?? '';
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : '';
  } catch {
    return '';
  }
}

/** 이슈 요약 문장 (온보딩 프리필 노트용) */
export function summarizeIssues(scan: ScanResult): string {
  const n = scan.issues.length;
  if (n === 0) return '';
  const top = scan.issues.slice(0, 3).map((i) => i.label);
  return `이전 진단(${scan.scores.total}점)에서 발견한 주요 개선점: ${top.join(', ')}${n > 3 ? ` 외 ${n - 3}건` : ''}.`;
}
