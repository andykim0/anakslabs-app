const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;
export const REPORTING_RETENTION_MONTHS = 24;

function daysInUtcMonth(year: number, zeroBasedMonth: number): number {
  return new Date(Date.UTC(year, zeroBasedMonth + 1, 0)).getUTCDate();
}

/** Fail closed on malformed or impossible YYYY-MM-DD values before a purge RPC. */
export function assertReportingCalendarDate(value: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new TypeError('site_events purge date must be a valid YYYY-MM-DD calendar date');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    month < 1
    || month > 12
    || day < 1
    || day > daysInUtcMonth(year, month - 1)
  ) {
    throw new TypeError('site_events purge date must be a valid YYYY-MM-DD calendar date');
  }
}

/** 24 calendar months in Korean time, clamped at month-end. */
export function reportingRetentionCutoff(now: Date = new Date()): {
  eventBeforeDate: string;
  reportCutoffIso: string;
} {
  if (!Number.isFinite(now.getTime())) throw new TypeError('A valid retention date is required');
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const targetMonth = kst.getUTCMonth() - REPORTING_RETENTION_MONTHS;
  const targetMonthStart = new Date(Date.UTC(kst.getUTCFullYear(), targetMonth, 1));
  const day = Math.min(
    kst.getUTCDate(),
    daysInUtcMonth(targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth()),
  );
  const eventBeforeDate = [
    targetMonthStart.getUTCFullYear(),
    String(targetMonthStart.getUTCMonth() + 1).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
  const reportMonthStartUtc = Date.UTC(
    targetMonthStart.getUTCFullYear(),
    targetMonthStart.getUTCMonth(),
    1,
  ) - KST_OFFSET_MS;
  return {
    eventBeforeDate,
    reportCutoffIso: new Date(reportMonthStartUtc).toISOString(),
  };
}
