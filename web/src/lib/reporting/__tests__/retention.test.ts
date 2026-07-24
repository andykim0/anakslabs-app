import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { HWARODAM_SITE_ID } from '@/lib/data/mock/seed';
import { getMockStore, resetMockStore } from '@/lib/data/mock/store';
import { MockSiteEventsRepo } from '@/lib/data/mock/site-events';
import {
  assertReportingCalendarDate,
  reportingRetentionCutoff,
  REPORTING_RETENTION_MONTHS,
} from '../retention';

describe('RPT4 reporting retention', () => {
  test('uses a 24-month Korean calendar cutoff and clamps leap-day', () => {
    assert.equal(REPORTING_RETENTION_MONTHS, 24);
    assert.deepEqual(
      reportingRetentionCutoff(new Date('2026-07-17T01:00:00.000Z')),
      {
        eventBeforeDate: '2024-07-17',
        reportCutoffIso: '2024-06-30T15:00:00.000Z',
      },
    );
    assert.equal(
      reportingRetentionCutoff(new Date('2024-02-29T03:00:00.000Z')).eventBeforeDate,
      '2022-02-28',
    );
  });

  test('mock deletes only aggregates strictly older than the cutoff date', async () => {
    resetMockStore();
    const store = getMockStore();
    for (const date of ['2024-07-16', '2024-07-17', '2026-07-01']) {
      store.siteEvents.set(date, {
        siteId: HWARODAM_SITE_ID,
        clientId: 'demo-premium',
        eventDate: date,
        eventType: 'pageview',
        source: 'direct',
        count: 1,
      });
    }
    const repo = new MockSiteEventsRepo();
    assert.equal(await repo.purgeBeforeDate('2024-07-17'), 1);
    assert.deepEqual([...store.siteEvents.values()].map((row) => row.eventDate), [
      '2024-07-17',
      '2026-07-01',
    ]);
    await assert.rejects(repo.purgeBeforeDate('2024/07/17'), /YYYY-MM-DD/);
    await assert.rejects(repo.purgeBeforeDate('2024-02-30'), /calendar date/);
    await assert.rejects(repo.purgeBeforeDate('2024-13-01'), /calendar date/);
  });

  test('event delivery receipts expire after their bounded retry window', async () => {
    resetMockStore();
    const store = getMockStore();
    store.siteEventReceipts = new Map([
      ['expired', { siteId: HWARODAM_SITE_ID, expiresAt: '2026-07-16T00:00:00.000Z' }],
      ['active', { siteId: HWARODAM_SITE_ID, expiresAt: '2026-07-18T00:00:00.000Z' }],
    ]);
    const repo = new MockSiteEventsRepo();
    assert.equal(await repo.purgeExpiredReceipts('2026-07-17T00:00:00.000Z'), 1);
    assert.deepEqual([...store.siteEventReceipts.keys()], ['active']);
    await assert.rejects(repo.purgeExpiredReceipts('not-a-date'), /ISO-8601/);
  });

  test('cutoff validator accepts leap dates and rejects impossible calendar dates', () => {
    assert.doesNotThrow(() => assertReportingCalendarDate('2024-02-29'));
    assert.throws(() => assertReportingCalendarDate('2023-02-29'), /calendar date/);
    assert.throws(() => assertReportingCalendarDate('2024-04-31'), /calendar date/);
  });

  test('Supabase purge is service-only and the authenticated cron invokes it', () => {
    const migration = readFileSync(
      join(process.cwd(), '../supabase/migrations/0015_reporting_retention.sql'),
      'utf8',
    );
    const cron = readFileSync(
      join(process.cwd(), 'src/app/api/cron/monthly-reports/route.ts'),
      'utf8',
    );
    assert.match(migration, /delete from public\.site_events where event_date < p_before_date/);
    assert.match(
      migration,
      /revoke execute on function public\.purge_site_events\(date\)[\s\S]*from public, anon, authenticated/,
    );
    assert.match(
      migration,
      /grant execute on function public\.purge_site_events\(date\) to service_role/,
    );
    assert.match(cron, /purgeExpiredReportingData\(\)/);
    assert.match(cron, /REPORTING_RETENTION_FAILED/);
  });
});
