import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Site } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';
import { MockCitationCheckRepository } from '../repository-mock';
import {
  CITATION_ENQUEUE_DEADLINE_MS,
  citationProbeInputForSite,
  citationRunMonthForSite,
  runCitationChecksCore,
  type CitationRunnerConfig,
  type CitationRunnerDependencies,
} from '../runner-core';
import type { CitationQuestionRecord } from '../repository-core';
import {
  CITATION_PROBE_TIMEOUT_MS,
  type CitationEngine,
  type CitationEngineAdapter,
  type ProbeResult,
} from '../types';
import { getMockStore, resetMockStore } from '@/lib/data/mock/store';

const BASE_CONFIG: CitationRunnerConfig = {
  enabled: true,
  maxQuestionsPerSite: 2,
  maxCallsPerRun: 120,
  maxCallsPerMonth: 2_000,
  concurrency: 4,
};

function siteConfig(overrides: Partial<SiteConfig['meta']> = {}): SiteConfig {
  return {
    version: 2,
    theme: {
      fonts: { heading: 'serif', body: 'sans-serif' },
      palette: {
        background: '#fff', surface: '#eee', text: '#111',
        muted: '#666', primary: '#123456', accent: '#654321',
      },
    },
    meta: {
      title: 'Specimen Dental',
      locale: 'en-US',
      jurisdiction: 'US',
      timezone: 'America/Los_Angeles',
      region: 'Lincoln Park',
      industryClass: 'medical',
      ...overrides,
    },
    pages: [],
  } as unknown as SiteConfig;
}

function site(overrides: Partial<Site> = {}): Site {
  return {
    id: 'site-1',
    clientId: 'client-1',
    name: 'Specimen Dental',
    domain: 'specimendental.com',
    domainType: 'custom',
    dnsVerified: true,
    cloudflareHostnameId: null,
    status: 'live',
    siteConfig: siteConfig(),
    draftConfig: null,
    publishedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Site;
}

function questions(siteId: string, count: number): CitationQuestionRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${siteId}-q${index}`,
    siteId,
    question: `Which clinic in Lincoln Park option ${index}?`,
    source: 'generated' as const,
    active: true,
    createdAt: `2026-08-01T00:00:0${index}.000Z`,
  }));
}

interface Harness {
  dependencies: CitationRunnerDependencies;
  repository: MockCitationCheckRepository;
  calls: string[];
  setElapsed(ms: number): void;
}

function harness(input: {
  sites?: Site[];
  engines?: CitationEngine[];
  config?: Partial<CitationRunnerConfig>;
  questionCount?: number;
  probe?: (engine: CitationEngine) => ProbeResult;
  subscriptionActive?: boolean;
} = {}): Harness {
  resetMockStore();
  const store = getMockStore();
  const sites = input.sites ?? [site()];
  for (const item of sites) store.sites.set(item.id, item);

  const repository = new MockCitationCheckRepository(store, () => '2026-08-02T00:00:00.000Z');
  const calls: string[] = [];
  let elapsed = 0;

  const adapters: CitationEngineAdapter[] = (input.engines ?? ['openai', 'anthropic']).map(
    (engine) => ({
      engine,
      probe: async (probeInput) => {
        calls.push(`${engine}:${probeInput.question}`);
        return input.probe?.(engine) ?? {
          engine,
          status: 'ok',
          model: `${engine}-model`,
          answerText: 'Specimen Dental is taking new patients.',
          sources: [{ url: 'https://specimendental.com/x', host: 'specimendental.com' }],
        };
      },
    }),
  );

  return {
    repository,
    calls,
    setElapsed(ms) { elapsed = ms; },
    dependencies: {
      listSites: async () => sites,
      isSubscriptionActive: async () => input.subscriptionActive ?? true,
      repository,
      ensureQuestions: async ({ siteId, maxQuestions }) =>
        questions(siteId, input.questionCount ?? 2).slice(0, maxQuestions),
      adapters,
      config: { ...BASE_CONFIG, ...input.config },
      elapsedMs: () => elapsed,
    },
  };
}

describe('[CITE$] the monthly probe runner', () => {
  test('probes every missing pair once and stores a verdict per row', async () => {
    const h = harness();
    const summary = await runCitationChecksCore(h.dependencies, {
      now: new Date('2026-08-02T12:00:00.000Z'),
    });
    assert.equal(summary.sitesTouched, 1);
    assert.deepEqual(summary.probes, { ok: 4, notConfigured: 0, error: 0, skipped: 0 });
    assert.equal(summary.remaining, 0);
    assert.equal(summary.stoppedBy, 'complete');
    assert.equal(h.calls.length, 4, '2 questions x 2 engines');

    const stored = await h.repository.listProbes({ siteId: 'site-1', runMonth: '2026-08-01' });
    assert.equal(stored.length, 4);
    for (const row of stored) {
      assert.equal(row.named, true);
      assert.equal(row.linked, true);
      assert.equal(row.status, 'ok');
    }
  });

  test('re-running the same month is a no-op: the unique key fills only what is missing', async () => {
    const h = harness();
    const now = new Date('2026-08-02T12:00:00.000Z');
    await runCitationChecksCore(h.dependencies, { now });
    const callsAfterFirst = h.calls.length;

    const second = await runCitationChecksCore(h.dependencies, { now });
    assert.equal(h.calls.length, callsAfterFirst, 'no second API call for an already stored pair');
    assert.equal(second.sitesTouched, 0);
    assert.deepEqual(second.probes, { ok: 0, notConfigured: 0, error: 0, skipped: 0 });

    const stored = await h.repository.listProbes({ siteId: 'site-1', runMonth: '2026-08-01' });
    assert.equal(stored.length, 4, 'still four rows, never eight');
  });

  test('a partially probed month resumes and fills only the gap', async () => {
    const h = harness();
    await h.repository.insertProbe({
      siteId: 'site-1',
      questionId: 'site-1-q0',
      engine: 'openai',
      runMonth: '2026-08-01',
      status: 'ok',
      named: true,
      linked: false,
      answerExcerpt: 'stored earlier',
      sources: [],
      model: 'earlier',
    });
    const summary = await runCitationChecksCore(h.dependencies, {
      now: new Date('2026-08-02T12:00:00.000Z'),
    });
    assert.equal(h.calls.length, 3, 'the stored pair is skipped');
    assert.equal(summary.probes.ok, 3);
  });

  test('a site with no domain is skipped without spending a single API call', async () => {
    const h = harness({ sites: [site({ domain: null })] });
    const summary = await runCitationChecksCore(h.dependencies, {
      now: new Date('2026-08-02T12:00:00.000Z'),
    });
    assert.equal(h.calls.length, 0, 'no engine was called');
    assert.deepEqual(summary.probes, { ok: 0, notConfigured: 0, error: 0, skipped: 4 });

    const stored = await h.repository.listProbes({ siteId: 'site-1', runMonth: '2026-08-01' });
    assert.equal(stored.length, 4);
    for (const row of stored) {
      assert.equal(row.status, 'skipped');
      assert.equal(row.errorCode, 'NO_DOMAIN');
      assert.equal(row.named, false);
      assert.equal(row.linked, false);
    }
  });

  test('a missing key becomes a not_configured row, never a thrown run', async () => {
    const h = harness({
      probe: (engine) => ({
        engine,
        status: 'not_configured',
        model: 'unset',
        answerText: '',
        sources: [],
        errorCode: 'NO_API_KEY',
      }),
    });
    const summary = await runCitationChecksCore(h.dependencies, {
      now: new Date('2026-08-02T12:00:00.000Z'),
    });
    assert.deepEqual(summary.probes, { ok: 0, notConfigured: 4, error: 0, skipped: 0 });
    const stored = await h.repository.listProbes({ siteId: 'site-1', runMonth: '2026-08-01' });
    assert.equal(stored.every((row) => !row.named && !row.linked), true);
  });

  test('an adapter that throws still produces exactly one error row', async () => {
    const h = harness();
    h.dependencies.adapters = [{
      engine: 'openai',
      probe: async () => { throw new Error('provider exploded with the key in the message'); },
    }];
    const summary = await runCitationChecksCore(h.dependencies, {
      now: new Date('2026-08-02T12:00:00.000Z'),
    });
    assert.equal(summary.probes.error, 2);
    const stored = await h.repository.listProbes({ siteId: 'site-1', runMonth: '2026-08-01' });
    assert.deepEqual(stored.map((row) => row.errorCode), ['ADAPTER_THREW', 'ADAPTER_THREW']);
  });

  test('one site failing to plan never blocks another site', async () => {
    const good = site({ id: 'site-good', clientId: 'client-1' });
    const bad = site({ id: 'site-bad', clientId: 'client-1' });
    const h = harness({ sites: [bad, good] });
    const inner = h.dependencies.ensureQuestions;
    h.dependencies.ensureQuestions = async (args) => {
      if (args.siteId === 'site-bad') throw new Error('planning blew up');
      return inner(args);
    };
    const summary = await runCitationChecksCore(h.dependencies, {
      now: new Date('2026-08-02T12:00:00.000Z'),
    });
    assert.equal(summary.sitesTouched, 1);
    assert.equal(summary.probes.ok, 4);
    assert.equal((await h.repository.listProbes({ siteId: 'site-good', runMonth: '2026-08-01' })).length, 4);
  });

  test('the per-run ceiling stops enqueuing and reports the leftovers', async () => {
    const h = harness({ config: { maxCallsPerRun: 3 } });
    const summary = await runCitationChecksCore(h.dependencies, {
      now: new Date('2026-08-02T12:00:00.000Z'),
    });
    assert.equal(h.calls.length, 3);
    assert.equal(summary.stoppedBy, 'run_cap');
    assert.equal(summary.remaining, 1);
  });

  test('the monthly cap counts STORED rows across all sites before spending', async () => {
    const first = site({ id: 'site-a', clientId: 'client-1' });
    const second = site({ id: 'site-b', clientId: 'client-1' });
    const h = harness({ sites: [first, second], config: { maxCallsPerMonth: 5 } });
    const summary = await runCitationChecksCore(h.dependencies, {
      now: new Date('2026-08-02T12:00:00.000Z'),
    });
    assert.equal(h.calls.length, 5, 'eight pairs were due, five were affordable');
    assert.equal(summary.stoppedBy, 'month_cap');
    assert.equal(summary.remaining, 3);

    // A second run sees the five stored rows and buys nothing more.
    const before = h.calls.length;
    const again = await runCitationChecksCore(h.dependencies, {
      now: new Date('2026-08-03T12:00:00.000Z'),
    });
    assert.equal(h.calls.length, before, 'a crash-and-retry cannot double spend the month');
    assert.equal(again.stoppedBy, 'month_cap');
  });

  test('an unreadable monthly count fails closed rather than risking a double spend', async () => {
    const h = harness({ config: { maxCallsPerMonth: 10 } });
    h.dependencies.repository = {
      ...h.repository,
      listQuestions: (id) => h.repository.listQuestions(id),
      addQuestions: (i) => h.repository.addQuestions(i),
      listProbes: (i) => h.repository.listProbes(i),
      insertProbe: (i) => h.repository.insertProbe(i),
      purgeOlderThan: (i) => h.repository.purgeOlderThan(i),
      countProbesForMonth: async () => { throw new Error('database unreachable'); },
    };
    const summary = await runCitationChecksCore(h.dependencies, {
      now: new Date('2026-08-02T12:00:00.000Z'),
    });
    assert.equal(h.calls.length, 0);
    assert.equal(summary.stoppedBy, 'month_cap');
  });

  test('the kill switch spends nothing and says so', async () => {
    const h = harness({ config: { enabled: false } });
    const summary = await runCitationChecksCore(h.dependencies, {
      now: new Date('2026-08-02T12:00:00.000Z'),
    });
    assert.equal(summary.stoppedBy, 'disabled');
    assert.equal(h.calls.length, 0);
    assert.deepEqual(summary.probes, { ok: 0, notConfigured: 0, error: 0, skipped: 0 });
  });

  test('an inactive subscription is not probed', async () => {
    const h = harness({ subscriptionActive: false });
    const summary = await runCitationChecksCore(h.dependencies, {
      now: new Date('2026-08-02T12:00:00.000Z'),
    });
    assert.equal(h.calls.length, 0);
    assert.equal(summary.sitesTouched, 0);
  });

  test('an unpublished or suspended site is not probed', async () => {
    for (const overrides of [
      { status: 'draft' as const },
      { status: 'suspended' as const },
      { publishedAt: null },
      { siteConfig: null },
    ]) {
      const h = harness({ sites: [site(overrides)] });
      await runCitationChecksCore(h.dependencies, { now: new Date('2026-08-02T12:00:00.000Z') });
      assert.equal(h.calls.length, 0, JSON.stringify(overrides));
    }
  });

  test('the deadline gates DISPATCH, so the pool stops pulling new work', async () => {
    const h = harness({
      config: { maxCallsPerRun: 100, maxQuestionsPerSite: 8 },
      questionCount: 8,
    });
    let dispatched = 0;
    h.dependencies.adapters = [{
      engine: 'openai',
      probe: async () => {
        dispatched += 1;
        // Two probes in, the clock passes the deadline.
        if (dispatched >= 2) h.setElapsed(CITATION_ENQUEUE_DEADLINE_MS + 1);
        return {
          engine: 'openai',
          status: 'ok',
          model: 'm',
          answerText: '',
          sources: [],
        };
      },
    }];
    const summary = await runCitationChecksCore(h.dependencies, {
      now: new Date('2026-08-02T12:00:00.000Z'),
      deadlineMs: CITATION_ENQUEUE_DEADLINE_MS,
    });
    assert.ok(dispatched < 8, `stopped early, dispatched ${dispatched} of 8`);
    assert.equal(summary.stoppedBy, 'deadline');
    assert.ok(summary.remaining > 0, 'the untouched pairs are reported, not silently dropped');
  });

  test('the deadline also stops planning before it walks every site', async () => {
    const many = Array.from({ length: 5 }, (_, index) =>
      site({ id: `site-${index}`, clientId: 'client-1' }));
    const h = harness({ sites: many });
    h.setElapsed(CITATION_ENQUEUE_DEADLINE_MS + 1);
    const summary = await runCitationChecksCore(h.dependencies, {
      now: new Date('2026-08-02T12:00:00.000Z'),
    });
    assert.equal(summary.stoppedBy, 'deadline');
    assert.equal(h.calls.length, 0);
  });

  test('ARITHMETIC: 4 workers x a 25 s probe never exceeds the 300 s route limit', () => {
    const ROUTE_MAX_MS = 300_000;
    // The pool refuses to START a probe at or after the deadline, so the worst finish is
    // the deadline plus one full probe timeout.
    const worstFinishMs = CITATION_ENQUEUE_DEADLINE_MS + CITATION_PROBE_TIMEOUT_MS;
    assert.equal(CITATION_ENQUEUE_DEADLINE_MS, 240_000);
    assert.equal(CITATION_PROBE_TIMEOUT_MS, 25_000);
    assert.equal(worstFinishMs, 265_000);
    assert.ok(worstFinishMs < ROUTE_MAX_MS, `${worstFinishMs}ms must be under ${ROUTE_MAX_MS}ms`);

    // Gating only the PLANNING phase would not hold: the full per-run ceiling at this
    // concurrency is far past the limit, which is why dispatch is gated too.
    const unboundedMs = (BASE_CONFIG.maxCallsPerRun / BASE_CONFIG.concurrency) * CITATION_PROBE_TIMEOUT_MS;
    assert.equal(unboundedMs, 750_000);
    assert.ok(unboundedMs > ROUTE_MAX_MS);
  });

  test('concurrency is bounded: never more workers in flight than configured', async () => {
    const h = harness({
      config: { concurrency: 4, maxQuestionsPerSite: 8 },
      questionCount: 8,
    });
    let inFlight = 0;
    let peak = 0;
    h.dependencies.adapters = [{
      engine: 'openai',
      probe: async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => { setTimeout(resolve, 1); });
        inFlight -= 1;
        return { engine: 'openai', status: 'ok', model: 'm', answerText: '', sources: [] };
      },
    }];
    await runCitationChecksCore(h.dependencies, { now: new Date('2026-08-02T12:00:00.000Z') });
    assert.equal(peak, 4);
  });
});

describe('[CITE$] per-site month and location resolution', () => {
  test('a US site uses its OWN time zone, never one global month', () => {
    // 08-01 05:00 UTC is 22:00 on 31 July in Los Angeles (PDT) and 01:00 on 1 August in
    // New York (EDT). One global month would file one of these two under the wrong month.
    const instant = new Date('2026-08-01T05:00:00.000Z');
    const la = site({ siteConfig: siteConfig({ timezone: 'America/Los_Angeles' }) });
    const ny = site({ siteConfig: siteConfig({ timezone: 'America/New_York' }) });
    assert.equal(citationRunMonthForSite(la, instant), '2026-07-01');
    assert.equal(citationRunMonthForSite(ny, instant), '2026-08-01');
  });

  test('a legacy/KR site keeps the Korean calendar it has always been reported on', () => {
    const kr = site({ siteConfig: siteConfig({ locale: undefined, timezone: undefined }) });
    // 31 July 15:30 UTC is already 1 August in Seoul.
    assert.equal(citationRunMonthForSite(kr, new Date('2026-07-31T15:30:00.000Z')), '2026-08-01');
    assert.equal(citationRunMonthForSite(kr, new Date('2026-07-31T14:30:00.000Z')), '2026-07-01');
  });

  test('a half-pinned US site falls back to Los Angeles rather than guessing', () => {
    const partial = site({ siteConfig: siteConfig({ timezone: undefined }) });
    assert.equal(citationRunMonthForSite(partial, new Date('2026-08-01T05:00:00.000Z')), '2026-07-01');
  });

  test('the probe carries region and country, the only geography a site actually stores', () => {
    const input = citationProbeInputForSite(site(), 'Which clinic is open?');
    assert.deepEqual(input.userLocation, {
      region: 'Lincoln Park',
      country: 'US',
      timezone: 'America/Los_Angeles',
    });
    assert.equal(input.locale, 'en-US');

    const noRegion = citationProbeInputForSite(
      site({ siteConfig: siteConfig({ region: undefined }) }),
      'q?',
    );
    // Providers require at least one field; country is the one we always know.
    assert.equal(noRegion.userLocation?.region, undefined);
    assert.equal(noRegion.userLocation?.country, 'US');
  });
});
