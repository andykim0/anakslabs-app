import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

const ROOT = process.cwd();

describe('RPT1 site_events storage contract', () => {
  const migration = readFileSync(
    join(ROOT, '../supabase/migrations/0012_site_events.sql'),
    'utf8',
  );

  test('stores aggregate counts only and excludes PII columns', () => {
    assert.match(migration, /primary key \(site_id, event_date, event_type, referrer_source\)/);
    assert.match(migration, /event_count\s+bigint/);
    assert.doesNotMatch(migration, /\b(ip_address|user_agent|session_id|visitor_id|raw_referrer|email|phone)\b/i);
  });

  test('RLS is owner-select and writes are service RPC only', () => {
    assert.match(migration, /enable row level security/);
    assert.match(migration, /client_id = auth\.uid\(\)/);
    assert.match(migration, /revoke all on table public\.site_events from anon, authenticated/);
    assert.match(migration, /grant execute on function public\.increment_site_event[\s\S]*to service_role/);
    assert.doesNotMatch(migration, /for insert to authenticated/);
  });

  test('database derives owner from a published site and validates closed enums', () => {
    assert.match(migration, /select client_id into v_client_id[\s\S]*from public\.sites/);
    assert.match(migration, /published_at is not null/);
    assert.match(migration, /status in \('live', 'pending_dns'\)/);
    assert.match(migration, /pageview.*tel.*reserve.*directions.*form/);
    assert.match(migration, /naver.*google.*instagram.*direct.*other/);
  });
});
