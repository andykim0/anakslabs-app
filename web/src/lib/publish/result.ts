import type { Site } from '@/lib/types/domain';

export interface PublishedPreflightSummary {
  warnings: string[];
  needsQa: boolean;
  scan?: { total: number; grade: string; belowThreshold: boolean };
  qaChecklist: { id: string; title: string; description: string }[];
}

/** publish API가 성공 뒤에도 QA 신호를 버리지 않도록 하는 클라이언트 응답 계약. */
export interface PublishedSiteResult {
  site: Site;
  url: string | null;
  preflight: PublishedPreflightSummary;
}
