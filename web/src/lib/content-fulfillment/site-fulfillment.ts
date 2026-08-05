/**
 * Resolves what one site owes for the month it is currently living in.
 *
 * The month is read in the *site's* time zone, not the server's: a Denver clinic that logs in on
 * the 1st at 00:30 local must see the new month, and a UTC-shaped answer would still show the old
 * one for hours.
 */
import type { Site } from '@/lib/types/domain';
import { DEFAULT_US_SITE_TIMEZONE, type UsSiteTimezone } from '@/lib/types/site';
import { currentMonthStartDateInTimeZone } from '@/lib/reporting/period';
import { committedPostsPerMonth } from './delivery';

export interface SiteFulfillmentPlan {
  timeZone: UsSiteTimezone;
  /** `YYYY-MM-01` in the site's time zone. */
  periodMonth: string;
  /** The contract version stamped on the site; slots inherit it. */
  pricingModelVersion: string | null;
  /** Posts owed this month, or null when the site carries no resolvable contract. */
  committed: number | null;
}

/** The published config is the served truth; a draft-only site still has a time zone to honor. */
export function siteContentTimeZone(site: Site): UsSiteTimezone {
  return site.siteConfig?.meta.timezone
    ?? site.draftConfig?.meta.timezone
    ?? DEFAULT_US_SITE_TIMEZONE;
}

export function siteFulfillmentPlan(site: Site, now: Date = new Date()): SiteFulfillmentPlan {
  const timeZone = siteContentTimeZone(site);
  return {
    timeZone,
    periodMonth: currentMonthStartDateInTimeZone(timeZone, now),
    pricingModelVersion: site.pricingModelVersion ?? null,
    committed: committedPostsPerMonth({
      industryProfileId: site.industryProfileId,
      pricingModelVersion: site.pricingModelVersion,
    }),
  };
}
