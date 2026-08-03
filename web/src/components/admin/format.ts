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

export function formatKrw(amount: number): string {
  return `₩${Math.round(amount).toLocaleString('ko-KR')}`;
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

export function shortId(id: string | null | undefined): string {
  if (!id) return '—';
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

export const TIER_LABELS: Record<Tier, string> = {
  basic: "default homepage",
  premium: "AI video homepage",
};

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  active: "active",
  paused: "pause",
  cancelled: "Termination",
};

export const SITE_STATUS_LABELS: Record<SiteStatus, string> = {
  draft: "draft",
  building: "in production",
  live: "live",
  pending_dns: "DNS standby",
  suspended: "stopped",
};

export const DOMAIN_TYPE_LABELS: Record<DomainType, string> = {
  subdomain: "subdomain",
  custom: "custom",
};

export const EDIT_TYPE_LABELS: Record<EditType, string> = {
  text: "Anaks Labs copy editing service",
  image: "Create a new AI image",
  video: "AI video regeneration",
  structure: "AI entire section redesign",
};

export const EDIT_STATUS_LABELS: Record<EditStatus, string> = {
  pending: "atmosphere",
  ai_processing: "AI processing",
  qa_review: "QA inspection",
  applied: "Applied",
  rejected: "Rejected",
};

export const CREDIT_REASON_LABELS: Record<CreditReason, string> = {
  initial_grant: "initial payment",
  purchase: "Buy pack",
  subscription_grant: "Subscription monthly payment",
  edit_text: "Anaks Labs copy editing service",
  edit_image: "Create a new AI image",
  edit_video: "AI video regeneration",
  edit_structure: "AI entire section redesign",
  refund: "refund",
  expired: "expiration",
  admin_clawback: "Recovery of payment",
  admin_adjust: "Administrator Coordination",
};

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  build_fee: "Build fee (past)",
  maintenance_subscription: "Site operation subscription",
  premium_addon: "AI video add-on",
  credit_pack: "credit pack",
};
