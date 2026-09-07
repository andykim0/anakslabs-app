/**
 * BLOG-SCREEN fix round 1 — F1, F2, F5.
 *
 *  F1  The provisioning actor lands in an append-only ledger, so it must be the operator who
 *      actually pressed the button; an unresolvable actor must stop the write, not label it.
 *  F2  A long-lived site's current month must never be crowded out of the customer's screen by
 *      its own history — that read "0 of 8" for a site that owed and had eight posts.
 *  F5  Mock/Postgres parity and limit-normalization sharp edges.
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { describe, test } from 'node:test';
import {
  CONTENT_QUEUE_DEFAULT_LIMIT,
  CONTENT_QUEUE_MAX_LIMIT,
  normalizeContentQueueLimit,
} from '@/lib/admin/content-queue-core';
import { MockContentQueueRepository } from '@/lib/admin/content-queue-repository-mock';
import { CONTENT_HONESTY_POLICY_VERSION } from '@/lib/content-fulfillment/honesty';
import { monthlySlotSlug } from '@/lib/content-fulfillment/delivery';
import { PRICING_MODEL_VERSION } from '@/lib/pricing';
import { SUMMIT_DENTAL_SITE_ID, DEMO_CLINIC_ID } from '@/lib/data/mock/seed';
import type { Site } from '@/lib/types/domain';

const SITE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-08-05T12:00:00.000Z');
const CURRENT_PERIOD = '2026-08-01';

/** A real operator id, deliberately unlike the constant this route used to hardcode. */
const OPERATOR_ACTOR_ID = 'admin-user-7f3a2c9d';

type ModuleLoader = {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

/**
 * The route module is cached after its first import, so the auth stub it captured must keep
 * answering the current question — a value baked in at load time would freeze the first test's
 * actor into every later one.
 */
let resolvedActorId: string | null = null;

/**
 * Runs a real route handler under the standalone runner: the Next server condition is absent, so
 * only the `server-only` marker is neutralized, and the admin session plus the resolved actor are
 * supplied the way the request would. No application module is stubbed out wholesale — the auth
 * module keeps every real export except the one identity the test is varying.
 */
async function withRouteEnvironment<T>(
  actorId: string | null,
  run: () => Promise<T>,
): Promise<T> {
  resolvedActorId = actorId;
  const loader = Module as unknown as ModuleLoader;
  const originalLoad = loader._load;
  loader._load = function loadForRouteTest(request, parent, isMain) {
    if (request === 'server-only') return {};
    if (request === 'next/headers') {
      return {
        cookies: async () => ({
          get: (name: string) => name === 'anaks_mock_session'
            ? { value: 'admin' }
            : undefined,
          getAll: () => [],
          set: () => undefined,
        }),
      };
    }
    const loaded = originalLoad.call(this, request, parent, isMain);
    if (request === '@/lib/services/auth') {
      return { ...loaded as object, getCurrentAdminActorId: async () => resolvedActorId };
    }
    return loaded;
  };
  try {
    return await run();
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

async function provisionThroughRoute(
  repository: MockContentQueueRepository,
  actorId: string | null,
): Promise<Response> {
  return withRouteEnvironment(actorId, () => withRepository(repository, async () => {
    const route = await import(
      '@/app/api/admin/clients/[id]/sites/[siteId]/content-slots/route'
    );
    const { NextRequest } = await import('next/server');
    return route.POST(
      new NextRequest(
        `http://app.anakslabs.com/api/admin/clients/${DEMO_CLINIC_ID}`
        + `/sites/${SUMMIT_DENTAL_SITE_ID}/content-slots`,
        { method: 'POST' },
      ),
      { params: Promise.resolve({ id: DEMO_CLINIC_ID, siteId: SUMMIT_DENTAL_SITE_ID }) },
    );
  }));
}

describe('BLOG-SCREEN F1 — the provisioning actor is the operator, not a constant', () => {
  test('the resolved operator id is what the slot ledger records', async () => {
    const repository = new MockContentQueueRepository();
    const response = await provisionThroughRoute(repository, OPERATOR_ACTOR_ID);
    assert.equal(response.status, 201);

    const events = repository.slotCreatedEvents();
    assert.equal(events.length, 8, 'every created slot writes one append-only ledger row');
    for (const event of events) {
      assert.equal(
        event.actorId,
        OPERATOR_ACTOR_ID,
        'the ledger must name the operator who pressed the button, not a hardcoded constant',
      );
      assert.equal(event.eventType, 'slot_created');
      assert.equal(event.toStatus, 'draft');
      assert.equal(event.actorType, 'admin');
    }
  });

  test('an unresolvable actor stops the write instead of labelling it', async () => {
    const repository = new MockContentQueueRepository();
    const response = await provisionThroughRoute(repository, null);

    assert.equal(response.status, 403);
    const payload = await response.json() as { error?: { code?: string; message?: string } };
    assert.equal(payload.error?.code, 'FORBIDDEN');
    // This product speaks English to its customers; the shared guards do too.
    assert.equal(payload.error?.message, 'Administrator access is required.');
    assert.equal(
      repository.slotCreatedEvents().length,
      0,
      'nothing may reach the append-only ledger without a named actor',
    );
    assert.equal((await repository.listBySites({ siteIds: [SUMMIT_DENTAL_SITE_ID] })).length, 0);
  });
});

describe('BLOG-SCREEN F2 — a long history cannot crowd out the current month', () => {
  /** 26 months of an eight-post contract is 208 rows — past the 200-row default budget. */
  async function siteWithLongHistory(): Promise<MockContentQueueRepository> {
    const repository = new MockContentQueueRepository();
    for (let offset = 25; offset >= 0; offset -= 1) {
      const month = new Date(Date.UTC(2026, 7 - offset, 1));
      const periodMonth = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, '0')}-01`;
      await repository.provisionMonthlySlots({
        clientId: CLIENT_ID,
        siteId: SITE_ID,
        pricingModelVersion: PRICING_MODEL_VERSION,
        periodMonth,
        count: 8,
        actorId: OPERATOR_ACTOR_ID,
      });
    }
    return repository;
  }

  function site(): Site {
    return {
      id: SITE_ID,
      clientId: CLIENT_ID,
      name: 'Long-running Dental',
      domain: 'long-running.anakslabs.com',
      industryProfileId: 'clinic',
      pricingModelVersion: PRICING_MODEL_VERSION,
      siteConfig: { meta: { timezone: 'America/Denver' } },
      draftConfig: null,
    } as unknown as Site;
  }

  test('the current month is read exactly, past 208 rows of history', async () => {
    const repository = await siteWithLongHistory();
    assert.equal(
      (await repository.listBySites({ siteIds: [SITE_ID], limit: CONTENT_QUEUE_MAX_LIMIT })).length,
      208,
      'the fixture must exceed the default row budget for this test to mean anything',
    );

    // Publish two of the current month's posts, and one from the oldest month.
    const current = await repository.listBySites({
      siteIds: [SITE_ID],
      periodMonths: [CURRENT_PERIOD],
    });
    for (const slot of current.slice(0, 2)) await publish(repository, slot.id);
    const oldest = await repository.listBySites({
      siteIds: [SITE_ID],
      periodMonths: ['2024-07-01'],
    });
    await publish(repository, oldest[0].id);

    const { loadCustomerBlogView } = await loadCustomerView();
    const view = await withRepository(repository, () => loadCustomerBlogView(site(), NOW));

    assert.equal(view.periodMonth, CURRENT_PERIOD);
    assert.equal(view.thisMonth.length, 8, 'the current month must never be truncated away');
    assert.equal(view.delivered, 2, 'the counter reads the current month, not a truncated page');
    assert.equal(view.committed, 8);
  });

  test('history is newest first and never repeats the current month', async () => {
    const repository = await siteWithLongHistory();
    for (const month of ['2026-07-01', '2026-06-01', '2024-07-01']) {
      const slots = await repository.listBySites({ siteIds: [SITE_ID], periodMonths: [month] });
      await publish(repository, slots[0].id);
    }
    const currentSlots = await repository.listBySites({
      siteIds: [SITE_ID],
      periodMonths: [CURRENT_PERIOD],
    });
    await publish(repository, currentSlots[0].id);

    const { loadCustomerBlogView } = await loadCustomerView();
    const view = await withRepository(repository, () => loadCustomerBlogView(site(), NOW));

    assert.deepEqual(
      view.earlier.map((post) => post.periodMonth),
      ['2026-07-01', '2026-06-01', '2024-07-01'],
      'history runs newest first',
    );
    assert.ok(
      view.earlier.every((post) => post.periodMonth !== CURRENT_PERIOD),
      'the current month appears once, in its own section',
    );
    assert.ok(
      view.earlier.every((post) => post.state === 'published'),
      'history shows delivered work only',
    );
  });
});

describe('BLOG-SCREEN F5 — normalization and mock/Postgres parity', () => {
  test('an oversized limit clamps to the ceiling while a nonsensical one falls back', () => {
    // Asking for more than the ceiling means "as much as possible", not "the default".
    assert.equal(normalizeContentQueueLimit(1_000), CONTENT_QUEUE_MAX_LIMIT);
    assert.equal(normalizeContentQueueLimit(501), CONTENT_QUEUE_MAX_LIMIT);
    assert.equal(normalizeContentQueueLimit(CONTENT_QUEUE_MAX_LIMIT), CONTENT_QUEUE_MAX_LIMIT);
    assert.equal(normalizeContentQueueLimit(499), 499);
    // A limit that says nothing meaningful falls back to the default.
    for (const nonsense of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(normalizeContentQueueLimit(nonsense), CONTENT_QUEUE_DEFAULT_LIMIT, `${nonsense}`);
    }
    assert.equal(normalizeContentQueueLimit(), CONTENT_QUEUE_DEFAULT_LIMIT);
  });

  test('a slug collision silently under-provisions, exactly as production would', async () => {
    const repository = new MockContentQueueRepository();
    await repository.provisionMonthlySlots({
      clientId: CLIENT_ID,
      siteId: SITE_ID,
      pricingModelVersion: PRICING_MODEL_VERSION,
      periodMonth: CURRENT_PERIOD,
      count: 2,
      actorId: OPERATOR_ACTOR_ID,
    });

    // A second pricing model version in the same month derives the same slugs. 0049's
    // (site_id, slug) unique index blocks the rows, but 0059 inserts under `on conflict do
    // nothing`, so nothing raises — the month simply comes up short. That silent shortfall is
    // the real signature to recognize, and the mock must reproduce it rather than throw.
    const result = await repository.provisionMonthlySlots({
      clientId: CLIENT_ID,
      siteId: SITE_ID,
      pricingModelVersion: 'some-other-contract-v1',
      periodMonth: CURRENT_PERIOD,
      count: 2,
      actorId: OPERATOR_ACTOR_ID,
    });

    assert.ok(
      result.created < 2,
      'a colliding batch must report fewer created slots than the month asked for',
    );
    assert.equal(result.created, 0, 'both ordinals collide, so none are created');

    const all = await repository.listBySites({ siteIds: [SITE_ID] });
    assert.equal(all.length, 2, 'no duplicate slug row exists');
    assert.deepEqual(
      all.map((item) => item.slug),
      [monthlySlotSlug(CURRENT_PERIOD, 1), monthlySlotSlug(CURRENT_PERIOD, 2)],
    );
    // The ledger only ever names slots that were actually created.
    assert.equal(repository.slotCreatedEvents().length, 2);
  });
});

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

async function publish(repository: MockContentQueueRepository, id: string): Promise<void> {
  await repository.claimGeneration({ id, actorId: OPERATOR_ACTOR_ID, regeneration: false });
  const stored = await repository.storeGenerated({
    id,
    actorId: OPERATOR_ACTOR_ID,
    generated: {
      post: {
        slug: 'published-post',
        title: 'A published post',
        titleSourceRefs: [],
        summary: 'A source-backed summary.',
        summarySourceRefs: [],
        tags: [],
        document: { version: 1, blocks: [{ type: 'paragraph', text: 'Body copy.' }] },
      },
      sourceSnapshot: {
        version: 1,
        siteId: SITE_ID,
        clientId: CLIENT_ID,
        capturedAt: '2026-08-05T00:00:00.000Z',
        surveyVersion: 2,
        industryId: 'clinic',
        industryClass: 'dental',
        sources: [],
      },
      sourceSnapshotSha256: 'a'.repeat(64),
      sourceRefs: [],
      policyVersions: { honesty: CONTENT_HONESTY_POLICY_VERSION, medical: 'medical-ad-2026-07-v1' },
      validationEvidence: { honesty: { ok: true }, medical: { ok: true } },
      generationMetadata: {
        pipelineVersion: 'content-post-generator-2026-07-v1',
        attempt: 1,
        externalImageCostKrw: 0,
        rawHtml: false,
      },
    } as never,
  });
  await repository.approveAndPublish({
    id,
    expectedVersionId: stored.currentVersionId!,
    actorId: OPERATOR_ACTOR_ID,
    sourceSnapshotSha256: 'a'.repeat(64),
    honestyPolicyVersion: CONTENT_HONESTY_POLICY_VERSION,
    medicalPolicyVersion: 'medical-ad-2026-07-v1',
    validatedDocumentSha256: 'b'.repeat(64),
  });
}
