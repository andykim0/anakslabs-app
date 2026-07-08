/**
 * 관리자 콘솔 → /api/admin/* API 클라이언트.
 *
 * [통합 계약] 아래 타입/엔드포인트는 backend(app/api/ 소유 영역)가 구현해야 하는 응답 형태다.
 * 모든 /api/admin/* 라우트는 isAdmin() 가드 필수(비관리자 → 401/403),
 * 실패 응답은 JSON `{ error: string }` 규약을 따른다.
 *
 *  - GET   /api/admin/overview                → AdminOverview
 *  - GET   /api/admin/clients                 → AdminClientRow[]
 *  - GET   /api/admin/clients/:clientId       → AdminClientDetail (ledger는 최근 20건)
 *  - PATCH /api/admin/clients/:clientId       body { tier?, status? } → { ok: true }
 *  - POST  /api/admin/credits/adjust          body AdjustCreditsInput → AdjustCreditsResult
 *                                               (reason='admin_adjust' 원장 append, 음수는
 *                                                CreditsService.consume 경유 — 잔액 부족 시 400)
 *  - GET   /api/admin/qa-queue                → AdminQaItem[] (status in ai_processing|qa_review)
 *  - POST  /api/admin/qa/:id/approve          → { ok: true } (status→applied + 배포 트리거)
 *  - POST  /api/admin/qa/:id/reject           body { reason } → { ok: true }
 *                                               (status→rejected + credits.refund(referenceId=편집요청 id))
 *  - GET   /api/admin/infra                   → AdminInfraStatus
 */
import type {
  Client,
  ClientStatus,
  CreditLedgerEntry,
  EditRequest,
  Payment,
  Site,
  SiteStatus,
  Tier,
} from '@/lib/types/domain';

// ---------- 응답 타입 (백엔드 구현 계약) ----------

export interface AdminOverview {
  clients: { total: number; basic: number; premium: number };
  liveSites: number;
  /** granted = 지급 합계(양수 행), consumed = 소모 합계(음수 행 절대값), circulating = granted - consumed */
  credits: { granted: number; consumed: number; circulating: number };
  qaPending: number;
  customHostnameCount: number;
}

export interface AdminClientRow {
  id: string;
  name: string;
  email: string;
  tier: Tier;
  status: ClientStatus;
  balance: number;
  siteCount: number;
  createdAt: string;
}

export interface AdminClientDetail {
  client: Client;
  balance: number;
  sites: Site[];
  /** 최근 20건, createdAt desc */
  ledger: CreditLedgerEntry[];
  payments: Payment[];
}

export interface AdjustCreditsInput {
  clientId: string;
  /** 0이 아닌 정수. 양수 = 지급, 음수 = 차감 */
  amount: number;
  memo: string;
}

export interface AdjustCreditsResult {
  ok: true;
  newBalance: number;
}

export interface UpdateClientInput {
  tier?: Tier;
  status?: ClientStatus;
}

export interface AdminQaItem extends EditRequest {
  clientName: string;
  clientTier: Tier;
  siteName: string;
}

export interface AdminHostnameRow {
  siteId: string;
  siteName: string;
  clientName: string;
  hostname: string;
  dnsVerified: boolean;
  siteStatus: SiteStatus;
  /** Cloudflare SSL 상태 문자열 (예: 'active' | 'pending_validation') */
  sslStatus: string;
}

export interface AdminInfraStatus {
  hostnameCount: number;
  hostnames: AdminHostnameRow[];
}

// ---------- fetch 헬퍼 ----------

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = `요청에 실패했습니다 (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // JSON이 아닌 에러 응답 — 기본 메시지 유지
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

// ---------- 엔드포인트 함수 ----------

export function getOverview(): Promise<AdminOverview> {
  return fetchJson<AdminOverview>('/api/admin/overview');
}

export function getClients(): Promise<AdminClientRow[]> {
  return fetchJson<AdminClientRow[]>('/api/admin/clients');
}

export function getClientDetail(clientId: string): Promise<AdminClientDetail> {
  return fetchJson<AdminClientDetail>(`/api/admin/clients/${encodeURIComponent(clientId)}`);
}

export function updateClient(clientId: string, patch: UpdateClientInput): Promise<{ ok: true }> {
  return fetchJson<{ ok: true }>(`/api/admin/clients/${encodeURIComponent(clientId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function adjustCredits(input: AdjustCreditsInput): Promise<AdjustCreditsResult> {
  return fetchJson<AdjustCreditsResult>('/api/admin/credits/adjust', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getQaQueue(): Promise<AdminQaItem[]> {
  return fetchJson<AdminQaItem[]>('/api/admin/qa-queue');
}

export function approveQaRequest(id: string): Promise<{ ok: true }> {
  return fetchJson<{ ok: true }>(`/api/admin/qa/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function rejectQaRequest(id: string, reason: string): Promise<{ ok: true }> {
  return fetchJson<{ ok: true }>(`/api/admin/qa/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function getInfra(): Promise<AdminInfraStatus> {
  return fetchJson<AdminInfraStatus>('/api/admin/infra');
}
