/**
 * Monthly fulfillment per site, batched.
 *
 * This used to issue one query per site — deliberately, because the alternative it replaced
 * divided a single row budget between every site and silently truncated the tail past roughly
 * sixty of them, so sites reported slots they actually had as missing. That reasoning was right
 * about the failure mode and wrong about the only way out of it: at a hundred customers the
 * console opens a hundred round trips to render one panel.
 *
 * The batching here cannot truncate, structurally rather than by raising a ceiling:
 *
 *  - A site can hold at most `MAX_MONTHLY_CONTENT_SLOTS` (31) rows for one month. 0049 caps
 *    `ordinal` at 31, the schedule identity is unique per
 *    (site, pricing_model_version, period_month, ordinal), and 0047's protected-columns trigger
 *    fixes `pricing_model_version` permanently once set.
 *  - So a query asking for exactly one month and at most
 *    `floor(CONTENT_QUEUE_MAX_LIMIT / 31)` = 16 sites requests at most 496 rows, inside the
 *    repository's own 500-row ceiling. `normalizeContentQueueLimit` clamps anything larger, which
 *    is why the chunk is sized against that constant instead of ignoring it.
 *  - Sites are grouped by the month they are actually living in before chunking. Time zones span
 *    more than a day, so on the 1st some sites are in month M and others in M+1; asking for the
 *    union in one query would let a single site return up to 62 rows and put the row budget back
 *    in play.
 *
 * The result: 16 sites cost one round trip instead of sixteen, a hundred cost seven instead of a
 * hundred, and no site can be short-changed by another site's rows.
 */
import type { Site } from '@/lib/types/domain';
import {
  MAX_MONTHLY_CONTENT_SLOTS,
  deliveredCountForPeriod,
  slotsForPeriod,
} from '@/lib/content-fulfillment/delivery';
import { siteFulfillmentPlan } from '@/lib/content-fulfillment/site-fulfillment';
import {
  CONTENT_QUEUE_MAX_LIMIT,
  type AdminContentQueueItem,
  type ContentQueueRepository,
} from './content-queue-core';

export interface ContentFulfillmentPanelRow {
  clientId: string;
  siteId: string;
  siteName: string;
  domain: string | null;
  periodMonth: string;
  timezone: string;
  committed: number | null;
  delivered: number;
  slotCount: number;
}

/** 16. One month's worth of rows for this many sites still fits the repository's row ceiling. */
export const CONTENT_PANEL_SITES_PER_QUERY = Math.max(
  1,
  Math.floor(CONTENT_QUEUE_MAX_LIMIT / MAX_MONTHLY_CONTENT_SLOTS),
);

export interface ContentPanelQuery {
  periodMonth: string;
  siteIds: string[];
  limit: number;
}

/** The exact queries the panel will issue. Separated so a test can count them without a database. */
export function contentPanelQueryPlan(
  plans: ReadonlyArray<{ siteId: string; periodMonth: string }>,
): ContentPanelQuery[] {
  const byMonth = new Map<string, string[]>();
  for (const plan of plans) {
    const bucket = byMonth.get(plan.periodMonth);
    if (bucket) bucket.push(plan.siteId);
    else byMonth.set(plan.periodMonth, [plan.siteId]);
  }
  const queries: ContentPanelQuery[] = [];
  for (const [periodMonth, siteIds] of byMonth) {
    for (let start = 0; start < siteIds.length; start += CONTENT_PANEL_SITES_PER_QUERY) {
      const chunk = siteIds.slice(start, start + CONTENT_PANEL_SITES_PER_QUERY);
      queries.push({
        periodMonth,
        siteIds: chunk,
        limit: MAX_MONTHLY_CONTENT_SLOTS * chunk.length,
      });
    }
  }
  return queries;
}

export async function loadContentFulfillmentPanelRows(input: {
  sites: readonly Site[];
  repository: Pick<ContentQueueRepository, 'listBySites'>;
  now?: Date;
}): Promise<ContentFulfillmentPanelRow[]> {
  const sites = [...input.sites]
    .filter((site) => site.industryProfileId && site.pricingModelVersion)
    .sort((left, right) => left.name.localeCompare(right.name));
  if (sites.length === 0) return [];

  // Each site's own time zone decides which month it is living in.
  const plans = new Map(sites.map((site) => [
    site.id,
    siteFulfillmentPlan(site, input.now ?? new Date()),
  ]));
  const queries = contentPanelQueryPlan(
    sites.map((site) => ({ siteId: site.id, periodMonth: plans.get(site.id)!.periodMonth })),
  );

  const bySite = new Map<string, AdminContentQueueItem[]>();
  const results = await Promise.all(queries.map((query) => input.repository.listBySites({
    siteIds: query.siteIds,
    periodMonths: [query.periodMonth],
    limit: query.limit,
  })));
  for (const rows of results) {
    for (const row of rows) {
      const bucket = bySite.get(row.siteId);
      if (bucket) bucket.push(row);
      else bySite.set(row.siteId, [row]);
    }
  }

  return sites.map((site) => {
    const plan = plans.get(site.id)!;
    // The month filter is re-applied locally: the query already scoped to it, and this keeps the
    // counters honest if a repository ever returns more than it was asked for.
    const slots = bySite.get(site.id) ?? [];
    const own = slotsForPeriod(slots, plan.periodMonth);
    return {
      clientId: site.clientId,
      siteId: site.id,
      siteName: site.name,
      domain: site.domain,
      periodMonth: plan.periodMonth,
      timezone: plan.timeZone,
      committed: plan.committed,
      delivered: deliveredCountForPeriod(slots, plan.periodMonth),
      slotCount: own.length,
    };
  });
}
