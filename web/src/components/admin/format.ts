/** 관리자 콘솔 공용 포맷터/라벨. */
import type {
  ClientStatus,
  CreditReason,
  DomainType,
  EditStatus,
  EditType,
  PaymentType,
  SiteStatus,
  Tier,
} from '@/lib/types/domain';

export type AdminDisplayCurrency = 'KRW' | 'USD';

/** Payment amounts are whole units of their recorded currency. */
export function formatCurrency(amount: number, currency: AdminDisplayCurrency): string {
  const rounded = Math.round(amount);
  return new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'ko-KR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(rounded);
}

/** Backward-compatible formatter for KRW-only operating surfaces. */
export function formatKrw(amount: number): string {
  return formatCurrency(amount, 'KRW');
}

export function formatNumber(n: number): string {
  return n.toLocaleString('ko-KR');
}

function kstParts(iso: string): Record<string, string> | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const parts = kstParts(iso);
  return parts ? `${parts.year}.${parts.month}.${parts.day}` : '—';
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const parts = kstParts(iso);
  return parts
    ? `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute} KST`
    : '—';
}

/**
 * "1 open request" / "3 open requests". The console shows a count of exactly one often enough —
 * a single overdue edit, a single credit — that "1 credits" reads as a bug to the operator.
 */
export function countLabel(count: number, singular: string, plural: string): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

export function shortId(id: string | null | undefined): string {
  if (!id) return '—';
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

export const TIER_LABELS: Record<Tier, string> = {
  basic: "Default homepage",
  premium: "AI video homepage",
};

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  active: "Active",
  paused: "Paused",
  cancelled: "Cancelled",
};

export const SITE_STATUS_LABELS: Record<SiteStatus, string> = {
  draft: "Draft",
  building: "Building",
  live: "Live",
  pending_dns: "Awaiting DNS",
  suspended: "Suspended",
};

export const DOMAIN_TYPE_LABELS: Record<DomainType, string> = {
  subdomain: "Subdomain",
  custom: "Custom domain",
};

export const EDIT_TYPE_LABELS: Record<EditType, string> = {
  text: "Text edit",
  image: "AI image",
  video: "AI video",
  structure: "Section redesign",
};

export const EDIT_STATUS_LABELS: Record<EditStatus, string> = {
  pending: "Pending",
  ai_processing: "AI processing",
  qa_review: "QA review",
  applied: "Applied",
  rejected: "Rejected",
};

export const CREDIT_REASON_LABELS: Record<CreditReason, string> = {
  initial_grant: "Initial grant",
  purchase: "Credit pack purchase",
  subscription_grant: "Monthly subscription grant",
  edit_text: "Text edit",
  edit_image: "AI image",
  edit_video: "AI video",
  edit_structure: "Section redesign",
  refund: "Refund",
  expired: "Expired",
  admin_clawback: "Admin clawback",
  admin_adjust: "Admin adjustment",
};

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  build_fee: "Build fee (legacy)",
  maintenance_subscription: "Site maintenance subscription",
  premium_addon: "AI video add-on",
  credit_pack: "Credit pack",
};
