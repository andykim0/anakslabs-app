/**
 * 사이트 운영 구독의 순수 계약.
 *
 * 구독 자격은 client/status 같은 간접 신호가 아니라 이 상태의
 * status + currentPeriodEnd 조합만으로 판정한다. 서버 I/O는 service.ts에 둔다.
 */

export const SITE_SUBSCRIPTION_STATUSES = [
  'active',
  'past_due',
  'suspended',
  'cancelled',
] as const;

export type SiteSubscriptionStatus = (typeof SITE_SUBSCRIPTION_STATUSES)[number];

export interface SiteSubscriptionState {
  clientId: string;
  /** 0047 이전 상태는 null/미지정. 신규 업종 계약은 사이트 단위 증거를 고정한다. */
  siteId?: string | null;
  industryProfileId?: 'interior' | 'clinic' | null;
  pricingModelVersion?: string | null;
  stripeSubscriptionId?: string | null;
  status: SiteSubscriptionStatus;
  currentPeriodEnd: string;
  updatedAt: string;
}

export interface ResolvedSubscription {
  state: SiteSubscriptionState | null;
  active: boolean;
}

/** Minimal service-side evidence used only for operational first-renewal counts. */
export interface SiteSubscriptionRenewalEvidence {
  clientId: string;
  periodStart: string;
  reversedAt: string | null;
}

export interface AdminSiteSubscriptionItem {
  state: SiteSubscriptionState;
  /** Uses the same fail-closed resolver as grants, reports and customer UI. */
  active: boolean;
  /** Earliest non-reversed renewal period start; null means the evidence is insufficient. */
  firstRenewedAt: string | null;
}

export interface AdminSubscriptionMonthSummary {
  /** Korean calendar month, e.g. `2026-07`. */
  periodMonth: string;
  /** First non-reversed renewal starts in this month. */
  newCount: number;
  /** Current authoritative state became `cancelled` in this month. */
  cancelledCount: number;
  /** Explicitly distinguishes this operational count from cohort churn analytics. */
  calculation: 'simple-churn';
}

export interface AdminSiteSubscriptionListing {
  asOf: string;
  items: AdminSiteSubscriptionItem[];
  summary: AdminSubscriptionMonthSummary;
}

export const SUBSCRIPTION_GRANT_REASON = 'subscription_grant' as const;
export const SUBSCRIPTION_GRANT_EXPIRY_DAYS = 90;

const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;

function currentKstMonthBounds(at: Date): {
  periodMonth: string;
  startMs: number;
  endExclusiveMs: number;
} {
  const atMs = at.getTime();
  if (!Number.isFinite(atMs)) throw new Error('currentKstMonthBounds: invalid date');
  const kst = new Date(atMs + KST_OFFSET_MS);
  const year = kst.getUTCFullYear();
  const zeroBasedMonth = kst.getUTCMonth();
  return {
    periodMonth: `${year}-${String(zeroBasedMonth + 1).padStart(2, '0')}`,
    startMs: Date.UTC(year, zeroBasedMonth, 1) - KST_OFFSET_MS,
    endExclusiveMs: Date.UTC(year, zeroBasedMonth + 1, 1) - KST_OFFSET_MS,
  };
}

function isWithinHalfOpenRange(value: string, startMs: number, endExclusiveMs: number): boolean {
  const valueMs = Date.parse(value);
  return Number.isFinite(valueMs) && valueMs >= startMs && valueMs < endExclusiveMs;
}

/** Invalid/missing state always fails closed. The end instant is exclusive. */
export function isSiteSubscriptionActiveAt(
  state: SiteSubscriptionState | null | undefined,
  at: Date = new Date(),
): boolean {
  if (!state || state.status !== 'active') return false;
  const atMs = at.getTime();
  const endMs = Date.parse(state.currentPeriodEnd);
  return Number.isFinite(atMs) && Number.isFinite(endMs) && endMs > atMs;
}

/** Calendar-month benefit keys use Korean billing time, not a server's locale. */
export function subscriptionGrantMonth(at: Date = new Date()): string {
  const atMs = at.getTime();
  if (!Number.isFinite(atMs)) throw new Error('subscriptionGrantMonth: invalid date');
  const kst = new Date(atMs + KST_OFFSET_MS);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function subscriptionGrantIdempotencyKey(clientId: string, at: Date = new Date()): string {
  const owner = clientId.trim();
  if (!owner) throw new Error('subscriptionGrantIdempotencyKey: clientId is required');
  return `${SUBSCRIPTION_GRANT_REASON}:${owner}:${subscriptionGrantMonth(at)}`;
}

/**
 * Builds the admin read model without changing subscription authority.
 *
 * Renewal evidence is used only to count a first start. Eligibility still
 * comes exclusively from the authoritative state through
 * isSiteSubscriptionActiveAt().
 */
export function buildAdminSiteSubscriptionListing(input: {
  states: readonly SiteSubscriptionState[];
  renewals: readonly SiteSubscriptionRenewalEvidence[];
  at?: Date;
}): AdminSiteSubscriptionListing {
  const at = input.at ?? new Date();
  const atMs = at.getTime();
  if (!Number.isFinite(atMs)) {
    throw new Error('buildAdminSiteSubscriptionListing: invalid date');
  }
  const bounds = currentKstMonthBounds(at);
  const firstRenewalByClient = new Map<string, string>();

  for (const renewal of input.renewals) {
    if (renewal.reversedAt !== null) continue;
    const clientId = renewal.clientId.trim();
    const periodStartMs = Date.parse(renewal.periodStart);
    if (!clientId || !Number.isFinite(periodStartMs)) {
      throw new Error('ADMIN_SUBSCRIPTION_RENEWAL_EVIDENCE_INVALID');
    }
    const existing = firstRenewalByClient.get(clientId);
    if (!existing || periodStartMs < Date.parse(existing)) {
      firstRenewalByClient.set(clientId, renewal.periodStart);
    }
  }

  const items = input.states
    .map((state): AdminSiteSubscriptionItem => ({
      state: { ...state },
      active: isSiteSubscriptionActiveAt(state, at),
      firstRenewedAt: firstRenewalByClient.get(state.clientId) ?? null,
    }))
    .sort(
      (left, right) =>
        Number(right.active) - Number(left.active) ||
        right.state.updatedAt.localeCompare(left.state.updatedAt) ||
        left.state.clientId.localeCompare(right.state.clientId),
    );

  return {
    asOf: at.toISOString(),
    items,
    summary: {
      periodMonth: bounds.periodMonth,
      newCount: items.filter(
        (item) =>
          item.firstRenewedAt !== null &&
          isWithinHalfOpenRange(item.firstRenewedAt, bounds.startMs, bounds.endExclusiveMs),
      ).length,
      cancelledCount: items.filter(
        (item) =>
          item.state.status === 'cancelled' &&
          isWithinHalfOpenRange(item.state.updatedAt, bounds.startMs, bounds.endExclusiveMs),
      ).length,
      calculation: 'simple-churn',
    },
  };
}

/** PostgreSQL calendar-month interval semantics without JS end-of-month overflow. */
export function addUtcCalendarMonthsClamped(at: Date, months: number): Date {
  const atMs = at.getTime();
  if (!Number.isFinite(atMs) || !Number.isInteger(months)) {
    throw new Error('addUtcCalendarMonthsClamped: valid date and integer months are required');
  }
  const targetMonthStart = new Date(
    Date.UTC(
      at.getUTCFullYear(),
      at.getUTCMonth() + months,
      1,
      at.getUTCHours(),
      at.getUTCMinutes(),
      at.getUTCSeconds(),
      at.getUTCMilliseconds(),
    ),
  );
  const daysInTargetMonth = new Date(
    Date.UTC(targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth() + 1, 0),
  ).getUTCDate();
  targetMonthStart.setUTCDate(Math.min(at.getUTCDate(), daysInTargetMonth));
  return targetMonthStart;
}
