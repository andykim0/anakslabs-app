import type { ScanComparisonResult, ScanIssue, ScanResult } from '@/lib/data/types';
import { actionableIssueCount } from './issue-groups';

export const SCAN_COMPARISON_LIMIT = 2;
export const SCAN_REQUEST_URL_LIMIT = 1 + SCAN_COMPARISON_LIMIT;

export const SCAN_STRUCTURE_SIGNALS = [
  { key: 'naver-access', label: 'Naver can access the page', failedBy: ['seo_naver_yeti_blocked'] },
  { key: 'indexable', label: 'No search exclusion', failedBy: ['seo_noindex'] },
  { key: 'canonical', label: 'Canonical address declared', failedBy: ['seo_canonical', 'seo_canonical_invalid'] },
  { key: 'sitemap', label: 'Page list available', failedBy: ['seo_sitemap', 'seo_sitemap_invalid'] },
  { key: 'structured-data', label: 'Business data structured', failedBy: ['aeo_jsonld_missing', 'aeo_jsonld_invalid'] },
  { key: 'business-info', label: 'Name, address, and phone available', failedBy: ['geo_business_info'] },
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
    return 'The other site exposes more readable structure to search engines.';
  }
  if (bestCompetitorCount < primaryCount) {
    return 'Your site exposes more readable structure to search engines.';
  }
  return 'The two sites expose a similar level of readable structure.';
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
