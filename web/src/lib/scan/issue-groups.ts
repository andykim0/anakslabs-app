import type { ScanIssue } from '@/lib/data/types';

export interface ScanIssueGroup {
  key: string;
  primary: ScanIssue;
  details: ScanIssue[];
  scoreDeducted: boolean;
}

/**
 * 같은 rootCause의 대표 이슈와 crawler/필러별 상세를 결정적 입력 순서로 묶는다.
 * 예전 저장 결과(scoreDeducted 미존재)는 각 이슈가 독립 차감된 것으로 호환한다.
 */
export function groupScanIssues(issues: readonly ScanIssue[]): ScanIssueGroup[] {
  const groups = new Map<string, ScanIssue[]>();
  for (const issue of issues) {
    const key = issue.rootCause ? `root:${issue.rootCause}` : `issue:${issue.code}`;
    const group = groups.get(key) ?? [];
    group.push(issue);
    groups.set(key, group);
  }

  return [...groups.entries()].map(([key, grouped]) => {
    const primary = grouped.find((issue) => issue.scoreDeducted !== false) ?? grouped[0];
    return {
      key,
      primary,
      details: grouped.filter((issue) => issue !== primary),
      scoreDeducted: grouped.some((issue) => issue.scoreDeducted !== false),
    };
  });
}

export function actionableIssueCount(issues: readonly ScanIssue[]): number {
  return groupScanIssues(issues).filter((group) => group.scoreDeducted).length;
}
