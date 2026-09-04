/**
 * [CITE$] Cost guards, the cron contract, and env-unset safety.
 *
 * The adapter modules import `server-only`, so they cannot be loaded in this runner.
 * Their key guard is pinned by reading their source, the way `cron/_lib/auth.test.ts`
 * pins a route's `maxDuration`. Every pure path they depend on is covered behaviourally
 * in `engine-parsers.test.ts`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, test } from 'node:test';
import { citationCheckConfig } from '@/lib/env';
import { CITATION_ENGINES } from '../types';

const KEYS = [
  'CITATION_ENGINES',
  'CITATION_MAX_QUESTIONS_PER_SITE',
  'CITATION_MAX_CALLS_PER_RUN',
  'CITATION_MAX_CALLS_PER_MONTH',
  'CITATION_CONCURRENCY',
  'CITATION_CHECK_ENABLED',
] as const;

function clearEnv(): void {
  for (const key of KEYS) delete process.env[key];
}

function adapterSource(name: string): string {
  return readFileSync(join(process.cwd(), 'src/lib/citation-check/engines', `${name}.ts`), 'utf8');
}

describe('[CITE$] cost configuration', () => {
  afterEach(clearEnv);

  test('the defaults are the documented ones', () => {
    clearEnv();
    assert.deepEqual(citationCheckConfig(), {
      engines: ['openai', 'anthropic', 'gemini', 'perplexity'],
      maxQuestionsPerSite: 8,
      maxCallsPerRun: 120,
      maxCallsPerMonth: 2_000,
      concurrency: 4,
      enabled: true,
    });
  });

  test('CITATION_CHECK_ENABLED=0 is the kill switch and nothing else is', () => {
    clearEnv();
    process.env.CITATION_CHECK_ENABLED = '0';
    assert.equal(citationCheckConfig().enabled, false);
    for (const value of ['1', 'true', 'yes', '']) {
      process.env.CITATION_CHECK_ENABLED = value;
      assert.equal(citationCheckConfig().enabled, true, `value: ${JSON.stringify(value)}`);
    }
  });

  test('engines are parsed, lowercased, trimmed and deduped', () => {
    clearEnv();
    process.env.CITATION_ENGINES = ' Anthropic , gemini,ANTHROPIC ,,';
    assert.deepEqual(citationCheckConfig().engines, ['anthropic', 'gemini']);
  });

  test('an empty engine list falls back to all four rather than probing nothing silently', () => {
    clearEnv();
    process.env.CITATION_ENGINES = '   ';
    assert.deepEqual(citationCheckConfig().engines, [...CITATION_ENGINES]);
  });

  test('numeric guards accept integers and reject nonsense without opening the budget', () => {
    clearEnv();
    process.env.CITATION_MAX_CALLS_PER_MONTH = '50';
    process.env.CITATION_MAX_CALLS_PER_RUN = '10';
    process.env.CITATION_MAX_QUESTIONS_PER_SITE = '3';
    process.env.CITATION_CONCURRENCY = '2';
    const configured = citationCheckConfig();
    assert.equal(configured.maxCallsPerMonth, 50);
    assert.equal(configured.maxCallsPerRun, 10);
    assert.equal(configured.maxQuestionsPerSite, 3);
    assert.equal(configured.concurrency, 2);

    for (const bad of ['abc', '-5', 'NaN']) {
      process.env.CITATION_MAX_CALLS_PER_MONTH = bad;
      assert.equal(citationCheckConfig().maxCallsPerMonth, 2_000, `value: ${bad}`);
    }
  });

  test('a zero cap really means zero, and concurrency never drops below one worker', () => {
    clearEnv();
    process.env.CITATION_MAX_CALLS_PER_MONTH = '0';
    process.env.CITATION_CONCURRENCY = '0';
    const configured = citationCheckConfig();
    assert.equal(configured.maxCallsPerMonth, 0, 'a budget of zero must be honoured');
    assert.equal(configured.concurrency, 1);
  });
});

describe('[CITE$] env-unset safety', () => {
  test('every adapter returns not_configured when its key is missing, and never throws', () => {
    const guards: ReadonlyArray<[string, RegExp]> = [
      ['openai', /if \(!env\.openaiApiKey\) return notConfigured\('openai', model\);/u],
      ['anthropic', /if \(!env\.anthropicApiKey\) return notConfigured\('anthropic', model\);/u],
      ['gemini', /if \(!env\.geminiApiKey\) return notConfigured\('gemini', model\);/u],
      ['perplexity', /if \(!env\.perplexityApiKey\) return notConfigured\('perplexity', MODEL_LABEL\);/u],
    ];
    for (const [name, guard] of guards) {
      assert.match(adapterSource(name), guard, `${name} must guard on its key first`);
    }
  });

  test('no adapter puts a key in a URL — a URL is the thing that gets logged', () => {
    // Comments are stripped first: the gemini adapter documents the `?key=` form it
    // deliberately avoids, and that prose must not be mistaken for the behaviour.
    const stripComments = (source: string) => source
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .replace(/^\s*\/\/.*$/gmu, '');
    for (const name of ['openai', 'anthropic', 'gemini', 'perplexity']) {
      const code = stripComments(adapterSource(name));
      assert.doesNotMatch(code, /[?&]key=/u, name);
      assert.doesNotMatch(code, /apiKey=\$\{/u, name);
    }
    // Gemini in particular: the key rides in a header, never a query string.
    const gemini = adapterSource('gemini');
    assert.match(gemini, /'x-goog-api-key': apiKey/u, 'the key is a header value');
    assert.match(gemini, /env\.geminiApiKey,\n\s+timeoutMs,/u, 'and it is passed as an argument');
    // Perplexity uses a bearer header for the same reason.
    assert.match(adapterSource('perplexity'), /authorization: `Bearer \$\{env\.perplexityApiKey\}`/u);
  });

  test('no adapter logs, and none returns a provider message as an error code', () => {
    for (const name of ['openai', 'anthropic', 'gemini', 'perplexity', 'shared']) {
      const source = adapterSource(name);
      assert.doesNotMatch(source, /console\.(log|warn|error|info)/u, name);
    }
  });

  test('every adapter bounds its request with the shared 25 s timeout', () => {
    for (const name of ['openai', 'anthropic', 'gemini', 'perplexity']) {
      assert.match(adapterSource(name), /CITATION_PROBE_TIMEOUT_MS/u, name);
    }
    for (const name of ['gemini', 'perplexity']) {
      assert.match(adapterSource(name), /AbortSignal\.timeout\(timeoutMs\)/u, name);
    }
  });

  test('the SDK adapters disable the SDK retry so only our single retry applies', () => {
    assert.match(adapterSource('anthropic'), /maxRetries: 0/u);
    assert.match(adapterSource('openai'), /maxRetries: 0/u);
  });
});

describe('[CITE$] the citation cron route', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/app/api/cron/citation-checks/route.ts'),
    'utf8',
  );

  test('it is authenticated by the shared cron contract and is dynamic', () => {
    assert.match(source, /isCronAuthorized\(request\)/u);
    assert.match(source, /status: 401/u);
    assert.match(source, /export const dynamic = 'force-dynamic'/u);
  });

  test('it claims the 300-second budget the runner is sized against', () => {
    assert.match(source, /export const maxDuration = 300/u);
  });

  test('the monthly-reports route keeps its own 60-second budget', () => {
    const monthly = readFileSync(
      join(process.cwd(), 'src/app/api/cron/monthly-reports/route.ts'),
      'utf8',
    );
    assert.match(monthly, /export const maxDuration = 60/u);
  });

  test('a disabled run returns 200 with a reason, not an error', () => {
    assert.match(source, /skipped: 'disabled'/u);
    assert.match(source, /citationCheckConfig\(\)\.enabled/u);
  });

  test('a failure returns a stable code, never a provider message', () => {
    assert.match(source, /code: 'CITATION_RUN_FAILED'/u);
    assert.doesNotMatch(source, /error\.message/u);
  });

  test('the month semantics are written down where the next reader will look', () => {
    assert.match(source, /previous-month[\s*]+period/iu);
    assert.match(source, /run_month = M/u);
    assert.match(source, /never "the current month"/u);
  });

  test('the schedule is registered daily so a rate-limited day heals the next day', () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    const entry = vercel.crons.find((cron) => cron.path === '/api/cron/citation-checks');
    assert.ok(entry, 'the cron must be registered');
    assert.equal(entry.schedule, '45 23 * * *');
    // The existing jobs are untouched.
    assert.equal(
      vercel.crons.find((cron) => cron.path === '/api/cron/monthly-reports')?.schedule,
      '15 0 * * *',
    );
    assert.equal(
      vercel.crons.find((cron) => cron.path === '/api/cron/expire-credits')?.schedule,
      '0 18 * * *',
    );
  });
});
