export const FULFILLMENT_SLA_BUSINESS_DAYS = 2;

const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const DAY_MS = 86_400_000;

function kstDayStartMs(value: string | Date): number | null {
  const sourceMs = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(sourceMs)) return null;
  const shifted = new Date(sourceMs + KST_OFFSET_MS);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}

function isWeekday(dayStartMs: number): boolean {
  const day = new Date(dayStartMs).getUTCDay();
  return day !== 0 && day !== 6;
}

/**
 * Counts completed KST business-day boundaries after the request date.
 * Weekends are excluded. Public holidays are intentionally not guessed; the
 * constant is an operational SLA warning, not a contractual due-date engine.
 */
export function waitingBusinessDays(requestedAt: string, now: Date = new Date()): number {
  const requestedDay = kstDayStartMs(requestedAt);
  const currentDay = kstDayStartMs(now);
  if (requestedDay === null || currentDay === null || currentDay <= requestedDay) return 0;

  let count = 0;
  for (let day = requestedDay + DAY_MS; day <= currentDay; day += DAY_MS) {
    if (isWeekday(day)) count += 1;
  }
  return count;
}

export function fulfillmentSlaState(requestedAt: string, now: Date = new Date()): {
  waitingBusinessDays: number;
  overdue: boolean;
} {
  const days = waitingBusinessDays(requestedAt, now);
  return {
    waitingBusinessDays: days,
    // The warning turns on as soon as the configured service window has been
    // fully consumed; waiting until the next integer boundary would hide work
    // throughout the first overdue business day.
    overdue: days >= FULFILLMENT_SLA_BUSINESS_DAYS,
  };
}
