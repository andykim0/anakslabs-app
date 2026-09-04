/**
 * [CITE$] Month semantics — the one thing that silently produces an empty section if it
 * is wrong.
 *
 *   The monthly report for month M is built on the 1st of M+1, over the PREVIOUS-month
 *   period in the site's own time zone, and the row is insert-once. So probes taken
 *   during M are stored under run_month = M, and the report builder must read the probes
 *   for ITS OWN period — M — not for the month the cron happens to be running in.
 *
 * The proof below is the packet's: a probe stored on M-02 appears in the report built on
 * (M+1)-01. A builder that reached for "the current month" would find nothing and ship a
 * report with no section at all.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DEMO_PREMIUM_ID, HWARODAM_SITE_ID } from '@/lib/data/mock/seed';
import { getMockStore, resetMockStore } from '@/lib/data/mock/store';
import { MockSiteEventsRepo } from '@/lib/data/mock/site-events';
import { MockMonthlyReportsRepository } from '@/lib/reporting/repository-mock';
import {
  runMonthlyReportsCore,
  type MonthlyReportRunnerDependencies,
} from '@/lib/reporting/runner-core';
import type { MonthlyPerformanceReportV2 } from '@/lib/reporting/types';
import { MockCitationCheckRepository } from '../repository-mock';
import { buildCitationReportSection } from '../report-section';
import {
  citationPeriodToRunMonth,
  citationRunMonthToPeriod,
  normalizeCitationRunMonth,
} from '../repository-core';

/** The report for July 2026 is built on 1 August 2026. */
const REPORT_RUN_AT = new Date('2026-08-01T03:00:00.000Z');
const PROBE_MONTH = '2026-07-01';
/** Probes taken on the 2nd of July — the first days of the month do the work. */
const PROBE_TAKEN_AT = '2026-07-02T23:10:00.000Z';

function setup() {
  resetMockStore();
  const store = getMockStore();
  const site = store.sites.get(HWARODAM_SITE_ID)!;
  const client = store.clients.get(DEMO_PREMIUM_ID)!;
  const events = new MockSiteEventsRepo();
  const reports = new MockMonthlyReportsRepository(store, () => REPORT_RUN_AT.toISOString());
  const citations = new MockCitationCheckRepository(store, () => PROBE_TAKEN_AT);

  const dependencies: MonthlyReportRunnerDependencies = {
    listSites: async () => [site],
    getClient: async () => client,
    isSubscriptionActive: async () => true,
    listSiteEvents: (query) => events.listBySiteRange(query),
    reports,
    sendEmail: async () => ({ ok: true as const, providerId: 'resend-1' }),
    dashboardUrl: 'https://anakslabs.com/dashboard/reports',
    loadAiAnswers: async ({ siteId, periodMonth }) => {
      const runMonth = citationPeriodToRunMonth(periodMonth);
      const [questions, probes] = await Promise.all([
        citations.listQuestions(siteId),
        citations.listProbes({ siteId, runMonth }),
      ]);
      return buildCitationReportSection({ questions, probes });
    },
  };
  return { dependencies, citations, reports, events, site };
}

describe('[CITE$] previous-month report semantics', () => {
  test('a probe stored on M-02 appears in the report built on (M+1)-01', async () => {
    const ctx = setup();
    const [stored] = await ctx.citations.addQuestions({
      siteId: HWARODAM_SITE_ID,
      questions: [{ question: 'Which clinic near here takes new patients?', source: 'generated' }],
    });
    await ctx.citations.insertProbe({
      siteId: HWARODAM_SITE_ID,
      questionId: stored.id,
      engine: 'anthropic',
      runMonth: PROBE_MONTH,
      status: 'ok',
      named: true,
      linked: true,
      answerExcerpt: 'Named in the answer.',
      sources: [{ url: 'https://example.test/x', host: 'example.test' }],
      model: 'claude-opus-4-8',
    });

    const summary = await runMonthlyReportsCore(ctx.dependencies, REPORT_RUN_AT);
    assert.equal(summary.createdReports, 1);
    assert.equal(summary.periodMonth, '2026-07', 'the report covers the previous month');

    const [record] = await ctx.reports.listByClient({ clientId: DEMO_PREMIUM_ID });
    assert.equal(record.periodMonth, '2026-07');
    const report = record.report as MonthlyPerformanceReportV2;
    assert.ok(report.aiAnswers, 'the section must be present, not silently empty');
    assert.deepEqual(report.aiAnswers.engines, [{
      engine: 'anthropic',
      asked: 1,
      named: 1,
      linked: 1,
      status: 'ok',
      measuredOn: '2026-07-02',
    }]);
    assert.match(report.aiAnswers.footnote, /2026-07-02/u);
  });

  test('probes filed under the RUNNING month are not pulled into the previous-month report', async () => {
    const ctx = setup();
    const [stored] = await ctx.citations.addQuestions({
      siteId: HWARODAM_SITE_ID,
      questions: [{ question: 'Which clinic near here takes new patients?', source: 'generated' }],
    });
    // August probes exist, but the report being built on 1 August covers July.
    await ctx.citations.insertProbe({
      siteId: HWARODAM_SITE_ID,
      questionId: stored.id,
      engine: 'anthropic',
      runMonth: '2026-08-01',
      status: 'ok',
      named: true,
      linked: false,
      answerExcerpt: 'August answer.',
      sources: [],
      model: 'claude-opus-4-8',
    });

    await runMonthlyReportsCore(ctx.dependencies, REPORT_RUN_AT);
    const [record] = await ctx.reports.listByClient({ clientId: DEMO_PREMIUM_ID });
    const report = record.report as MonthlyPerformanceReportV2;
    assert.equal(record.periodMonth, '2026-07');
    assert.equal(report.period.month, '2026-07');
    assert.equal(report.aiAnswers, undefined, 'reading "the current month" would be the bug');
  });

  test('with no probes at all the report is created without the key', async () => {
    const ctx = setup();
    const summary = await runMonthlyReportsCore(ctx.dependencies, REPORT_RUN_AT);
    assert.equal(summary.createdReports, 1);
    const [record] = await ctx.reports.listByClient({ clientId: DEMO_PREMIUM_ID });
    assert.ok(!('aiAnswers' in record.report));
  });

  test('a citation lookup failure never costs the customer their report', async () => {
    const ctx = setup();
    ctx.dependencies.loadAiAnswers = async () => { throw new Error('citation store down'); };
    const summary = await runMonthlyReportsCore(ctx.dependencies, REPORT_RUN_AT);
    assert.equal(summary.createdReports, 1);
    assert.equal(summary.sentReports, 1);
    const [record] = await ctx.reports.listByClient({ clientId: DEMO_PREMIUM_ID });
    assert.ok(!('aiAnswers' in record.report));
  });

  test('the period/run-month conversions are exact inverses', () => {
    assert.equal(citationPeriodToRunMonth('2026-07'), '2026-07-01');
    assert.equal(citationRunMonthToPeriod('2026-07-01'), '2026-07');
    assert.equal(citationRunMonthToPeriod(citationPeriodToRunMonth('2026-12')), '2026-12');
    assert.throws(() => citationPeriodToRunMonth('2026-13'), /YYYY-MM/u);
    assert.throws(() => citationPeriodToRunMonth('2026-07-01'), /YYYY-MM/u);
    // A mid-month date is never a valid run month: the column is a month start.
    assert.throws(() => normalizeCitationRunMonth('2026-07-15'), /YYYY-MM-01/u);
    assert.throws(() => normalizeCitationRunMonth('2026-00-01'), /YYYY-MM-01/u);
  });
});
