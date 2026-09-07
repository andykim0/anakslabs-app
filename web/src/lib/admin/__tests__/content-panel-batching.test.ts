/**
 * The fulfillment panel's read cost.
 *
 * It used to issue one query per site on purpose: a pooled read shared one row budget between
 * every site and truncated the tail, which made sites report slots they already had as missing.
 * That is a real failure mode and the batching here must not reintroduce it — so both properties
 * are asserted together: the round trips collapse, AND every site's counters stay exact at a
 * roster size where the naive pooled read would have started lying.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { MockContentQueueRepository } from '@/lib/admin/content-queue-repository-mock';
import {
  CONTENT_QUEUE_MAX_LIMIT,
  type ContentQueueSiteQuery,
  type ContentQueueRepository,
} from '@/lib/admin/content-queue-core';
import { MAX_MONTHLY_CONTENT_SLOTS } from '@/lib/content-fulfillment/delivery';
import { currentMonthStartDateInTimeZone } from '@/lib/reporting/period';
import { PRICING_MODEL_VERSION } from '@/lib/pricing';
import type { Site } from '@/lib/types/domain';
import {
  CONTENT_PANEL_SITES_PER_QUERY,
  contentPanelQueryPlan,
  loadContentFulfillmentPanelRows,
} from '../content-fulfillment-panel-core';
import { publishSlot } from './content-slot-fixtures';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-09-07T12:00:00.000Z');

function siteId(index: number): string {
  return `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`;
}

function site(index: number, timezone = 'America/Denver'): Site {
  return {
    id: siteId(index),
    clientId: CLIENT_ID,
    name: `Clinic ${String(index).padStart(3, '0')}`,
    domain: `clinic-${index}.anakslabs.com`,
    status: 'live',
    publishedAt: '2026-08-01T00:00:00.000Z',
    industryProfileId: 'clinic',
    pricingModelVersion: PRICING_MODEL_VERSION,
    siteConfig: { meta: { timezone, locale: 'en-US' } },
    draftConfig: null,
  } as unknown as Site;
}

/** Counts `listBySites` calls without touching a database. */
function counting(repository: MockContentQueueRepository): {
  repository: Pick<ContentQueueRepository, 'listBySites'>;
  queries: ContentQueueSiteQuery[];
} {
  const queries: ContentQueueSiteQuery[] = [];
  return {
    queries,
    repository: {
      listBySites: (query) => {
        queries.push(query);
        return repository.listBySites(query);
      },
    },
  };
}

async function provision(
  repository: MockContentQueueRepository,
  sites: readonly Site[],
  periodMonth: string,
  count = 8,
): Promise<void> {
  for (const entry of sites) {
    await repository.provisionMonthlySlots({
      clientId: entry.clientId,
      siteId: entry.id,
      pricingModelVersion: PRICING_MODEL_VERSION,
      periodMonth,
      count,
      actorId: 'admin',
    });
  }
}

describe('the fulfillment panel batches its reads', () => {
  test('a screen of sites costs one round trip, not one per site', async () => {
    const repository = new MockContentQueueRepository();
    const sites = Array.from({ length: CONTENT_PANEL_SITES_PER_QUERY }, (_, i) => site(i + 1));
    const period = currentMonthStartDateInTimeZone('America/Denver', NOW);
    await provision(repository, sites, period);

    const counted = counting(repository);
    const rows = await loadContentFulfillmentPanelRows({
      sites,
      repository: counted.repository,
      now: NOW,
    });
    assert.equal(counted.queries.length, 1, 'sixteen sites, one query');
    assert.equal(rows.length, sites.length);
    assert.ok(rows.every((row) => row.slotCount === 8));
  });

  test('a hundred sites cost seven round trips instead of a hundred, and no site is truncated', async () => {
    const repository = new MockContentQueueRepository();
    const sites = Array.from({ length: 100 }, (_, i) => site(i + 1));
    const period = currentMonthStartDateInTimeZone('America/Denver', NOW);
    // The maximum a month can hold, which is where a shared row budget would start losing rows.
    await provision(repository, sites, period, MAX_MONTHLY_CONTENT_SLOTS);

    const counted = counting(repository);
    const rows = await loadContentFulfillmentPanelRows({
      sites,
      repository: counted.repository,
      now: NOW,
    });
    assert.equal(counted.queries.length, Math.ceil(100 / CONTENT_PANEL_SITES_PER_QUERY));
    assert.equal(rows.length, 100);
    assert.ok(
      rows.every((row) => row.slotCount === MAX_MONTHLY_CONTENT_SLOTS),
      'every site must see all 31 of its own rows',
    );
  });

  test('no query can ask for more rows than the repository will return', async () => {
    const plan = contentPanelQueryPlan(
      Array.from({ length: 100 }, (_, i) => ({
        siteId: siteId(i + 1),
        periodMonth: '2026-09-01',
      })),
    );
    for (const query of plan) {
      assert.ok(query.siteIds.length <= CONTENT_PANEL_SITES_PER_QUERY, 'chunk size');
      assert.ok(
        query.limit <= CONTENT_QUEUE_MAX_LIMIT,
        `a limit past ${CONTENT_QUEUE_MAX_LIMIT} is silently clamped and truncates: ${query.limit}`,
      );
      assert.equal(query.limit, MAX_MONTHLY_CONTENT_SLOTS * query.siteIds.length);
    }
  });

  test('sites living in different months are never mixed into one query', async () => {
    // On the 7th at 12:00 UTC these are the same calendar month; the grouping is asserted on the
    // plan itself so it holds on the day of the year when they are not.
    const plan = contentPanelQueryPlan([
      { siteId: siteId(1), periodMonth: '2026-09-01' },
      { siteId: siteId(2), periodMonth: '2026-10-01' },
      { siteId: siteId(3), periodMonth: '2026-09-01' },
    ]);
    assert.equal(plan.length, 2);
    assert.deepEqual(
      plan.map((query) => [query.periodMonth, query.siteIds.length]),
      [['2026-09-01', 2], ['2026-10-01', 1]],
    );
  });

  test('the counters are the same numbers the per-site read produced', async () => {
    const repository = new MockContentQueueRepository();
    const sites = [site(1), site(2)];
    const period = currentMonthStartDateInTimeZone('America/Denver', NOW);
    await provision(repository, sites, period);

    const first = await repository.listBySites({
      siteIds: [sites[0]!.id],
      periodMonths: [period],
    });
    await publishSlot(repository, first[0]!.id);
    await publishSlot(repository, first[1]!.id, 'safe-catalog');

    const rows = await loadContentFulfillmentPanelRows({ sites, repository, now: NOW });
    const one = rows.find((row) => row.siteId === sites[0]!.id)!;
    assert.equal(one.committed, 8);
    assert.equal(one.slotCount, 8);
    assert.equal(one.delivered, 1, 'a safe-catalog publication is not fulfilment of the contract');
    assert.equal(rows.find((row) => row.siteId === sites[1]!.id)!.delivered, 0);
  });

  test('a site with no contract pair is left out, and an empty roster costs no query', async () => {
    const repository = new MockContentQueueRepository();
    const counted = counting(repository);
    assert.deepEqual(
      await loadContentFulfillmentPanelRows({ sites: [], repository: counted.repository }),
      [],
    );
    assert.equal(counted.queries.length, 0);

    const unpriced = {
      ...site(1),
      industryProfileId: null,
      pricingModelVersion: null,
    } as unknown as Site;
    assert.deepEqual(
      await loadContentFulfillmentPanelRows({
        sites: [unpriced],
        repository: counted.repository,
      }),
      [],
    );
    assert.equal(counted.queries.length, 0);
  });
});
