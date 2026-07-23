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
import type { CreditLedgerEntry, EditRequest, EditType } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';
import type { PublishHumanChecks } from '@/lib/publish/human-checks';
import type { PublishedSiteResult } from '@/lib/publish/result';

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

/**
 * [F3 #4] 에디터에서 이미지 파일 업로드 → 저장 URL (로고·이미지 요소를 파일로 교체).
 * /api/uploads 공용(5MB·png/jpg/webp/svg, SVG는 서버에서 sanitize). FormData라 JSON request 헬퍼 우회.
 */
export async function uploadEditorImage(file: File): Promise<string> {
  const body = new FormData();
  body.append('file', file);
  let res: Response;
  try {
    res = await fetch('/api/uploads', { method: 'POST', body });
  } catch {
    throw new EditorApiError(0, 'NETWORK_ERROR', '네트워크 연결을 확인해 주세요.', {});
  }
  const data = (await res.json().catch(() => null)) as { url?: string; error?: { message?: string } } | null;
  if (!res.ok || !data?.url) {
    throw new EditorApiError(res.status, 'UPLOAD_FAILED', data?.error?.message ?? '이미지 업로드에 실패했어요.', {});
  }
  return data.url;
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

export async function publishSiteRequest(
  siteId: string,
  humanChecks: PublishHumanChecks,
): Promise<PublishedSiteResult> {
  // 사업자 정보와 사람의 최종 3체크를 각각 서버에 명시한다.
  return request(`/api/sites/${encodeURIComponent(siteId)}/publish`, {
    method: 'POST',
    body: JSON.stringify({ businessInfoConfirmed: true, humanChecks }),
  });
}

// ---------- [G4] 발행 전 진단 ----------

export interface ScanIssueGuidance {
  title: string;
  action: string;
  effect: string;
  anchor: 'editor:content' | 'editor:business-info' | 'editor:meta' | 'editor:images' | 'system';
  presentation?: 'input-to-perfect';
}
export interface PreflightIssue {
  code: string;
  pillar: 'seo' | 'aeo' | 'geo';
  severity: 'critical' | 'warn' | 'info';
  label: string;
  detail: string;
  guidance: ScanIssueGuidance | null;
}
export interface ImprovementCompare {
  resolved: string[];
  remaining: string[];
  beforeTotal: number;
  afterTotal: number;
  sourceUrl: string;
}
export interface PreflightResult {
  scan: { scores: { seo: number; aeo: number; geo: number; total: number }; grade: string; issues: PreflightIssue[] };
  ok: boolean;
  blockers: string[];
  warnings: string[];
  needsQa: boolean;
  businessInfoMissing: boolean;
  /** [I4] 개선 모드 전후 대조 (진단 원본 있을 때만) */
  improvement: ImprovementCompare | null;
}

/** [G4] 발행하지 않고 진단만 조회(발행 전 가이드 화면용) */
export async function fetchPreflight(siteId: string): Promise<PreflightResult> {
  return request(`/api/sites/${encodeURIComponent(siteId)}/preflight`, { method: 'POST' });
}

// ---------- 편집 요청 (AI) ----------

export interface CreateEditRequestInput {
  siteId: string;
  type: EditType;
  requestedContent: string;
  target: { pageId: string; sectionId?: string; elementId?: string };
  /** @deprecated 영상 애드온 권한은 일반 크레딧으로 우회할 수 없음. */
  confirmUpsell?: boolean;
}

export async function createEditRequest(
  input: CreateEditRequestInput,
): Promise<{ editRequest: EditRequest; balance: number }> {
  return request('/api/edit-requests', { method: 'POST', body: JSON.stringify(input) });
}
