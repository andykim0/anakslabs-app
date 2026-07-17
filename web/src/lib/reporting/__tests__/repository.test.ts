import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { DEMO_BASIC_ID, DEMO_PREMIUM_ID, HWARODAM_SITE_ID } from '@/lib/data/mock/seed';
import { getMockStore, resetMockStore } from '@/lib/data/mock/store';
import type { KstMonthRange, MonthlyPerformanceReport } from '../types';
import { cutoffMonthFromIso, monthlyPerformanceReportSchema } from '../repository-core';
import { MockMonthlyReportsRepository } from '../repository-mock';

function range(month: string): KstMonthRange {
  const [year, oneBasedMonth] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, oneBasedMonth - 1, 1) - 9 * 60 * 60 * 1_000);
  const end = new Date(Date.UTC(year, oneBasedMonth, 1) - 9 * 60 * 60 * 1_000);
  return {
    month,
    startDate: `${month}-01`,
    endExclusiveDate: end.toISOString().slice(0, 10),
    startIso: start.toISOString(),
    endExclusiveIso: end.toISOString(),
  };
}

function previousMonth(month: string): string {
  const [year, oneBasedMonth] = month.split('-').map(Number);
  return new Date(Date.UTC(year, oneBasedMonth - 2, 1)).toISOString().slice(0, 7);
}

function report(siteId: string, month: string, pageviews = 3): MonthlyPerformanceReport {
  return {
    schemaVersion: 1,
    siteId,
    period: range(month),
    comparisonPeriod: range(previousMonth(month)),
    metrics: {
      pageviews: { current: pageviews, previous: 0, changePercent: null },
      phoneClicks: { current: 0, previous: 0, changePercent: null },
      reservationClicks: { current: 0, previous: 0, changePercent: null },
      directionsClicks: { current: 0, previous: 0, changePercent: null },
      formSubmissions: { current: 0, previous: 0, changePercent: null },
    },
    sources: [
      {
        source: 'direct',
        label: '직접·사이트 내부',
        count: pageviews,
        previousCount: 0,
        sharePercent: pageviews > 0 ? 100 : 0,
        changePercent: null,
      },
    ],
    hasCurrentData: pageviews > 0,
    hasComparisonData: false,
    insight: pageviews > 0
      ? `이번 달 방문(페이지뷰) ${pageviews}건이 처음 집계됐어요.`
      : '이번 달에는 아직 집계된 방문과 행동이 없어요.',
  };
}

function repository() {
  resetMockStore();
  const instants = [
    '2026-07-01T00:00:00.000Z',
    '2026-07-01T00:00:01.000Z',
    '2026-07-01T00:00:02.000Z',
    '2026-07-01T00:00:03.000Z',
    '2026-07-01T00:00:04.000Z',
  ];
  let index = 0;
  return new MockMonthlyReportsRepository(
    getMockStore(),
    () => instants[Math.min(index++, instants.length - 1)],
  );
}

describe('RPT2 monthly report repository', () => {
  test('insert is site/month idempotent and does not overwrite the first report', async () => {
    const repo = repository();
    const first = await repo.insertIfAbsent({
      siteId: HWARODAM_SITE_ID,
      clientId: DEMO_PREMIUM_ID,
      periodMonth: '2026-06',
      report: report(HWARODAM_SITE_ID, '2026-06', 3),
    });
    const retry = await repo.insertIfAbsent({
      siteId: HWARODAM_SITE_ID,
      clientId: DEMO_PREMIUM_ID,
      periodMonth: '2026-06',
      report: report(HWARODAM_SITE_ID, '2026-06', 99),
    });

    assert.equal(first.created, true);
    assert.equal(retry.created, false);
    assert.equal(retry.record.id, first.record.id);
    assert.equal(retry.record.report.metrics.pageviews.current, 3);
    assert.equal((await repo.listByClient({ clientId: DEMO_PREMIUM_ID })).length, 1);
  });

  test('owner-scoped reads fail closed and database ownership is mirrored in mock', async () => {
    const repo = repository();
    const inserted = await repo.insertIfAbsent({
      siteId: HWARODAM_SITE_ID,
      clientId: DEMO_PREMIUM_ID,
      periodMonth: '2026-06',
      report: report(HWARODAM_SITE_ID, '2026-06'),
    });

    assert.equal(await repo.get({ clientId: DEMO_BASIC_ID, reportId: inserted.record.id }), null);
    assert.equal((await repo.listByClient({ clientId: DEMO_BASIC_ID })).length, 0);
    assert.equal((await repo.getByIdForService(inserted.record.id))?.clientId, DEMO_PREMIUM_ID);
    await assert.rejects(
      repo.insertIfAbsent({
        siteId: HWARODAM_SITE_ID,
        clientId: DEMO_BASIC_ID,
        periodMonth: '2026-05',
        report: report(HWARODAM_SITE_ID, '2026-05'),
      }),
      /OWNERSHIP_MISMATCH/,
    );
  });

  test('delivery claim is atomic by state and sent/unknown are never auto-reclaimed', async () => {
    const repo = repository();
    const inserted = await repo.insertIfAbsent({
      siteId: HWARODAM_SITE_ID,
      clientId: DEMO_PREMIUM_ID,
      periodMonth: '2026-06',
      report: report(HWARODAM_SITE_ID, '2026-06'),
    });
    const id = inserted.record.id;

    assert.equal((await repo.claimDelivery({ reportId: id }))?.deliveryAttempts, 1);
    assert.equal(await repo.claimDelivery({ reportId: id }), null);
    assert.equal(
      (await repo.markDeliveryResult({
        reportId: id,
        status: 'failed',
        errorCode: 'RESEND_TEMPORARY',
      })).deliveryStatus,
      'failed',
    );
    assert.equal((await repo.claimDelivery({ reportId: id }))?.deliveryAttempts, 2);
    assert.equal(
      (await repo.markDeliveryResult({
        reportId: id,
        status: 'sent',
        providerMessageId: 'resend-message-1',
      })).deliveryStatus,
      'sent',
    );
    assert.equal(await repo.claimDelivery({ reportId: id }), null);

    const unknown = await repo.insertIfAbsent({
      siteId: HWARODAM_SITE_ID,
      clientId: DEMO_PREMIUM_ID,
      periodMonth: '2026-05',
      report: report(HWARODAM_SITE_ID, '2026-05'),
    });
    await repo.claimDelivery({ reportId: unknown.record.id });
    await repo.markDeliveryResult({
      reportId: unknown.record.id,
      status: 'delivery_unknown',
      errorCode: 'RESEND_RESPONSE_UNKNOWN',
    });
    assert.equal(await repo.claimDelivery({ reportId: unknown.record.id }), null);
  });

  test('stale sending leases become review-only unknown and are never resent', async () => {
    const repo = repository();
    const inserted = await repo.insertIfAbsent({
      siteId: HWARODAM_SITE_ID,
      clientId: DEMO_PREMIUM_ID,
      periodMonth: '2026-06',
      report: report(HWARODAM_SITE_ID, '2026-06'),
    });
    await repo.claimDelivery({
      reportId: inserted.record.id,
      claimedAt: '2026-07-01T00:00:00.000Z',
    });
    assert.equal(await repo.reconcileStaleDeliveries({
      beforeIso: '2026-07-01T00:10:00.000Z',
      reconciledAt: '2026-07-01T00:15:00.000Z',
    }), 1);
    const record = await repo.getByIdForService(inserted.record.id);
    assert.equal(record?.deliveryStatus, 'delivery_unknown');
    assert.equal(record?.lastErrorCode, 'DELIVERY_STALE_REQUIRES_REVIEW');
    assert.equal(await repo.claimDelivery({ reportId: inserted.record.id }), null);
  });

  test('purges by report month and keeps the cutoff month', async () => {
    const repo = repository();
    for (const month of ['2024-06', '2024-07', '2026-06']) {
      await repo.insertIfAbsent({
        siteId: HWARODAM_SITE_ID,
        clientId: DEMO_PREMIUM_ID,
        periodMonth: month,
        report: report(HWARODAM_SITE_ID, month),
      });
    }
    assert.equal(await repo.purgeOlderThan('2024-07-17T00:00:00.000Z'), 1);
    assert.deepEqual(
      (await repo.listByClient({ clientId: DEMO_PREMIUM_ID })).map((row) => row.periodMonth),
      ['2026-06', '2024-07'],
    );
    assert.equal(cutoffMonthFromIso('2024-06-30T15:00:00.000Z'), '2024-07');
  });

  test('strict payload schema rejects recipient or other undeclared data', () => {
    const unsafe = { ...report(HWARODAM_SITE_ID, '2026-06'), recipient: 'owner@example.com' };
    assert.equal(monthlyPerformanceReportSchema.safeParse(unsafe).success, false);
  });
});

describe('RPT2 monthly report SQL contract', () => {
  const migration = readFileSync(
    join(process.cwd(), '../supabase/migrations/0014_monthly_site_reports.sql'),
    'utf8',
  );

  test('persists only owner/site/month, aggregate payload, and delivery metadata', () => {
    assert.match(migration, /unique \(site_id, period_month\)/);
    assert.match(migration, /report_payload\s+jsonb not null/);
    const tableDefinition = migration.match(
      /create table public\.monthly_site_reports \(([\s\S]*?)\n\);/,
    )?.[1] ?? '';
    assert.doesNotMatch(
      tableDefinition,
      /^\s*(recipient|email|phone|name|ip_address|user_agent|session_id)\s+/im,
    );
  });

  test('RLS exposes owner select only and all mutation RPCs are service-only', () => {
    assert.match(migration, /enable row level security/);
    assert.match(migration, /using \(client_id = auth\.uid\(\)\)/);
    assert.doesNotMatch(migration, /for (insert|update|delete) to authenticated/i);
    for (const routine of [
      'insert_monthly_site_report',
      'claim_monthly_report_delivery',
      'mark_monthly_report_delivery',
      'reconcile_stale_monthly_report_deliveries',
      'purge_monthly_site_reports',
    ]) {
      assert.match(migration, new RegExp(`grant execute on function public\\.${routine}[^;]+to service_role`));
      assert.match(migration, new RegExp(`revoke execute on function public\\.${routine}[^;]+from public, anon, authenticated`));
    }
  });

  test('delivery state machine is retryable without auto-reclaiming ambiguous sends', () => {
    assert.match(migration, /delivery_status in \('pending', 'sending', 'sent', 'failed', 'delivery_unknown'\)/);
    assert.match(migration, /delivery_status in \('pending', 'failed'\)/);
    assert.doesNotMatch(
      migration.match(/create or replace function public\.claim_monthly_report_delivery[\s\S]*?\$\$;/)?.[0] ?? '',
      /delivery_unknown|delivery_status\s*=\s*'sending'\s+or/i,
    );
    assert.match(migration, /delivery_attempts = delivery_attempts \+ 1/);
    assert.match(migration, /where delivery_status = 'sending' and updated_at < p_before/);
    assert.match(migration, /DELIVERY_STALE_REQUIRES_REVIEW/);
    assert.match(migration, /monthly_site_reports_sending_updated_idx[\s\S]*where delivery_status = 'sending'/);
    const unknownShape = migration.match(
      /or \(delivery_status = 'delivery_unknown'([\s\S]*?)\n    or \(delivery_status in \('pending', 'sending'\)/,
    )?.[1] ?? '';
    assert.match(unknownShape, /last_error_code is not null/);
    assert.doesNotMatch(
      unknownShape,
      /provider_message_id is null/,
      'known provider acceptance must preserve its provider id in delivery_unknown',
    );
  });

  test('insert derives owner from sites and cannot overwrite an existing monthly report', () => {
    assert.match(migration, /select s\.client_id into v_client_id[\s\S]*from public\.sites s/);
    assert.match(migration, /on conflict \(site_id, period_month\) do nothing/);
    assert.doesNotMatch(migration, /on conflict \(site_id, period_month\) do update/);
  });
});
