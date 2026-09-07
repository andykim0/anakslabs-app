/**
 * Cost guards, the cron contract, and the one thing the in-memory mock cannot verify.
 *
 * The wiring modules import `server-only` and cannot be loaded in this runner, so their
 * contracts are pinned by reading their source — the way `cron/_lib/auth.test.ts` pins a route's
 * `maxDuration`. `MockContentQueueRepository` proves the repository CONTRACT; it cannot prove
 * that the Supabase implementation names tables and columns the migration actually declares.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, test } from 'node:test';
import {
  CONTENT_BATCH_DEFAULTS,
  contentBatchConfig,
} from '../batch-config';
import { CONTENT_BATCH_DISPATCH_DEADLINE_MS } from '../batch-core';
import { CONTENT_POST_GENERATION_REQUEST_TIMEOUT_MS } from '../generation-tool';

const KEYS = [
  'CONTENT_BATCH_ENABLED',
  'CONTENT_BATCH_MAX_GENERATIONS_PER_RUN',
  'CONTENT_BATCH_MAX_GENERATIONS_PER_MONTH',
  'CONTENT_BATCH_CONCURRENCY',
  'CONTENT_BATCH_STALE_GENERATING_MINUTES',
] as const;

function clearEnv(): void {
  for (const key of KEYS) delete process.env[key];
}

function source(relative: string): string {
  return readFileSync(join(process.cwd(), relative), 'utf8');
}

describe('content batch cost configuration', () => {
  afterEach(clearEnv);

  test('the defaults are the documented ones', () => {
    clearEnv();
    assert.deepEqual(contentBatchConfig(), {
      enabled: true,
      maxGenerationsPerRun: 24,
      maxGenerationsPerMonth: 1_200,
      concurrency: 3,
      staleGeneratingMs: 20 * 60_000,
    });
    assert.equal(CONTENT_BATCH_DEFAULTS.concurrency, 3, 'the packet fixes concurrency at 3');
  });

  test('CONTENT_BATCH_ENABLED=0 is the kill switch and nothing else is', () => {
    clearEnv();
    process.env.CONTENT_BATCH_ENABLED = '0';
    assert.equal(contentBatchConfig().enabled, false);
    for (const value of ['1', 'true', 'yes', '']) {
      process.env.CONTENT_BATCH_ENABLED = value;
      assert.equal(contentBatchConfig().enabled, true, `value: ${JSON.stringify(value)}`);
    }
  });

  test('numeric guards accept integers and reject nonsense without opening the budget', () => {
    clearEnv();
    process.env.CONTENT_BATCH_MAX_GENERATIONS_PER_RUN = '6';
    process.env.CONTENT_BATCH_MAX_GENERATIONS_PER_MONTH = '50';
    process.env.CONTENT_BATCH_CONCURRENCY = '2';
    process.env.CONTENT_BATCH_STALE_GENERATING_MINUTES = '5';
    const configured = contentBatchConfig();
    assert.equal(configured.maxGenerationsPerRun, 6);
    assert.equal(configured.maxGenerationsPerMonth, 50);
    assert.equal(configured.concurrency, 2);
    assert.equal(configured.staleGeneratingMs, 5 * 60_000);

    for (const bad of ['abc', '-5', 'NaN']) {
      process.env.CONTENT_BATCH_MAX_GENERATIONS_PER_MONTH = bad;
      assert.equal(contentBatchConfig().maxGenerationsPerMonth, 1_200, `value: ${bad}`);
    }
  });

  test('a zero cap really means zero, and concurrency never drops below one worker', () => {
    clearEnv();
    process.env.CONTENT_BATCH_MAX_GENERATIONS_PER_MONTH = '0';
    process.env.CONTENT_BATCH_CONCURRENCY = '0';
    const configured = contentBatchConfig();
    assert.equal(configured.maxGenerationsPerMonth, 0, 'a budget of zero must be honoured');
    assert.equal(configured.concurrency, 1);
  });
});

describe('the content-fulfillment cron route', () => {
  const route = source('src/app/api/cron/content-fulfillment/route.ts');

  test('it is authenticated by the shared cron contract and is dynamic', () => {
    assert.match(route, /isCronAuthorized\(request\)/u);
    assert.match(route, /status: 401/u);
    assert.match(route, /export const dynamic = 'force-dynamic'/u);
  });

  test('it claims the 300-second budget the runner is sized against', () => {
    assert.match(route, /export const maxDuration = 300/u);
  });

  test('the dispatch deadline plus one request timeout is exactly that budget', () => {
    assert.equal(CONTENT_POST_GENERATION_REQUEST_TIMEOUT_MS, 130_000);
    assert.equal(CONTENT_BATCH_DISPATCH_DEADLINE_MS, 170_000);
    assert.equal(
      CONTENT_BATCH_DISPATCH_DEADLINE_MS + CONTENT_POST_GENERATION_REQUEST_TIMEOUT_MS,
      300_000,
    );
    // And the number is written down where the next reader will look for it.
    assert.match(route, /170 s/u);
    assert.match(route, /130 s/u);
  });

  test('a disabled run returns 200 with a reason, not an error', () => {
    assert.match(route, /skipped: 'disabled'/u);
    assert.match(route, /contentBatchConfig\(\)\.enabled/u);
  });

  test('a failure returns a stable code, never a provider message or customer copy', () => {
    assert.match(route, /code: 'CONTENT_BATCH_RUN_FAILED'/u);
    assert.doesNotMatch(route, /error\.message/u);
  });

  test('the schedule is registered daily and clear of the other two heavy jobs', () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    assert.equal(
      vercel.crons.find((cron) => cron.path === '/api/cron/content-fulfillment')?.schedule,
      '30 22 * * *',
    );
    // The existing jobs are untouched.
    assert.equal(
      vercel.crons.find((cron) => cron.path === '/api/cron/citation-checks')?.schedule,
      '45 23 * * *',
    );
    assert.equal(
      vercel.crons.find((cron) => cron.path === '/api/cron/monthly-reports')?.schedule,
      '15 0 * * *',
    );
    assert.equal(
      vercel.crons.find((cron) => cron.path === '/api/cron/expire-credits')?.schedule,
      '0 18 * * *',
    );
    assert.equal(vercel.crons.length, 4, 'the plan must allow a fourth daily cron');
    assert.equal(
      new Set(vercel.crons.map((cron) => cron.schedule)).size,
      4,
      'two 300-second functions must not start in the same minute',
    );
  });
});

describe('the console action and the cron share one runner', () => {
  const action = source('src/app/api/admin/content-queue/run-month/route.ts');
  const cron = source('src/app/api/cron/content-fulfillment/route.ts');
  const wiring = source('src/lib/admin/content-fulfillment-batch.ts');

  test('both routes call the same entry point', () => {
    assert.match(action, /runContentFulfillmentBatch\(/u);
    assert.match(cron, /runContentFulfillmentBatch\(/u);
  });

  test('the console action is behind the admin guard and records the human actor', () => {
    assert.match(action, /requireAdminOr403\(\)/u);
    assert.match(action, /getCurrentAdminActorId\(\)/u);
    assert.match(action, /apiError\(403, 'FORBIDDEN'/u);
    assert.match(action, /export const maxDuration = 300/u);
  });

  test('the unattended run is identifiable in the append-only event ledger', () => {
    assert.match(wiring, /CONTENT_BATCH_CRON_ACTOR_ID = 'cron:content-fulfillment'/u);
  });

  test('nothing in the batch path can approve or publish', () => {
    for (const [name, code] of [
      ['runner', source('src/lib/content-fulfillment/batch-core.ts')],
      ['wiring', wiring],
      ['cron route', cron],
      ['console action', action],
    ] as const) {
      assert.doesNotMatch(code, /approveAndPublish|approveAndSwap|approveAdminContentPost/u, name);
    }
  });
});

describe('the Supabase repository is wired to the migration it reads', () => {
  const repository = source('src/lib/admin/content-queue-repository.ts');
  const migration = readFileSync(
    join(process.cwd(), '..', 'supabase/migrations/0049_content_fulfillment.sql'),
    'utf8',
  );

  test('the monthly spend count reads a table and columns 0049 declares', () => {
    assert.match(repository, /countGeneratedVersionsForMonth/u);
    assert.match(repository, /\.from\('content_post_versions'\)/u);
    assert.match(repository, /content_posts!inner\(period_month\)/u);
    assert.match(migration, /create table public\.content_post_versions/u);
    assert.match(migration, /create table public\.content_posts/u);
    // The embed resolves through this foreign key, and the filter is on this column.
    assert.match(migration, /post_id uuid not null references public\.content_posts \(id\)/u);
    assert.match(migration, /period_month date not null/u);
  });

  test('the reclaim path uses the RPC the migration already declares, not a new one', () => {
    const runner = source('src/lib/content-fulfillment/batch-core.ts');
    assert.match(runner, /repository\.failGeneration/u);
    assert.match(repository, /\.rpc\('fail_content_post_generation'/u);
    assert.match(migration, /create or replace function public\.fail_content_post_generation/u);
    assert.match(migration, /p_restore_status not in \('draft', 'rejected'\)/u);
  });

  test('the seven declared statuses are still the seven the runner reasons about', () => {
    for (const status of [
      'draft',
      'generating',
      'generated',
      'pending_approval',
      'approved',
      'published',
      'rejected',
    ]) {
      assert.match(migration, new RegExp(`'${status}'`, 'u'), status);
    }
    // `generated` and `approved` are declared but never written: the store RPC lands on
    // pending_approval and the approve RPC lands on published. If that ever changes, the
    // runner's eligible set has to be revisited — this is the tripwire.
    assert.match(migration, /set status = 'pending_approval'/u);
    assert.match(migration, /set status = 'published'/u);
    assert.doesNotMatch(migration, /set status = 'generated'/u);
    assert.doesNotMatch(migration, /set status = 'approved'/u);
  });
});
