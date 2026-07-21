import type { ScanComparisonResult, ScanIssue, ScanResult } from '@/lib/data/types';
import { actionableIssueCount } from './issue-groups';

export const SCAN_COMPARISON_LIMIT = 2;
export const SCAN_REQUEST_URL_LIMIT = 1 + SCAN_COMPARISON_LIMIT;

export const SCAN_STRUCTURE_SIGNALS = [
  { key: 'naver-access', label: '네이버가 페이지에 접근', failedBy: ['seo_naver_yeti_blocked'] },
  { key: 'indexable', label: '검색 제외 설정 없음', failedBy: ['seo_noindex'] },
  { key: 'canonical', label: '대표 주소 표시', failedBy: ['seo_canonical', 'seo_canonical_invalid'] },
  { key: 'sitemap', label: '사이트 목록 제공', failedBy: ['seo_sitemap', 'seo_sitemap_invalid'] },
  { key: 'structured-data', label: '가게 정보 구조화', failedBy: ['aeo_jsonld_missing', 'aeo_jsonld_invalid'] },
  { key: 'business-info', label: '상호·주소·전화 확인', failedBy: ['geo_business_info'] },
] as const;

export type ScanStructureSignalKey = (typeof SCAN_STRUCTURE_SIGNALS)[number]['key'];

export function comparisonEngineSummary(
  scan: Pick<ScanResult, 'scores' | 'grade' | 'issues'>,
): {
  scores: ScanResult['scores'];
  grade: ScanResult['grade'];
  actionableRootCauses: number;
} {
  return {
    scores: scan.scores,
    grade: scan.grade,
    actionableRootCauses: actionableIssueCount(scan.issues),
  };
}

export function structureSignals(issues: ScanIssue[]): Record<ScanStructureSignalKey, boolean> {
  const issueCodes = new Set(issues.map((issue) => issue.code));
  return Object.fromEntries(
    SCAN_STRUCTURE_SIGNALS.map((signal) => [
      signal.key,
      !signal.failedBy.some((code) => issueCodes.has(code)),
    ]),
  ) as Record<ScanStructureSignalKey, boolean>;
}

function signalCount(issues: ScanIssue[]): number {
  return Object.values(structureSignals(issues)).filter(Boolean).length;
}

export function comparisonHeadline(
  primary: Pick<ScanResult, 'issues'>,
  comparisons: Array<Pick<ScanComparisonResult, 'issues'>>,
): string {
  const primaryCount = signalCount(primary.issues);
  const bestCompetitorCount = Math.max(...comparisons.map((item) => signalCount(item.issues)), 0);
  if (bestCompetitorCount > primaryCount) {
    return '지금 구조로는 네이버가 옆 가게를 먼저 읽습니다.';
  }
  if (bestCompetitorCount < primaryCount) {
    return '구조 신호만 보면 내 홈페이지에 검색엔진이 읽을 정보가 더 갖춰져 있습니다.';
  }
  return '구조 신호만 보면 내 홈페이지와 옆 가게 홈페이지가 비슷한 상태입니다.';
}

export function toComparisonResult(
  scan: Pick<ScanResult, 'url' | 'scores' | 'grade' | 'issues'>,
): ScanComparisonResult {
  return {
    url: scan.url,
    scores: scan.scores,
    grade: scan.grade,
    issues: scan.issues,
  };
}
