import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DEMO_PREMIUM_ID, HWARODAM_SITE_ID } from '@/lib/data/mock/seed';
import { getMockStore, resetMockStore } from '@/lib/data/mock/store';
import { MockSiteEventsRepo } from '@/lib/data/mock/site-events';
import { MockMonthlyReportsRepository } from '../repository-mock';
import {
  REPORT_DELIVERY_CONCURRENCY,
  REPORT_DELIVERY_STALE_MS,
  reportDeliveryFailure,
  retryMonthlyReportCore,
  runMonthlyReportsCore,
  type MonthlyReportRunnerDependencies,
} from '../runner-core';
import { REPORT_EMAIL_TIMEOUT_MS } from '../resend-core';
import {
  REPORT_EMAIL_MAX_STARTS_PER_SECOND,
  REPORT_EMAIL_START_INTERVAL_MS,
  type ReportEmailRateGateTiming,
} from '../start-rate-gate';

const NOW = new Date('2026-07-17T03:00:00.000Z');

function setup(input?: {
  active?: boolean;
  send?: MonthlyReportRunnerDependencies['sendEmail'];
}) {
  resetMockStore();
  const store = getMockStore();
  const site = store.sites.get(HWARODAM_SITE_ID)!;
  const client = store.clients.get(DEMO_PREMIUM_ID)!;
  const events = new MockSiteEventsRepo();
  const reports = new MockMonthlyReportsRepository(store, () => NOW.toISOString());
  let sends = 0;
  const send = input?.send ?? (async () => {
    sends += 1;
    return { ok: true as const, providerId: 'resend-1' };
  });
  const dependencies: MonthlyReportRunnerDependencies = {
    listSites: async () => [site],
    getClient: async () => client,
    isSubscriptionActive: async () => input?.active ?? true,
    listSiteEvents: (query) => events.listBySiteRange(query),
    reports,
    sendEmail: async (request) => {
      if (input?.send) sends += 1;
      return send(request);
    },
    dashboardUrl: 'https://anakslabs.com/dashboard/reports',
  };
  return { dependencies, events, reports, site, client, sends: () => sends };
}

describe('RPT2 monthly report runner', () => {
  test('creates, sends, and persists one report per site/month', async () => {
    const ctx = setup();
    await ctx.events.increment({
      siteId: HWARODAM_SITE_ID,
      eventType: 'pageview',
      source: 'naver',
      eventDate: '2026-06-12',
    });
    await ctx.events.increment({
      siteId: HWARODAM_SITE_ID,
      eventType: 'tel',
      source: 'naver',
      eventDate: '2026-06-12',
    });

    const first = await runMonthlyReportsCore(ctx.dependencies, NOW);
    const second = await runMonthlyReportsCore(ctx.dependencies, NOW);
    assert.deepEqual(
      {
        period: first.periodMonth,
        eligible: first.eligibleSites,
        created: first.createdReports,
        sent: first.sentReports,
      },
      { period: '2026-06', eligible: 1, created: 1, sent: 1 },
    );
    assert.equal(second.createdReports, 0);
    assert.equal(second.sentReports, 0);
    assert.equal(ctx.sends(), 1);
    const [record] = await ctx.reports.listByClient({ clientId: DEMO_PREMIUM_ID });
    assert.equal(record.deliveryStatus, 'sent');
    assert.equal(record.report.metrics.pageviews.current, 1);
    assert.equal(record.report.metrics.phoneClicks.current, 1);
  });

  test('inactive authoritative subscription generates no report or email', async () => {
    const ctx = setup({ active: false });
    const result = await runMonthlyReportsCore(ctx.dependencies, NOW);
    assert.equal(result.eligibleSites, 0);
    assert.equal(result.skippedSites, 1);
    assert.equal(ctx.sends(), 0);
    assert.deepEqual(
      await ctx.reports.listByClient({ clientId: DEMO_PREMIUM_ID }),
      [],
    );
  });

  test('known delivery failure keeps the report readable and allows explicit retry only', async () => {
    const ctx = setup({
      send: async () => ({
        ok: false,
        code: 'not_configured',
        retryable: true,
        message: 'not configured',
      }),
    });
    const first = await runMonthlyReportsCore(ctx.dependencies, NOW);
    assert.equal(first.createdReports, 1);
    assert.equal(first.failedDeliveries, 1);
    assert.equal((await ctx.reports.listByClient({ clientId: DEMO_PREMIUM_ID }))[0].deliveryStatus, 'failed');

    await runMonthlyReportsCore(ctx.dependencies, NOW);
    assert.equal(ctx.sends(), 1, 'daily cron must not retry failed email forever');

    const [report] = await ctx.reports.listByClient({ clientId: DEMO_PREMIUM_ID });
    const retryDependencies: MonthlyReportRunnerDependencies = {
      ...ctx.dependencies,
      sendEmail: async () => ({ ok: true, providerId: 'resend-retry' }),
    };
    const retry = await retryMonthlyReportCore({
      report,
      site: ctx.site,
      client: ctx.client,
      subscriptionActive: true,
      dependencies: retryDependencies,
    });
    assert.equal(retry, 'sent');
    assert.equal((await ctx.reports.getByIdForService(report.id))?.deliveryAttempts, 2);
  });

  test('ambiguous provider outcome is never automatically or manually reclaimed', async () => {
    const ctx = setup({
      send: async () => ({
        ok: false,
        code: 'request_failed',
        retryable: true,
        message: 'network failed',
      }),
    });
    const result = await runMonthlyReportsCore(ctx.dependencies, NOW);
    assert.equal(result.unknownDeliveries, 1);
    const [report] = await ctx.reports.listByClient({ clientId: DEMO_PREMIUM_ID });
    assert.equal(report.deliveryStatus, 'delivery_unknown');
    assert.equal(await ctx.reports.claimDelivery({ reportId: report.id }), null);
    assert.equal(
      await retryMonthlyReportCore({
        report,
        site: ctx.site,
        client: ctx.client,
        subscriptionActive: true,
        dependencies: ctx.dependencies,
      }),
      'not_retryable',
    );
  });

  test('provider acceptance followed by sent-state failure never becomes retryable failed', async () => {
    const ctx = setup();
    const original = ctx.reports.markDeliveryResult.bind(ctx.reports);
    let rejectSentOnce = true;
    ctx.reports.markDeliveryResult = async (input) => {
      if (input.status === 'sent' && rejectSentOnce) {
        rejectSentOnce = false;
        throw new Error('transient database failure');
      }
      return original(input);
    };
    const result = await runMonthlyReportsCore(ctx.dependencies, NOW);
    assert.equal(result.sentReports, 0);
    assert.equal(result.unknownDeliveries, 1);
    const [report] = await ctx.reports.listByClient({ clientId: DEMO_PREMIUM_ID });
    assert.equal(report.deliveryStatus, 'delivery_unknown');
    assert.equal(report.providerMessageId, 'resend-1');
    assert.equal(report.lastErrorCode, 'RESEND_ACCEPTED_PERSISTENCE_UNKNOWN');
    assert.equal(await ctx.reports.claimDelivery({ reportId: report.id }), null);
  });

  test('reconciles an abandoned sending lease before processing and never resends it', async () => {
    const ctx = setup();
    const inserted = await ctx.reports.insertIfAbsent({
      siteId: HWARODAM_SITE_ID,
      clientId: DEMO_PREMIUM_ID,
      periodMonth: '2026-06',
      report: {
        schemaVersion: 1,
        siteId: HWARODAM_SITE_ID,
        period: {
          month: '2026-06',
          startDate: '2026-06-01',
          endExclusiveDate: '2026-07-01',
          startIso: '2026-05-31T15:00:00.000Z',
          endExclusiveIso: '2026-06-30T15:00:00.000Z',
        },
        comparisonPeriod: {
          month: '2026-05',
          startDate: '2026-05-01',
          endExclusiveDate: '2026-06-01',
          startIso: '2026-04-30T15:00:00.000Z',
          endExclusiveIso: '2026-05-31T15:00:00.000Z',
        },
        metrics: {
          pageviews: { current: 0, previous: 0, changePercent: null },
          phoneClicks: { current: 0, previous: 0, changePercent: null },
          reservationClicks: { current: 0, previous: 0, changePercent: null },
          directionsClicks: { current: 0, previous: 0, changePercent: null },
          formSubmissions: { current: 0, previous: 0, changePercent: null },
        },
        sources: [],
        hasCurrentData: false,
        hasComparisonData: false,
        insight: '이번 달에는 아직 집계된 방문과 행동이 없어요.',
      },
    });
    await ctx.reports.claimDelivery({
      reportId: inserted.record.id,
      claimedAt: new Date(NOW.getTime() - REPORT_DELIVERY_STALE_MS - 1).toISOString(),
    });

    const result = await runMonthlyReportsCore(ctx.dependencies, NOW);
    assert.equal(result.reconciledUnknownDeliveries, 1);
    assert.equal(result.sentReports, 0);
    assert.equal(ctx.sends(), 0);
    assert.equal(
      (await ctx.reports.getByIdForService(inserted.record.id))?.deliveryStatus,
      'delivery_unknown',
    );
  });

  test('bounds provider sends to eight workers within the route timeout budget', async () => {
    const ctx = setup();
    const store = getMockStore();
    const sites = Array.from({ length: 12 }, (_, index) => ({
      ...ctx.site,
      id: `concurrency-site-${index}`,
      name: `동시성 사이트 ${index}`,
    }));
    for (const site of sites) store.sites.set(site.id, site);

    let entered = 0;
    let inFlight = 0;
    let maximumInFlight = 0;
    let fakeNow = 0;
    const starts: number[] = [];
    const rateGateTiming: ReportEmailRateGateTiming = {
      now: () => fakeNow,
      sleep: async (ms) => { fakeNow += ms; },
    };
    const firstWave: Array<() => void> = [];
    const sendEmail: MonthlyReportRunnerDependencies['sendEmail'] = async () => {
      const position = ++entered;
      inFlight += 1;
      maximumInFlight = Math.max(maximumInFlight, inFlight);
      starts.push(fakeNow);
      if (position <= REPORT_DELIVERY_CONCURRENCY) {
        await new Promise<void>((resolve) => {
          firstWave.push(resolve);
          if (firstWave.length === REPORT_DELIVERY_CONCURRENCY) {
            for (const release of firstWave.splice(0)) release();
          }
        });
      }
      inFlight -= 1;
      return { ok: true, providerId: `resend-${position}` };
    };

    const result = await runMonthlyReportsCore({
      ...ctx.dependencies,
      listSites: async () => sites,
      sendEmail,
    }, NOW, { rateGateTiming });
    assert.equal(REPORT_DELIVERY_CONCURRENCY, 8);
    assert.equal(maximumInFlight, REPORT_DELIVERY_CONCURRENCY);
    assert.equal(result.sentReports, sites.length);
    assert.equal(REPORT_EMAIL_MAX_STARTS_PER_SECOND, 5);
    assert.deepEqual(
      starts,
      Array.from({ length: sites.length }, (_, index) => index * REPORT_EMAIL_START_INTERVAL_MS),
    );
    assert.ok(
      (49 * REPORT_EMAIL_START_INTERVAL_MS) + REPORT_EMAIL_TIMEOUT_MS < 60_000,
      'the launch batch provider budget must fit under maxDuration=60s',
    );
  });

  test('classifies only transport ambiguity as delivery_unknown', () => {
    assert.equal(reportDeliveryFailure({
      ok: false,
      code: 'provider_rejected',
      retryable: true,
      status: 503,
      message: 'x',
    }).status, 'delivery_unknown');
    assert.equal(reportDeliveryFailure({
      ok: false,
      code: 'provider_rejected',
      retryable: true,
      status: 429,
      message: 'x',
    }).status, 'failed');
    assert.equal(reportDeliveryFailure({
      ok: false,
      code: 'invalid_input',
      retryable: false,
      message: 'x',
    }).status, 'failed');
  });
});
