import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DEMO_PREMIUM_ID, HWARODAM_SITE_ID } from '@/lib/data/mock/seed';
import { getMockStore, resetMockStore } from '@/lib/data/mock/store';
import { MockSiteEventsRepo } from '@/lib/data/mock/site-events';
import { MockMonthlyReportsRepository } from '../repository-mock';
import {
  reportDeliveryFailure,
  retryMonthlyReportCore,
  runMonthlyReportsCore,
  type MonthlyReportRunnerDependencies,
} from '../runner-core';

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
    dashboardUrl: 'https://daboim.com/dashboard/reports',
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
