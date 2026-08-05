import type { KstMonthRange, MonthlyReportPeriods } from './types';
import type { UsSiteTimezone } from '@/lib/types/site';

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

interface CalendarParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const zonedCalendarFormatters = new Map<UsSiteTimezone, Intl.DateTimeFormat>();

function zonedCalendarFormatter(timeZone: UsSiteTimezone): Intl.DateTimeFormat {
  const existing = zonedCalendarFormatters.get(timeZone);
  if (existing) return existing;
  const formatter = new Intl.DateTimeFormat('en-CA-u-ca-iso8601-nu-latn', {
    timeZone,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  zonedCalendarFormatters.set(timeZone, formatter);
  return formatter;
}

function zonedCalendarParts(value: Date, timeZone: UsSiteTimezone): CalendarParts {
  const values = new Map(
    zonedCalendarFormatter(timeZone)
      .formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)] as const),
  );
  const parts: CalendarParts = {
    year: values.get('year') ?? Number.NaN,
    month: values.get('month') ?? Number.NaN,
    day: values.get('day') ?? Number.NaN,
    hour: values.get('hour') ?? Number.NaN,
    minute: values.get('minute') ?? Number.NaN,
    second: values.get('second') ?? Number.NaN,
  };
  if (Object.values(parts).some((part) => !Number.isInteger(part))) {
    throw new RangeError(`Unable to resolve report calendar parts for ${timeZone}`);
  }
  return parts;
}

function normalizedCalendarMonth(year: number, zeroBasedMonth: number): {
  year: number;
  zeroBasedMonth: number;
} {
  const normalized = new Date(Date.UTC(year, zeroBasedMonth, 1));
  return {
    year: normalized.getUTCFullYear(),
    zeroBasedMonth: normalized.getUTCMonth(),
  };
}

/** Resolve a local calendar midnight by asking Intl about each candidate instant. */
function zonedMonthStartMs(
  year: number,
  zeroBasedMonth: number,
  timeZone: UsSiteTimezone,
): number {
  const normalized = normalizedCalendarMonth(year, zeroBasedMonth);
  const targetWallMs = Date.UTC(normalized.year, normalized.zeroBasedMonth, 1);
  let candidateMs = targetWallMs;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const shown = zonedCalendarParts(new Date(candidateMs), timeZone);
    const shownWallMs = Date.UTC(
      shown.year,
      shown.month - 1,
      shown.day,
      shown.hour,
      shown.minute,
      shown.second,
    );
    const correctionMs = targetWallMs - shownWallMs;
    if (correctionMs === 0) return candidateMs;
    candidateMs += correctionMs;
  }

  const shown = zonedCalendarParts(new Date(candidateMs), timeZone);
  if (
    shown.year === normalized.year
    && shown.month === normalized.zeroBasedMonth + 1
    && shown.day === 1
    && shown.hour === 0
    && shown.minute === 0
    && shown.second === 0
  ) {
    return candidateMs;
  }
  throw new RangeError(`Unable to resolve report month boundary for ${timeZone}`);
}

function zonedMonthRange(
  year: number,
  zeroBasedMonth: number,
  timeZone: UsSiteTimezone,
): KstMonthRange {
  const start = normalizedCalendarMonth(year, zeroBasedMonth);
  const end = normalizedCalendarMonth(year, zeroBasedMonth + 1);
  const month = `${start.year}-${String(start.zeroBasedMonth + 1).padStart(2, '0')}`;
  const endMonth = `${end.year}-${String(end.zeroBasedMonth + 1).padStart(2, '0')}`;
  return {
    month,
    startDate: `${month}-01`,
    endExclusiveDate: `${endMonth}-01`,
    startIso: new Date(zonedMonthStartMs(start.year, start.zeroBasedMonth, timeZone)).toISOString(),
    endExclusiveIso: new Date(
      zonedMonthStartMs(end.year, end.zeroBasedMonth, timeZone),
    ).toISOString(),
  };
}

/**
 * First day of the *current* calendar month in an approved US site time zone, as `YYYY-MM-01`.
 *
 * Content fulfillment stamps this on every monthly slot, so it must answer "which month is the
 * customer living in right now" — the ranges above answer the different question of which months
 * are already complete, and reusing them would date every slot one month early.
 */
export function currentMonthStartDateInTimeZone(
  timeZone: UsSiteTimezone,
  now: Date = new Date(),
): string {
  assertValidDate(now);
  const local = zonedCalendarParts(now, timeZone);
  return `${String(local.year).padStart(4, '0')}-${String(local.month).padStart(2, '0')}-01`;
}

/** Resolve the last two completed calendar months in an approved US site time zone. */
export function previousMonthRangesInTimeZone(
  timeZone: UsSiteTimezone,
  now: Date = new Date(),
): MonthlyReportPeriods {
  assertValidDate(now);
  const localNow = zonedCalendarParts(now, timeZone);
  return {
    report: zonedMonthRange(localNow.year, localNow.month - 2, timeZone),
    comparison: zonedMonthRange(localNow.year, localNow.month - 3, timeZone),
  };
}
