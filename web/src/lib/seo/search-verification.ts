import type { SearchVerification, SiteConfig } from '@/lib/types/site';

export const SEARCH_VERIFICATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{6,200}$/;

export function normalizeSearchVerification(input: SearchVerification | undefined): SearchVerification | undefined {
  const naver = input?.naver?.trim();
  const google = input?.google?.trim();
  if (naver && !SEARCH_VERIFICATION_TOKEN_PATTERN.test(naver)) throw new Error('The Naver verification token is not valid.');
  if (google && !SEARCH_VERIFICATION_TOKEN_PATTERN.test(google)) throw new Error('The Google verification token is not valid.');
  if (!naver && !google) return undefined;
  return { ...(naver ? { naver } : {}), ...(google ? { google } : {}) };
}

/** 일반 초안 저장에서 클라이언트가 보낸 값을 버리고 서버에 있던 값만 보존한다. */
export function preserveServerSearchVerification(incoming: SiteConfig, persisted: SiteConfig | null): SiteConfig {
  const serverValue = normalizeSearchVerification(persisted?.searchVerification);
  const rest = { ...incoming };
  delete rest.searchVerification;
  return { ...rest, ...(serverValue ? { searchVerification: serverValue } : {}) };
}

export function withServerSearchVerification(config: SiteConfig, verification: SearchVerification | undefined): SiteConfig {
  const normalized = normalizeSearchVerification(verification);
  const rest = { ...config };
  delete rest.searchVerification;
  return { ...rest, ...(normalized ? { searchVerification: normalized } : {}) };
}
