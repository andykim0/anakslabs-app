import 'server-only';

import { getDataServices } from '@/lib/data';
import { getCitationCheckRepository } from '@/lib/citation-check/repository';
import { getMonthlyReportsRepository } from './repository';
import { reportingRetentionCutoff } from './retention';

/** Service-role only; invoked by the authenticated reporting cron. */
export async function purgeExpiredReportingData(now: Date = new Date()) {
  const cutoff = reportingRetentionCutoff(now);
  const [siteEvents, eventReceipts, reports, citationProbes] = await Promise.all([
    getDataServices().siteEvents.purgeBeforeDate(cutoff.eventBeforeDate),
    getDataServices().siteEvents.purgeExpiredReceipts(now.toISOString()),
    getMonthlyReportsRepository().purgeOlderThan(cutoff.reportCutoffIso),
    // [CITE$] Probes expire on the SAME window as the reports that quote them, using the
    // same cutoff, so a report can never outlive the rows behind its numbers.
    getCitationCheckRepository().purgeOlderThan(cutoff.reportCutoffIso),
  ]);
  return { ...cutoff, siteEvents, eventReceipts, reports, citationProbes };
}
