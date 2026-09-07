/**
 * The month, in one action.
 *
 * Before this, fulfilling a month meant a Provision button per site and then one Create click per
 * slot, each blocking on a call that can take 130 s: roughly 25–33 operator interactions per site
 * per month, and at a hundred customers ~800 typed topics and ~800 blocking requests. The three
 * properties that matter here are the same three the citation runner is built around, for the
 * same reasons:
 *
 *  1. COST. Every generation is a paid Anthropic call. Three brakes: a kill switch, a per-run
 *     ceiling, and a monthly ceiling counted from STORED version rows across every site, so a
 *     crash-and-retry cannot double spend. An unreadable count is treated as fully spent.
 *  2. THE 300 s ROUTE LIMIT. The deadline gates DISPATCH, not planning. `generation-tool.ts`
 *     bounds one request at 130 s, so the last generation may START at 170 s and must be done by
 *     300 s. Gating only the planning phase would blow this. That arithmetic leaves no slack by
 *     design: a run that overruns loses in-flight work, and the rows it already wrote stand, so
 *     the next daily run continues where this one stopped.
 *  3. IDEMPOTENCE. Provisioning fills only the ordinals a month is missing (0059, unique on
 *     (site, pricing_model_version, period_month, ordinal)), and only `draft` rows are generated.
 *     Re-running a month adds nothing to a slot that is pending, approved, published, or
 *     rejected — approval stays a human act, and this never publishes anything.
 *
 * The batch is deliberately not sized to finish a month in one run. It is designed to run daily
 * and converge: what the deadline or the caps leave behind is reported as `remaining` and picked
 * up tomorrow.
 */
import type { Site } from '@/lib/types/domain';
import { runWithConcurrency } from '@/lib/reporting/runner-core';
import type {
  AdminContentQueueItem,
  ContentQueueRepository,
} from '@/lib/admin/content-queue-core';
import { siteFulfillmentPlan } from './site-fulfillment';
import {
  contentTopicPool,
  selectMonthlyContentTopics,
  type ContentTopicPoolInput,
} from './topic-pool-core';
import type { ContentBatchConfig } from './batch-config';

/**
 * Dispatch stops here. 170 s + one 130 s request timeout = the route's 300 s ceiling
 * (`maxDuration = 300`). Stated again in `docs/ops/content-fulfillment-batch.md`; changing one
 * without the other is how a run starts a call it cannot finish.
 */
export const CONTENT_BATCH_DISPATCH_DEADLINE_MS = 170_000;

export type ContentBatchStop =
  | 'complete'
  | 'disabled'
  | 'run_cap'
  | 'month_cap'
  | 'deadline';

export interface ContentBatchSiteLog {
  siteId: string;
  siteName: string;
  periodMonth: string;
  timeZone: string;
  committed: number;
  /** Slots this run created; 0 on a month that was already provisioned. */
  provisioned: number;
  /** Abandoned `generating` rows this run released back to their previous state. */
  reclaimed: number;
  /** `draft` slots the run could have generated. */
  eligible: number;
  generated: number;
  failed: number;
  /** Eligible slots left undispatched by a cap or the deadline. */
  deferred: number;
  /** Set when the site was inspected and could not be worked on. */
  skippedReason?: ContentBatchSkipReason;
}

export type ContentBatchSkipReason =
  | 'not-published'
  | 'subscription-inactive'
  | 'contract-unresolved'
  | 'no-topics'
  | 'planning-failed';

export interface ContentBatchSummary {
  inspectedSites: number;
  eligibleSites: number;
  skippedSites: number;
  provisionedSlots: number;
  reclaimedSlots: number;
  generated: number;
  failed: number;
  /** Slots that were due and were not attempted in this run. */
  remaining: number;
  stoppedBy: ContentBatchStop;
  sites: ContentBatchSiteLog[];
}

export interface ContentBatchTopicContext extends ContentTopicPoolInput {
  industry: string;
}

export interface ContentBatchDependencies {
  listSites(): Promise<Site[]>;
  isSubscriptionActive(clientId: string, at: Date): Promise<boolean>;
  repository: ContentQueueRepository;
  /**
   * Topic material for one site, read from the same stored survey the generator's source snapshot
   * is built from. Null when the site has no survey — the batch then has nothing honest to write
   * about and skips the site rather than inventing a subject.
   */
  loadTopicContext(siteId: string): Promise<ContentBatchTopicContext | null>;
  /** One slot, all the way through the existing service: claim → generate → store, or fail. */
  generateSlot(input: { id: string; actorId: string; topic: string }): Promise<void>;
  /** Lands in append-only `content_post_events`; it can never be corrected afterwards. */
  actorId: string;
  config: ContentBatchConfig;
  /** Clock seam so a test can make the deadline bite without waiting three minutes. */
  elapsedMs?: () => number;
}

export interface ContentBatchOptions {
  now?: Date;
  deadlineMs?: number;
  /** Restricts the run to one site. The console's per-site action uses it; the cron does not. */
  siteId?: string;
}

/**
 * Mirrors `reporting/runner-core.ts` and `citation-check/runner-core.ts`: a site we actually
 * serve for a paying customer. Kept as a local copy for the same reason the citation runner keeps
 * one — the report runner's predicate is private to that module.
 */
function publishedSite(site: Site): boolean {
  return (
    (site.status === 'live' || site.status === 'pending_dns')
    && site.siteConfig !== null
    && site.publishedAt !== null
  );
}

/**
 * en-US first. The report and citation runners have no locale filter and neither does this, but
 * when a cap bites the US product is the one being launched, so it gets the budget first. Ties
 * break on name so the order is stable across runs and a site cannot be starved by reordering.
 */
export function orderSitesForContentBatch(sites: readonly Site[]): Site[] {
  return [...sites].sort((left, right) => {
    const leftUs = left.siteConfig?.meta.locale === 'en-US' ? 0 : 1;
    const rightUs = right.siteConfig?.meta.locale === 'en-US' ? 0 : 1;
    return leftUs - rightUs || left.name.localeCompare(right.name);
  });
}

/**
 * A `generating` row this run is allowed to release.
 *
 * `generating` is a lease with no expiry in the schema: a crashed run, a killed function, or a
 * request that outlived its own timeout leaves the slot in it forever, and neither the console
 * nor this batch can touch it again. Twenty minutes is well past the 130 s request timeout.
 */
export function isStaleGenerating(
  item: AdminContentQueueItem,
  now: Date,
  staleMs: number,
): boolean {
  if (item.status !== 'generating') return false;
  const updatedAt = Date.parse(item.updatedAt);
  if (!Number.isFinite(updatedAt)) return false;
  return now.getTime() - updatedAt >= staleMs;
}

/**
 * Where a reclaimed row goes back to.
 *
 * `fail_content_post_generation` only accepts draft or rejected, and the row itself says which it
 * came from: a slot that has never produced a version has no `current_version_id`, so it was
 * claimed from `draft`; one that has a version was claimed from `rejected` by a regeneration.
 * Sending the second back to `draft` would erase an operator's rejection and then let this batch
 * regenerate the post they had just turned down.
 */
export function reclaimRestoreStatus(item: AdminContentQueueItem): 'draft' | 'rejected' {
  return item.currentVersionId === null ? 'draft' : 'rejected';
}

/**
 * The statuses this batch generates.
 *
 * Seven exist in 0049. Only `draft` is generated: `generating` is in flight (or reclaimed above),
 * `pending_approval` is waiting on a human, `rejected` is a human decision this must not
 * overrule, and `published`/`approved` are done. `generated` and `approved` are declared by the
 * check constraint but no code path ever sets them — `store_content_post_generated` writes
 * `pending_approval` and `approve_and_publish_content_post` writes `published` — so there is no
 * `generated`-without-a-pending-version state to handle.
 */
function isGeneratable(item: AdminContentQueueItem): boolean {
  return item.status === 'draft';
}

interface BatchTask {
  item: AdminContentQueueItem;
  topic: string;
  periodMonth: string;
  log: ContentBatchSiteLog;
}

export async function runContentFulfillmentBatchCore(
  dependencies: ContentBatchDependencies,
  options: ContentBatchOptions = {},
): Promise<ContentBatchSummary> {
  const now = options.now ?? new Date();
  const deadlineMs = options.deadlineMs ?? CONTENT_BATCH_DISPATCH_DEADLINE_MS;
  const startedAt = Date.now();
  const elapsedMs = dependencies.elapsedMs ?? (() => Date.now() - startedAt);
  const { config, repository } = dependencies;

  const summary: ContentBatchSummary = {
    inspectedSites: 0,
    eligibleSites: 0,
    skippedSites: 0,
    provisionedSlots: 0,
    reclaimedSlots: 0,
    generated: 0,
    failed: 0,
    remaining: 0,
    stoppedBy: 'complete',
  sites: [],
  };
  if (!config.enabled) return { ...summary, stoppedBy: 'disabled' };

  // ---- Phase 1: what each site owes, and what is missing -----------------------
  const due: BatchTask[] = [];
  let stoppedBy: ContentBatchStop = 'complete';
  const allSites = await dependencies.listSites();
  const sites = orderSitesForContentBatch(
    options.siteId ? allSites.filter((site) => site.id === options.siteId) : allSites,
  );
  summary.inspectedSites = sites.length;
  const eligibility = new Map<string, Promise<boolean>>();

  for (const site of sites) {
    if (elapsedMs() >= deadlineMs) { stoppedBy = 'deadline'; break; }
    if (!publishedSite(site)) {
      summary.skippedSites += 1;
      continue;
    }
    const plan = siteFulfillmentPlan(site, now);
    const log: ContentBatchSiteLog = {
      siteId: site.id,
      siteName: site.name,
      periodMonth: plan.periodMonth,
      timeZone: plan.timeZone,
      committed: plan.committed ?? 0,
      provisioned: 0,
      reclaimed: 0,
      eligible: 0,
      generated: 0,
      failed: 0,
      deferred: 0,
    };
    try {
      let active = eligibility.get(site.clientId);
      if (!active) {
        active = dependencies.isSubscriptionActive(site.clientId, now);
        eligibility.set(site.clientId, active);
      }
      if (!(await active)) {
        summary.skippedSites += 1;
        summary.sites.push({ ...log, skippedReason: 'subscription-inactive' });
        continue;
      }
      if (!plan.pricingModelVersion || plan.committed === null) {
        // The same 409 the per-site button returns: no industry profile and pricing model
        // version means there is no contract to bill a month of content against.
        summary.skippedSites += 1;
        summary.sites.push({ ...log, skippedReason: 'contract-unresolved' });
        continue;
      }

      const provisioned = await repository.provisionMonthlySlots({
        clientId: site.clientId,
        siteId: site.id,
        pricingModelVersion: plan.pricingModelVersion,
        periodMonth: plan.periodMonth,
        count: plan.committed,
        actorId: dependencies.actorId,
      });
      log.provisioned = provisioned.created;
      summary.provisionedSlots += provisioned.created;

      // Release abandoned leases before deciding what is generatable, so a slot stuck since a
      // crashed run rejoins this month instead of being lost until someone notices.
      const items = [...provisioned.items];
      for (const [index, item] of items.entries()) {
        if (!isStaleGenerating(item, now, config.staleGeneratingMs)) continue;
        const restoreStatus = reclaimRestoreStatus(item);
        try {
          await repository.failGeneration({
            id: item.id,
            actorId: dependencies.actorId,
            restoreStatus,
            reason: 'content batch reclaimed an abandoned generation lease',
          });
          items[index] = { ...item, status: restoreStatus };
          log.reclaimed += 1;
          summary.reclaimedSlots += 1;
        } catch {
          // A row that refuses to be released is left exactly as it was; the next run retries.
        }
      }

      const generatable = items
        .filter(isGeneratable)
        .sort((left, right) => left.ordinal - right.ordinal);
      log.eligible = generatable.length;
      if (generatable.length === 0) {
        summary.eligibleSites += 1;
        summary.sites.push(log);
        continue;
      }

      const context = await dependencies.loadTopicContext(site.id);
      if (!context) {
        summary.skippedSites += 1;
        summary.sites.push({ ...log, skippedReason: 'no-topics' });
        continue;
      }
      // History first, so a subject the customer already has an article about goes to the back.
      const history = await repository.listBySites({
        siteIds: [site.id],
        beforePeriodMonth: plan.periodMonth,
        order: 'desc',
        limit: 60,
      });
      const usedTitles = [...history, ...items]
        .map((item) => item.currentVersion?.title ?? '')
        .filter((title) => title.length > 0);
      const topics = selectMonthlyContentTopics({
        pool: contentTopicPool(context),
        usedTitles,
        siteId: site.id,
        periodMonth: plan.periodMonth,
        count: plan.committed,
      });
      if (topics.length === 0) {
        summary.skippedSites += 1;
        summary.sites.push({ ...log, skippedReason: 'no-topics' });
        continue;
      }

      summary.eligibleSites += 1;
      summary.sites.push(log);
      for (const item of generatable) {
        // Ordinals run 1..committed; a slot outside that window (a shrunken contract) still gets
        // a topic by wrapping rather than being left with none.
        const selected = topics[(item.ordinal - 1) % topics.length]!;
        due.push({ item, topic: selected.candidate.topic, periodMonth: plan.periodMonth, log });
      }
    } catch {
      // One site's planning failure is contained; every other site still runs.
      summary.skippedSites += 1;
      summary.sites.push({ ...log, skippedReason: 'planning-failed' });
    }
  }

  // ---- Phase 2: how much of it the budget allows ------------------------------
  const monthlySpend = new Map<string, number>();
  const monthlySpentFor = async (periodMonth: string): Promise<number> => {
    const known = monthlySpend.get(periodMonth);
    if (known !== undefined) return known;
    let stored: number;
    try {
      stored = await repository.countGeneratedVersionsForMonth(periodMonth);
    } catch {
      // Unknown spend is treated as fully spent: fail closed rather than double spend.
      stored = config.maxGenerationsPerMonth;
    }
    monthlySpend.set(periodMonth, stored);
    return stored;
  };

  const tasks: BatchTask[] = [];
  for (const task of due) {
    if (tasks.length >= config.maxGenerationsPerRun) { stoppedBy = 'run_cap'; break; }
    const spent = await monthlySpentFor(task.periodMonth);
    if (spent >= config.maxGenerationsPerMonth) { stoppedBy = 'month_cap'; break; }
    // Reserve against the month as we select, so one run cannot overshoot the cap.
    monthlySpend.set(task.periodMonth, spent + 1);
    tasks.push(task);
  }

  // ---- Phase 3: generate ------------------------------------------------------
  let dispatched = 0;
  await runWithConcurrency(tasks, Math.max(1, config.concurrency), async (task) => {
    // The deadline gates DISPATCH, not just planning: the pool stops pulling new work, so the
    // whole run finishes within the deadline plus one request timeout.
    if (elapsedMs() >= deadlineMs) {
      if (stoppedBy === 'complete') stoppedBy = 'deadline';
      return;
    }
    dispatched += 1;
    try {
      await dependencies.generateSlot({
        id: task.item.id,
        actorId: dependencies.actorId,
        topic: task.topic,
      });
      task.log.generated += 1;
      summary.generated += 1;
    } catch {
      // The service already restored the slot's status and wrote the failure event, and the
      // generator's own safe-catalog fallback still applies inside it. A failure is one row, not
      // the end of the batch.
      task.log.failed += 1;
      summary.failed += 1;
    }
  });

  summary.remaining = Math.max(0, due.length - dispatched);
  for (const task of due.slice(dispatched)) task.log.deferred += 1;
  summary.stoppedBy = stoppedBy;
  return summary;
}
