import type { Site } from '@/lib/types/domain';

export const ACCOUNT_SITE_LIMIT = 1;
export const SITE_LIMIT_ERROR_CODE = 'SITE_LIMIT_REACHED';
export const SITE_LIMIT_MESSAGE =
  '현재 계정에는 홈페이지가 이미 1개 있습니다. 추가 홈페이지는 별도 제작 문의해 주세요.';

export class AccountSiteLimitError extends Error {
  readonly code = SITE_LIMIT_ERROR_CODE;

  constructor() {
    super(SITE_LIMIT_MESSAGE);
    this.name = 'AccountSiteLimitError';
  }
}

/**
 * The current schema has no archived/deleted site state. Every persisted site,
 * including a suspended one retained for export, therefore occupies the one
 * self-service site slot until operations handles a separate-site contract.
 */
export function accountHasSite(sites: readonly Pick<Site, 'clientId'>[], clientId: string): boolean {
  return sites.some((site) => site.clientId === clientId);
}

export function assertAccountCanCreateSite(
  sites: readonly Pick<Site, 'clientId'>[],
  clientId: string,
): void {
  if (accountHasSite(sites, clientId)) throw new AccountSiteLimitError();
}

export function isAccountSiteLimitError(error: unknown): boolean {
  if (error instanceof AccountSiteLimitError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(SITE_LIMIT_ERROR_CODE)
    || message.includes('sites_one_per_client_uidx');
}
