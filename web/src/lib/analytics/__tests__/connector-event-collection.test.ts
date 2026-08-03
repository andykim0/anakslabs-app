import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, test } from 'node:test';
import { HWARODAM_SITE_ID } from '@/lib/data/mock/seed';
import { MockSiteEventsRepo } from '@/lib/data/mock/site-events';
import { getMockStore, resetMockStore } from '@/lib/data/mock/store';
import { ANONYMOUS_SITE_EVENT_DISCLOSURE } from '@/lib/legal/templates';

const MIGRATION = readFileSync(
  join(process.cwd(), '../supabase/migrations/0045_connectors.sql'),
  'utf8',
);

describe('CONN C1 — idempotent anonymous conversion collection', () => {
  beforeEach(() => resetMockStore());

  test('same event nonce increments the aggregate exactly once', async () => {
    const repo = new MockSiteEventsRepo();
    const input = {
      siteId: HWARODAM_SITE_ID,
      eventType: 'chat' as const,
      source: 'direct' as const,
      eventDate: '2026-07-24',
      eventId: '114ea1a2-3448-49a3-bfb4-a9b2f4992d97',
    };
    await repo.increment(input);
    await repo.increment(input);
    await repo.increment({
      ...input,
      eventId: '9d12cb89-a992-4d47-b98f-da48038c71e2',
    });
    const rows = await repo.listBySiteRange({
      siteId: HWARODAM_SITE_ID,
      fromDate: '2026-07-01',
      toDate: '2026-08-01',
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.eventType, 'chat');
    assert.equal(rows[0]?.count, 2);
  });

  test('0045 records receipt and aggregate atomically with a 48-hour expiry', () => {
    assert.match(MIGRATION, /create table public\.site_event_receipts/);
    assert.match(MIGRATION, /p_received_at \+ interval '48 hours'/);
    assert.match(
      MIGRATION,
      /insert into public\.site_event_receipts[\s\S]*on conflict \(event_id\) do nothing[\s\S]*if not v_recorded then[\s\S]*return false[\s\S]*insert into public\.site_events/,
    );
    assert.match(MIGRATION, /purge_site_event_receipts/);
    assert.match(MIGRATION, /delete from public\.site_event_receipts where expires_at <= p_before/);
  });

  test('visitor actions stay separate from the build economics ledger', () => {
    assert.doesNotMatch(MIGRATION, /insert into public\.build_economics_events/);
    assert.doesNotMatch(
      MIGRATION,
      /update public\.site_events[\s\S]*set event_type/u,
      'past aggregates must never be rewritten when Kakao classification changes',
    );
  });

  test('storage and fixed legal copy exclude identifying and raw click data', () => {
    const receiptTable = MIGRATION.slice(
      MIGRATION.indexOf('create table public.site_event_receipts'),
      MIGRATION.indexOf('create or replace function public.increment_site_event'),
    );
    assert.doesNotMatch(
      receiptTable,
      /\b(ip_address|user_agent|visitor_id|session_id|raw_referrer|clicked_url|email|phone)\b/iu,
    );
    assert.match(ANONYMOUS_SITE_EVENT_DISCLOSURE.collected, /message, social-link/u);
    assert.match(ANONYMOUS_SITE_EVENT_DISCLOSURE.excluded, /clicked destination URLs/u);
    assert.match(ANONYMOUS_SITE_EVENT_DISCLOSURE.retention, /24 months/u);
  });

  test('route accepts an optional UUID only for legacy compatibility', () => {
    const route = readFileSync(
      join(process.cwd(), 'src/app/api/site-events/route.ts'),
      'utf8',
    );
    assert.match(route, /eventId: z\.string\(\)\.uuid\(\)\.optional\(\)/);
    assert.match(route, /eventId: parsed\.data\.eventId/);
    assert.doesNotMatch(route, /request\.ip|x-forwarded-for|referer/iu);
  });

  test('0045 keeps report v2 compatibility without Instagram account or cache tables', () => {
    assert.doesNotMatch(MIGRATION, /site_connector_(?:credentials|cache)/);
    assert.doesNotMatch(MIGRATION, /ciphertext|initialization_iv|auth_tag|key_version/);
    assert.match(MIGRATION, /schemaVersion'\)::integer in \(1, 2\)/);
  });

  test('mock receipts never become visitor rows', () => {
    const store = getMockStore();
    store.siteEventReceipts = new Map([
      ['event-only', { siteId: HWARODAM_SITE_ID, expiresAt: '2026-07-25T00:00:00.000Z' }],
    ]);
    assert.deepEqual(Object.keys(store.siteEventReceipts.get('event-only') ?? {}).sort(), [
      'expiresAt',
      'siteId',
    ]);
  });
});
