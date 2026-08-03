import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { buildMonthlyReportEmail } from '../email';
import {
  buildMonthlyPerformanceReport,
  deriveMonthlyInsight,
  reportChangePercent,
} from '../monthly-report';
import { previousMonthRangesKst } from '../period';
import { monthlyPerformanceReportSchema } from '../repository-core';
import type {
  MonthlyPerformanceReportV1,
  MonthlyReportMetrics,
  ReportSourceComposition,
  SiteEventAggregate,
} from '../types';

describe('RPT2 monthly report core', () => {
  test('resolves completed KST month ranges across a year boundary', () => {
    const periods = previousMonthRangesKst(new Date('2026-01-15T03:00:00.000Z'));
    assert.deepEqual(periods.report, {
      month: '2025-12',
      startDate: '2025-12-01',
      endExclusiveDate: '2026-01-01',
      startIso: '2025-11-30T15:00:00.000Z',
      endExclusiveIso: '2025-12-31T15:00:00.000Z',
    });
    assert.deepEqual(periods.comparison, {
      month: '2025-11',
      startDate: '2025-11-01',
      endExclusiveDate: '2025-12-01',
      startIso: '2025-10-31T15:00:00.000Z',
      endExclusiveIso: '2025-11-30T15:00:00.000Z',
    });
  });

  test('uses Korea local month even around the UTC boundary', () => {
    assert.equal(
      previousMonthRangesKst(new Date('2026-07-31T15:00:00.000Z')).report.month,
      '2026-07',
    );
    assert.equal(
      previousMonthRangesKst(new Date('2026-07-31T14:59:59.999Z')).report.month,
      '2026-06',
    );
  });

  test('groups consultation actions while preserving raw connector metrics and pageview sources', () => {
    const periods = previousMonthRangesKst(new Date('2026-07-17T00:00:00.000Z'));
    const current: SiteEventAggregate[] = [
      { eventType: 'pageview', source: 'naver', count: 61 },
      { eventType: 'pageview', source: 'google', count: 20 },
      { eventType: 'pageview', source: 'direct', count: 20 },
      { eventType: 'tel', source: 'naver', count: 9 },
      { eventType: 'reserve', source: 'naver', count: 13 },
      { eventType: 'directions', source: 'google', count: 4 },
      { eventType: 'form', source: 'direct', count: 2 },
      { eventType: 'chat', source: 'direct', count: 3 },
      { eventType: 'instagram', source: 'instagram', count: 5 },
    ];
    const previous: SiteEventAggregate[] = [
      { eventType: 'pageview', source: 'naver', count: 50 },
      { eventType: 'pageview', source: 'google', count: 20 },
      { eventType: 'pageview', source: 'direct', count: 10 },
      { eventType: 'tel', source: 'naver', count: 3 },
      { eventType: 'reserve', source: 'naver', count: 10 },
      { eventType: 'chat', source: 'direct', count: 1 },
    ];
    const report = buildMonthlyPerformanceReport({
      siteId: 'site-1',
      period: periods.report,
      comparisonPeriod: periods.comparison,
      current,
      previous,
    });

    assert.equal(report.metrics.pageviews.current, 101);
    assert.equal(report.metrics.phoneClicks.current, 9);
    assert.equal(report.metrics.reservationClicks.current, 13);
    assert.equal(report.metrics.directionsClicks.current, 4);
    assert.equal(report.metrics.formSubmissions.current, 2);
    assert.equal(report.schemaVersion, 2);
    assert.equal(report.metrics.chatClicks.current, 3);
    assert.equal(report.metrics.instagramClicks.current, 5);
    assert.deepEqual(report.metrics.consultationActions, {
      current: 5,
      previous: 1,
      changePercent: 400,
    });
    assert.equal(report.hasComparisonData, true);
    assert.equal(report.sources.reduce((sum, source) => sum + source.sharePercent, 0), 100);
    assert.equal(report.sources.find((source) => source.source === 'naver')?.sharePercent, 60);
    assert.equal(report.insight, '직접·사이트 내부 유입이 전월보다 100% 늘었어요.');
  });

  test('reads legacy v1 reports without inventing connector metrics', () => {
    const periods = previousMonthRangesKst(new Date('2026-07-17T00:00:00.000Z'));
    const report: MonthlyPerformanceReportV1 = {
      schemaVersion: 1,
      siteId: 'legacy-site',
      period: periods.report,
      comparisonPeriod: periods.comparison,
      metrics: {
        pageviews: { current: 4, previous: 0, changePercent: null },
        phoneClicks: { current: 1, previous: 0, changePercent: null },
        reservationClicks: { current: 0, previous: 0, changePercent: null },
        directionsClicks: { current: 0, previous: 0, changePercent: null },
        formSubmissions: { current: 0, previous: 0, changePercent: null },
      },
      sources: [],
      hasCurrentData: true,
      hasComparisonData: false,
      insight: '이번 달 방문(페이지뷰) 4건이 처음 집계됐어요.',
    };
    assert.equal(monthlyPerformanceReportSchema.safeParse(report).success, true);
    const email = buildMonthlyReportEmail({
      siteName: '기존 사이트',
      dashboardUrl: 'https://anakslabs.com/dashboard/reports/legacy-site',
      report,
    });
    assert.match(email.text, /Bookings: 0/);
    assert.doesNotMatch(email.text, /Chat clicks/);
  });

  test('never invents a percentage from a zero baseline and rejects invalid aggregates', () => {
    assert.equal(reportChangePercent(8, 0), null);
    const periods = previousMonthRangesKst();
    assert.throws(
      () => buildMonthlyPerformanceReport({
        siteId: 'site-1',
        period: periods.report,
        comparisonPeriod: periods.comparison,
        current: [{ eventType: 'pageview', source: 'direct', count: -1 }],
        previous: [],
      }),
      /non-negative safe integers/,
    );
  });

  test('deterministic insight tie-break is stable and data-only', () => {
    const metrics: MonthlyReportMetrics = {
      pageviews: { current: 20, previous: 20, changePercent: 0 },
      phoneClicks: { current: 4, previous: 2, changePercent: 100 },
      reservationClicks: { current: 6, previous: 3, changePercent: 100 },
      directionsClicks: { current: 0, previous: 0, changePercent: null },
      formSubmissions: { current: 0, previous: 0, changePercent: null },
    };
    const sources: ReportSourceComposition[] = [
      { source: 'naver', label: '네이버', count: 10, previousCount: 10, sharePercent: 50, changePercent: 0 },
      { source: 'google', label: '구글', count: 10, previousCount: 10, sharePercent: 50, changePercent: 0 },
    ];
    assert.equal(deriveMonthlyInsight(metrics, sources), '예약 클릭이 전월보다 100% 늘었어요.');
  });

  test('email is escaped, identifies pageviews honestly, and contains no recipient field', () => {
    const periods = previousMonthRangesKst(new Date('2026-07-17T00:00:00.000Z'));
    const report = buildMonthlyPerformanceReport({
      siteId: 'site-1',
      period: periods.report,
      comparisonPeriod: periods.comparison,
      current: [
        { eventType: 'pageview', source: 'naver', count: 3 },
        { eventType: 'chat', source: 'direct', count: 2 },
        { eventType: 'form', source: 'direct', count: 1 },
        { eventType: 'instagram', source: 'instagram', count: 4 },
      ],
      previous: [],
    });
    const email = buildMonthlyReportEmail({
      siteName: '<온화 & 다이닝>',
      dashboardUrl: 'https://anakslabs.com/dashboard/reports/site-1',
      report,
    });
    assert.match(email.subject, /June 2026/);
    assert.match(email.html, /&lt;온화 &amp; 다이닝&gt;/);
    assert.doesNotMatch(email.html, /<온화/);
    assert.match(email.html, /page views, not unique visitors/);
    assert.match(email.html, /first report/iu);
    assert.match(email.text, /Page views: 3 · Newly measured/);
    assert.match(email.text, /Inquiry actions: 3/);
    assert.match(email.text, /Chat clicks 2 · Form submissions 1/);
    assert.match(email.text, /Instagram clicks 4/);
    assert.doesNotMatch(email.text, /consultation completed/iu);
    assert.equal('to' in email, false);
  });

  test('dashboard uses customer-facing connector labels and never claims completion', () => {
    const source = readFileSync(
      new URL('../../../app/(dashboard)/dashboard/reports/page.tsx', import.meta.url),
      'utf8',
    );
    for (const copy of [
      'Inquiry actions',
      'Chat clicks',
      'Form submissions',
      'Booking clicks',
      'Instagram clicks',
    ]) {
      assert.match(source, new RegExp(copy));
    }
    assert.doesNotMatch(source, /consultation completed/iu);
  });
});
