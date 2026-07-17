import type { Client, Site } from '@/lib/types/domain';
import type { SiteEventAggregate as StoredSiteEventAggregate } from '@/lib/data/types';
import { buildMonthlyReportEmail } from './email';
import { buildMonthlyPerformanceReport } from './monthly-report';
import { previousMonthRangesKst } from './period';
import type {
  MonthlyReportRecord,
  MonthlyReportsRepository,
} from './repository-core';
import type { ReportEmailSendResult } from './resend-core';

export interface MonthlyReportRunnerDependencies {
  listSites(): Promise<Site[]>;
  getClient(clientId: string): Promise<Client | null>;
  isSubscriptionActive(clientId: string, at: Date): Promise<boolean>;
  listSiteEvents(input: {
    siteId: string;
    fromDate: string;
    toDate: string;
  }): Promise<StoredSiteEventAggregate[]>;
  reports: MonthlyReportsRepository;
  sendEmail(input: {
    to: string;
    message: ReturnType<typeof buildMonthlyReportEmail>;
    idempotencyKey: string;
  }): Promise<ReportEmailSendResult>;
  dashboardUrl: string;
}

export interface MonthlyReportRunSummary {
  periodMonth: string;
  inspectedSites: number;
  eligibleSites: number;
  createdReports: number;
  sentReports: number;
  failedDeliveries: number;
  unknownDeliveries: number;
  skippedSites: number;
  pipelineErrors: number;
}

function publishedSite(site: Site): boolean {
  return (
    (site.status === 'live' || site.status === 'pending_dns')
    && site.siteConfig !== null
    && site.publishedAt !== null
  );
}

function reportAggregates(rows: readonly StoredSiteEventAggregate[]) {
  return rows.map(({ eventType, source, count }) => ({ eventType, source, count }));
}

export function reportDeliveryFailure(result: Extract<ReportEmailSendResult, { ok: false }>): {
  status: 'failed' | 'delivery_unknown';
  errorCode: string;
} {
  const suffix = result.code.toUpperCase();
  const ambiguous = (
    result.code === 'request_failed'
    || result.code === 'invalid_response'
    || (
      result.code === 'provider_rejected'
      && (result.status === 409 || (result.status ?? 0) >= 500)
    )
  );
  return {
    status: ambiguous ? 'delivery_unknown' : 'failed',
    errorCode: `RESEND_${suffix}`,
  };
}

async function markPipelineFailure(
  reports: MonthlyReportsRepository,
  claimed: MonthlyReportRecord,
): Promise<void> {
  try {
    await reports.markDeliveryResult({
      reportId: claimed.id,
      status: 'failed',
      errorCode: 'REPORT_PIPELINE_ERROR',
    });
  } catch {
    // The cron summary exposes the pipeline error. Never replace the original
    // failure with a second exception that could suppress other sites.
  }
}

async function deliverReport(input: {
  record: MonthlyReportRecord;
  site: Site;
  client: Client | null;
  dependencies: MonthlyReportRunnerDependencies;
}): Promise<'sent' | 'failed' | 'delivery_unknown' | 'pipeline_error'> {
  const { dependencies, record, site, client } = input;
  const claimed = await dependencies.reports.claimDelivery({ reportId: record.id });
  if (!claimed) return 'pipeline_error';

  try {
    const message = buildMonthlyReportEmail({
      siteName: site.name,
      dashboardUrl: dependencies.dashboardUrl,
      report: claimed.report,
    });
    const result = await dependencies.sendEmail({
      to: client?.email ?? '',
      message,
      // Stable across manual retries. The database remains the long-lived
      // guard; Resend additionally deduplicates this key for 24 hours.
      idempotencyKey: `monthly-report:${claimed.id}`,
    });
    if (result.ok) {
      await dependencies.reports.markDeliveryResult({
        reportId: claimed.id,
        status: 'sent',
        providerMessageId: result.providerId,
      });
      return 'sent';
    }
    const failure = reportDeliveryFailure(result);
    await dependencies.reports.markDeliveryResult({
      reportId: claimed.id,
      ...failure,
    });
    return failure.status;
  } catch {
    await markPipelineFailure(dependencies.reports, claimed);
    return 'pipeline_error';
  }
}

/**
 * Idempotent monthly processor. It may run daily: site/month uniqueness keeps
 * report creation once-only, sent/unknown rows cannot be reclaimed, and known
 * failures are left for an explicit admin retry rather than retried forever.
 */
export async function runMonthlyReportsCore(
  dependencies: MonthlyReportRunnerDependencies,
  now: Date = new Date(),
): Promise<MonthlyReportRunSummary> {
  const periods = previousMonthRangesKst(now);
  const sites = await dependencies.listSites();
  const summary: MonthlyReportRunSummary = {
    periodMonth: periods.report.month,
    inspectedSites: sites.length,
    eligibleSites: 0,
    createdReports: 0,
    sentReports: 0,
    failedDeliveries: 0,
    unknownDeliveries: 0,
    skippedSites: 0,
    pipelineErrors: 0,
  };
  const eligibility = new Map<string, Promise<boolean>>();

  for (const site of sites) {
    if (!publishedSite(site)) {
      summary.skippedSites += 1;
      continue;
    }
    try {
      let active = eligibility.get(site.clientId);
      if (!active) {
        active = dependencies.isSubscriptionActive(site.clientId, now);
        eligibility.set(site.clientId, active);
      }
      if (!(await active)) {
        summary.skippedSites += 1;
        continue;
      }
      summary.eligibleSites += 1;

      const [current, previous] = await Promise.all([
        dependencies.listSiteEvents({
          siteId: site.id,
          fromDate: periods.report.startDate,
          toDate: periods.report.endExclusiveDate,
        }),
        dependencies.listSiteEvents({
          siteId: site.id,
          fromDate: periods.comparison.startDate,
          toDate: periods.comparison.endExclusiveDate,
        }),
      ]);
      const report = buildMonthlyPerformanceReport({
        siteId: site.id,
        period: periods.report,
        comparisonPeriod: periods.comparison,
        current: reportAggregates(current),
        previous: reportAggregates(previous),
      });
      const inserted = await dependencies.reports.insertIfAbsent({
        siteId: site.id,
        clientId: site.clientId,
        periodMonth: periods.report.month,
        report,
      });
      if (inserted.created) summary.createdReports += 1;

      // Failed rows are explicitly retryable by an administrator. Do not run
      // an unbounded daily retry loop. Pending covers a prior crash before send.
      if (inserted.record.deliveryStatus !== 'pending') continue;
      const client = await dependencies.getClient(site.clientId);
      const delivery = await deliverReport({
        record: inserted.record,
        site,
        client,
        dependencies,
      });
      if (delivery === 'sent') summary.sentReports += 1;
      else if (delivery === 'failed') summary.failedDeliveries += 1;
      else if (delivery === 'delivery_unknown') summary.unknownDeliveries += 1;
      else summary.pipelineErrors += 1;
    } catch {
      summary.pipelineErrors += 1;
    }
  }
  return summary;
}

export async function retryMonthlyReportCore(input: {
  report: MonthlyReportRecord;
  site: Site;
  client: Client | null;
  subscriptionActive: boolean;
  dependencies: MonthlyReportRunnerDependencies;
}): Promise<'sent' | 'failed' | 'delivery_unknown' | 'not_retryable' | 'ineligible'> {
  if (!input.subscriptionActive) return 'ineligible';
  if (input.report.deliveryStatus !== 'failed') return 'not_retryable';
  const result = await deliverReport({
    record: input.report,
    site: input.site,
    client: input.client,
    dependencies: input.dependencies,
  });
  return result === 'pipeline_error' ? 'failed' : result;
}
