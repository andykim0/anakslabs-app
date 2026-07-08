/**
 * Cloudflare for SaaS — Custom Hostnames API 클라이언트 (서버 전용).
 * https://developers.cloudflare.com/api/resources/custom_hostnames/
 *
 * 순수 API 클라이언트만 담당 — 도메인 모델(CustomDomainStatus) 매핑/sites 갱신은
 * lib/data/supabase/domains.ts(DomainService)의 책임.
 */
import 'server-only';
import { env } from '@/lib/env';

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

export class CloudflareConfigError extends Error {
  constructor() {
    super(
      'CLOUDFLARE_NOT_CONFIGURED: CLOUDFLARE_API_TOKEN / CLOUDFLARE_ZONE_ID가 필요합니다. ' +
        '키 없이 데모하려면 NEXT_PUBLIC_MOCK_MODE=1 을 사용하세요.',
    );
    this.name = 'CloudflareConfigError';
  }
}

export interface CfSslStatus {
  status?: string; // initializing | pending_validation | pending_issuance | pending_deployment | active | ...
  method?: string;
  type?: string;
  validation_records?: Array<{ txt_name?: string; txt_value?: string }>;
  validation_errors?: Array<{ message?: string }>;
}

export interface CfCustomHostname {
  id: string;
  hostname: string;
  // pending | active | moved | deleted | blocked | test_pending | test_failed ...
  status?: string;
  ssl?: CfSslStatus;
  ownership_verification?: { type?: string; name?: string; value?: string };
  verification_errors?: string[];
}

interface CfEnvelope<T> {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result: T;
  result_info?: { total_count?: number };
}

function requireConfig(): { token: string; zoneId: string } {
  if (!env.cloudflareApiToken || !env.cloudflareZoneId) {
    throw new CloudflareConfigError();
  }
  return { token: env.cloudflareApiToken, zoneId: env.cloudflareZoneId };
}

async function cfFetch<T>(path: string, init?: RequestInit): Promise<CfEnvelope<T>> {
  const { token } = requireConfig();
  const res = await fetch(`${CF_API_BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  let body: CfEnvelope<T>;
  try {
    body = (await res.json()) as CfEnvelope<T>;
  } catch {
    throw new Error(`Cloudflare API 응답 파싱 실패 (HTTP ${res.status}) — ${path}`);
  }

  if (!res.ok || !body.success) {
    const detail = (body.errors ?? []).map((e) => `${e.code ?? ''} ${e.message ?? ''}`.trim()).join(' / ');
    throw new Error(`Cloudflare API 실패 (HTTP ${res.status}): ${detail || '알 수 없는 오류'} — ${path}`);
  }
  return body;
}

/** custom hostname 등록 — SSL은 TXT 검증 DV 인증서 */
export async function createCustomHostname(hostname: string): Promise<CfCustomHostname> {
  const { zoneId } = requireConfig();
  const body = await cfFetch<CfCustomHostname>(`/zones/${zoneId}/custom_hostnames`, {
    method: 'POST',
    body: JSON.stringify({
      hostname,
      ssl: {
        method: 'txt',
        type: 'dv',
        settings: { min_tls_version: '1.2' },
      },
    }),
  });
  return body.result;
}

/** 등록된 custom hostname 상세 (검증/SSL 상태 폴링) */
export async function getCustomHostname(id: string): Promise<CfCustomHostname> {
  const { zoneId } = requireConfig();
  const body = await cfFetch<CfCustomHostname>(`/zones/${zoneId}/custom_hostnames/${id}`, {
    method: 'GET',
  });
  return body.result;
}

/** hostname 문자열로 조회 (재요청 멱등 처리용). 없으면 null */
export async function findCustomHostnameByName(hostname: string): Promise<CfCustomHostname | null> {
  const { zoneId } = requireConfig();
  const body = await cfFetch<CfCustomHostname[]>(
    `/zones/${zoneId}/custom_hostnames?hostname=${encodeURIComponent(hostname)}`,
    { method: 'GET' },
  );
  return body.result?.[0] ?? null;
}

/** custom hostname 삭제 (도메인 연결 해제) */
export async function deleteCustomHostname(id: string): Promise<void> {
  const { zoneId } = requireConfig();
  await cfFetch<{ id: string }>(`/zones/${zoneId}/custom_hostnames/${id}`, { method: 'DELETE' });
}

/** 등록된 custom hostname 총수 — 무료 100개 한도 모니터링용 */
export async function countCustomHostnames(): Promise<number> {
  const { zoneId } = requireConfig();
  const body = await cfFetch<CfCustomHostname[]>(`/zones/${zoneId}/custom_hostnames?per_page=1`, {
    method: 'GET',
  });
  return body.result_info?.total_count ?? body.result.length;
}
