/**
 * [RPT$] The seeded performance-report history.
 *
 * `/dashboard/reports` used to render "No performance reports have been created yet" in
 * mock mode, so nobody could see what a customer receives each month. These tests pin the
 * two properties that make the seed worth trusting:
 *
 *  1. every number on the card is the PRODUCT'S arithmetic — rebuilding the report from the
 *     seeded daily aggregates reproduces the stored payload byte for byte;
 *  2. the stored payload survives the strict storage schema, so the demo card cannot show
 *     a shape the real database would reject.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildDemoReportingSeed } from '@/lib/data/mock/reporting-demo';
import { DEMO_CLINIC_ID, SUMMIT_DENTAL_SITE_ID } from '@/lib/data/mock/seed';
import { getMockStore } from '@/lib/data/mock/store';
import { buildMonthlyReportEmail } from '@/lib/reporting/email';
import { buildMonthlyPerformanceReport } from '@/lib/reporting/monthly-report';
import { previousMonthRangesInTimeZone } from '@/lib/reporting/period';
import { monthlyPerformanceReportSchema } from '@/lib/reporting/repository-core';
import { MockMonthlyReportsRepository } from '@/lib/reporting/repository-mock';
import type { SiteEventAggregate } from '@/lib/data/types';
import type { KstMonthRange, MonthlyPerformanceReport } from '@/lib/reporting/types';

const TIME_ZONE = 'America/Denver' as const;
const FIXED_NOW = new Date('2026-09-07T18:00:00.000Z');

function seed() {
  return buildDemoReportingSeed({
    siteId: SUMMIT_DENTAL_SITE_ID,
    clientId: DEMO_CLINIC_ID,
    timeZone: TIME_ZONE,
    now: FIXED_NOW,
  });
}

function aggregatesInRange(rows: readonly SiteEventAggregate[], range: KstMonthRange) {
  return rows
    .filter((row) => row.eventDate >= range.startDate && row.eventDate < range.endExclusiveDate)
    .map(({ eventType, source, count }) => ({ eventType, source, count }));
}

function totalFor(
  rows: readonly SiteEventAggregate[],
  range: KstMonthRange,
  eventType: SiteEventAggregate['eventType'],
): number {
  return aggregatesInRange(rows, range)
    .filter((row) => row.eventType === eventType)
    .reduce((sum, row) => sum + row.count, 0);
}

describe('RPT$ demo reporting seed', () => {
  test('covers the last completed month and the one before it, in the site time zone', () => {
    const built = seed();
    const periods = previousMonthRangesInTimeZone(TIME_ZONE, FIXED_NOW);
    assert.deepEqual(
      built.monthlyReports.map((record) => record.periodMonth),
      [periods.report.month, periods.comparison.month],
    );
    assert.deepEqual(built.monthlyReports.map((record) => record.periodMonth), ['2026-08', '2026-07']);
    for (const record of built.monthlyReports) {
      assert.equal(record.siteId, SUMMIT_DENTAL_SITE_ID);
      assert.equal(record.clientId, DEMO_CLINIC_ID);
      // A delivered row is the whole point: nobody had ever seen one anywhere.
      assert.equal(record.deliveryStatus, 'sent');
      assert.equal(record.lastErrorCode, null);
      assert.ok(record.providerMessageId && record.sentAt);
      assert.equal(record.report.period.month, record.periodMonth);
      assert.equal(monthlyPerformanceReportSchema.safeParse(record.report).success, true);
    }
  });

  test('every stored number is what the product’s own builder computes', () => {
    const built = seed();
    const [recent, older] = built.monthlyReports;
    const aiAnswers = recent.report.schemaVersion === 2 ? recent.report.aiAnswers : undefined;
    assert.ok(aiAnswers, 'the newer report carries the citation section');

    const rebuiltRecent: MonthlyPerformanceReport = buildMonthlyPerformanceReport({
      siteId: SUMMIT_DENTAL_SITE_ID,
      period: recent.report.period,
      comparisonPeriod: recent.report.comparisonPeriod,
      current: aggregatesInRange(built.siteEvents, recent.report.period),
      previous: aggregatesInRange(built.siteEvents, recent.report.comparisonPeriod),
      locale: 'en-US',
      aiAnswers,
    });
    assert.deepEqual(rebuiltRecent, recent.report);

    const rebuiltOlder: MonthlyPerformanceReport = buildMonthlyPerformanceReport({
      siteId: SUMMIT_DENTAL_SITE_ID,
      period: older.report.period,
      comparisonPeriod: older.report.comparisonPeriod,
      current: aggregatesInRange(built.siteEvents, older.report.period),
      previous: aggregatesInRange(built.siteEvents, older.report.comparisonPeriod),
      locale: 'en-US',
    });
    assert.deepEqual(rebuiltOlder, older.report);
    // Absent, not present-and-undefined: a period without probes renders the pre-CITE$ report.
    assert.equal('aiAnswers' in older.report, false);
  });

  test('the daily aggregates sum to the headline metrics', () => {
    const built = seed();
    const [recent] = built.monthlyReports;
    const period = recent.report.period;
    assert.equal(totalFor(built.siteEvents, period, 'pageview'), recent.report.metrics.pageviews.current);
    assert.equal(totalFor(built.siteEvents, period, 'tel'), recent.report.metrics.phoneClicks.current);
    assert.equal(
      totalFor(built.siteEvents, period, 'directions'),
      recent.report.metrics.directionsClicks.current,
    );
    // Daily rows, not one lump: the demo history must look like what the beacon writes.
    const dates = new Set(
      built.siteEvents
        .filter((row) => row.eventDate.startsWith(period.month))
        .map((row) => row.eventDate),
    );
    assert.ok(dates.size >= 28, `expected a full month of daily rows, saw ${dates.size}`);
  });

  test('an AI referral row and a four-engine citation section are both present', () => {
    const built = seed();
    const [recent] = built.monthlyReports;
    const ai = recent.report.sources.find((source) => source.source === 'ai');
    assert.ok(ai, 'the en-US report shows an AI assistants row');
    assert.equal(ai.label, 'AI assistants');
    assert.ok(ai.count > 0 && ai.previousCount > 0);
    assert.ok((ai.changePercent ?? 0) > 0);
    // A US site never sees Naver: the row exists at zero and the UI drops it.
    assert.equal(recent.report.sources.find((source) => source.source === 'naver')?.count, 0);

    const section = recent.report.schemaVersion === 2 ? recent.report.aiAnswers : undefined;
    assert.ok(section);
    assert.equal(section.probeBasis, 'api');
    assert.deepEqual(
      section.engines.map((engine) => [engine.engine, engine.status]),
      [['openai', 'ok'], ['anthropic', 'ok'], ['gemini', 'not_configured'], ['perplexity', 'not_configured']],
    );
    // A missing key must never be reported as a measured zero.
    for (const engine of section.engines) {
      if (engine.status !== 'not_configured') continue;
      assert.equal(engine.named, 0);
      assert.equal(engine.linked, 0);
    }
    assert.equal(section.questions.length, 3);
    assert.match(section.footnote, /Google Search's AI answers are not included/u);
    assert.equal(built.citation.probes.length, 12);
    assert.equal(built.citation.probes.filter((probe) => probe.status === 'ok').length, 6);
  });

  test('the store hands the dashboard two delivered reports for the demo clinic', async () => {
    const store = getMockStore();
    const records = await new MockMonthlyReportsRepository(store).listByClient({
      clientId: DEMO_CLINIC_ID,
    });
    assert.equal(records.length, 2);
    assert.deepEqual(records.map((record) => record.deliveryStatus), ['sent', 'sent']);
    assert.ok(records[0].periodMonth > records[1].periodMonth, 'newest month first');

    // The seeded aggregates are keyed exactly the way MockSiteEventsRepo keys its writes,
    // or a later beacon would create a duplicate row instead of incrementing this one.
    for (const [key, row] of store.siteEvents) {
      assert.equal(key, [row.siteId, row.eventDate, row.eventType, row.source].join('|'));
    }
    assert.ok(
      [...store.siteEvents.values()].some((row) => row.siteId === SUMMIT_DENTAL_SITE_ID),
      'the demo clinic has its own aggregate history',
    );
  });

  test('the seeded report renders the email a customer would actually receive', () => {
    const [recent] = seed().monthlyReports;
    const message = buildMonthlyReportEmail({
      siteName: 'Summit Dental Studio',
      dashboardUrl: 'https://anakslabs.com/dashboard/reports',
      report: recent.report,
    });
    assert.match(message.subject, /Summit Dental Studio — August 2026 performance report/u);
    assert.match(message.html, /Who got named in AI answers/u);
    assert.match(message.html, /AI assistants/u);
    assert.match(message.text, /Gemini: not connected/u);
    assert.match(message.text, /ChatGPT: 3 asked, 2 named, 1 linked/u);
  });
});
