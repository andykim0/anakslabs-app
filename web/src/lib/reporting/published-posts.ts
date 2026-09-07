/**
 * [SERIES$] "What we published" — the report-month slice of the customer's own blog view.
 *
 * Pure, and deliberately NOT part of the stored report payload. A report is a measurement
 * record; the posts are already a first-class record of their own in the content queue,
 * and copying titles into the report would freeze them at generation time — a title fixed
 * after the fact would then read one way on the blog screen and another way in the email.
 */
import type { CustomerBlogPost, CustomerBlogView } from '@/lib/content-fulfillment/customer-view';
import type { ReportPublishedPost } from './types';

/** Nothing about a report is worth a runaway list; a month's contract is single digits. */
const MAX_REPORT_POSTS = 40;

function isPublished(post: CustomerBlogPost): boolean {
  return post.state === 'published' && typeof post.title === 'string' && post.title.trim() !== '';
}

/**
 * Posts published in `periodMonth`, in slot order.
 *
 * Both halves of the view are searched. `thisMonth` only ever holds the CURRENT month, and
 * a report always covers a COMPLETED one, so in production the matches come from `earlier`
 * — but a report regenerated inside its own month would find them in `thisMonth`, and
 * reading only one half would silently return an empty list in that case.
 *
 * An in-progress slot is dropped rather than listed as pending: the email states a fact
 * about what the month produced, and a customer counting rows should count live articles.
 */
export function publishedPostsForMonth(
  view: CustomerBlogView,
  periodMonth: string,
): ReportPublishedPost[] {
  const month = periodMonth.trim();
  if (!/^\d{4}-\d{2}$/u.test(month)) return [];
  return [...view.thisMonth, ...view.earlier]
    .filter((post) => post.periodMonth === month && isPublished(post))
    .sort((left, right) => left.ordinal - right.ordinal)
    .slice(0, MAX_REPORT_POSTS)
    .map((post) => ({
      ordinal: post.ordinal,
      title: (post.title ?? '').trim(),
      url: post.url,
      publishedAt: post.publishedAt,
    }));
}
