export const NAVER_ACCOUNT_SITE_LIMIT = 100;
export const NAVER_ACCOUNT_SWITCH_WARNING = 80;
export const SEARCH_REGISTRATION_ACCOUNT_PATTERN = /^[A-Z0-9_-]{2,40}$/;

export type SearchRegistrationStatus = 'pending' | 'completed';
export type NaverIndexStatus = 'unchecked' | 'present' | 'absent';

export interface SearchRegistrationRecord {
  siteId: string;
  status: SearchRegistrationStatus;
  accountLabel: string | null;
  naverVerification: string | null;
  googleVerification: string | null;
  indexStatus: NaverIndexStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SearchRegistrationAccountUsage {
  accountLabel: string;
  registeredCount: number;
  warning: boolean;
  full: boolean;
}

export function summarizeRegistrationAccounts(
  records: readonly SearchRegistrationRecord[],
): SearchRegistrationAccountUsage[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    if (record.status !== 'completed' || !record.accountLabel) continue;
    counts.set(record.accountLabel, (counts.get(record.accountLabel) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([accountLabel, registeredCount]) => ({
      accountLabel,
      registeredCount,
      warning: registeredCount >= NAVER_ACCOUNT_SWITCH_WARNING,
      full: registeredCount >= NAVER_ACCOUNT_SITE_LIMIT,
    }));
}
