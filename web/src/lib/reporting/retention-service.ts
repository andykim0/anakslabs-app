import 'server-only';

import { getDataServices } from '@/lib/data';
import { getMonthlyReportsRepository } from './repository';
import { reportingRetentionCutoff } from './retention';

/** Service-role only; invoked by the authenticated reporting cron. */
export async function purgeExpiredReportingData(now: Date = new Date()) {
  const cutoff = reportingRetentionCutoff(now);
  const [siteEvents, reports] = await Promise.all([
    getDataServices().siteEvents.purgeBeforeDate(cutoff.eventBeforeDate),
    getMonthlyReportsRepository().purgeOlderThan(cutoff.reportCutoffIso),
  ]);
  return { ...cutoff, siteEvents, reports };
}
