/**
 * Monthly fulfillment arithmetic for content slots.
 *
 * The promise a clinic buys is "N posts this month", so the counter is anchored to the month a
 * slot was *promised for* (`period_month`) rather than the instant it happened to go live.
 * `published_at` answers a different question and is only ever shown as per-post detail.
 */
import type { AdminContentQueueItem } from '@/lib/admin/content-queue-core';
import type { IndustryProfileId } from '@/lib/industry/profiles';
import { industryProfile } from '@/lib/pricing';

/** 0049 caps `ordinal` at 31, so a month can never owe more slots than that. */
export const MAX_MONTHLY_CONTENT_SLOTS = 31;

/** `period_month` is a calendar-month date; compare on the month key so a date or a timestamp both work. */
export function periodMonthKey(periodMonth: string): string {
  return periodMonth.slice(0, 7);
}

export function isSamePeriodMonth(left: string, right: string): boolean {
  return periodMonthKey(left) === periodMonthKey(right);
}

/**
 * Deterministic per-slot slug. `(site_id, slug)` is unique in 0049 and so is
 * `(site_id, pricing_model_version, period_month, ordinal)`; deriving one from the other keeps
 * re-provisioning idempotent instead of minting a fresh slug on every retry.
 */
export function monthlySlotSlug(periodMonth: string, ordinal: number): string {
  return `${periodMonthKey(periodMonth)}-post-${ordinal}`;
}

/**
 * Safe-catalog is the generator's own fallback copy, not fulfillment of the contract. Publishing
 * one is an explicit operator exception, and it must not count toward what the customer was owed.
 *
 * This reads the immutable version row that the server joined onto the slot — never the public
 * projection, whose pipeline-version gate can drop the evidence entirely.
 */
export function isSafeCatalogSlot(item: AdminContentQueueItem): boolean {
  return item.currentVersion?.generationMetadata.attempt === 'safe-catalog';
}

export function slotsForPeriod(
  items: readonly AdminContentQueueItem[],
  periodMonth: string,
): AdminContentQueueItem[] {
  return items.filter((item) => isSamePeriodMonth(item.periodMonth, periodMonth));
}

/** Published slots promised for this month, safe-catalog exceptions excluded. */
export function deliveredSlotsForPeriod(
  items: readonly AdminContentQueueItem[],
  periodMonth: string,
): AdminContentQueueItem[] {
  return slotsForPeriod(items, periodMonth)
    .filter((item) => item.status === 'published' && !isSafeCatalogSlot(item));
}

export function deliveredCountForPeriod(
  items: readonly AdminContentQueueItem[],
  periodMonth: string,
): number {
  return deliveredSlotsForPeriod(items, periodMonth).length;
}

/**
 * How many posts the month owes. Never a literal: the count lives in the industry profile that the
 * row's own pricing model version pins, so a site on a frozen contract keeps its own number.
 * Returns null when the pair no longer resolves — the UI then states the numerator alone rather
 * than inventing a denominator.
 */
export function committedPostsPerMonth(input: {
  industryProfileId: IndustryProfileId | null | undefined;
  pricingModelVersion: string | null | undefined;
}): number | null {
  if (!input.industryProfileId || !input.pricingModelVersion) return null;
  const profile = industryProfile(input.industryProfileId, input.pricingModelVersion);
  if (!profile) return null;
  const posts = profile.postsPerMonth;
  return Number.isSafeInteger(posts) && posts > 0 && posts <= MAX_MONTHLY_CONTENT_SLOTS
    ? posts
    : null;
}
