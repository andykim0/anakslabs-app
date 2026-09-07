/**
 * The monthly batch: the properties that make it safe to leave running unattended.
 *
 * Everything here drives `runContentFulfillmentBatchCore` against the in-memory repository the
 * console uses in mock mode. No network, no provider, no database.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { MockContentQueueRepository } from '@/lib/admin/content-queue-repository-mock';
import type { ContentQueueRepository } from '@/lib/admin/content-queue-core';
import { PRICING_MODEL_VERSION } from '@/lib/pricing';
import type { Site } from '@/lib/types/domain';
import {
  CONTENT_BATCH_DISPATCH_DEADLINE_MS,
  isStaleGenerating,
  orderSitesForContentBatch,
  reclaimRestoreStatus,
  runContentFulfillmentBatchCore,
  type ContentBatchDependencies,
} from '../batch-core';
import { CONTENT_BATCH_DEFAULTS } from '../batch-config';
import { currentMonthStartDateInTimeZone } from '@/lib/reporting/period';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const SITE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_SITE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOW = new Date('2026-09-07T12:00:00.000Z');
const PERIOD = currentMonthStartDateInTimeZone('America/Denver', NOW);

/** Loose overrides on purpose: several cases need a partial `siteConfig` the real type
 *  would reject, and the whole object is cast to `Site` at the end anyway. */
function site(overrides: Record<string, unknown> = {}): Site {
  return {
    id: SITE_ID,
    clientId: CLIENT_ID,
    name: 'Summit Dental Studio',
    domain: 'summit-dental.anakslabs.com',
    status: 'live',
    publishedAt: '2026-08-01T00:00:00.000Z',
    industryProfileId: 'clinic',
    pricingModelVersion: PRICING_MODEL_VERSION,
    siteConfig: { meta: { timezone: 'America/Denver', locale: 'en-US' } },
    draftConfig: null,
    ...overrides,
  } as unknown as Site;
}

interface Harness {
  repository: MockContentQueueRepository;
  dependencies: ContentBatchDependencies;
  generated: Array<{ id: string; topic: string; actorId: string }>;
}

function harness(input: {
  sites?: Site[];
  config?: Partial<ContentBatchDependencies['config']>;
  generateSlot?: ContentBatchDependencies['generateSlot'];
  elapsedMs?: () => number;
  repository?: MockContentQueueRepository;
  loadTopicContext?: ContentBatchDependencies['loadTopicContext'];
} = {}): Harness {
  const repository = input.repository ?? new MockContentQueueRepository();
  const generated: Array<{ id: string; topic: string; actorId: string }> = [];
  const dependencies: ContentBatchDependencies = {
    listSites: async () => input.sites ?? [site()],
    isSubscriptionActive: async () => true,
    repository,
    loadTopicContext: input.loadTopicContext ?? (async () => ({
      industry: 'Dental practice',
      purposeId: 'booking_service',
      survey: null,
    })),
    generateSlot: input.generateSlot ?? (async ({ id, topic, actorId }) => {
      generated.push({ id, topic, actorId });
      // Mirrors the real service: claim, then store, which lands the slot on pending_approval.
      await repository.claimGeneration({ id, actorId, regeneration: false });
      await repository.storeGenerated({ id, actorId, generated: version() });
    }),
    actorId: 'cron:content-fulfillment',
    config: {
      enabled: true,
      maxGenerationsPerRun: CONTENT_BATCH_DEFAULTS.maxGenerationsPerRun,
      maxGenerationsPerMonth: CONTENT_BATCH_DEFAULTS.maxGenerationsPerMonth,
      concurrency: CONTENT_BATCH_DEFAULTS.concurrency,
      staleGeneratingMs: CONTENT_BATCH_DEFAULTS.staleGeneratingMinutes * 60_000,
      ...input.config,
    },
    ...(input.elapsedMs ? { elapsedMs: input.elapsedMs } : {}),
  };
  return { repository, dependencies, generated };
}

/**
 * The in-memory repository stamps `updatedAt` from the wall clock, which would make the staleness
 * window depend on when the suite happens to run. This shadows one method so a lease has a known
 * age against a fixed `now`, and leaves every other method on the real object.
 */
function withLeaseAge(
  repository: MockContentQueueRepository,
  updatedAt: string,
): ContentQueueRepository {
  const wrapped = Object.create(repository) as ContentQueueRepository;
  wrapped.provisionMonthlySlots = async (input) => {
    const result = await repository.provisionMonthlySlots(input);
    return {
      ...result,
      items: result.items.map((item) =>
        (item.status === 'generating' ? { ...item, updatedAt } : item)),
    };
  };
  return wrapped;
}

function version() {
  return {
    post: {
      slug: 'what-to-expect',
      title: 'What to expect at your first visit',
      titleSourceRefs: [],
      summary: 'A short checklist you can prepare before the appointment.',
      summarySourceRefs: [],
      tags: ['first visit'],
      document: {
        version: 1,
        blocks: [{ type: 'paragraph', text: 'Ask what the office needs from you in advance.' }],
      },
    },
    sourceSnapshot: {},
    sourceSnapshotSha256: 'a'.repeat(64),
    sourceRefs: [],
    policyVersions: {},
    validationEvidence: {},
    generationMetadata: { attempt: 1, externalImageCostKrw: 0, rawHtml: false },
  } as unknown as Parameters<ContentQueueRepository['storeGenerated']>[0]['generated'];
}

describe('the monthly batch fulfils a month in one action', () => {
  test('an unprovisioned month goes from nothing to a full set of pending drafts', async () => {
    const { repository, dependencies, generated } = harness();
    const summary = await runContentFulfillmentBatchCore(dependencies, { now: NOW });

    assert.equal(summary.eligibleSites, 1);
    assert.equal(summary.provisionedSlots, 8, 'the clinic contract owes eight posts a month');
    assert.equal(summary.generated, 8);
    assert.equal(summary.failed, 0);
    assert.equal(summary.remaining, 0);
    assert.equal(summary.stoppedBy, 'complete');

    const slots = await repository.listBySites({ siteIds: [SITE_ID], periodMonths: [PERIOD] });
    assert.equal(slots.length, 8);
    assert.ok(slots.every((slot) => slot.status === 'pending_approval'), 'nothing is published');
    assert.equal(new Set(generated.map((call) => call.topic)).size, 8, 'eight distinct topics');
  });

  test('re-running the same month adds nothing', async () => {
    const first = harness();
    await runContentFulfillmentBatchCore(first.dependencies, { now: NOW });

    const second = harness({ repository: first.repository });
    const summary = await runContentFulfillmentBatchCore(second.dependencies, { now: NOW });
    assert.equal(summary.provisionedSlots, 0);
    assert.equal(summary.generated, 0);
    assert.equal(second.generated.length, 0, 'no second paid call for an already-written slot');
    assert.equal(
      (await first.repository.listBySites({ siteIds: [SITE_ID], periodMonths: [PERIOD] })).length,
      8,
    );
  });

  test('the actor recorded on every slot is the one the runner was given', async () => {
    const { repository, dependencies } = harness();
    await runContentFulfillmentBatchCore(dependencies, { now: NOW });
    const events = repository.slotCreatedEvents();
    assert.equal(events.length, 8);
    assert.ok(events.every((event) => event.actorId === 'cron:content-fulfillment'));
  });
});

describe('the batch only touches the statuses it is allowed to', () => {
  test('pending, rejected and published slots are never regenerated', async () => {
    const first = harness();
    await runContentFulfillmentBatchCore(first.dependencies, { now: NOW });
    const slots = await first.repository.listBySites({
      siteIds: [SITE_ID],
      periodMonths: [PERIOD],
    });

    // One rejected, one published, six left pending.
    await first.repository.reject({
      id: slots[0]!.id,
      expectedVersionId: slots[0]!.currentVersionId!,
      actorId: 'admin',
      reason: 'The tone is wrong for this practice.',
    });
    await first.repository.approveAndPublish({
      id: slots[1]!.id,
      expectedVersionId: slots[1]!.currentVersionId!,
      actorId: 'admin',
      sourceSnapshotSha256: 'a'.repeat(64),
      honestyPolicyVersion: 'x',
      medicalPolicyVersion: 'y',
      validatedDocumentSha256: 'b'.repeat(64),
    });

    const second = harness({ repository: first.repository });
    const summary = await runContentFulfillmentBatchCore(second.dependencies, { now: NOW });
    assert.equal(summary.generated, 0);
    assert.equal(second.generated.length, 0);

    const after = await first.repository.listBySites({
      siteIds: [SITE_ID],
      periodMonths: [PERIOD],
    });
    assert.equal(after.find((slot) => slot.id === slots[0]!.id)?.status, 'rejected');
    assert.equal(after.find((slot) => slot.id === slots[1]!.id)?.status, 'published');
  });

  test('an abandoned generating lease is released, and one from a rejection goes back to rejected', async () => {
    const { repository, dependencies } = harness();
    await runContentFulfillmentBatchCore(dependencies, { now: NOW });
    const slots = await repository.listBySites({ siteIds: [SITE_ID], periodMonths: [PERIOD] });

    // A first-generation lease: claimed from draft, so it has no version.
    const fresh = await repository.provisionMonthlySlots({
      clientId: CLIENT_ID,
      siteId: OTHER_SITE_ID,
      pricingModelVersion: PRICING_MODEL_VERSION,
      periodMonth: PERIOD,
      count: 1,
      actorId: 'admin',
    });
    await repository.claimGeneration({
      id: fresh.items[0]!.id,
      actorId: 'admin',
      regeneration: false,
    });

    // A regeneration lease: rejected first, so it carries a version.
    await repository.reject({
      id: slots[0]!.id,
      expectedVersionId: slots[0]!.currentVersionId!,
      actorId: 'admin',
      reason: 'Regenerate with a different angle.',
    });
    await repository.claimGeneration({
      id: slots[0]!.id,
      actorId: 'admin',
      regeneration: true,
    });

    const stranded = await repository.getById(slots[0]!.id);
    const strandedFresh = await repository.getById(fresh.items[0]!.id);
    assert.equal(stranded?.status, 'generating');
    assert.equal(strandedFresh?.status, 'generating');
    assert.equal(reclaimRestoreStatus(stranded!), 'rejected');
    assert.equal(reclaimRestoreStatus(strandedFresh!), 'draft');

    const second = harness({
      repository,
      sites: [site(), site({ id: OTHER_SITE_ID, name: 'Second Site' })],
    });
    // Both leases are an hour old against the run's clock; the window is twenty minutes.
    second.dependencies.repository = withLeaseAge(repository, '2026-09-07T11:00:00.000Z');
    const summary = await runContentFulfillmentBatchCore(second.dependencies, { now: NOW });

    assert.equal(summary.reclaimedSlots, 2);
    assert.equal(
      (await repository.getById(slots[0]!.id))?.status,
      'rejected',
      'a rejection the operator made is not silently undone by a reclaim',
    );
    // The freshly reclaimed draft is generated in the same run; the rejected one is not.
    const touched = new Set(second.generated.map((call) => call.id));
    assert.ok(touched.has(fresh.items[0]!.id), 'the released draft rejoins this month');
    assert.ok(!touched.has(slots[0]!.id), 'a rejected slot is never regenerated by the batch');
  });

  test('the staleness window is respected, not just the status', () => {
    const item = {
      status: 'generating',
      currentVersionId: null,
      updatedAt: NOW.toISOString(),
    } as never;
    const window = CONTENT_BATCH_DEFAULTS.staleGeneratingMinutes * 60_000;
    assert.equal(isStaleGenerating(item, new Date(NOW.getTime() + 60_000), window), false);
    assert.equal(isStaleGenerating(item, new Date(NOW.getTime() + window), window), true);
    assert.equal(
      isStaleGenerating({ ...(item as object), status: 'draft' } as never, NOW, window),
      false,
    );
  });
});

describe('cost and time guards', () => {
  test('the kill switch stops the run before it reads a single site', async () => {
    let listed = false;
    const { dependencies } = harness({ config: { enabled: false } });
    dependencies.listSites = async () => { listed = true; return [site()]; };
    const summary = await runContentFulfillmentBatchCore(dependencies, { now: NOW });
    assert.equal(summary.stoppedBy, 'disabled');
    assert.equal(summary.generated, 0);
    assert.equal(listed, false);
  });

  test('the per-run cap bounds the calls and reports the rest as remaining', async () => {
    const { dependencies, generated } = harness({ config: { maxGenerationsPerRun: 3 } });
    const summary = await runContentFulfillmentBatchCore(dependencies, { now: NOW });
    assert.equal(summary.generated, 3);
    assert.equal(generated.length, 3);
    assert.equal(summary.remaining, 5);
    assert.equal(summary.stoppedBy, 'run_cap');
  });

  test('the monthly cap is counted from stored version rows, so a re-run cannot double spend', async () => {
    const first = harness({ config: { maxGenerationsPerMonth: 5 } });
    const one = await runContentFulfillmentBatchCore(first.dependencies, { now: NOW });
    assert.equal(one.generated, 5);
    assert.equal(one.stoppedBy, 'month_cap');
    assert.equal(await first.repository.countGeneratedVersionsForMonth(PERIOD), 5);

    // Nothing about the next run's own tally matters: the five rows already written are the spend.
    const second = harness({ repository: first.repository, config: { maxGenerationsPerMonth: 5 } });
    const two = await runContentFulfillmentBatchCore(second.dependencies, { now: NOW });
    assert.equal(two.generated, 0);
    assert.equal(two.stoppedBy, 'month_cap');
    assert.equal(second.generated.length, 0);
  });

  test('an unreadable monthly count is treated as fully spent, not as zero', async () => {
    const { repository, dependencies, generated } = harness();
    const unreadable = Object.create(repository) as ContentQueueRepository;
    unreadable.countGeneratedVersionsForMonth = async () => {
      throw new Error('database unreachable');
    };
    dependencies.repository = unreadable;
    const summary = await runContentFulfillmentBatchCore(dependencies, { now: NOW });
    assert.equal(summary.generated, 0);
    assert.equal(generated.length, 0, 'a budget we cannot read is a budget we do not spend');
    assert.equal(summary.stoppedBy, 'month_cap');
  });

  test('the deadline gates dispatch, not only planning', async () => {
    let elapsed = 0;
    let calls = 0;
    const { dependencies } = harness({
      config: { concurrency: 1 },
      elapsedMs: () => elapsed,
      generateSlot: async () => { calls += 1; elapsed += 80_000; },
    });
    const summary = await runContentFulfillmentBatchCore(dependencies, {
      now: NOW,
      deadlineMs: CONTENT_BATCH_DISPATCH_DEADLINE_MS,
    });
    // 0 s, 80 s and 160 s are all under 170 s; the fourth would start at 240 s and does not.
    assert.equal(calls, 3);
    assert.equal(summary.generated, 3);
    assert.equal(summary.remaining, 5);
    assert.equal(summary.stoppedBy, 'deadline');
  });

  test('the dispatch deadline plus one request timeout is the route budget', async () => {
    const { CONTENT_POST_GENERATION_REQUEST_TIMEOUT_MS } = await import('../generation-tool');
    assert.equal(
      CONTENT_BATCH_DISPATCH_DEADLINE_MS + CONTENT_POST_GENERATION_REQUEST_TIMEOUT_MS,
      300_000,
      'maxDuration = 300 on the cron route is what this arithmetic is against',
    );
  });
});

describe('one failure never costs the rest of the batch', () => {
  test('a slot that throws is counted and the run continues', async () => {
    let call = 0;
    const { dependencies } = harness({
      generateSlot: async () => {
        call += 1;
        if (call % 2 === 1) throw new Error('the policy gate refused this draft');
      },
    });
    const summary = await runContentFulfillmentBatchCore(dependencies, { now: NOW });
    assert.equal(summary.generated, 4);
    assert.equal(summary.failed, 4);
    assert.equal(summary.stoppedBy, 'complete');
  });

  test("one site's planning failure never blocks another site", async () => {
    const { dependencies } = harness({
      sites: [site(), site({ id: OTHER_SITE_ID, name: 'Second Site' })],
      loadTopicContext: async (siteId) => (siteId === SITE_ID
        ? null
        : { industry: 'Dental practice', purposeId: 'booking_service', survey: null }),
    });
    const summary = await runContentFulfillmentBatchCore(dependencies, { now: NOW });
    assert.equal(summary.skippedSites, 1);
    assert.equal(summary.eligibleSites, 1);
    assert.equal(summary.generated, 8);
    assert.equal(
      summary.sites.find((entry) => entry.siteId === SITE_ID)?.skippedReason,
      'no-topics',
    );
  });
});

describe('site selection', () => {
  test('an unpublished site and an inactive subscription are both skipped', async () => {
    const draft = harness({ sites: [site({ status: 'draft', publishedAt: null })] });
    const draftSummary = await runContentFulfillmentBatchCore(draft.dependencies, { now: NOW });
    assert.equal(draftSummary.eligibleSites, 0);
    assert.equal(draftSummary.skippedSites, 1);
    assert.equal(draftSummary.generated, 0);

    const lapsed = harness();
    lapsed.dependencies.isSubscriptionActive = async () => false;
    const lapsedSummary = await runContentFulfillmentBatchCore(lapsed.dependencies, { now: NOW });
    assert.equal(lapsedSummary.generated, 0);
    assert.equal(
      lapsedSummary.sites[0]?.skippedReason,
      'subscription-inactive',
    );
  });

  test('a site with no industry profile and pricing model version is skipped, not guessed at', async () => {
    const { dependencies } = harness({
      sites: [site({ industryProfileId: null, pricingModelVersion: null })],
    });
    const summary = await runContentFulfillmentBatchCore(dependencies, { now: NOW });
    assert.equal(summary.provisionedSlots, 0);
    assert.equal(summary.sites[0]?.skippedReason, 'contract-unresolved');
  });

  test('en-US sites are ordered first so a cap takes from the legacy roster', () => {
    const ordered = orderSitesForContentBatch([
      site({ id: '1', name: 'Zeta KR', siteConfig: { meta: { locale: 'ko-KR' } } }),
      site({ id: '2', name: 'Beta KR', siteConfig: { meta: { locale: 'ko-KR' } } }),
      site({ id: '3', name: 'Zeta US', siteConfig: { meta: { locale: 'en-US' } } }),
      site({ id: '4', name: 'Alpha US', siteConfig: { meta: { locale: 'en-US' } } }),
    ]);
    assert.deepEqual(ordered.map((entry) => entry.name), [
      'Alpha US',
      'Zeta US',
      'Beta KR',
      'Zeta KR',
    ]);
  });

  test('a run can be narrowed to one site without touching the others', async () => {
    const { repository, dependencies } = harness({
      sites: [site(), site({ id: OTHER_SITE_ID, name: 'Second Site' })],
    });
    const summary = await runContentFulfillmentBatchCore(dependencies, {
      now: NOW,
      siteId: OTHER_SITE_ID,
    });
    assert.equal(summary.inspectedSites, 1);
    assert.equal(summary.generated, 8);
    assert.equal(
      (await repository.listBySites({ siteIds: [SITE_ID] })).length,
      0,
      'the site that was not named has no slots at all',
    );
  });
});
