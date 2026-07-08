/**
 * 클라이언트 컴포넌트 전용 /api fetch 헬퍼 (dashboard 팀 소유).
 * 데이터 계층 규약: 클라이언트 컴포넌트는 반드시 /api/* 를 fetch (TanStack Query).
 *
 * ── 백엔드(API 라우트 팀)와의 가정 계약 — integrationNotes에도 명시 ──
 *  POST /api/auth/mock-login        { role: 'basic'|'premium'|'admin' }
 *  POST /api/auth/logout            (body 없음)
 *  GET  /api/credits                → { balance: CreditBalance|number, ledger: CreditLedgerEntry[] }
 *  POST /api/credits/purchase       { credits: number }  // CREDIT_PACKS 중 하나
 *  GET  /api/edit-requests          → { editRequests: EditRequest[] } | EditRequest[]
 *  POST /api/edit-requests          { siteId, type, requestedContent }
 *                                    부족 시 4xx + { error: 'insufficient_credits', balance }
 *  GET  /api/payments               → { payments: Payment[] } | Payment[]
 *  POST /api/domains                { siteId, hostname } → CustomDomainStatus
 *  GET  /api/domains?siteId=        → CustomDomainStatus (커스텀 도메인 없으면 404)
 *  POST /api/onboarding/candidates  SurveyInput → { candidates: DesignCandidate[] } | DesignCandidate[]
 *  POST /api/onboarding/generate    { survey, candidate } → { siteId } | { site: Site }
 *  POST /api/sites/[siteId]/publish → { site: Site }
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

export class ApiError extends Error {
  status: number;
  code: string | null;
  body: unknown;

  constructor(status: number, code: string | null, message: string, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export function isInsufficientCredits(err: unknown): boolean {
  return err instanceof ApiError && (err.code === 'insufficient_credits' || err.status === 402);
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, 'network_error', '네트워크 연결을 확인해주세요.', null);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // 빈 응답 허용
  }
  if (!res.ok) {
    const b = (body ?? {}) as { error?: string; message?: string };
    const code = typeof b.error === 'string' ? b.error : null;
    const message =
      typeof b.message === 'string' ? b.message : (code ?? `요청에 실패했습니다. (${res.status})`);
    throw new ApiError(res.status, code, message, body);
  }
  return body as T;
}

function post<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
}

/** 응답이 { key: value } 래핑이든 bare 값이든 모두 수용 */
function unwrap<T>(data: unknown, key: string): T {
  if (data && typeof data === 'object' && !Array.isArray(data) && key in (data as Record<string, unknown>)) {
    return (data as Record<string, T>)[key];
  }
  return data as T;
}

// ---------- 인증 ----------

export type MockRole = 'basic' | 'premium' | 'admin';

export async function mockLogin(role: MockRole): Promise<void> {
  await post('/api/auth/mock-login', { role });
}

export async function logout(): Promise<void> {
  await post('/api/auth/logout');
}

// ---------- 크레딧 ----------

export interface CreditsSnapshot {
  balance: number;
  updatedAt: string | null;
  ledger: CreditLedgerEntry[];
}

export async function getCredits(): Promise<CreditsSnapshot> {
  const data = await request<unknown>('/api/credits');
  const obj = (data ?? {}) as Record<string, unknown>;
  const rawBalance = obj.balance;
  let balance = 0;
  let updatedAt: string | null = null;
  if (typeof rawBalance === 'number') {
    balance = rawBalance;
  } else if (rawBalance && typeof rawBalance === 'object') {
    const b = rawBalance as { balance?: number; updatedAt?: string };
    balance = typeof b.balance === 'number' ? b.balance : 0;
    updatedAt = b.updatedAt ?? null;
  }
  const ledger = Array.isArray(obj.ledger) ? (obj.ledger as CreditLedgerEntry[]) : [];
  return { balance, updatedAt, ledger };
}

export async function purchaseCreditPack(credits: number): Promise<void> {
  await post('/api/credits/purchase', { credits });
}

// ---------- 편집 요청 ----------

export async function listEditRequests(): Promise<EditRequest[]> {
  const data = await request<unknown>('/api/edit-requests');
  const list = unwrap<EditRequest[]>(data, 'editRequests');
  return Array.isArray(list) ? list : [];
}

export async function createEditRequest(input: {
  siteId: string;
  type: EditType;
  requestedContent: string;
}): Promise<EditRequest> {
  const data = await post<unknown>('/api/edit-requests', input);
  return unwrap<EditRequest>(data, 'editRequest');
}

// ---------- 결제 ----------

export async function listPayments(): Promise<Payment[]> {
  const data = await request<unknown>('/api/payments');
  const list = unwrap<Payment[]>(data, 'payments');
  return Array.isArray(list) ? list : [];
}

// ---------- 커스텀 도메인 ----------

function normalizeDomainStatus(data: unknown): CustomDomainStatus | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  if (typeof obj.hostname === 'string') return data as CustomDomainStatus;
  for (const key of ['domain', 'status', 'customDomain']) {
    const nested = obj[key];
    if (nested && typeof nested === 'object' && typeof (nested as { hostname?: unknown }).hostname === 'string') {
      return nested as CustomDomainStatus;
    }
  }
  return null;
}

export async function requestCustomDomain(siteId: string, hostname: string): Promise<CustomDomainStatus> {
  const data = await post<unknown>('/api/domains', { siteId, hostname });
  const status = normalizeDomainStatus(data);
  if (!status) throw new ApiError(500, 'invalid_response', '도메인 등록 응답을 해석하지 못했습니다.', data);
  return status;
}

export async function getDomainStatus(siteId: string): Promise<CustomDomainStatus | null> {
  try {
    const data = await request<unknown>(`/api/domains?siteId=${encodeURIComponent(siteId)}`);
    return normalizeDomainStatus(data);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

// ---------- 온보딩 ----------

export async function generateCandidates(survey: SurveyInput): Promise<DesignCandidate[]> {
  const data = await post<unknown>('/api/onboarding/candidates', survey);
  const list = unwrap<DesignCandidate[]>(data, 'candidates');
  if (!Array.isArray(list) || list.length === 0) {
    throw new ApiError(500, 'invalid_response', '디자인 후보 생성에 실패했습니다.', data);
  }
  return list;
}

export async function generateSite(input: {
  survey: SurveyInput;
  candidate: DesignCandidate;
}): Promise<{ siteId: string }> {
  const data = await post<unknown>('/api/onboarding/generate', input);
  const obj = (data ?? {}) as { siteId?: string; site?: { id?: string }; id?: string };
  const siteId = obj.siteId ?? obj.site?.id ?? obj.id;
  if (!siteId) throw new ApiError(500, 'invalid_response', '사이트 생성 응답을 해석하지 못했습니다.', data);
  return { siteId };
}

// ---------- 사이트 ----------

export async function publishSite(siteId: string): Promise<Site | null> {
  const data = await post<unknown>(`/api/sites/${encodeURIComponent(siteId)}/publish`);
  const site = unwrap<Site>(data, 'site');
  return site && typeof site === 'object' ? site : null;
}
