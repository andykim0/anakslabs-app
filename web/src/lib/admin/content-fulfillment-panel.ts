import 'server-only';
import { getDataServices } from '@/lib/data';
import {
  MAX_MONTHLY_CONTENT_SLOTS,
  deliveredCountForPeriod,
  slotsForPeriod,
} from '@/lib/content-fulfillment/delivery';
import { siteFulfillmentPlan } from '@/lib/content-fulfillment/site-fulfillment';
import { getContentQueueRepository } from './content-queue-repository';

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

/**
 * Monthly fulfillment per site, read independently of the approval queue.
 *
 * This deliberately does not share a query with the queue listing. One pooled read across every
 * site divides a single row budget between them, so past roughly sixty sites the tail is silently
 * truncated and those sites report slots they actually have as missing — an operator would go
 * provisioning months that were already full.
 *
 * Reading per site removes the failure mode structurally rather than by raising a ceiling. A site
 * can hold at most 31 rows for one month: 0049 caps `ordinal` at 31, the schedule identity is
 * unique per (site, pricing_model_version, period_month, ordinal), and 0047's protected-columns
 * trigger fixes `pricing_model_version` permanently once set, so a site can never accumulate a
 * second version's worth of rows in the same month. A 31-row request therefore cannot truncate,
 * no matter how many sites exist.
 *
 * The cost is one query per site instead of one overall, which is the right trade for an
 * operator-managed console: bounded fan-out, and a number that stays correct as the roster grows.
 */
export async function loadContentFulfillmentPanel(): Promise<ContentFulfillmentPanelRow[]> {
  const sites = (await getDataServices().sites.listAll())
    .filter((site) => site.industryProfileId && site.pricingModelVersion)
    .sort((left, right) => left.name.localeCompare(right.name));
  if (sites.length === 0) return [];

  const repository = getContentQueueRepository();
  return Promise.all(sites.map(async (site) => {
    // Each site's own time zone decides which month it is living in.
    const plan = siteFulfillmentPlan(site);
    const slots = await repository.listBySites({
      siteIds: [site.id],
      periodMonths: [plan.periodMonth],
      limit: MAX_MONTHLY_CONTENT_SLOTS,
    });
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
  }));
}
