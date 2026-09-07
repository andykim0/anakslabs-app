/**
 * [SERIES$] The trailing KPI series and the weekly buckets.
 *
 * The two things worth pinning here are the two that are easy to get quietly wrong: which
 * calendar decides where a month starts, and which week a day at the edge of a year
 * belongs to. Both fail silently — the chart still draws, it just draws the wrong month.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  REPORT_SERIES_MONTHS,
  previousMonthRangesInTimeZone,
  previousMonthRangesKst,
  trailingMonthRangesInTimeZone,
  trailingMonthRangesKst,
} from '../period';
import { buildReportSeries, isoWeekOf } from '../series';
import { buildMonthlyPerformanceReport } from '../monthly-report';
import { monthlyPerformanceReportSchema } from '../repository-core';
import type { DatedSiteEventAggregate } from '../series';
import type { MonthlyPerformanceReportV2 } from '../types';

const DENVER = 'America/Denver' as const;

function row(eventDate: string, eventType: string, count: number): DatedSiteEventAggregate {
  return { eventDate, eventType, count };
}

describe('[SERIES$] month windows are resolved in the site’s own calendar', () => {
  test('the newest trailing month is exactly the month the runner reports on', () => {
    // 18:00 UTC on 1 September is still 31 August in Denver, so the two resolvers must
    // disagree with UTC in the same direction or the series axis would be a month ahead
    // of the report it decorates.
    const now = new Date('2026-09-01T18:00:00.000Z');
    const legacy = previousMonthRangesInTimeZone(DENVER, now);
    const trailing = trailingMonthRangesInTimeZone(DENVER, now);
    assert.equal(trailing.length, REPORT_SERIES_MONTHS);
    assert.equal(trailing[trailing.length - 1].month, legacy.report.month);
    assert.equal(trailing[trailing.length - 2].month, legacy.comparison.month);
    assert.deepEqual(trailing.map((range) => range.month), [
      '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08',
    ]);
  });

  test('an instant that is next month in UTC but this month in Denver picks the local one', () => {
    // 2026-08-01T02:00Z is 31 July, 20:00 in Denver. The last COMPLETED Denver month is
    // therefore June, not July.
    const now = new Date('2026-08-01T02:00:00.000Z');
    const trailing = trailingMonthRangesInTimeZone(DENVER, now);
    assert.equal(trailing[trailing.length - 1].month, '2026-06');
    assert.equal(
      trailing[trailing.length - 1].month,
      previousMonthRangesInTimeZone(DENVER, now).report.month,
    );
  });

  test('the KST walk agrees with the pair resolver it is built beside', () => {
    const now = new Date('2026-08-01T00:15:00.000Z');
    const legacy = previousMonthRangesKst(now);
    const trailing = trailingMonthRangesKst(now);
    assert.equal(trailing[trailing.length - 1].month, legacy.report.month);
    assert.deepEqual(trailing[trailing.length - 1], legacy.report);
    assert.deepEqual(trailing[trailing.length - 2], legacy.comparison);
  });

  test('a month spanning a DST change keeps 24-hour-aligned local boundaries', () => {
    // Denver moves to MDT on 8 March 2026. The March range must still start and end at
    // local midnight, which means the two UTC offsets differ by an hour.
    const march = trailingMonthRangesInTimeZone(DENVER, new Date('2026-05-02T18:00:00.000Z'), 3);
    const range = march.find((month) => month.month === '2026-03');
    assert.ok(range);
    assert.equal(range.startIso, '2026-03-01T07:00:00.000Z');
    assert.equal(range.endExclusiveIso, '2026-04-01T06:00:00.000Z');
  });

  test('a count outside the daily store’s retention is refused rather than silently zeroed', () => {
    assert.throws(() => trailingMonthRangesKst(new Date('2026-08-01T00:00:00.000Z'), 25));
    assert.throws(() => trailingMonthRangesInTimeZone(DENVER, new Date(), 0));
  });
});

describe('[SERIES$] ISO week numbering', () => {
  test('the Thursday rule places a new year’s first days in the old year’s last week', () => {
    // 1 January 2027 is a Friday, so its week's Thursday is 31 December 2026.
    assert.deepEqual(isoWeekOf('2027-01-01'), { isoYear: 2026, isoWeek: 53 });
    assert.deepEqual(isoWeekOf('2027-01-03'), { isoYear: 2026, isoWeek: 53 });
    assert.deepEqual(isoWeekOf('2027-01-04'), { isoYear: 2027, isoWeek: 1 });
    // 1 January 2026 IS a Thursday, so it opens week 1 of its own year.
    assert.deepEqual(isoWeekOf('2026-01-01'), { isoYear: 2026, isoWeek: 1 });
    assert.deepEqual(isoWeekOf('2026-12-31'), { isoYear: 2026, isoWeek: 53 });
  });

  test('a malformed date is rejected, never coerced', () => {
    assert.throws(() => isoWeekOf('2026-8-1'));
    assert.throws(() => isoWeekOf(''));
  });
});

describe('[SERIES$] buildReportSeries', () => {
  const months = trailingMonthRangesInTimeZone(DENVER, new Date('2026-09-07T18:00:00.000Z'));

  test('each month sums only its own days, and a quiet month is a zero point not a gap', () => {
    const series = buildReportSeries({
      months,
      rows: [
        row('2026-06-15', 'pageview', 40),
        row('2026-08-02', 'pageview', 10),
        row('2026-08-20', 'pageview', 7),
        row('2026-08-20', 'tel', 3),
        // form + chat are one KPI, matching `consultationActions` exactly.
        row('2026-08-21', 'form', 2),
        row('2026-08-21', 'chat', 5),
        row('2026-08-22', 'directions', 4),
        // Outside the window entirely: ignored, not an error, so a slightly wider fetch
        // than the series needs can never corrupt a total.
        row('2026-09-03', 'pageview', 999),
        row('2026-01-04', 'pageview', 999),
      ],
    });
    assert.deepEqual(series.months.map((month) => month.month), [
      '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08',
    ]);
    assert.deepEqual(series.months[series.months.length - 1], {
      month: '2026-08',
      pageviews: 17,
      calls: 3,
      directions: 4,
      inquiries: 7,
    });
    assert.deepEqual(series.months[3], {
      month: '2026-06', pageviews: 40, calls: 0, directions: 0, inquiries: 0,
    });
    assert.deepEqual(series.months[0], {
      month: '2026-03', pageviews: 0, calls: 0, directions: 0, inquiries: 0,
    });
  });

  test('weekly buckets are clamped to the report month, first and last included', () => {
    const series = buildReportSeries({ months, rows: [] });
    // August 2026 opens on a Saturday, so its first ISO week contributes two days and its
    // last contributes one. Six buckets is the maximum a calendar month can produce.
    assert.equal(series.weeks.length, 6);
    assert.deepEqual(
      series.weeks.map((week) => [week.startDate, week.endDate, week.isoWeek]),
      [
        ['2026-08-01', '2026-08-02', 31],
        ['2026-08-03', '2026-08-09', 32],
        ['2026-08-10', '2026-08-16', 33],
        ['2026-08-17', '2026-08-23', 34],
        ['2026-08-24', '2026-08-30', 35],
        ['2026-08-31', '2026-08-31', 36],
      ],
    );
    // Every day of the month lands in exactly one bucket, and no bucket reaches outside it.
    const covered = series.weeks.reduce((sum, week) => (
      sum + (Date.parse(`${week.endDate}T00:00:00Z`) - Date.parse(`${week.startDate}T00:00:00Z`))
        / 86_400_000 + 1
    ), 0);
    assert.equal(covered, 31);
  });

  test('a January month opens on the previous ISO year’s week 53', () => {
    const january = trailingMonthRangesInTimeZone(DENVER, new Date('2027-02-05T18:00:00.000Z'), 1);
    assert.equal(january[0].month, '2027-01');
    const series = buildReportSeries({ months: january, rows: [row('2027-01-02', 'tel', 4)] });
    assert.deepEqual(
      { isoYear: series.weeks[0].isoYear, isoWeek: series.weeks[0].isoWeek },
      { isoYear: 2026, isoWeek: 53 },
    );
    // Week 53 of 2026 and week 1 of 2027 must not merge into one bar.
    assert.equal(series.weeks[0].calls, 4);
    assert.equal(series.weeks[1].isoYear, 2027);
    assert.equal(series.weeks[1].isoWeek, 1);
    assert.equal(series.weeks[1].startDate, '2027-01-04');
  });

  test('weekly counts are cut on the same day grain as the month totals', () => {
    const series = buildReportSeries({
      months,
      rows: [
        row('2026-08-02', 'tel', 2),
        row('2026-08-03', 'tel', 5),
        row('2026-08-31', 'directions', 9),
        row('2026-08-04', 'form', 1),
        row('2026-08-04', 'chat', 1),
      ],
    });
    assert.equal(series.weeks[0].calls, 2);
    assert.equal(series.weeks[1].calls, 5);
    assert.equal(series.weeks[1].inquiries, 2);
    assert.equal(series.weeks[5].directions, 9);
    const weeklyCalls = series.weeks.reduce((sum, week) => sum + week.calls, 0);
    assert.equal(weeklyCalls, series.months[series.months.length - 1].calls);
  });

  test('an out-of-order or empty month list is refused', () => {
    assert.throws(() => buildReportSeries({ months: [], rows: [] }));
    assert.throws(() => buildReportSeries({ months: [months[3], months[1]], rows: [] }));
  });
});

describe('[SERIES$] the strict stored schema widens additively', () => {
  function baseReport(withSeries: boolean): MonthlyPerformanceReportV2 {
    const months = trailingMonthRangesInTimeZone(DENVER, new Date('2026-09-07T18:00:00.000Z'));
    return buildMonthlyPerformanceReport({
      siteId: 'site-1',
      period: months[months.length - 1],
      comparisonPeriod: months[months.length - 2],
      current: [{ eventType: 'pageview', source: 'google', count: 4 }],
      previous: [],
      locale: 'en-US',
      ...(withSeries
        ? { series: buildReportSeries({ months, rows: [row('2026-08-04', 'tel', 3)] }) }
        : {}),
    }) as MonthlyPerformanceReportV2;
  }

  test('a report stored BEFORE the series existed still parses, key absent', () => {
    const report = baseReport(false);
    assert.equal('series' in report, false, 'the key must be absent, not present-and-undefined');
    assert.equal(monthlyPerformanceReportSchema.safeParse(report).success, true);
  });

  test('a report carrying the series round-trips through JSON and the strict schema', () => {
    const report = baseReport(true);
    const parsed = monthlyPerformanceReportSchema.parse(JSON.parse(JSON.stringify(report)));
    assert.equal(parsed.schemaVersion, 2, 'the series is additive; the version stays 2');
    assert.deepEqual((parsed as MonthlyPerformanceReportV2).series, report.series);
  });

  test('the section stays strict: a half-built series is not storable', () => {
    const report = baseReport(true) as unknown as Record<string, unknown>;
    const series = report.series as { months: unknown[]; weeks: unknown[] };
    assert.equal(
      monthlyPerformanceReportSchema.safeParse({
        ...report,
        series: { months: series.months },
      }).success,
      false,
      'weeks is required within the section',
    );
    assert.equal(
      monthlyPerformanceReportSchema.safeParse({
        ...report,
        series: { ...series, unexpected: 1 },
      }).success,
      false,
    );
    assert.equal(
      monthlyPerformanceReportSchema.safeParse({
        ...report,
        series: { ...series, months: [{ month: '2026-08', pageviews: -1, calls: 0, directions: 0, inquiries: 0 }] },
      }).success,
      false,
      'a negative count is not a measurement',
    );
  });

  test('a v1 payload cannot carry a series at all', () => {
    const v2 = baseReport(true) as unknown as Record<string, unknown>;
    const v1 = {
      ...v2,
      schemaVersion: 1,
      metrics: {
        pageviews: { current: 4, previous: 0, changePercent: null },
        phoneClicks: { current: 0, previous: 0, changePercent: null },
        reservationClicks: { current: 0, previous: 0, changePercent: null },
        directionsClicks: { current: 0, previous: 0, changePercent: null },
        formSubmissions: { current: 0, previous: 0, changePercent: null },
      },
    };
    assert.equal(monthlyPerformanceReportSchema.safeParse(v1).success, false);
    const withoutSeries = Object.fromEntries(
      Object.entries(v1).filter(([key]) => key !== 'series'),
    );
    assert.equal(monthlyPerformanceReportSchema.safeParse(withoutSeries).success, true);
  });
});
