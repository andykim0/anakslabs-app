/**
 * DB row(snake_case) ↔ 앱 도메인 모델(camelCase) 매핑.
 * numeric 컬럼은 PostgREST가 number로 직렬화하지만 방어적으로 Number() 강제.
 */
import type {
  AuthProvider,
  Client,
  ClientStatus,
  CreditBalance,
  CreditLedgerEntry,
  CreditReason,
  DomainType,
  EditRequest,
  EditStatus,
  EditType,
  ExportStatus,
  Payment,
  PaymentType,
  Site,
  SiteStatus,
  Tier,
} from '@/lib/types/domain';
import type { SiteConfig, SiteConfigV1 } from '@/lib/types/site';
import { normalizeSiteConfig } from '@/lib/types/site';
import { ensureMotion } from '@/lib/motion/validate';

/** [v4] jsonb site_config → v2 정규화 (v1이면 홈 페이지 1개로 승격) + motion 기본값 주입. null 유지. */
function normalizeConfigCol(raw: unknown): SiteConfig | null {
  if (raw == null) return null;
  return ensureMotion(normalizeSiteConfig(raw as SiteConfigV1 | SiteConfig));
}

export interface ClientRow {
  id: string;
  name: string;
  email: string;
  auth_provider: string;
  tier: string;
  status: string;
  created_at: string;
  cancel_requested_at?: string | null;
}

export function rowToClient(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    authProvider: row.auth_provider as AuthProvider,
    tier: row.tier as Tier,
    status: row.status as ClientStatus,
    createdAt: row.created_at,
    cancelRequestedAt: row.cancel_requested_at ?? null,
  };
}

export interface SiteRow {
  id: string;
  client_id: string;
  name: string;
  domain: string | null;
  domain_type: string;
  dns_verified: boolean;
  cloudflare_hostname_id: string | null;
  status: string;
  site_config: unknown;
  draft_config: unknown;
  published_at: string | null;
  created_at: string;
  free_regens_used?: number | null;
  export_status?: string | null;
  export_requested_at?: string | null;
  export_url?: string | null;
  asset_policy_version?: number | null;
}

export function rowToSite(row: SiteRow): Site {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    domain: row.domain,
    domainType: row.domain_type as DomainType,
    dnsVerified: row.dns_verified,
    cloudflareHostnameId: row.cloudflare_hostname_id,
    status: row.status as SiteStatus,
    // [v4] read 경계 단일 정규화 — 앱 코드는 v2만 본다 (v1 저장분도 여기서 승격)
    siteConfig: normalizeConfigCol(row.site_config),
    draftConfig: normalizeConfigCol(row.draft_config),
    publishedAt: row.published_at,
    createdAt: row.created_at,
    freeRegensUsed: row.free_regens_used ?? 0,
    exportStatus: (row.export_status as ExportStatus | null | undefined) ?? 'none',
    exportRequestedAt: row.export_requested_at ?? null,
    exportUrl: row.export_url ?? null,
    ...(row.asset_policy_version === 2 ? { assetPolicyVersion: 2 as const } : {}),
  };
}

export interface LedgerRow {
  id: string;
  client_id: string;
  amount: number | string;
  reason: string;
  reference_id: string | null;
  expires_at: string | null;
  created_at: string;
}

export function rowToLedgerEntry(row: LedgerRow): CreditLedgerEntry {
  return {
    id: row.id,
    clientId: row.client_id,
    amount: Number(row.amount),
    reason: row.reason as CreditReason,
    referenceId: row.reference_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export interface BalanceRow {
  client_id: string;
  balance: number | string;
  updated_at: string;
}

export function rowToBalance(row: BalanceRow): CreditBalance {
  return {
    clientId: row.client_id,
    balance: Number(row.balance),
    updatedAt: row.updated_at,
  };
}

export interface EditRequestRow {
  id: string;
  client_id: string;
  site_id: string;
  type: string;
  credit_cost: number | string;
  status: string;
  requested_content: string;
  ai_output: unknown;
  created_at: string;
  applied_at: string | null;
  is_initial_revision?: boolean | null;
  auto_approved?: boolean | null;
  reviewed_at?: string | null;
  qa_note?: string | null;
}

export function rowToEditRequest(row: EditRequestRow): EditRequest {
  return {
    id: row.id,
    clientId: row.client_id,
    siteId: row.site_id,
    type: row.type as EditType,
    creditCost: Number(row.credit_cost),
    status: row.status as EditStatus,
    requestedContent: row.requested_content,
    aiOutput: row.ai_output ?? null,
    createdAt: row.created_at,
    appliedAt: row.applied_at,
    isInitialRevision: row.is_initial_revision ?? false,
    autoApproved: row.auto_approved ?? false,
    reviewedAt: row.reviewed_at ?? null,
    qaNote: row.qa_note ?? null,
  };
}

export interface PaymentRow {
  id: string;
  client_id: string;
  type: string;
  amount: number | string;
  credits_granted: number | string;
  provider_payment_key: string | null;
  created_at: string;
  refunded_at?: string | null;
  refund_amount?: number | string | null;
}

export function rowToPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    clientId: row.client_id,
    type: row.type as PaymentType,
    amount: Number(row.amount),
    creditsGranted: Number(row.credits_granted),
    providerPaymentKey: row.provider_payment_key,
    createdAt: row.created_at,
    refundedAt: row.refunded_at ?? null,
    refundAmount: row.refund_amount === null || row.refund_amount === undefined ? null : Number(row.refund_amount),
  };
}
