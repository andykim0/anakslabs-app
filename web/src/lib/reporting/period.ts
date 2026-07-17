import type { KstMonthRange, MonthlyReportPeriods } from './types';

const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;

function assertValidDate(value: Date): void {
  if (!Number.isFinite(value.getTime())) throw new TypeError('A valid report date is required');
}

function monthRange(year: number, zeroBasedMonth: number): KstMonthRange {
  const startMs = Date.UTC(year, zeroBasedMonth, 1) - KST_OFFSET_MS;
  const endMs = Date.UTC(year, zeroBasedMonth + 1, 1) - KST_OFFSET_MS;
  const localStart = new Date(startMs + KST_OFFSET_MS);
  const localEnd = new Date(endMs + KST_OFFSET_MS);
  const month = `${localStart.getUTCFullYear()}-${String(localStart.getUTCMonth() + 1).padStart(2, '0')}`;
  const endMonth = `${localEnd.getUTCFullYear()}-${String(localEnd.getUTCMonth() + 1).padStart(2, '0')}`;
  return {
    month,
    startDate: `${month}-01`,
    endExclusiveDate: `${endMonth}-01`,
    startIso: new Date(startMs).toISOString(),
    endExclusiveIso: new Date(endMs).toISOString(),
  };
}

/**
 * Resolve the last two completed Korean calendar months as UTC half-open ranges.
 * A fixed UTC+09:00 offset is correct because Korea does not observe daylight saving time.
 */
export function previousMonthRangesKst(now: Date = new Date()): MonthlyReportPeriods {
  assertValidDate(now);
  const nowInKst = new Date(now.getTime() + KST_OFFSET_MS);
  const year = nowInKst.getUTCFullYear();
  const month = nowInKst.getUTCMonth();
  return {
    report: monthRange(year, month - 1),
    comparison: monthRange(year, month - 2),
  };
}
