/**
 * 에디터 전용 /api fetch 헬퍼 (클라이언트 컴포넌트에서만 사용).
 *
 * 확정 통합 계약:
 *  - 실패 응답: { error: { code, message, ...extra } }
 *  - PATCH /api/sites/[siteId] { draftConfig } → { ok, savedAt }
 *  - POST  /api/sites/[siteId]/publish → { site, url }
 *  - GET   /api/credits → { balance: number, updatedAt, ledger }
 *  - POST  /api/edit-requests → 201 { editRequest, balance }
 *    · 402 UPSELL_REQUIRED (error.creditCost, error.options)
 *    · 409 INSUFFICIENT_CREDITS (error.balance, error.required)
 *    · 502 AI_GENERATION_FAILED (자동 환불됨)
 */
import type { CreditLedgerEntry, EditRequest, EditType, Site } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';

export class EditorApiError extends Error {
  status: number;
  code: string;
  /** error 객체의 나머지 필드 (balance, required, creditCost, options 등) */
  extra: Record<string, unknown>;

  constructor(status: number, code: string, message: string, extra: Record<string, unknown>) {
    super(message);
    this.name = 'EditorApiError';
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new EditorApiError(0, 'NETWORK_ERROR', '네트워크 연결을 확인해 주세요.', {});
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // 빈 응답 허용
  }

  if (!res.ok) {
    const errObj = ((body as { error?: unknown } | null)?.error ?? {}) as Record<string, unknown>;
    const code = typeof errObj.code === 'string' ? errObj.code : 'UNKNOWN_ERROR';
    const message =
      typeof errObj.message === 'string' ? errObj.message : `요청에 실패했습니다. (${res.status})`;
    const { code: _c, message: _m, ...extra } = errObj;
    void _c;
    void _m;
    throw new EditorApiError(res.status, code, message, extra);
  }
  return body as T;
}

// ---------- 크레딧 ----------

export interface CreditsSnapshot {
  balance: number;
  updatedAt: string | null;
  ledger: CreditLedgerEntry[];
}

export async function getCredits(): Promise<CreditsSnapshot> {
  const data = await request<{ balance?: number; updatedAt?: string; ledger?: CreditLedgerEntry[] }>(
    '/api/credits',
  );
  return {
    balance: typeof data.balance === 'number' ? data.balance : 0,
    updatedAt: data.updatedAt ?? null,
    ledger: Array.isArray(data.ledger) ? data.ledger : [],
  };
}

// ---------- 사이트 저장/발행 ----------

export async function saveDraftRequest(
  siteId: string,
  draftConfig: SiteConfig,
): Promise<{ ok: boolean; savedAt: string }> {
  return request(`/api/sites/${encodeURIComponent(siteId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ draftConfig }),
  });
}

export async function publishSiteRequest(siteId: string): Promise<{ site: Site; url: string | null }> {
  // [v3 Phase 4] 발행 다이얼로그 1단계(사업자 정보 확인)를 거쳤음을 서버에 명시 —
  // 이 필드 없이 API를 직접 호출하면 400 (클라 우회 방지)
  return request(`/api/sites/${encodeURIComponent(siteId)}/publish`, {
    method: 'POST',
    body: JSON.stringify({ businessInfoConfirmed: true }),
  });
}

// ---------- 편집 요청 (AI) ----------

export interface CreateEditRequestInput {
  siteId: string;
  type: EditType;
  requestedContent: string;
  confirmUpsell?: boolean;
}

export async function createEditRequest(
  input: CreateEditRequestInput,
): Promise<{ editRequest: EditRequest; balance: number }> {
  return request('/api/edit-requests', { method: 'POST', body: JSON.stringify(input) });
}
