/**
 * [CITE$] The monthly probe run.
 *
 * Three properties matter more than throughput here:
 *
 *  1. COST. Every probe is real money ($10 per 1,000 searches on two of the four
 *     providers). Three independent brakes exist: a per-run ceiling, a monthly ceiling
 *     counted from STORED rows across all sites (so a crash-and-retry cannot double
 *     spend), and a kill switch.
 *  2. THE 300 s ROUTE LIMIT. Workers check the deadline before starting each probe, not
 *     only while planning. With 4 workers, a 25 s per-probe timeout and a 240 s deadline,
 *     the last probe can start just under 240 s and must finish by 265 s — inside 300 s.
 *     Gating only the planning phase would blow this: 120 calls / 4 workers x 25 s = 750 s.
 *  3. IDEMPOTENCE. The identity of a probe is (site, question, engine, run_month), so
 *     re-running a month fills only the missing pairs. That is what lets this run daily
 *     and be a no-op after the first few days of each month.
 */
import type { Site } from '@/lib/types/domain';
import { DEFAULT_US_SITE_TIMEZONE } from '@/lib/types/site';
import { currentMonthStartDateInTimeZone } from '@/lib/reporting/period';
import { runWithConcurrency } from '@/lib/reporting/runner-core';
import { judgeProbe } from './judge';
import {
  citationIdentityForSite,
  citationIdentityIsMeasurable,
} from './identity';
import type { CitationCheckRepository, CitationQuestionRecord } from './repository-core';
import type {
  CitationEngineAdapter,
  CitationIdentity,
  CitationProbeInput,
  CitationProbeStatus,
} from './types';

/** Leaves one full probe timeout (25 s) of headroom under the route's 300 s ceiling. */
export const CITATION_ENQUEUE_DEADLINE_MS = 240_000;

export type CitationRunStop =
  | 'complete'
  | 'disabled'
  | 'run_cap'
  | 'month_cap'
  | 'deadline';

export interface CitationRunSummary {
  sitesTouched: number;
  probes: { ok: number; notConfigured: number; error: number; skipped: number };
  /** Pairs that were due this month and were not attempted in this run. */
  remaining: number;
  stoppedBy: CitationRunStop;
}

export interface CitationRunnerConfig {
  enabled: boolean;
  maxQuestionsPerSite: number;
  maxCallsPerRun: number;
  maxCallsPerMonth: number;
  concurrency: number;
}

export interface CitationRunnerDependencies {
  listSites(): Promise<Site[]>;
  isSubscriptionActive(clientId: string, at: Date): Promise<boolean>;
  repository: CitationCheckRepository;
  ensureQuestions(input: {
    siteId: string;
    site: Site;
    maxQuestions: number;
  }): Promise<CitationQuestionRecord[]>;
  adapters: readonly CitationEngineAdapter[];
  config: CitationRunnerConfig;
  /** Clock seam so a test can make the deadline bite without waiting four minutes. */
  elapsedMs?: () => number;
}

export interface CitationRunOptions {
  now?: Date;
  deadlineMs?: number;
}

/** Mirrors `reporting/runner-core.ts`: a site we actually serve for a paying customer. */
function publishedSite(site: Site): boolean {
  return (
    (site.status === 'live' || site.status === 'pending_dns')
    && site.siteConfig !== null
    && site.publishedAt !== null
  );
}

/**
 * The month a probe belongs to, in the SITE'S own time zone. A Los Angeles site rolls
 * over sixteen hours after a Korean one, so a single global month would file the
 * first-of-month probes under the wrong month for one of them.
 */
export function citationRunMonthForSite(site: Site, now: Date): string {
  const meta = site.siteConfig?.meta;
  if (meta?.locale === 'en-US') {
    return currentMonthStartDateInTimeZone(meta.timezone ?? DEFAULT_US_SITE_TIMEZONE, now);
  }
  // Legacy/KR sites keep the Korean calendar they have always been reported on.
  return `${new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  }).format(now)}-01`;
}

export function citationProbeInputForSite(site: Site, question: string): CitationProbeInput {
  const meta = site.siteConfig?.meta;
  const isUs = meta?.locale === 'en-US';
  const region = meta?.region?.trim();
  return {
    question,
    locale: meta?.locale ?? 'ko-KR',
    userLocation: {
      ...(region ? { region } : {}),
      // A provider needs at least one location field; country is the one we always know.
      country: isUs ? 'US' : 'KR',
      timezone: isUs ? (meta?.timezone ?? DEFAULT_US_SITE_TIMEZONE) : 'Asia/Seoul',
    },
  };
}

interface DuePair {
  site: Site;
  runMonth: string;
  question: CitationQuestionRecord;
  adapter: CitationEngineAdapter;
  identity: CitationIdentity;
}

/**
 * A site with no domain (and no hosted host to compare against) cannot be measured for
 * LINKED at all. It gets one `skipped` row per pair so the gap stays visible and is
 * never re-attempted, and it spends no budget: no API call is made.
 */
const NO_DOMAIN_ERROR_CODE = 'NO_DOMAIN';

export async function runCitationChecksCore(
  dependencies: CitationRunnerDependencies,
  options: CitationRunOptions = {},
): Promise<CitationRunSummary> {
  const now = options.now ?? new Date();
  const deadlineMs = options.deadlineMs ?? CITATION_ENQUEUE_DEADLINE_MS;
  const startedAt = Date.now();
  const elapsedMs = dependencies.elapsedMs ?? (() => Date.now() - startedAt);
  const { config } = dependencies;

  const summary: CitationRunSummary = {
    sitesTouched: 0,
    probes: { ok: 0, notConfigured: 0, error: 0, skipped: 0 },
    remaining: 0,
    stoppedBy: 'complete',
  };
  if (!config.enabled) return { ...summary, stoppedBy: 'disabled' };

  const countStatus = (status: CitationProbeStatus): void => {
    if (status === 'ok') summary.probes.ok += 1;
    else if (status === 'not_configured') summary.probes.notConfigured += 1;
    else if (status === 'error') summary.probes.error += 1;
    else summary.probes.skipped += 1;
  };

  const writeProbe = async (input: Parameters<CitationCheckRepository['insertProbe']>[0]) => {
    try {
      await dependencies.repository.insertProbe(input);
      countStatus(input.status);
    } catch {
      // One row's failure must never stop another site's work. The unique key means the
      // pair is simply retried on the next daily run.
    }
  };

  // ---- Phase 1: what is due this month, for every eligible site --------------
  const due: DuePair[] = [];
  let stoppedBy: CitationRunStop = 'complete';
  const sites = await dependencies.listSites();
  const eligibility = new Map<string, Promise<boolean>>();

  for (const site of sites) {
    if (elapsedMs() >= deadlineMs) { stoppedBy = 'deadline'; break; }
    if (!publishedSite(site)) continue;
    try {
      let active = eligibility.get(site.clientId);
      if (!active) {
        active = dependencies.isSubscriptionActive(site.clientId, now);
        eligibility.set(site.clientId, active);
      }
      if (!(await active)) continue;

      const runMonth = citationRunMonthForSite(site, now);
      const questions = await dependencies.ensureQuestions({
        siteId: site.id,
        site,
        maxQuestions: config.maxQuestionsPerSite,
      });
      if (questions.length === 0) continue;

      const stored = await dependencies.repository.listProbes({ siteId: site.id, runMonth });
      const done = new Set(stored.map((row) => `${row.questionId}:${row.engine}`));
      const identity = citationIdentityForSite(site);
      const measurable = citationIdentityIsMeasurable(identity);
      let siteTouched = false;

      for (const question of questions) {
        for (const adapter of dependencies.adapters) {
          if (done.has(`${question.id}:${adapter.engine}`)) continue;
          siteTouched = true;
          if (measurable) {
            due.push({ site, runMonth, question, adapter, identity });
          } else {
            // No API call, no budget: record the gap and move on.
            await writeProbe({
              siteId: site.id,
              questionId: question.id,
              engine: adapter.engine,
              runMonth,
              status: 'skipped',
              named: false,
              linked: false,
              answerExcerpt: '',
              sources: [],
              model: '',
              errorCode: NO_DOMAIN_ERROR_CODE,
            });
          }
        }
      }
      if (siteTouched) summary.sitesTouched += 1;
    } catch {
      // A single site's planning failure is contained; the others still run.
    }
  }

  // ---- Phase 2: how much of it the budget allows -----------------------------
  const monthlySpend = new Map<string, number>();
  const monthlyBudgetFor = async (runMonth: string): Promise<number> => {
    const known = monthlySpend.get(runMonth);
    if (known !== undefined) return known;
    let stored: number;
    try {
      stored = await dependencies.repository.countProbesForMonth(runMonth);
    } catch {
      // Unknown spend is treated as fully spent: fail closed rather than double spend.
      stored = config.maxCallsPerMonth;
    }
    monthlySpend.set(runMonth, stored);
    return stored;
  };

  const tasks: DuePair[] = [];
  for (const pair of due) {
    if (tasks.length >= config.maxCallsPerRun) { stoppedBy = 'run_cap'; break; }
    const spent = await monthlyBudgetFor(pair.runMonth);
    if (spent >= config.maxCallsPerMonth) { stoppedBy = 'month_cap'; break; }
    // Reserve against the month as we select, so one run cannot overshoot the cap.
    monthlySpend.set(pair.runMonth, spent + 1);
    tasks.push(pair);
  }

  // ---- Phase 3: probe ---------------------------------------------------------
  let dispatched = 0;
  await runWithConcurrency(tasks, Math.max(1, config.concurrency), async (task) => {
    // The deadline gates DISPATCH, not just planning: the pool stops pulling new work,
    // so the whole run finishes within deadline + one probe timeout.
    if (elapsedMs() >= deadlineMs) {
      if (stoppedBy === 'complete') stoppedBy = 'deadline';
      return;
    }
    dispatched += 1;

    let result;
    try {
      result = await task.adapter.probe(
        citationProbeInputForSite(task.site, task.question.question),
      );
    } catch {
      // An adapter is contracted never to throw; if one ever does, it is still one row.
      result = {
        engine: task.adapter.engine,
        status: 'error' as const,
        model: '',
        answerText: '',
        sources: [],
        errorCode: 'ADAPTER_THREW',
      };
    }

    const verdict = result.status === 'ok'
      ? judgeProbe({ answerText: result.answerText, sources: result.sources }, task.identity)
      : { named: false, linked: false, nameHits: [], linkedHosts: [] };

    await writeProbe({
      siteId: task.site.id,
      questionId: task.question.id,
      engine: task.adapter.engine,
      runMonth: task.runMonth,
      status: result.status,
      named: verdict.named,
      linked: verdict.linked,
      answerExcerpt: result.status === 'ok' ? result.answerText : '',
      sources: result.sources,
      model: result.model,
      errorCode: result.errorCode ?? null,
    });
  });

  summary.remaining = Math.max(0, due.length - dispatched);
  summary.stoppedBy = stoppedBy;
  return summary;
}
