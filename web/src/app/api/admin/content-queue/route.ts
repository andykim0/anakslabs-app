import { NextResponse } from 'next/server';
import { getContentQueueRepository } from '@/lib/admin/content-queue-repository';
import { requireAdminOr403 } from '@/app/api/_lib/guards';
import { withApiHandler } from '@/app/api/_lib/http';
import { getDataServices } from '@/lib/data';
import {
  deliveredCountForPeriod,
  slotsForPeriod,
} from '@/lib/content-fulfillment/delivery';
import { siteFulfillmentPlan } from '@/lib/content-fulfillment/site-fulfillment';
import { contentQueueItemDto } from './_lib';

/**
 * Monthly fulfillment per site. The queue itself drops published rows by design, so the counter
 * cannot be derived from `items` — it is read from the slot rows for the site's current month.
 */
async function fulfillmentBySite() {
  const sites = (await getDataServices().sites.listAll())
    .filter((site) => site.industryProfileId && site.pricingModelVersion)
    .sort((left, right) => left.name.localeCompare(right.name));
  if (sites.length === 0) return [];

  const plans = sites.map((site) => ({ site, plan: siteFulfillmentPlan(site) }));
  const slots = await getContentQueueRepository().listBySites({
    siteIds: plans.map(({ site }) => site.id),
    periodMonths: [...new Set(plans.map(({ plan }) => plan.periodMonth))],
    limit: 500,
  });

  return plans.map(({ site, plan }) => {
    const own = slots.filter((slot) => slot.siteId === site.id);
    return {
      clientId: site.clientId,
      siteId: site.id,
      siteName: site.name,
      domain: site.domain,
      periodMonth: plan.periodMonth,
      timezone: plan.timeZone,
      committed: plan.committed,
      delivered: deliveredCountForPeriod(own, plan.periodMonth),
      slotCount: slotsForPeriod(own, plan.periodMonth).length,
    };
  });
}

export const GET = withApiHandler(async () => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const repository = getContentQueueRepository();
  const [items, sourceCount, fulfillment] = await Promise.all([
    repository.listNonterminal(),
    repository.countNonterminal(),
    fulfillmentBySite(),
  ]);
  return NextResponse.json({
    items: items.map(contentQueueItemDto),
    fulfillment,
    integrity: {
      sourceCount,
      queueCount: items.length,
      missingCount: Math.max(0, sourceCount - items.length),
    },
  });
});
