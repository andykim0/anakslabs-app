/**
 * [SERIES$] Trailing KPI series and weekly buckets, derived from the day-grained store.
 *
 * This module is PURE: no clock, no I/O, no time-zone lookup. That is deliberate and it is
 * only safe because of one property of the storage layer — `SiteEventAggregate.eventDate`
 * is already the SITE'S OWN local calendar day. `siteEventDateString()` stamps it at
 * ingest with `usSiteDateString(site.timezone)` for a US site and `kstDateString()` for a
 * legacy one, so a row dated `2026-08-01` means "the first of August where the clinic is",
 * never "the first of August in UTC".
 *
 * Re-projecting those dates through a time zone here would therefore be a SECOND
 * conversion, and would drag events across month and week boundaries by a day. So month
 * membership is a string comparison against the half-open range the caller already
 * resolved in the site's calendar, and ISO week numbers are computed from the calendar
 * date alone.
 */
import type {
  KstMonthRange,
  ReportSeriesMonth,
  ReportSeriesSection,
  ReportWeeklyBucket,
} from './types';

/**
 * A stored aggregate row, narrowed to what the series needs. Structurally compatible with
 * `@/lib/data/types`.`SiteEventAggregate` so the runner can pass rows straight through
 * without a mapping step that would drop the date again.
 */
export interface DatedSiteEventAggregate {
  /** `YYYY-MM-DD` in the site's own calendar. */
  eventDate: string;
  eventType: string;
  count: number;
}

const DAY_MS = 86_400_000;

function assertCalendarDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new TypeError('A report series date must be YYYY-MM-DD');
  }
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) throw new RangeError(`Unusable report series date: ${value}`);
  return parsed;
}

function assertCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('Report series counts must be non-negative safe integers');
  }
  return value;
}

/**
 * ISO-8601 week number and week-numbering year for a calendar date.
 *
 * The Thursday rule, in full: a week belongs to whichever year contains its Thursday, so
 * `2026-01-01` (a Thursday) is week 1 of 2026 while `2027-01-01` (a Friday) is week 53 of
 * 2026. Both `isoYear` and `isoWeek` are returned because the number alone is ambiguous
 * across a new year — a January report month can legitimately open on week 53 of the
 * previous year, and bucketing on the number alone would then merge it with week 53 of a
 * later December.
 */
export function isoWeekOf(date: string): { isoYear: number; isoWeek: number } {
  const dayMs = assertCalendarDate(date);
  // Monday = 1 … Sunday = 7.
  const weekday = new Date(dayMs).getUTCDay() || 7;
  const thursdayMs = dayMs + (4 - weekday) * DAY_MS;
  const isoYear = new Date(thursdayMs).getUTCFullYear();
  const januaryFirstMs = Date.UTC(isoYear, 0, 1);
  // CEIL of (elapsed days + 1) / 7, counting from 1 January of the ISO year. Rounding the
  // week offset instead is off by one whenever 1 January is late in its own week: the
  // Thursday of 2027-W1 is 6 days after 2027-01-01, which rounds to a second week.
  return {
    isoYear,
    isoWeek: Math.ceil(((thursdayMs - januaryFirstMs) / DAY_MS + 1) / 7),
  };
}

/** Every calendar day of a half-open month range, in order. */
function daysOf(range: KstMonthRange): string[] {
  const startMs = assertCalendarDate(range.startDate);
  const endMs = assertCalendarDate(range.endExclusiveDate);
  if (endMs <= startMs) throw new RangeError('A report month range must be non-empty');
  const days: string[] = [];
  for (let cursor = startMs; cursor < endMs; cursor += DAY_MS) {
    days.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return days;
}

function inRange(date: string, range: KstMonthRange): boolean {
  return date >= range.startDate && date < range.endExclusiveDate;
}

/**
 * The four series KPIs, summed from raw event rows.
 *
 * `inquiries` is `form + chat`, matching `consultationActions` exactly — the sparkline
 * under a KPI tile must trend the number printed above it, not a near neighbour of it.
 */
function accumulate(
  rows: readonly DatedSiteEventAggregate[],
  keep: (date: string) => boolean,
): { pageviews: number; calls: number; directions: number; inquiries: number } {
  const totals = { pageviews: 0, calls: 0, directions: 0, inquiries: 0 };
  for (const row of rows) {
    if (!keep(row.eventDate)) continue;
    const count = assertCount(row.count);
    switch (row.eventType) {
      case 'pageview': totals.pageviews += count; break;
      case 'tel': totals.calls += count; break;
      case 'directions': totals.directions += count; break;
      case 'form':
      case 'chat': totals.inquiries += count; break;
      default: break;
    }
  }
  return {
    pageviews: assertCount(totals.pageviews),
    calls: assertCount(totals.calls),
    directions: assertCount(totals.directions),
    inquiries: assertCount(totals.inquiries),
  };
}

/**
 * [SERIES$] Build the trend section for one report.
 *
 * `months` must be OLDEST FIRST and must end with the report month; the caller resolves it
 * with `trailingMonthRangesInTimeZone` / `trailingMonthRangesKst`, which guarantee both.
 * A month with no rows at all still gets a point, at zero — a gap in the axis would make a
 * quiet month look like a month that was never measured.
 *
 * Rows outside the month window are ignored rather than rejected, so a caller that fetched
 * a slightly wider window (or a store that returned a boundary day twice) cannot corrupt
 * the totals.
 */
export function buildReportSeries(input: {
  months: readonly KstMonthRange[];
  rows: readonly DatedSiteEventAggregate[];
}): ReportSeriesSection {
  const { months, rows } = input;
  if (months.length === 0) throw new RangeError('A report series needs at least one month');
  for (let index = 1; index < months.length; index += 1) {
    if (months[index - 1].startDate >= months[index].startDate) {
      throw new RangeError('Report series months must be strictly ascending');
    }
  }
  const reportMonth = months[months.length - 1];

  const monthPoints: ReportSeriesMonth[] = months.map((range) => ({
    month: range.month,
    ...accumulate(rows, (date) => inRange(date, range)),
  }));

  // One pass per day of the report month, so a bucket's start and end are real days of
  // that month and never the Monday/Sunday that fall outside it.
  const buckets = new Map<string, ReportWeeklyBucket>();
  for (const day of daysOf(reportMonth)) {
    const { isoYear, isoWeek } = isoWeekOf(day);
    const key = `${isoYear}-${String(isoWeek).padStart(2, '0')}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.endDate = day;
      continue;
    }
    buckets.set(key, {
      isoYear,
      isoWeek,
      startDate: day,
      endDate: day,
      calls: 0,
      directions: 0,
      inquiries: 0,
    });
  }
  const weeks = [...buckets.values()].sort((left, right) =>
    left.startDate.localeCompare(right.startDate));
  for (const week of weeks) {
    const totals = accumulate(
      rows,
      (date) => date >= week.startDate && date <= week.endDate,
    );
    week.calls = totals.calls;
    week.directions = totals.directions;
    week.inquiries = totals.inquiries;
  }

  return { months: monthPoints, weeks };
}

/** The report month's own point, i.e. the last element. Present by construction. */
export function seriesLatest(section: ReportSeriesSection): ReportSeriesMonth | null {
  return section.months.length > 0 ? section.months[section.months.length - 1] : null;
}
