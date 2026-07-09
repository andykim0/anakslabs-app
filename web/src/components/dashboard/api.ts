/**
 * 클라이언트 컴포넌트 전용 /api fetch 헬퍼 (dashboard 팀 소유).
 * 데이터 계층 규약: 클라이언트 컴포넌트는 반드시 /api/* 를 fetch (TanStack Query).
 *
 * ── 확정된 통합 계약과 1:1 ──
 *  실패 응답: { error: { code, message, ...extra } }
 *   - 401 UNAUTHORIZED / 403 FORBIDDEN / 404 SITE_NOT_FOUND / 400 VALIDATION_ERROR
 *   - 402 UPSELL_REQUIRED  → error.creditCost, error.options
 *   - 409 INSUFFICIENT_CREDITS → error.balance, error.required
 *   - 502 AI_GENERATION_FAILED (크레딧 자동 환불됨)
 *  성공 응답:
 *   POST /api/auth/mock-login {as} → { ok, clientId, redirect }
 *   GET  /api/sites → {sites} · GET /api/sites/[id] → {site} · POST .../publish → {site,url}
 *   GET  /api/credits → {balance:number, updatedAt, ledger}
 *   POST /api/credits/purchase {packCredits} → 201 {paid:true, credits, amount, balance}
 *   POST /api/edit-requests → 201 {editRequest, balance} · GET → {editRequests}
 *   POST /api/domains {siteId,hostname} → 201 {status} · GET ?siteId= → {status}
 *   GET  /api/payments → {payments}
 */
import type {
  CreditLedgerEntry,
  CustomDomainStatus,
  DesignCandidate,
  EditRequest,
  EditType,
  Payment,
  Site,
  SurveyInput,
} from '@/lib/types/domain';

// ---------- 에러 ----------

export class ApiError extends Error {
  status: number;
  code: string;
  /** { error: { code, message, ...extra } } 의 extra 부분 */
  extra: Record<string, unknown>;

  constructor(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function isUpsellRequired(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 402 && err.code === 'UPSELL_REQUIRED';
}

export function isInsufficientCredits(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 409 && err.code === 'INSUFFICIENT_CREDITS';
}

export interface UpsellOption {
  action: string;
  label: string;
}

/** 402 UPSELL_REQUIRED 응답의 부가 정보 */
export function upsellInfo(err: ApiError): { creditCost: number; options: UpsellOption[] } {
  const creditCost = typeof err.extra.creditCost === 'number' ? err.extra.creditCost : 3;
  const options = Array.isArray(err.extra.options)
    ? (err.extra.options as UpsellOption[]).filter(
        (o) => o && typeof o.action === 'string' && typeof o.label === 'string',
      )
    : [];
  return { creditCost, options };
}

/** 409 INSUFFICIENT_CREDITS 응답의 부가 정보 */
export function insufficientInfo(err: ApiError): { balance: number; required: number } {
  return {
    balance: typeof err.extra.balance === 'number' ? err.extra.balance : 0,
    required: typeof err.extra.required === 'number' ? err.extra.required : 1,
  };
}

// ---------- fetch 코어 ----------

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', '네트워크 연결을 확인해 주세요.');
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // 빈 응답 허용
  }

  if (!res.ok) {
    const errObj =
      body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'object'
        ? ((body as { error: Record<string, unknown> }).error ?? {})
        : {};
    const code = typeof errObj.code === 'string' ? errObj.code : 'UNKNOWN_ERROR';
    const message =
      typeof errObj.message === 'string' ? errObj.message : `요청에 실패했습니다. (${res.status})`;
    const { code: _c, message: _m, ...extra } = errObj;
    void _c;
    void _m;
    throw new ApiError(res.status, code, message, extra);
  }
  return body as T;
}

function post<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// ---------- 인증 ----------

export type MockRole = 'basic' | 'premium' | 'admin';

export interface MockLoginResult {
  ok: boolean;
  clientId: string;
  redirect: string;
}

export async function mockLogin(as: MockRole): Promise<MockLoginResult> {
  return post<MockLoginResult>('/api/auth/mock-login', { as });
}

export async function logout(): Promise<void> {
  await post('/api/auth/logout');
}

// ---------- 사이트 ----------

export async function listSites(): Promise<Site[]> {
  const data = await request<{ sites: Site[] }>('/api/sites');
  return data.sites ?? [];
}

export async function getSite(siteId: string): Promise<Site> {
  const data = await request<{ site: Site }>(`/api/sites/${encodeURIComponent(siteId)}`);
  return data.site;
}

export interface PublishResult {
  site: Site;
  url: string | null;
}

export async function publishSite(siteId: string): Promise<PublishResult> {
  return post<PublishResult>(`/api/sites/${encodeURIComponent(siteId)}/publish`);
}

// ---------- 정적 HTML 백업 (§5) ----------

export interface ExportStatusResult {
  status: 'none' | 'processing' | 'ready' | 'failed';
  downloadUrl: string | null;
  requestedAt?: string | null;
  warnings?: string[];
}

/** 백업 생성 (동기 — 완료 후 다운로드 URL 반환) */
export async function createExport(siteId: string): Promise<ExportStatusResult> {
  return post<ExportStatusResult>(`/api/sites/${encodeURIComponent(siteId)}/export`);
}

/** 백업 상태 조회 */
export async function getExport(siteId: string): Promise<ExportStatusResult> {
  return request<ExportStatusResult>(`/api/sites/${encodeURIComponent(siteId)}/export`);
}

// ---------- 크레딧 ----------

export interface CreditsSnapshot {
  balance: number;
  updatedAt: string | null;
  ledger: CreditLedgerEntry[];
}

export async function getCredits(): Promise<CreditsSnapshot> {
  const data = await request<{ balance: number; updatedAt?: string; ledger?: CreditLedgerEntry[] }>(
    '/api/credits',
  );
  return {
    balance: typeof data.balance === 'number' ? data.balance : 0,
    updatedAt: data.updatedAt ?? null,
    ledger: Array.isArray(data.ledger) ? data.ledger : [],
  };
}

export interface PurchaseResult {
  paid: boolean;
  credits?: number;
  amount?: number;
  balance?: number;
  /** 실모드: 토스 결제창 파라미터 */
  checkout?: Record<string, unknown>;
}

export async function purchaseCreditPack(packCredits: number): Promise<PurchaseResult> {
  return post<PurchaseResult>('/api/credits/purchase', { packCredits });
}

// ---------- 편집 요청 ----------

export async function listEditRequests(siteId?: string): Promise<EditRequest[]> {
  const qs = siteId ? `?siteId=${encodeURIComponent(siteId)}` : '';
  const data = await request<{ editRequests: EditRequest[] }>(`/api/edit-requests${qs}`);
  return data.editRequests ?? [];
}

export interface CreateEditRequestResult {
  editRequest: EditRequest;
  balance: number;
  /** [§3] 최초 발행 후 7일 무료 수정권으로 처리됨 (크레딧 미차감) */
  isInitialRevision?: boolean;
}

export async function createEditRequest(input: {
  siteId: string;
  type: EditType;
  requestedContent: string;
  /** Basic 티어 영상 업셀 안내 확인 후 재제출 시 true */
  confirmUpsell?: boolean;
}): Promise<CreateEditRequestResult> {
  return post<CreateEditRequestResult>('/api/edit-requests', input);
}

// ---------- 결제 ----------

export async function listPayments(): Promise<Payment[]> {
  const data = await request<{ payments: Payment[] }>('/api/payments');
  return data.payments ?? [];
}

// ---------- 업로드 (§7) ----------

/** 로고/이미지 업로드 (multipart) → 저장 URL. SVG는 서버에서 sanitize됨. */
export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  let res: Response;
  try {
    res = await fetch('/api/uploads', { method: 'POST', body: form });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', '네트워크 연결을 확인해 주세요.');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // 빈 응답 허용
  }
  if (!res.ok) {
    const err =
      body && typeof body === 'object' && 'error' in body
        ? ((body as { error: Record<string, unknown> }).error ?? {})
        : {};
    const code = typeof err.code === 'string' ? err.code : 'UPLOAD_FAILED';
    const message = typeof err.message === 'string' ? err.message : '업로드에 실패했습니다.';
    throw new ApiError(res.status, code, message);
  }
  const url = (body as { url?: string }).url;
  if (!url) throw new ApiError(500, 'INVALID_RESPONSE', '업로드 응답을 해석하지 못했습니다.');
  return url;
}

// ---------- 커스텀 도메인 ----------

export async function requestCustomDomain(
  siteId: string,
  hostname: string,
): Promise<CustomDomainStatus> {
  const data = await post<{ status: CustomDomainStatus }>('/api/domains', { siteId, hostname });
  return data.status;
}

/** 커스텀 도메인 미연결(404 NO_CUSTOM_DOMAIN)이면 null */
export async function getDomainStatus(siteId: string): Promise<CustomDomainStatus | null> {
  try {
    const data = await request<{ status: CustomDomainStatus }>(
      `/api/domains?siteId=${encodeURIComponent(siteId)}`,
    );
    return data.status;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

// ---------- 온보딩 ----------

export async function generateCandidates(survey: SurveyInput): Promise<DesignCandidate[]> {
  const data = await post<{ candidates: DesignCandidate[] }>('/api/onboarding/candidates', {
    survey,
  });
  if (!Array.isArray(data.candidates) || data.candidates.length === 0) {
    throw new ApiError(500, 'INVALID_RESPONSE', '디자인 후보 생성에 실패했습니다.');
  }
  return data.candidates;
}

export async function generateSite(input: {
  survey: SurveyInput;
  candidate: DesignCandidate;
}): Promise<{ siteId: string; site?: Site; freeRegensUsed: number }> {
  const data = await post<{ siteId?: string; site?: Site }>('/api/onboarding/generate', input);
  const siteId = data.siteId ?? data.site?.id;
  if (!siteId) {
    throw new ApiError(500, 'INVALID_RESPONSE', '사이트 생성 응답을 해석하지 못했습니다.');
  }
  return { siteId, site: data.site, freeRegensUsed: 0 };
}

/** [§3] 온보딩 무료 재생성 (사이트당 1회) — 같은 사이트의 draft를 교체 */
export async function regenerateSite(input: {
  siteId: string;
  survey: SurveyInput;
  candidate: DesignCandidate;
}): Promise<{ siteId: string; site?: Site; freeRegensUsed: number; freeRegenLimit: number }> {
  const data = await post<{ siteId: string; site?: Site; freeRegensUsed?: number; freeRegenLimit?: number }>(
    '/api/onboarding/regenerate',
    input,
  );
  return {
    siteId: data.siteId,
    site: data.site,
    freeRegensUsed: typeof data.freeRegensUsed === 'number' ? data.freeRegensUsed : 1,
    freeRegenLimit: typeof data.freeRegenLimit === 'number' ? data.freeRegenLimit : 1,
  };
}
