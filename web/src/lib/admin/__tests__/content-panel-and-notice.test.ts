/**
 * BLOG-SCREEN fix round 2 — F3, F4, F6.
 *
 *  F3  The admin fulfillment panel must stay correct as the site roster grows; one pooled read
 *      divided a single row budget between sites and reported full months as missing.
 *  F4  A live post that does not count toward the month must say so, rather than leaving the
 *      customer to read the gap between the badges and the counter as an arithmetic error.
 *  F6  Every published article carries an educational disclaimer, rendered beside the document
 *      and never inside it — the stored document's hash is what approval re-checks.
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import assertNode from 'node:assert';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import {
  MAX_MONTHLY_CONTENT_SLOTS,
  monthlySlotSlug,
} from '@/lib/content-fulfillment/delivery';
import { contentPostEducationalNotice } from '@/lib/legal/notices';
import { MockContentQueueRepository } from '@/lib/admin/content-queue-repository-mock';
import type {
  AdminContentQueueItem,
  ContentQueueSiteQuery,
} from '@/lib/admin/content-queue-core';
import { PRICING_MODEL_VERSION } from '@/lib/pricing';
import type { Site } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';
import { SUMMIT_DENTAL_SITE_CONFIG } from '@/lib/data/mock/summit-dental';
import { normalizeSiteConfig } from '@/lib/types/site';
import { publishSlot, slotGeneration } from './content-slot-fixtures';

const PERIOD = '2026-08-01';
const ACTOR = 'admin-user-7f3a2c9d';

/**
 * F3 asserts what the panel reports for the month it believes it is in, and the panel gets that
 * month from the wall clock: `loadContentFulfillmentPanel` takes no clock and calls
 * `siteFulfillmentPlan(site)`, whose `now` defaults to `new Date()`. With PERIOD a fixed string,
 * the two agreed only during August 2026 and the suite began failing on the 1st of September —
 * the same rot the 2026-08-14 batch cleared out of three other tests.
 *
 * The clock is frozen instead of the constant being bumped, because bumping only moves the
 * expiry. The instant is derived FROM PERIOD so the two cannot drift apart again: midday UTC on
 * the 15th is mid-month in every US zone this suite uses, so no zone offset or DST transition can
 * push the panel into a neighbouring month. At the next rollover — and every one after it —
 * nothing happens.
 */
const FROZEN_NOW = Date.parse(`${PERIOD.slice(0, 8)}15T12:00:00Z`);

type ModuleLoader = {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

function withServerOnlyNeutralized<T>(run: () => Promise<T>): Promise<T> {
  const loader = Module as unknown as ModuleLoader;
  const originalLoad = loader._load;
  loader._load = function load(request, parent, isMain) {
    if (request === 'server-only') return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  return run().finally(() => {
    loader._load = originalLoad;
  });
}

/** Records every query the panel issues, so the row budget can be asserted, not assumed. */
class RecordingRepository extends MockContentQueueRepository {
  readonly queries: ContentQueueSiteQuery[] = [];

  override async listBySites(query: ContentQueueSiteQuery): Promise<AdminContentQueueItem[]> {
    this.queries.push(structuredClone(query) as ContentQueueSiteQuery);
    return super.listBySites(query);
  }
}

describe('BLOG-SCREEN F3 — the panel stays correct as the roster grows', () => {
  // Only Date is faked: the panel's fan-out is promise-based and must still settle normally.
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: FROZEN_NOW }));
  afterEach(() => mock.timers.reset());

  /**
   * 63 sites × 8 posts is 504 rows for the current month alone — past the pooled read's old
   * 500-row ceiling. Each site also carries four earlier months, so its 40 rows exceed the
   * per-site 31-row request: that makes the month filter load-bearing rather than incidental,
   * since an unfiltered read of the same size would return the oldest months instead.
   */
  const EARLIER_MONTHS = ['2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01'];

  async function rosterOf63(): Promise<{
    repository: RecordingRepository;
    sites: Site[];
  }> {
    const repository = new RecordingRepository();
    const sites: Site[] = [];
    for (let index = 0; index < 63; index += 1) {
      const siteId = `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`;
      const clientId = `bbbbbbbb-bbbb-4bbb-8bbb-${String(index).padStart(12, '0')}`;
      for (const periodMonth of EARLIER_MONTHS) {
        await repository.provisionMonthlySlots({
          clientId,
          siteId,
          pricingModelVersion: PRICING_MODEL_VERSION,
          periodMonth,
          count: 8,
          actorId: ACTOR,
        });
      }
      await repository.provisionMonthlySlots({
        clientId,
        siteId,
        pricingModelVersion: PRICING_MODEL_VERSION,
        periodMonth: PERIOD,
        count: 8,
        actorId: ACTOR,
      });
      sites.push({
        id: siteId,
        clientId,
        name: `Clinic ${String(index).padStart(3, '0')}`,
        domain: `clinic-${index}.anakslabs.com`,
        industryProfileId: 'clinic',
        pricingModelVersion: PRICING_MODEL_VERSION,
        siteConfig: { meta: { timezone: 'America/Denver' } },
        draftConfig: null,
      } as unknown as Site);
    }
    return { repository, sites };
  }

  async function loadPanel(repository: RecordingRepository, sites: readonly Site[]) {
    const globalWithRepo = globalThis as typeof globalThis & {
      __daboimContentQueueRepository__?: unknown;
    };
    const previousRepo = globalWithRepo.__daboimContentQueueRepository__;
    globalWithRepo.__daboimContentQueueRepository__ = repository;
    const loader = Module as unknown as ModuleLoader;
    const originalLoad = loader._load;
    loader._load = function load(request, parent, isMain) {
      if (request === 'server-only') return {};
      const loaded = originalLoad.call(this, request, parent, isMain);
      if (request === '@/lib/data') {
        return {
          ...loaded as object,
          getDataServices: () => ({ sites: { listAll: async () => sites } }),
        };
      }
      return loaded;
    };
    try {
      const { loadContentFulfillmentPanel } = await import(
        '@/lib/admin/content-fulfillment-panel'
      );
      return await loadContentFulfillmentPanel();
    } finally {
      loader._load = originalLoad;
      globalWithRepo.__daboimContentQueueRepository__ = previousRepo;
    }
  }

  test('every site reports its real slot count at 63 sites and 504 rows', async () => {
    const { repository, sites } = await rosterOf63();
    assert.equal(
      (await repository.listBySites({ siteIds: [sites[0].id], limit: 500 })).length,
      40,
      'each site must hold more rows than one per-site request returns',
    );
    // Two sites deliver work so the numerator is exercised alongside the count.
    for (const site of [sites[0], sites[62]]) {
      const slots = await repository.listBySites({
        siteIds: [site.id],
        periodMonths: [PERIOD],
      });
      await publishSlot(repository, slots[0].id, 1);
    }
    repository.queries.length = 0;

    const panel = await loadPanel(repository, sites);

    assert.equal(panel.length, 63);
    for (const row of panel) {
      assert.equal(row.slotCount, 8, `${row.siteName} must report the slots it actually has`);
      assert.equal(row.committed, 8);
      assert.equal(row.periodMonth, PERIOD);
      assert.equal(row.timezone, 'America/Denver');
    }
    assert.equal(panel.filter((row) => row.delivered === 1).length, 2);
    assert.equal(panel.filter((row) => row.delivered === 0).length, 61);
  });

  test('no panel query asks for more than one month of one site', async () => {
    const { repository, sites } = await rosterOf63();
    repository.queries.length = 0;
    await loadPanel(repository, sites);

    assert.equal(repository.queries.length, 63, 'one bounded read per site');
    for (const query of repository.queries) {
      assert.equal(query.siteIds.length, 1, 'a query must never pool sites into one row budget');
      assert.deepEqual(query.periodMonths, [PERIOD], 'the month is filtered, not scanned');
      assert.ok(
        query.limit !== undefined && query.limit <= MAX_MONTHLY_CONTENT_SLOTS,
        `panel limit ${query.limit} must stay within one month's ceiling of ${MAX_MONTHLY_CONTENT_SLOTS}`,
      );
    }
  });
});

describe('BLOG-SCREEN F4 — a live post that does not count says so', () => {
  async function viewWith(
    build: (repository: MockContentQueueRepository, slotIds: string[]) => Promise<void>,
  ) {
    const siteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const clientId = '11111111-1111-4111-8111-111111111111';
    const repository = new MockContentQueueRepository();
    await repository.provisionMonthlySlots({
      clientId,
      siteId,
      pricingModelVersion: PRICING_MODEL_VERSION,
      periodMonth: PERIOD,
      count: 8,
      actorId: ACTOR,
    });
    const slots = await repository.listBySites({ siteIds: [siteId] });
    await build(repository, slots.map((slot) => slot.id));

    const globalWithRepo = globalThis as typeof globalThis & {
      __daboimContentQueueRepository__?: unknown;
    };
    const previous = globalWithRepo.__daboimContentQueueRepository__;
    globalWithRepo.__daboimContentQueueRepository__ = repository;
    try {
      const { loadCustomerBlogView } = await withServerOnlyNeutralized(
        () => import('@/lib/content-fulfillment/customer-view'),
      );
      return await loadCustomerBlogView({
        id: siteId,
        clientId,
        name: 'Summit Dental Studio',
        domain: 'summit-dental.anakslabs.com',
        industryProfileId: 'clinic',
        pricingModelVersion: PRICING_MODEL_VERSION,
        siteConfig: { meta: { timezone: 'America/Denver' } },
        draftConfig: null,
      } as unknown as Site, new Date('2026-08-05T12:00:00.000Z'));
    } finally {
      globalWithRepo.__daboimContentQueueRepository__ = previous;
    }
  }

  test('interim marks the published safe-catalog post and nothing else', async () => {
    const view = await viewWith(async (repository, ids) => {
      await publishSlot(repository, ids[0], 1);
      await publishSlot(repository, ids[1], 'safe-catalog');
    });

    assert.equal(view.delivered, 1, 'the counter is unchanged by this field');
    assert.equal(view.committed, 8);
    const interim = view.thisMonth.filter((post) => post.interim);
    assert.equal(interim.length, 1);
    assert.equal(interim[0].ordinal, 2);
    assert.equal(interim[0].state, 'published', 'interim is a published state, not a third one');
    const counted = view.thisMonth.find((post) => post.ordinal === 1);
    assert.equal(counted?.interim, false, 'a delivered post is never interim');
  });

  test('an unpublished safe-catalog draft is never interim', async () => {
    // Boolean absence is invisible to a string search, so the field is asserted by value.
    const view = await viewWith(async (repository, ids) => {
      await repository.claimGeneration({ id: ids[0], actorId: ACTOR, regeneration: false });
      await repository.storeGenerated({
        id: ids[0],
        actorId: ACTOR,
        generated: slotGeneration('safe-catalog'),
      });
    });

    const pending = view.thisMonth.find((post) => post.ordinal === 1);
    assert.equal(pending?.state, 'in_progress');
    assert.equal(
      pending?.interim,
      false,
      'a draft has not been delivered as anything yet, interim or otherwise',
    );
    for (const post of view.thisMonth) {
      assert.equal(typeof post.interim, 'boolean', 'the field is always present and boolean');
      if (post.state === 'in_progress') assert.equal(post.interim, false);
    }
  });

  test('the customer DTO still carries no operator internals', async () => {
    const view = await viewWith(async (repository, ids) => {
      await publishSlot(repository, ids[0], 1);
      await publishSlot(repository, ids[1], 'safe-catalog');
      await repository.claimGeneration({ id: ids[2], actorId: ACTOR, regeneration: false });
      const stored = await repository.storeGenerated({
        id: ids[2],
        actorId: ACTOR,
        generated: slotGeneration(1),
      });
      await repository.reject({
        id: ids[2],
        expectedVersionId: stored.currentVersionId!,
        actorId: ACTOR,
        reason: 'The claim about sedation is not in the source.',
      });
    });

    const serialized = JSON.stringify(view);
    assert.ok(!serialized.includes('sedation'), 'no rejection reason');
    assert.ok(!serialized.includes('safe-catalog'), 'no generation attempt');
    assert.ok(!serialized.includes('sourceRefs'), 'no source evidence');
    assert.ok(!serialized.includes('versionNumber'), 'no version internals');
  });
});

describe('BLOG-SCREEN F6 — published articles carry an educational disclaimer', () => {
  const CONFIG = normalizeSiteConfig(structuredClone(SUMMIT_DENTAL_SITE_CONFIG)) as SiteConfig;

  function publishedPost() {
    return {
      id: '22222222-2222-4222-8222-222222222222',
      siteId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      clientId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      versionId: '33333333-3333-4333-8333-333333333333',
      slug: monthlySlotSlug(PERIOD, 1),
      title: 'What to expect at your first visit',
      summary: 'A source-backed walkthrough of the first appointment.',
      tags: ['first visit'],
      document: {
        version: 1 as const,
        blocks: [{ type: 'paragraph' as const, text: 'Bring your insurance card.' }],
      },
      publishedAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    };
  }

  test('the notice is fixed text with one slot and stays industry-neutral', () => {
    const notice = contentPostEducationalNotice('Summit Dental Studio');
    assert.equal(
      notice,
      'This article is general information provided by Summit Dental Studio and is not a '
      + 'substitute for professional medical advice. For questions about your own care, '
      + 'contact the clinic.',
    );
    // The pipeline classifies these businesses generically as medical; a specialty would assert
    // something the site data does not establish.
    assert.doesNotMatch(notice, /dentist|dental practice|orthodont/iu);
    assert.equal(contentPostEducationalNotice('   '), contentPostEducationalNotice('this clinic'));
  });

  test('the detail render carries the notice beside the document, not inside it', async () => {
    const { TenantContentBlog } = await withServerOnlyNeutralized(
      () => import('@/components/content-posts/TenantContentBlog'),
    );
    const post = publishedPost();
    const html = renderToStaticMarkup(createElement(TenantContentBlog, {
      config: CONFIG,
      posts: [post],
      post,
    }));

    assert.ok(
      html.includes('is not a substitute for professional medical advice'),
      'the detail page must carry the disclaimer',
    );
    assert.ok(html.includes('Summit Dental Studio'), 'the clinic name fills the slot');
    // The stored document is untouched: its one block is still the only body copy.
    assert.equal(post.document.blocks.length, 1);
    assert.equal(post.document.blocks[0].text, 'Bring your insurance card.');
    assertNode.match(html, /<aside[^>]*anaks-content-blog__notice/u);
  });

  test('the index does not claim to be an article', async () => {
    const { TenantContentBlog } = await withServerOnlyNeutralized(
      () => import('@/components/content-posts/TenantContentBlog'),
    );
    const html = renderToStaticMarkup(createElement(TenantContentBlog, {
      config: CONFIG,
      posts: [publishedPost()],
    }));
    // The sentence begins "This article is…" and the index is a list, not an article.
    assert.ok(
      !html.includes('is not a substitute for professional medical advice'),
      'the list page must not print a sentence that is false there',
    );
    assert.ok(html.includes('What to expect at your first visit'), 'it still lists the post');
  });

  test('the static export carries the notice on post files and not on the index', async () => {
    const { renderStaticContentPostFiles } = await withServerOnlyNeutralized(
      () => import('@/lib/content-fulfillment/render-static'),
    );
    const files = renderStaticContentPostFiles({
      site: {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        domain: 'summit-dental.anakslabs.com',
        siteConfig: CONFIG,
      } as unknown as Site,
      posts: [publishedPost()],
    });

    assert.equal(files.length, 2, 'a list file and one detail file');
    const index = files.find((file) => file.name === 'blog.html');
    const detail = files.find((file) => file.name.startsWith('blog/'));
    assert.ok(index && detail);
    assert.ok(
      detail.html.includes('is not a substitute for professional medical advice'),
      `${detail.name} must carry the disclaimer`,
    );
    assert.ok(
      !index.html.includes('is not a substitute for professional medical advice'),
      'the exported index must not carry it either',
    );
  });
});
