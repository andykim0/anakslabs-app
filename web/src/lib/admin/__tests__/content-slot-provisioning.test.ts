/**
 * BLOG-SCREEN — the two gaps that kept the blog product from starting.
 *
 *  1. Monthly slots had no creation path at all; provisioning must be idempotent so an operator
 *     can press the button twice without billing the month twice.
 *  2. The customer had no screen, and the fulfillment counter it shows must count what was
 *     actually delivered — safe-catalog fallbacks published under an explicit override are not
 *     fulfillment of the contract.
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { describe, test } from 'node:test';
import {
  MAX_MONTHLY_CONTENT_SLOTS,
  committedPostsPerMonth,
  deliveredCountForPeriod,
  isSafeCatalogSlot,
  monthlySlotSlug,
  slotsForPeriod,
} from '@/lib/content-fulfillment/delivery';
import { siteFulfillmentPlan } from '@/lib/content-fulfillment/site-fulfillment';
import { currentMonthStartDateInTimeZone } from '@/lib/reporting/period';
import { MockContentQueueRepository } from '@/lib/admin/content-queue-repository-mock';
import type { AdminContentQueueItem } from '@/lib/admin/content-queue-core';
import type { GeneratedContentPostVersion } from '@/lib/content-fulfillment/generation';
import {
  PREVIOUS_PRICING_MODEL_VERSION,
  PRICING_MODEL_VERSION,
} from '@/lib/pricing';
import { buildSeed, SUMMIT_DENTAL_SITE_ID } from '@/lib/data/mock/seed';
import type { Site } from '@/lib/types/domain';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const SITE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PERIOD = '2026-08-01';

function generated(attempt: 1 | 2 | 'safe-catalog'): GeneratedContentPostVersion {
  return {
    post: {
      slug: 'what-to-expect',
      title: 'What to expect at your first visit',
      titleSourceRefs: [],
      summary: 'A source-backed walkthrough of the first appointment.',
      summarySourceRefs: [],
      tags: ['first visit'],
      document: {
        version: 1,
        blocks: [{ type: 'paragraph', text: 'Bring your insurance card.' }],
      },
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
    policyVersions: { honesty: 'content-honesty-2026-07-v1', medical: 'medical-ad-2026-07-v1' },
    validationEvidence: { honesty: { ok: true }, medical: { ok: true } },
    generationMetadata: {
      pipelineVersion: 'content-post-generator-2026-07-v1',
      attempt,
      externalImageCostKrw: 0,
      rawHtml: false,
    },
  } as unknown as GeneratedContentPostVersion;
}

async function publish(
  repository: MockContentQueueRepository,
  id: string,
  attempt: 1 | 2 | 'safe-catalog',
): Promise<AdminContentQueueItem> {
  await repository.claimGeneration({ id, actorId: 'admin', regeneration: false });
  const stored = await repository.storeGenerated({
    id,
    actorId: 'admin',
    generated: generated(attempt),
  });
  const result = await repository.approveAndPublish({
    id,
    expectedVersionId: stored.currentVersionId!,
    actorId: 'admin',
    sourceSnapshotSha256: 'a'.repeat(64),
    honestyPolicyVersion: 'content-honesty-2026-07-v1',
    medicalPolicyVersion: 'medical-ad-2026-07-v1',
    validatedDocumentSha256: 'b'.repeat(64),
  });
  return result.item;
}

async function provisionedMonth(count = 8): Promise<MockContentQueueRepository> {
  const repository = new MockContentQueueRepository();
  await repository.provisionMonthlySlots({
    clientId: CLIENT_ID,
    siteId: SITE_ID,
    pricingModelVersion: PRICING_MODEL_VERSION,
    periodMonth: PERIOD,
    count,
    actorId: 'admin',
  });
  return repository;
}

describe('BLOG-SCREEN — monthly slot provisioning is idempotent', () => {
  test('a second run adds nothing and the month never holds a duplicate ordinal', async () => {
    const repository = await provisionedMonth();
    const first = await repository.listBySites({ siteIds: [SITE_ID] });
    assert.equal(first.length, 8);

    const second = await repository.provisionMonthlySlots({
      clientId: CLIENT_ID,
      siteId: SITE_ID,
      pricingModelVersion: PRICING_MODEL_VERSION,
      periodMonth: PERIOD,
      count: 8,
      actorId: 'admin',
    });
    assert.equal(second.created, 0, 're-provisioning must create no slot');
    assert.equal(second.existing, 8);

    const all = await repository.listBySites({ siteIds: [SITE_ID] });
    assert.equal(all.length, 8, 'the month must not double after a second run');
    const ordinals = all.map((item) => item.ordinal);
    assert.deepEqual(ordinals, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(new Set(ordinals).size, ordinals.length, 'ordinals must stay unique');
    // Identity is unique per (site, slug) in 0049, so the derived slugs must not collide either.
    const slugs = all.map((item) => item.slug);
    assert.equal(new Set(slugs).size, slugs.length);
    assert.equal(slugs[0], monthlySlotSlug(PERIOD, 1));
  });

  test('a partially provisioned month is topped up rather than restarted', async () => {
    const repository = await provisionedMonth(3);
    const partial = await repository.listBySites({ siteIds: [SITE_ID] });
    const keptIds = partial.map((item) => item.id);

    const topUp = await repository.provisionMonthlySlots({
      clientId: CLIENT_ID,
      siteId: SITE_ID,
      pricingModelVersion: PRICING_MODEL_VERSION,
      periodMonth: PERIOD,
      count: 8,
      actorId: 'admin',
    });
    assert.equal(topUp.created, 5);
    assert.equal(topUp.existing, 3);

    const all = await repository.listBySites({ siteIds: [SITE_ID] });
    assert.equal(all.length, 8);
    // The first three rows survive: re-provisioning must not orphan work already generated.
    for (const id of keptIds) {
      assert.ok(all.some((item) => item.id === id), `slot ${id} must survive re-provisioning`);
    }
  });

  test('new slots start as drafts with no published pointer', async () => {
    const repository = await provisionedMonth(2);
    for (const item of await repository.listBySites({ siteIds: [SITE_ID] })) {
      assert.equal(item.status, 'draft');
      assert.equal(item.currentVersionId, null);
      assert.equal(item.publishedVersionId, null);
      assert.equal(item.publishedAt, null);
      assert.equal(item.pricingModelVersion, PRICING_MODEL_VERSION);
      assert.equal(item.periodMonth, PERIOD);
    }
  });
});

describe('BLOG-SCREEN — the delivered counter counts fulfillment, not activity', () => {
  test('publishing moves the published pointer with the status', async () => {
    const repository = await provisionedMonth(2);
    const [slot] = await repository.listBySites({ siteIds: [SITE_ID] });
    const published = await publish(repository, slot.id, 1);

    assert.equal(published.status, 'published');
    assert.ok(published.publishedVersionId, 'published_version_id must be set on publish');
    assert.equal(published.publishedVersionId, published.currentVersionId);
    assert.ok(published.publishedAt, 'published_at must be set on publish');
  });

  test('a safe-catalog publication is excluded from the delivered numerator', async () => {
    const repository = await provisionedMonth();
    const slots = await repository.listBySites({ siteIds: [SITE_ID] });
    await publish(repository, slots[0].id, 1);
    const fallback = await publish(repository, slots[1].id, 'safe-catalog');

    const all = await repository.listBySites({ siteIds: [SITE_ID] });
    assert.equal(
      all.filter((item) => item.status === 'published').length,
      2,
      'both posts are genuinely published',
    );
    assert.ok(isSafeCatalogSlot(fallback), 'the override publication is a safe-catalog version');
    assert.equal(
      deliveredCountForPeriod(all, PERIOD),
      1,
      'the safe-catalog fallback must not count toward what the customer was owed',
    );
  });

  test('the numerator is anchored to the promised month, not the publish instant', async () => {
    const repository = await provisionedMonth(1);
    const [slot] = await repository.listBySites({ siteIds: [SITE_ID] });
    await publish(repository, slot.id, 1);

    // Published right now, but promised for August — September owes its own posts.
    assert.equal(deliveredCountForPeriod(
      await repository.listBySites({ siteIds: [SITE_ID] }),
      PERIOD,
    ), 1);
    assert.equal(deliveredCountForPeriod(
      await repository.listBySites({ siteIds: [SITE_ID] }),
      '2026-09-01',
    ), 0);
    assert.equal(slotsForPeriod(
      await repository.listBySites({ siteIds: [SITE_ID] }),
      '2026-09-01',
    ).length, 0);
  });

  test('the denominator comes from the row contract, never a literal', () => {
    assert.equal(
      committedPostsPerMonth({
        industryProfileId: 'clinic',
        pricingModelVersion: PRICING_MODEL_VERSION,
      }),
      8,
    );
    // A frozen contract keeps its own number rather than inheriting the current one.
    assert.equal(
      committedPostsPerMonth({
        industryProfileId: 'clinic',
        pricingModelVersion: PREVIOUS_PRICING_MODEL_VERSION,
      }),
      8,
    );
    // An unresolvable pair yields no denominator instead of a fabricated one.
    assert.equal(
      committedPostsPerMonth({ industryProfileId: 'clinic', pricingModelVersion: 'nonexistent' }),
      null,
    );
    assert.equal(
      committedPostsPerMonth({ industryProfileId: null, pricingModelVersion: PRICING_MODEL_VERSION }),
      null,
    );
    assert.ok(MAX_MONTHLY_CONTENT_SLOTS === 31, '0049 caps ordinal at 31');
  });
});

describe('BLOG-SCREEN — the month is read in the site time zone', () => {
  test('a site resolves the calendar month its own customers are living in', () => {
    // 2026-09-01T04:30Z is still August 31 in Denver (UTC-6) and already September in New York.
    const instant = new Date('2026-09-01T04:30:00.000Z');
    assert.equal(currentMonthStartDateInTimeZone('America/Denver', instant), '2026-08-01');
    assert.equal(currentMonthStartDateInTimeZone('America/New_York', instant), '2026-09-01');
  });

  test('the seeded clinic demo carries the contract pair its slots inherit', () => {
    const site = buildSeed().sites.get(SUMMIT_DENTAL_SITE_ID) as Site;
    assert.ok(site);
    const plan = siteFulfillmentPlan(site, new Date('2026-08-05T12:00:00.000Z'));
    assert.equal(plan.timeZone, 'America/Denver');
    assert.equal(plan.periodMonth, '2026-08-01');
    assert.equal(plan.pricingModelVersion, PRICING_MODEL_VERSION);
    assert.equal(plan.committed, 8);
  });
});

describe('BLOG-SCREEN — the customer view carries no operator internals', () => {
  test('an in-progress post exposes no title, reason, or generation evidence', async () => {
    const moduleLoader = Module as unknown as {
      _load: (request: string, parent: unknown, isMain: boolean) => unknown;
    };
    const originalLoad = moduleLoader._load;
    moduleLoader._load = function loadForViewTest(request, parent, isMain) {
      // The standalone runner has no Next server condition; only the marker package is neutralized.
      if (request === 'server-only') return {};
      return originalLoad.call(this, request, parent, isMain);
    };
    const globalWithRepo = globalThis as typeof globalThis & {
      __daboimContentQueueRepository__?: unknown;
    };
    const previousRepository = globalWithRepo.__daboimContentQueueRepository__;

    try {
      const repository = await provisionedMonth();
      const slots = await repository.listBySites({ siteIds: [SITE_ID] });
      await publish(repository, slots[0].id, 1);
      await publish(repository, slots[1].id, 'safe-catalog');
      // A rejected draft is the sharpest case: its reason must not reach the customer.
      await repository.claimGeneration({
        id: slots[2].id,
        actorId: 'admin',
        regeneration: false,
      });
      const rejectedDraft = await repository.storeGenerated({
        id: slots[2].id,
        actorId: 'admin',
        generated: generated(1),
      });
      await repository.reject({
        id: slots[2].id,
        expectedVersionId: rejectedDraft.currentVersionId!,
        actorId: 'admin',
        reason: 'The claim about sedation is not in the source.',
      });

      globalWithRepo.__daboimContentQueueRepository__ = repository;
      const { loadCustomerBlogView } = await import('@/lib/content-fulfillment/customer-view');
      const site = {
        id: SITE_ID,
        clientId: CLIENT_ID,
        name: 'Summit Dental Studio',
        domain: 'summit-dental.anakslabs.com',
        industryProfileId: 'clinic',
        pricingModelVersion: PRICING_MODEL_VERSION,
        siteConfig: { meta: { timezone: 'America/Denver' } },
        draftConfig: null,
      } as unknown as Site;
      const view = await loadCustomerBlogView(site, new Date('2026-08-05T12:00:00.000Z'));

      assert.equal(view.committed, 8);
      assert.equal(view.delivered, 1, 'the safe-catalog publication is not delivered work');
      assert.equal(view.thisMonth.length, 8);

      const serialized = JSON.stringify(view);
      assert.ok(
        !serialized.includes('sedation'),
        'a rejection reason must never reach the customer DTO',
      );
      assert.ok(!serialized.includes('safe-catalog'), 'the generation attempt must not leak');
      assert.ok(!serialized.includes('sourceRefs'), 'source evidence must not leak');
      assert.ok(!serialized.includes('versionNumber'), 'version internals must not leak');

      const inProgress = view.thisMonth.filter((post) => post.state === 'in_progress');
      assert.equal(inProgress.length, 6);
      for (const post of inProgress) {
        assert.equal(post.title, null, 'an unpublished draft title is not the customer’s copy yet');
        assert.equal(post.summary, null);
        assert.equal(post.publishedAt, null);
        assert.equal(post.url, null, 'nothing links out until it is actually live');
      }

      const published = view.thisMonth.filter((post) => post.state === 'published');
      assert.equal(published.length, 2, 'the override publication is still visible as a post');
      for (const post of published) {
        assert.ok(post.title);
        assert.ok(post.publishedAt);
        assert.equal(
          post.url,
          `https://summit-dental.anakslabs.com/blog/${monthlySlotSlug(PERIOD, post.ordinal)}`,
        );
      }
    } finally {
      globalWithRepo.__daboimContentQueueRepository__ = previousRepository;
      moduleLoader._load = originalLoad;
    }
  });
});
