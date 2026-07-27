/**
 * 관리자 콘솔 → /api/admin/* API 클라이언트.
 *
 * [통합 계약] 아래 타입/엔드포인트는 backend(app/api/ 소유 영역)가 구현해야 하는 응답 형태다.
 * 모든 /api/admin/* 라우트는 isAdmin() 가드 필수(비관리자 → 401/403),
 * 실패 응답은 API 표준 포맷 JSON `{ error: { code, message, ...extra } }` 를 따른다.
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
 *  - GET   /api/admin/video-queue             → AdminVideoQueueResponse
 *  - POST  /api/admin/video-queue/:siteId/complete body { videoAssetId } → idempotent completion
 *  - GET   /api/admin/edit-queue              → AdminEditQueueResponse
 *  - POST  /api/admin/edit-queue/:id/complete → 초안·발행본 적용과 상태 전환을 원자적으로 완료
 *  - GET   /api/admin/content-queue           → AdminContentQueueResponse
 *  - POST  /api/admin/content-queue/:id/generate|regenerate|reject|approve
 *                                               → immutable 버전 생성·원자적 승인 발행
 */
import type {
  Client,
  ClientStatus,
  CreditLedgerEntry,
  EditRequest,
  EditType,
  Payment,
  Site,
  SiteStatus,
  Tier,
} from '@/lib/types/domain';
import type { AdminOpsRevenueMetrics } from '@/lib/admin/ops-metrics';
import type { MonthlyReportDeliveryStatus } from '@/lib/reporting/repository-core';
import type { SiteSubscriptionStatus } from '@/lib/subscriptions/core';
import type { GuaranteeDecision, GuaranteeExceptionCode } from '@/lib/guarantee';
import type { NaverIndexStatus, SearchRegistrationAccountUsage, SearchRegistrationStatus } from '@/lib/seo/search-registration';
import type {
  ManualCollectionChannel,
  ManualCollectionDirection,
  ManualCollectionProductKind,
  ManualPaymentEntry,
} from '@/lib/payments/manual-collection-core';

// ---------- 응답 타입 (백엔드 구현 계약) ----------

export interface AdminOverview {
  clients: { total: number; basic: number; premium: number };
  liveSites: number;
  /** granted = 지급 합계(양수 행), consumed = 소모 합계(음수 행 절대값), circulating = granted - consumed */
  credits: { granted: number; consumed: number; circulating: number };
  qaPending: number;
  fulfillmentAlerts: { editOverdue: number; videoOverdue: number; total: number };
  customHostnameCount: number;
  revenue: AdminOpsRevenueMetrics;
  guaranteeProgramEnabled: boolean;
  guarantees: AdminGuaranteeRow[];
  manualCollections: AdminManualCollectionRow[];
}

export interface AdminGuaranteeRow {
  siteId: string;
  siteName: string;
  domain: string | null;
  publishedAt: string;
  dueAt: string;
  daysRemaining: number;
  decision: GuaranteeDecision;
  naverIndexed: boolean | null;
  naverIndexCheckedAt: string | null;
  naverReferralCount: number;
  referralThreshold: number;
  indexBelowThreshold: boolean | null;
  referralsBelowThreshold: boolean;
  exceptionCode: GuaranteeExceptionCode | null;
}

export interface AdminSearchRegistrationItem {
  siteId: string;
  siteName: string;
  siteUrl: string;
  domainType: 'subdomain' | 'custom';
  status: SearchRegistrationStatus;
  accountLabel: string | null;
  naverVerification: string | null;
  googleVerification: string | null;
  indexStatus: NaverIndexStatus;
  completedAt: string | null;
  updatedAt: string;
}

export interface AdminSearchRegistrationResponse {
  items: AdminSearchRegistrationItem[];
  accounts: SearchRegistrationAccountUsage[];
}

export interface AdminManualCollectionRow {
  entryId: string;
  paymentId: string | null;
  clientId: string | null;
  clientName: string;
  customerContact: string | null;
  siteId: string | null;
  siteName: string | null;
  productKind: ManualCollectionProductKind;
  direction: ManualCollectionDirection;
  amountKrw: number;
  channel: ManualCollectionChannel;
  collectionReference: string;
  memo: string | null;
  createdAt: string;
  reversible: boolean;
  cancelled: boolean;
  reversal: {
    entryId: string;
    collectionReference: string;
    memo: string | null;
    createdAt: string;
  } | null;
  links: Array<{
    id: string;
    kind: 'client' | 'site';
    clientId: string;
    clientName: string;
    siteId: string | null;
    siteName: string | null;
    memo: string | null;
    createdAt: string;
  }>;
}

export interface RecordManualCollectionInput {
  clientId?: string | null;
  customerName?: string | null;
  customerContact?: string | null;
  siteId?: string | null;
  productKind: ManualCollectionProductKind;
  amountKrw: number;
  channel: ManualCollectionChannel;
  collectionReference: string;
  memo?: string | null;
  creditPackCredits?: number;
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
  /** [motion 4단계] 영상 생성 원가 대조 — 누적/오늘 생성 수 + 예산가·가드 상한 */
  videoGen?: {
    total: number;
    today: number;
    enabled: boolean;
    dailyCap: number;
    maxPerSite: number;
    budgetKrwPerSite: number;
  };
}

export type AdminVideoQueueTimingSource = 'recorded' | 'site-created-fallback';

export interface AdminVideoQueueItem {
  siteId: string;
  clientId: string;
  clientName: string;
  siteName: string;
  siteStatus: SiteStatus;
  industryClass: string;
  heroImageUrl: string | null;
  motionLabel: string;
  videoConceptLabel: string | null;
  requestedAt: string;
  timingSource: AdminVideoQueueTimingSource;
  waitingDays: number;
  waitingBusinessDays: number;
  overdue: boolean;
  blockedReason:
    | 'hero-source-missing'
    | 'asset-policy-v2-required'
    | 'hero-source-mismatch'
    | null;
}

export interface AdminVideoFulfillmentHistoryItem {
  id: string;
  siteId: string;
  siteName: string;
  clientName: string;
  videoAssetId: string;
  canonicalVideoUrl: string;
  posterUrl: string;
  requestedAt: string;
  timingSource: AdminVideoQueueTimingSource;
  completedAt: string;
}

export interface AdminVideoQueueResponse {
  items: AdminVideoQueueItem[];
  integrity: AdminFulfillmentQueueIntegrity;
  recentCompletions: AdminVideoFulfillmentHistoryItem[];
}

export interface AdminFulfillmentQueueIntegrity {
  sourceCount: number;
  queueCount: number;
  missingCount: number;
}

export interface AdminSubscriptionReportItem {
  siteId: string;
  siteName: string;
  siteStatus: SiteStatus;
  reportId: string | null;
  deliveryStatus: MonthlyReportDeliveryStatus | 'not-generated' | 'not-eligible';
  deliveryAttempts: number;
  lastErrorCode: string | null;
  sentAt: string | null;
}

export interface AdminSubscriptionItem {
  clientId: string;
  clientName: string;
  clientEmail: string;
  status: SiteSubscriptionStatus;
  active: boolean;
  currentPeriodEnd: string;
  updatedAt: string;
  reports: AdminSubscriptionReportItem[];
}

export interface AdminSubscriptionsResponse {
  asOf: string;
  reportPeriodMonth: string;
  summary: {
    active: number;
    pastDue: number;
    suspended: number;
    cancelled: number;
    mrrKrw: number;
    newThisMonth: number;
    cancelledThisMonth: number;
    reportAccepted: number;
    reportFailed: number;
    reportMissing: number;
  };
  items: AdminSubscriptionItem[];
}

export interface AdminEditQueueItem {
  id: string;
  clientId: string;
  clientName: string;
  siteId: string;
  siteName: string;
  siteStatus: SiteStatus | null;
  type: EditType;
  status: Extract<EditRequest['status'], 'pending' | 'ai_processing' | 'qa_review'>;
  requestedContent: string;
  createdAt: string;
  waitingHours: number;
  waitingBusinessDays: number;
  overdue: boolean;
  isInitialRevision: boolean;
  /** 같은 request id를 referenceId로 가진 append-only 원장의 차감·환불 순액. */
  netCreditCharge: number;
  creditCharged: boolean;
  ledgerEntryCount: number;
}

export interface AdminEditQueueResponse {
  items: AdminEditQueueItem[];
  integrity: AdminFulfillmentQueueIntegrity;
}

export type AdminContentQueueStatus =
  | 'draft'
  | 'generating'
  | 'pending_approval'
  | 'rejected';

export interface AdminContentQueueVersion {
  id: string;
  versionNumber: number;
  title: string;
  summary: string;
  tags: string[];
  sourceRefs: string[];
  policyVersions: Record<string, unknown>;
  generationMetadata: Record<string, unknown>;
  createdAt: string;
}

export interface AdminContentQueueItem {
  id: string;
  clientId: string;
  siteId: string;
  pricingModelVersion: string;
  periodMonth: string;
  ordinal: number;
  slug: string;
  status: AdminContentQueueStatus;
  currentVersionId: string | null;
  currentVersion: AdminContentQueueVersion | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminContentQueueResponse {
  items: AdminContentQueueItem[];
  integrity: AdminFulfillmentQueueIntegrity;
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
      // API 표준 에러 포맷: { error: { code, message, ...extra } }
      const body = (await res.json()) as { error?: { message?: string } | string };
      if (typeof body?.error === 'string') message = body.error;
      else if (body?.error?.message) message = body.error.message;
    } catch {
      // JSON이 아닌 에러 응답 — 기본 메시지 유지
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

// ---------- QA 자동화 (§2) ----------

export interface QaRuleDto {
  editType: EditType;
  enabled: boolean;
  approvalThreshold: number;
  minSamples: number;
  sampleAuditRate: number;
}

export interface QaStatDto {
  editType: EditType;
  sampleSize: number;
  approvedCount: number;
  approvalRate: number;
}

export function getQaStats(): Promise<{ rules: QaRuleDto[]; stats: QaStatDto[] }> {
  return fetchJson<{ rules: QaRuleDto[]; stats: QaStatDto[] }>('/api/admin/qa-stats');
}

export function setQaRule(editType: EditType, enabled: boolean): Promise<{ ok: boolean; rules: QaRuleDto[] }> {
  return fetchJson<{ ok: boolean; rules: QaRuleDto[] }>('/api/admin/qa-rules', {
    method: 'POST',
    body: JSON.stringify({ editType, enabled }),
  });
}

// ---------- 엔드포인트 함수 ----------

export function getOverview(): Promise<AdminOverview> {
  return fetchJson<AdminOverview>('/api/admin/overview');
}

export function recordManualCollection(
  input: RecordManualCollectionInput,
): Promise<{ ok: true; duplicated: boolean; entry: ManualPaymentEntry }> {
  return fetchJson<{ ok: true; duplicated: boolean; entry: ManualPaymentEntry }>(
    '/api/admin/payments/manual',
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export function reverseManualCollection(
  entryId: string,
  input: { collectionReference: string; memo: string },
): Promise<{ ok: true; duplicated: boolean; entry: ManualPaymentEntry }> {
  return fetchJson<{ ok: true; duplicated: boolean; entry: ManualPaymentEntry }>(
    `/api/admin/payments/manual/${encodeURIComponent(entryId)}/reverse`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export function cancelManualCollection(
  entryId: string,
): Promise<{ ok: true; duplicated: boolean; entry: ManualPaymentEntry }> {
  return fetchJson<{ ok: true; duplicated: boolean; entry: ManualPaymentEntry }>(
    `/api/admin/payments/manual/${encodeURIComponent(entryId)}/cancel`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export function linkManualCollectionClient(
  entryId: string,
  input: { clientId: string; memo?: string | null },
): Promise<{ ok: true; duplicated: boolean; entry: ManualPaymentEntry }> {
  return fetchJson<{ ok: true; duplicated: boolean; entry: ManualPaymentEntry }>(
    `/api/admin/payments/manual/${encodeURIComponent(entryId)}/link-client`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export function linkManualCollectionSite(
  entryId: string,
  input: { siteId: string; memo?: string | null },
): Promise<{ ok: true; duplicated: boolean; entry: ManualPaymentEntry }> {
  return fetchJson<{ ok: true; duplicated: boolean; entry: ManualPaymentEntry }>(
    `/api/admin/payments/manual/${encodeURIComponent(entryId)}/link-site`,
    { method: 'POST', body: JSON.stringify(input) },
  );
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

export function getSearchRegistrationQueue(): Promise<AdminSearchRegistrationResponse> {
  return fetchJson<AdminSearchRegistrationResponse>('/api/admin/search-registration');
}

export function updateSearchRegistration(
  siteId: string,
  input: Pick<AdminSearchRegistrationItem, 'status' | 'accountLabel' | 'naverVerification' | 'googleVerification' | 'indexStatus'>,
): Promise<{ item: AdminSearchRegistrationItem }> {
  return fetchJson<{ item: AdminSearchRegistrationItem }>(
    `/api/admin/search-registration/${encodeURIComponent(siteId)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
}

export function getVideoQueue(): Promise<AdminVideoQueueResponse> {
  return fetchJson<AdminVideoQueueResponse>('/api/admin/video-queue');
}

export function completeVideoFulfillment(
  siteId: string,
  videoAssetId: string,
): Promise<{ ok: true; duplicated: boolean }> {
  return fetchJson<{ ok: true; duplicated: boolean }>(
    `/api/admin/video-queue/${encodeURIComponent(siteId)}/complete`,
    {
      method: 'POST',
      body: JSON.stringify({ videoAssetId }),
    },
  );
}

export function getAdminSubscriptions(): Promise<AdminSubscriptionsResponse> {
  return fetchJson<AdminSubscriptionsResponse>('/api/admin/subscriptions');
}

export function retryAdminMonthlyReport(
  reportId: string,
): Promise<{ ok: boolean; deliveryStatus: 'sent' | 'failed' | 'delivery_unknown' }> {
  return fetchJson<{ ok: boolean; deliveryStatus: 'sent' | 'failed' | 'delivery_unknown' }>(
    '/api/admin/reports/retry',
    {
      method: 'POST',
      body: JSON.stringify({ reportId }),
    },
  );
}

export function getAdminEditQueue(): Promise<AdminEditQueueResponse> {
  return fetchJson<AdminEditQueueResponse>('/api/admin/edit-queue');
}

export function completeAdminEditRequest(
  editRequestId: string,
): Promise<{ ok: true; duplicated: boolean }> {
  return fetchJson<{ ok: true; duplicated: boolean }>(
    `/api/admin/edit-queue/${encodeURIComponent(editRequestId)}/complete`,
    {
      method: 'POST',
      body: JSON.stringify({ siteAppliedConfirmed: true }),
    },
  );
}

export function getAdminContentQueue(): Promise<AdminContentQueueResponse> {
  return fetchJson<AdminContentQueueResponse>('/api/admin/content-queue');
}

export function generateAdminContent(
  id: string,
  topic: string,
  regeneration = false,
): Promise<{ ok: true; item: AdminContentQueueItem }> {
  const action = regeneration ? 'regenerate' : 'generate';
  return fetchJson<{ ok: true; item: AdminContentQueueItem }>(
    `/api/admin/content-queue/${encodeURIComponent(id)}/${action}`,
    { method: 'POST', body: JSON.stringify({ topic }) },
  );
}

export function rejectAdminContent(
  id: string,
  expectedVersionId: string,
  reason: string,
): Promise<{ ok: true; duplicated: boolean }> {
  return fetchJson<{ ok: true; duplicated: boolean }>(
    `/api/admin/content-queue/${encodeURIComponent(id)}/reject`,
    {
      method: 'POST',
      body: JSON.stringify({ expectedVersionId, reason }),
    },
  );
}

export function approveAdminContent(
  id: string,
  expectedVersionId: string,
): Promise<{ ok: true; duplicated: boolean }> {
  return fetchJson<{ ok: true; duplicated: boolean }>(
    `/api/admin/content-queue/${encodeURIComponent(id)}/approve`,
    {
      method: 'POST',
      body: JSON.stringify({ expectedVersionId, approvalConfirmed: true }),
    },
  );
}
