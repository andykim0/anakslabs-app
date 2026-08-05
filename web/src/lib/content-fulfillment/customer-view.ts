import 'server-only';
import { getContentQueueRepository } from '@/lib/admin/content-queue-repository';
import type { AdminContentQueueItem } from '@/lib/admin/content-queue-core';
import { siteUrlOf } from '@/lib/seo/structured-data';
import type { Site } from '@/lib/types/domain';
import { deliveredCountForPeriod, isSafeCatalogSlot, slotsForPeriod } from './delivery';
import { siteFulfillmentPlan } from './site-fulfillment';

/**
 * What a customer is allowed to know about their own post.
 *
 * Everything the operator uses to run the queue — rejection reasons, generation attempt, source
 * refs, policy evidence, version numbers — stays on the admin side. A post is either live on the
 * customer's domain or it is being worked on; there is no third thing worth telling them, and the
 * intermediate states are ours to fix, not theirs to interpret.
 */
export type CustomerBlogPostState = 'published' | 'in_progress';

export interface CustomerBlogPost {
  id: string;
  ordinal: number;
  periodMonth: string;
  state: CustomerBlogPostState;
  /**
   * True only for a post that is live but does not count toward the month's total — a general
   * article rather than one written from this business's own information. It exists so the screen
   * can explain the gap between what is live and what the counter says, instead of leaving the
   * customer to read the difference as an arithmetic error. Never true while in progress: an
   * unpublished draft has not been delivered as anything yet.
   */
  interim: boolean;
  /** Copy only exists for the customer once it is live under their own domain. */
  title: string | null;
  summary: string | null;
  publishedAt: string | null;
  url: string | null;
}

export interface CustomerBlogView {
  siteId: string;
  siteName: string;
  domain: string | null;
  periodMonth: string;
  /** Published slots promised for this month, safe-catalog exceptions excluded. */
  delivered: number;
  /** Posts owed this month; null when the site carries no resolvable contract. */
  committed: number | null;
  thisMonth: CustomerBlogPost[];
  earlier: CustomerBlogPost[];
}

function publishedUrl(site: Site, item: AdminContentQueueItem): string | null {
  if (item.status !== 'published') return null;
  const base = siteUrlOf(site.domain);
  return base ? `${base}/blog/${encodeURIComponent(item.slug)}` : null;
}

function customerPost(site: Site, item: AdminContentQueueItem): CustomerBlogPost {
  const published = item.status === 'published';
  return {
    id: item.id,
    ordinal: item.ordinal,
    periodMonth: item.periodMonth,
    state: published ? 'published' : 'in_progress',
    interim: published && isSafeCatalogSlot(item),
    title: published ? item.currentVersion?.title ?? null : null,
    summary: published ? item.currentVersion?.summary ?? null : null,
    publishedAt: published ? item.publishedAt : null,
    url: publishedUrl(site, item),
  };
}

function byOrdinal(left: CustomerBlogPost, right: CustomerBlogPost): number {
  return left.ordinal - right.ordinal;
}

/**
 * How far back the history list reaches. A single unbounded read cannot serve this screen: with
 * one row budget shared between months, a long-lived site's *current* month falls off the end and
 * the counter reads zero. So the current month is fetched exactly, and history is a separate
 * newest-first read. Roughly 25 months of an eight-post contract fit here; anything older than
 * that is omitted from the list, which the counter never depends on.
 */
const EARLIER_POST_LIMIT = 200;

/**
 * The caller is responsible for having proven ownership of `site` — this reads through the
 * service-role queue repository and applies no tenancy filter of its own beyond the site id.
 */
export async function loadCustomerBlogView(
  site: Site,
  now: Date = new Date(),
): Promise<CustomerBlogView> {
  const plan = siteFulfillmentPlan(site, now);
  const repository = getContentQueueRepository();
  const [thisMonthItems, earlierItems] = await Promise.all([
    // Exact month: the counter is computed from these rows, so they can never be crowded out.
    repository.listBySites({
      siteIds: [site.id],
      periodMonths: [plan.periodMonth],
    }),
    repository.listBySites({
      siteIds: [site.id],
      beforePeriodMonth: plan.periodMonth,
      statuses: ['published'],
      order: 'desc',
      limit: EARLIER_POST_LIMIT,
    }),
  ]);

  return {
    siteId: site.id,
    siteName: site.name,
    domain: site.domain,
    periodMonth: plan.periodMonth,
    delivered: deliveredCountForPeriod(thisMonthItems, plan.periodMonth),
    committed: plan.committed,
    thisMonth: slotsForPeriod(thisMonthItems, plan.periodMonth)
      .map((item) => customerPost(site, item))
      .sort(byOrdinal),
    earlier: earlierItems
      .map((item) => customerPost(site, item))
      .sort((left, right) =>
        right.periodMonth.localeCompare(left.periodMonth) || byOrdinal(left, right)),
  };
}
