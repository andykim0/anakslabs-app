/**
 * PUBLISHED-REWORK — `published` stops being a dead end.
 *
 * A slot filled by a safe-catalog fallback under an operator override used to be final: the month
 * could never reach N/N delivered, and the only way to get different text in front of a customer
 * was to publish it on a different slot. Rework replaces the text in place, and it must do so
 * without the post ever leaving the air and without anything reaching the customer's screen before
 * an operator approves it.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  ContentQueueError,
  hasStagedRework,
  projectAdminContentItem,
  type AdminContentQueueItem,
} from '@/lib/admin/content-queue-core';
import { MockContentQueueRepository } from '@/lib/admin/content-queue-repository-mock';
import { CONTENT_REWORK_REFUSAL_MESSAGES } from '@/lib/admin/content-rework-policy';
import {
  deliveredCountForPeriod,
  isSafeCatalogSlot,
} from '@/lib/content-fulfillment/delivery';
import {
  MockPublishedContentPostsRepository,
  publishedRowsFromQueueItems,
} from '@/lib/content-fulfillment/repository-mock';
import type { GeneratedContentPostVersion } from '@/lib/content-fulfillment/generation';
import { PRICING_MODEL_VERSION } from '@/lib/pricing';
import type { Site } from '@/lib/types/domain';
import { slotGeneration, publishSlot } from './content-slot-fixtures';

const SITE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const PERIOD = '2026-08-01';
const NOW = new Date('2026-08-20T12:00:00.000Z');
const ACTOR = 'admin-user-7f3a2c9d';
const SOURCE_SHA = 'a'.repeat(64);

const REWORKED_TITLE = 'How we plan a first visit around what you already told us';
const REWORKED_SUMMARY = 'Written from this practice’s own answers rather than a template.';

/** The same generation the queue accepts, carrying text a customer could tell apart. */
function reworkGeneration(
  attempt: 1 | 2 | 'safe-catalog' = 1,
  overrides: Partial<GeneratedContentPostVersion['post']> = {},
): GeneratedContentPostVersion {
  const base = slotGeneration(attempt);
  return {
    ...base,
    post: {
      ...base.post,
      title: REWORKED_TITLE,
      summary: REWORKED_SUMMARY,
      ...overrides,
    },
  } as GeneratedContentPostVersion;
}

function site(): Site {
  return {
    id: SITE_ID,
    clientId: CLIENT_ID,
    name: 'Summit Dental Studio',
    domain: 'summit-dental.anakslabs.com',
    industryProfileId: 'clinic',
    pricingModelVersion: PRICING_MODEL_VERSION,
    siteConfig: { meta: { timezone: 'America/Denver' } },
    draftConfig: null,
  } as unknown as Site;
}

async function provisionedMonth(count = 8): Promise<MockContentQueueRepository> {
  const repository = new MockContentQueueRepository();
  await repository.provisionMonthlySlots({
    clientId: CLIENT_ID,
    siteId: SITE_ID,
    pricingModelVersion: PRICING_MODEL_VERSION,
    periodMonth: PERIOD,
    count,
    actorId: ACTOR,
  });
  return repository;
}

/**
 * What the public boundary would serve at this instant, through the projection the tenant site
 * and the export both read. Not a summary of repository state: the pointer gate, the
 * pipeline-version gate and the document schema all run here exactly as they do in production.
 */
async function servedPost(repository: MockContentQueueRepository, slug: string) {
  const published = new MockPublishedContentPostsRepository([], [], async (siteId) =>
    publishedRowsFromQueueItems(await repository.listBySites({
      siteIds: [siteId],
      statuses: ['published'],
      limit: 500,
    })));
  return published.getPublishedBySiteAndSlug(SITE_ID, slug);
}

type ModuleLoader = {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

async function loadCustomerView() {
  const loader = Module as unknown as ModuleLoader;
  const originalLoad = loader._load;
  loader._load = function loadForViewTest(request, parent, isMain) {
    if (request === 'server-only') return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return await import('@/lib/content-fulfillment/customer-view');
  } finally {
    loader._load = originalLoad;
  }
}

function withRepository<T>(
  repository: MockContentQueueRepository,
  run: () => Promise<T>,
): Promise<T> {
  const globalWithRepo = globalThis as typeof globalThis & {
    __daboimContentQueueRepository__?: unknown;
  };
  const previous = globalWithRepo.__daboimContentQueueRepository__;
  globalWithRepo.__daboimContentQueueRepository__ = repository;
  return run().finally(() => {
    globalWithRepo.__daboimContentQueueRepository__ = previous;
  });
}

async function customerView(repository: MockContentQueueRepository) {
  const { loadCustomerBlogView } = await loadCustomerView();
  return withRepository(repository, () => loadCustomerBlogView(site(), NOW));
}

/** Drives a provisioned month to the state the rework exists for: one real post, one fallback. */
async function monthWithFallbackSlot(): Promise<{
  repository: MockContentQueueRepository;
  fallback: AdminContentQueueItem;
}> {
  const repository = await provisionedMonth();
  const slots = await repository.listBySites({ siteIds: [SITE_ID] });
  await publishSlot(repository, slots[0].id, 1, ACTOR);
  await publishSlot(repository, slots[1].id, 'safe-catalog', ACTOR);
  const fallback = (await repository.getById(slots[1].id))!;
  return { repository, fallback };
}

async function stageRework(
  repository: MockContentQueueRepository,
  id: string,
  generated: GeneratedContentPostVersion = reworkGeneration(),
): Promise<AdminContentQueueItem> {
  const claimed = await repository.getById(id);
  if (claimed?.pendingVersionId === null) {
    await repository.claimRework({ id, actorId: ACTOR });
  }
  return repository.storeReworkVersion({ id, actorId: ACTOR, generated });
}

async function swap(
  repository: MockContentQueueRepository,
  item: AdminContentQueueItem,
) {
  return repository.approveAndSwap({
    id: item.id,
    expectedVersionId: item.pendingVersionId!,
    actorId: ACTOR,
    sourceSnapshotSha256: SOURCE_SHA,
    honestyPolicyVersion: 'content-honesty-2026-07-v1',
    medicalPolicyVersion: 'medical-ad-2026-07-v1',
    validatedDocumentSha256: 'b'.repeat(64),
  });
}

describe('PUBLISHED-REWORK — the whole path, from a stranded fallback to a replaced post', () => {
  test('a safe-catalog slot is reworked and swapped, and the URL never stops answering', async () => {
    const { repository, fallback } = await monthWithFallbackSlot();
    const slug = fallback.slug;

    // The month stands where the old model left it: two posts live, one of them not fulfillment.
    const before = await customerView(repository);
    assert.equal(before.delivered, 1, 'a safe-catalog publication is not delivered work');
    assert.ok(isSafeCatalogSlot(fallback));
    const servedBefore = await servedPost(repository, slug);
    assert.ok(servedBefore, 'the fallback post is genuinely live before the rework starts');
    const originalTitle = servedBefore.title;
    const originalVersionId = servedBefore.versionId;

    // Rework: claim, then stage a replacement generated from the practice's own material.
    await repository.claimRework({ id: fallback.id, actorId: ACTOR });
    const staged = await repository.storeReworkVersion({
      id: fallback.id,
      actorId: ACTOR,
      generated: reworkGeneration(),
    });
    assert.ok(staged.pendingVersionId, 'the replacement is staged on its own pointer');
    assert.equal(staged.status, 'published', 'the row never leaves published');
    assert.equal(
      staged.currentVersionId,
      originalVersionId,
      'the serving pointer does not move while a rework is staged',
    );

    // Mid-rework: the address still answers, with the old text.
    const servedDuring = await servedPost(repository, slug);
    assert.ok(servedDuring, 'the post must not disappear while its replacement is staged');
    assert.equal(servedDuring.title, originalTitle);
    assert.equal(servedDuring.versionId, originalVersionId);

    const result = await swap(repository, staged);
    assert.equal(result.duplicated, false);

    // After: same address, new text, and the month finally counts it.
    const servedAfter = await servedPost(repository, slug);
    assert.ok(servedAfter, 'the swap must not leave the address answering nothing');
    assert.equal(servedAfter.slug, slug, 'the customer-facing address is unchanged');
    assert.equal(servedAfter.title, REWORKED_TITLE);
    assert.notEqual(servedAfter.versionId, originalVersionId);

    const swapped = (await repository.getById(fallback.id))!;
    assert.equal(swapped.pendingVersionId, null, 'nothing is left staged after the swap');
    assert.equal(swapped.currentVersionId, swapped.publishedVersionId, '0049 equality holds');
    assert.equal(swapped.currentVersionId, staged.pendingVersionId);

    const after = await customerView(repository);
    assert.equal(after.delivered, 2, 'the reworked slot is now fulfillment of the contract');
    const post = after.thisMonth.find((entry) => entry.id === fallback.id)!;
    assert.equal(post.interim, false, 'it is no longer a general article');
    assert.equal(post.title, REWORKED_TITLE);
  });

  test('the ledger records the rework as what it was: no status ever moved', async () => {
    const { repository, fallback } = await monthWithFallbackSlot();
    const staged = await stageRework(repository, fallback.id);
    await swap(repository, staged);

    const reworkEvents = repository.events()
      .filter((event) => event.eventType.startsWith('rework_'));
    assert.deepEqual(
      reworkEvents.map((event) => event.eventType),
      ['rework_claimed', 'rework_published'],
    );
    for (const event of reworkEvents) {
      assert.equal(event.fromStatus, 'published');
      assert.equal(event.toStatus, 'published');
      assert.equal(event.actorId, ACTOR);
    }
  });
});

describe('PUBLISHED-REWORK — a staged rework is invisible to the customer', () => {
  test('delivered, interim, title and summary are all unchanged while the rework waits', async () => {
    const { repository, fallback } = await monthWithFallbackSlot();
    const before = await customerView(repository);

    await stageRework(repository, fallback.id);
    const during = await customerView(repository);

    assert.equal(during.delivered, before.delivered, 'an unapproved version is not delivered work');
    assert.deepEqual(
      during.thisMonth.map((post) => [post.id, post.interim, post.title, post.summary]),
      before.thisMonth.map((post) => [post.id, post.interim, post.title, post.summary]),
      'nothing the customer can read may change before an operator approves it',
    );
    const staged = (await repository.getById(fallback.id))!;
    assert.notEqual(
      staged.pendingVersion?.title,
      staged.currentVersion?.title,
      'the fixture must actually stage different copy for this assertion to mean anything',
    );
  });

  test('the delivered counter reads the served version, not the staged one', async () => {
    // The staged version is a real generation and the served one is the fallback. If the counter
    // ever read the staged version, this month would report the rework as delivered early.
    const { repository, fallback } = await monthWithFallbackSlot();
    await stageRework(repository, fallback.id);

    const items = await repository.listBySites({ siteIds: [SITE_ID] });
    assert.equal(deliveredCountForPeriod(items, PERIOD), 1);
    const staged = items.find((item) => item.id === fallback.id)!;
    assert.ok(isSafeCatalogSlot(staged), 'the served version is still the safe-catalog fallback');
  });
});

describe('PUBLISHED-REWORK — what the swap refuses', () => {
  test('a safe-catalog replacement is refused, and the slot can be reworked again', async () => {
    const { repository, fallback } = await monthWithFallbackSlot();
    const staged = await stageRework(repository, fallback.id, reworkGeneration('safe-catalog'));

    await assert.rejects(
      () => swap(repository, staged),
      (error: unknown) => error instanceof ContentQueueError
        && error.code === 'CONTENT_POST_SAFE_CATALOG_REFUSED'
        && error.message === CONTENT_REWORK_REFUSAL_MESSAGES.safe_catalog,
    );

    const refused = (await repository.getById(fallback.id))!;
    assert.equal(refused.status, 'published', 'a refusal leaves the live post alone');
    assert.equal(refused.currentVersionId, staged.currentVersionId);
    assert.ok(await servedPost(repository, fallback.slug), 'the post is still on the air');

    // Recovery: generate again over the refused staging, and this one swaps.
    const restaged = await stageRework(repository, fallback.id, reworkGeneration(1));
    const result = await swap(repository, restaged);
    assert.equal(result.duplicated, false);
    assert.equal((await servedPost(repository, fallback.slug))!.title, REWORKED_TITLE);
  });

  test('a replacement the public boundary would drop is refused before the pointers move', async () => {
    const { repository, fallback } = await monthWithFallbackSlot();
    const tooManyTags = reworkGeneration(1, {
      tags: Array.from({ length: 13 }, (_, index) => `tag-${index}`),
    });
    const staged = await stageRework(repository, fallback.id, tooManyTags);

    await assert.rejects(
      () => swap(repository, staged),
      (error: unknown) => error instanceof ContentQueueError
        && error.code === 'CONTENT_POST_POLICY_BLOCKED'
        && error.message === CONTENT_REWORK_REFUSAL_MESSAGES.public_projection,
    );
    // The point of refusing early: had the swap gone through, this would now be null.
    assert.ok(
      await servedPost(repository, fallback.slug),
      'the address must never be left pointing at a version the public boundary drops',
    );
  });

  test('a post that is not live cannot stage or swap a rework', async () => {
    const repository = await provisionedMonth(2);
    const [draft] = await repository.listBySites({ siteIds: [SITE_ID] });

    for (const attempt of [
      () => repository.claimRework({ id: draft.id, actorId: ACTOR }),
      () => repository.storeReworkVersion({
        id: draft.id,
        actorId: ACTOR,
        generated: reworkGeneration(),
      }),
    ]) {
      await assert.rejects(attempt, (error: unknown) => error instanceof ContentQueueError
        && error.code === 'CONTENT_POST_STATE_CONFLICT');
    }
    assert.equal((await repository.getById(draft.id))!.pendingVersionId, null);
  });

  test('a rework cannot be claimed twice over the same staged version', async () => {
    const { repository, fallback } = await monthWithFallbackSlot();
    await stageRework(repository, fallback.id);
    await assert.rejects(
      () => repository.claimRework({ id: fallback.id, actorId: ACTOR }),
      (error: unknown) => error instanceof ContentQueueError
        && error.code === 'CONTENT_POST_STATE_CONFLICT',
    );
  });

  test('a swap that already landed is idempotent rather than a conflict', async () => {
    const { repository, fallback } = await monthWithFallbackSlot();
    const staged = await stageRework(repository, fallback.id);
    const first = await swap(repository, staged);
    assert.equal(first.duplicated, false);
    const again = await swap(repository, staged);
    assert.equal(again.duplicated, true);
  });
});

describe('PUBLISHED-REWORK — the queue shows the staged version beside the served one', () => {
  test('a published post enters the queue only while a rework is staged against it', async () => {
    const { repository, fallback } = await monthWithFallbackSlot();
    const queueBefore = await repository.listNonterminal();
    assert.ok(
      queueBefore.every((item) => item.status !== 'published'),
      'delivered posts stay out of the queue when nothing is staged',
    );

    const staged = await stageRework(repository, fallback.id);
    const queue = await repository.listNonterminal();
    const entry = queue.find((item) => item.id === fallback.id);
    assert.ok(entry, 'a staged rework brings its post back into the operator queue');
    assert.ok(hasStagedRework(entry));
    assert.equal(entry.pendingVersion?.title, REWORKED_TITLE, 'the queue shows the new version');
    assert.equal(
      entry.currentVersion?.id,
      staged.currentVersionId,
      'the served version stays in currentVersion, where every counter reads it',
    );
    assert.notEqual(entry.currentVersion?.title, REWORKED_TITLE);
    assert.equal(await repository.countNonterminal(), queue.length);

    await swap(repository, staged);
    assert.ok(
      (await repository.listNonterminal()).every((item) => item.id !== fallback.id),
      'the post leaves the queue the moment the swap lands',
    );
  });

  test('the projection drops a row whose staged pointer resolves to nothing', () => {
    const row = {
      id: '22222222-2222-4222-8222-222222222222',
      site_id: SITE_ID,
      client_id: CLIENT_ID,
      slug: '2026-08-post-1',
      status: 'published',
      current_version_id: null,
      published_version_id: null,
      published_at: '2026-08-10T00:00:00.000Z',
      pending_version_id: '33333333-3333-4333-8333-333333333333',
      updated_at: '2026-08-10T00:00:00.000Z',
      pricing_model_version: PRICING_MODEL_VERSION,
      period_month: PERIOD,
      ordinal: 1,
      created_at: '2026-08-01T00:00:00.000Z',
    };
    assert.equal(projectAdminContentItem(row, null, null), null);
    assert.equal(projectAdminContentItem({ ...row, pending_version_id: null }, null, null)
      ?.pendingVersionId, null);
  });
});

describe('PUBLISHED-REWORK — the operator workflow, through the real service', () => {
  const GENERATED_TITLE = 'Questions to bring to a consultation';
  const CONTEXT_SNAPSHOT = {
    version: 1,
    siteId: SITE_ID,
    clientId: CLIENT_ID,
    capturedAt: '2026-08-05T00:00:00.000Z',
    surveyVersion: 2,
    industryId: 'clinic',
    industryClass: 'medical',
    sources: [{
      id: 'customer-faq:consultation',
      kind: 'customer-faq',
      path: 'survey.contentDepth.faqAnswers.0',
      text: 'Write down your questions before the consultation.',
    }],
  };

  async function serviceModule() {
    const loader = Module as unknown as ModuleLoader;
    const originalLoad = loader._load;
    loader._load = function loadForServiceTest(request, parent, isMain) {
      if (request === 'server-only') return {};
      return originalLoad.call(this, request, parent, isMain);
    };
    try {
      return await import('@/lib/admin/content-fulfillment-service');
    } finally {
      loader._load = originalLoad;
    }
  }

  async function serviceDependencies(repository: MockContentQueueRepository) {
    const { HWARODAM_SITE_CONFIG } = await import('@/lib/data/mock/hwarodam');
    const { normalizeSiteConfig } = await import('@/lib/types/site');
    const config = normalizeSiteConfig(structuredClone(HWARODAM_SITE_CONFIG));
    let generatorCalls = 0;
    return {
      generatorCalls: () => generatorCalls,
      dependencies: {
        repository,
        generator: {
          // A compliant generator answers with the slug it was pinned to; the revalidation before
          // publication rebuilds the post from the slot's own slug and would not match otherwise.
          async generateText(input: { prompt: string }) {
            generatorCalls += 1;
            return JSON.stringify({
              slug: /Use this exact slug: (\S+)/u.exec(input.prompt)?.[1] ?? 'consultation-checklist',
              title: GENERATED_TITLE,
              titleSourceRefs: [],
              summary: 'A short checklist can keep the conversation focused.',
              summarySourceRefs: [],
              tags: ['consultation'],
              document: {
                version: 1,
                blocks: [{
                  type: 'list',
                  ordered: false,
                  items: ['Write down your main question.'],
                }],
              },
            });
          },
        },
        loadContext: async () => ({ sourceSnapshot: CONTEXT_SNAPSHOT, config }),
        indexNow: async () => undefined,
      } as never,
    };
  }

  test('rework generates, stages, and swaps a live post through the real entry points', async () => {
    const { repository, fallback } = await monthWithFallbackSlot();
    const { reworkAdminContentPost, approveSwapAdminContentPost } = await serviceModule();
    const { dependencies } = await serviceDependencies(repository);

    const staged = await reworkAdminContentPost({
      id: fallback.id,
      actorId: ACTOR,
      topic: 'What to ask at a consultation',
      dependencies,
    });
    assert.equal(staged.status, 'published', 'the live post never left the air');
    assert.equal(staged.pendingVersion?.title, GENERATED_TITLE);
    assert.equal(staged.currentVersionId, fallback.currentVersionId, 'the served version held');
    assert.equal((await servedPost(repository, fallback.slug))!.title, fallback.currentVersion!.title);

    const result = await approveSwapAdminContentPost({
      id: fallback.id,
      expectedVersionId: staged.pendingVersionId!,
      actorId: ACTOR,
      dependencies,
    });
    assert.equal(result.duplicated, false);
    assert.equal((await servedPost(repository, fallback.slug))!.title, GENERATED_TITLE);
    assert.equal((await customerView(repository)).delivered, 2);
  });

  test('a second rework attempt restages instead of claiming again', async () => {
    const { repository, fallback } = await monthWithFallbackSlot();
    const { reworkAdminContentPost } = await serviceModule();
    const { dependencies } = await serviceDependencies(repository);

    const first = await reworkAdminContentPost({
      id: fallback.id,
      actorId: ACTOR,
      topic: 'What to ask at a consultation',
      dependencies,
    });
    const second = await reworkAdminContentPost({
      id: fallback.id,
      actorId: ACTOR,
      topic: 'What to ask at a consultation',
      dependencies,
    });

    assert.notEqual(second.pendingVersionId, first.pendingVersionId, 'a fresh version is staged');
    assert.equal(
      repository.events().filter((event) => event.eventType === 'rework_claimed').length,
      1,
      'one claim per rework episode; restaging is the recovery path, not a second claim',
    );
  });

  test('only a published post can be reworked', async () => {
    const repository = await provisionedMonth(2);
    const [draft] = await repository.listBySites({ siteIds: [SITE_ID] });
    const { reworkAdminContentPost } = await serviceModule();
    const { dependencies, generatorCalls } = await serviceDependencies(repository);

    await assert.rejects(
      () => reworkAdminContentPost({
        id: draft.id,
        actorId: ACTOR,
        topic: 'What to ask at a consultation',
        dependencies,
      }),
      (error: unknown) => error instanceof ContentQueueError
        && error.code === 'CONTENT_POST_STATE_CONFLICT',
    );
    assert.equal(generatorCalls(), 0, 'nothing is generated for a post that cannot be reworked');
  });
});

describe('PUBLISHED-REWORK — the migration says what the code assumes', () => {
  const migration = readFileSync(
    join(process.cwd(), '../supabase/migrations/0060_content_post_rework.sql'),
    'utf8',
  );

  test('publish_shape keeps 0049 equality and forbids staging off a published row', () => {
    const start = migration.indexOf('add constraint content_posts_publish_shape');
    const shape = migration.slice(start, migration.indexOf('alter table public.content_post_events'));
    assert.match(shape, /published_version_id = current_version_id/u, '0049 equality is untouched');
    assert.match(shape, /status <> 'published'[\s\S]*pending_version_id is null/u);
    // The published branch deliberately says nothing about pending: that is where it may be set.
    const publishedBranch = shape.slice(0, shape.indexOf("status <> 'published'"));
    assert.doesNotMatch(publishedBranch, /pending_version_id/u);
  });

  test('the swap moves both serving pointers in one statement and clears the staging one', () => {
    const start = migration.indexOf('create or replace function public.approve_and_swap_content_post');
    const rpc = migration.slice(start, migration.indexOf('comment on function public.claim_content_post_rework'));
    const update = rpc.slice(rpc.indexOf('update public.content_posts'));
    const single = update.slice(0, update.indexOf(';'));
    assert.match(single, /current_version_id = v_version\.id/u);
    assert.match(single, /published_version_id = v_version\.id/u);
    assert.match(single, /pending_version_id = null/u);
    assert.match(rpc, /from public\.content_posts[\s\S]*for update/u);
    assert.match(rpc, /from public\.content_post_versions[\s\S]*for update/u);
    assert.match(rpc, /safe-catalog swap refused/u);
    assert.match(rpc, /public projection precheck failed/u);
    assert.match(rpc, /'rework_published'/u);
  });

  test('the staging RPC never touches a serving pointer', () => {
    const start = migration.indexOf('create or replace function public.store_content_post_rework_version');
    const rpc = migration.slice(start, migration.indexOf('create or replace function public.approve_and_swap_content_post'));
    const update = rpc.slice(rpc.indexOf('update public.content_posts'));
    const single = update.slice(0, update.indexOf(';'));
    assert.match(single, /pending_version_id = v_version\.id/u);
    assert.doesNotMatch(single, /current_version_id|published_version_id|status =/u);
    assert.match(rpc, /status <> 'published'[\s\S]*rework state conflict/u);
  });

  test('the event vocabulary is additive and the new RPCs are service-role only', () => {
    for (const eventType of [
      'slot_created',
      'generation_claimed',
      'generation_failed',
      'version_generated',
      'approval_requested',
      'rejected',
      'regeneration_requested',
      'approved',
      'published',
      'rework_claimed',
      'rework_published',
    ]) {
      assert.match(migration, new RegExp(`'${eventType}'`, 'u'), eventType);
    }
    for (const fn of [
      'claim_content_post_rework',
      'store_content_post_rework_version',
      'approve_and_swap_content_post',
    ]) {
      assert.match(
        migration,
        new RegExp(`revoke execute on function public\\.${fn}\\([\\s\\S]*?from public, anon, authenticated`, 'u'),
        fn,
      );
      assert.match(
        migration,
        new RegExp(`grant execute on function public\\.${fn}\\([\\s\\S]*?to service_role`, 'u'),
        fn,
      );
    }
    assert.doesNotMatch(migration, /grant [a-z, ]*on table/u, '0060 issues no new table grant');
  });

  test('every content-queue route is admin guarded, including the rework pair', () => {
    for (const route of [
      'src/app/api/admin/content-queue/[id]/rework/route.ts',
      'src/app/api/admin/content-queue/[id]/approve-swap/route.ts',
    ]) {
      const source = readFileSync(join(process.cwd(), route), 'utf8');
      assert.match(source, /await requireAdminOr403\(\)/u, route);
      assert.match(source, /getCurrentAdminActorId/u, route);
    }
    const boundary = readFileSync(
      join(process.cwd(), 'src/app/api/admin/content-queue/_lib.ts'),
      'utf8',
    );
    const dto = boundary.slice(
      boundary.indexOf('function contentQueueVersionDto'),
      boundary.indexOf('export function contentQueueErrorResponse'),
    );
    assert.match(dto, /pendingVersion/u, 'the console needs the staged version');
    assert.doesNotMatch(dto, /sourceSnapshot|validationEvidence|\bdocument\b/u);
  });
});
