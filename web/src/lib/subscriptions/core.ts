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
  status: SiteSubscriptionStatus;
  currentPeriodEnd: string;
  updatedAt: string;
}

export interface ResolvedSubscription {
  state: SiteSubscriptionState | null;
  active: boolean;
}

export const SUBSCRIPTION_GRANT_REASON = 'subscription_grant' as const;
export const SUBSCRIPTION_GRANT_EXPIRY_DAYS = 90;

const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;

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
