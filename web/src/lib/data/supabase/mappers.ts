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
  Payment,
  PaymentType,
  Site,
  SiteStatus,
  Tier,
} from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';

export interface ClientRow {
  id: string;
  name: string;
  email: string;
  auth_provider: string;
  tier: string;
  status: string;
  created_at: string;
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
    siteConfig: (row.site_config as SiteConfig | null) ?? null,
    draftConfig: (row.draft_config as SiteConfig | null) ?? null,
    publishedAt: row.published_at,
    createdAt: row.created_at,
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
  };
}
