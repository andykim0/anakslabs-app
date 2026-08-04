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
import {
  createReportEmailStartRateGate,
  type ReportEmailRateGateTiming,
  type ReportEmailStartRateGate,
} from './start-rate-gate';

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
  reconciledUnknownDeliveries: number;
  skippedSites: number;
  pipelineErrors: number;
}

export interface MonthlyReportRunOptions {
  /** Deterministic test seam; production uses a monotonic clock and real timers. */
  rateGateTiming?: ReportEmailRateGateTiming;
}

export const REPORT_DELIVERY_CONCURRENCY = 8;
export const REPORT_DELIVERY_STALE_MS = 15 * 60 * 1_000;

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

async function markDeliverySafely(
  reports: MonthlyReportsRepository,
  input: Parameters<MonthlyReportsRepository['markDeliveryResult']>[0],
): Promise<boolean> {
  try {
    await reports.markDeliveryResult(input);
    return true;
  } catch {
    // A stale-lease reconciliation moves the abandoned `sending` row to
    // delivery_unknown. Never guess `failed` after a possible provider send.
    return false;
  }
}

async function deliverReport(input: {
  record: MonthlyReportRecord;
  site: Site;
  client: Client | null;
  dependencies: MonthlyReportRunnerDependencies;
  startRateGate: ReportEmailStartRateGate;
}): Promise<'sent' | 'failed' | 'delivery_unknown' | 'pipeline_error'> {
  const { dependencies, record, site, client, startRateGate } = input;
  const claimed = await dependencies.reports.claimDelivery({ reportId: record.id });
  if (!claimed) return 'pipeline_error';

  let message: ReturnType<typeof buildMonthlyReportEmail>;
  try {
    message = buildMonthlyReportEmail({
      siteName: site.name,
      dashboardUrl: dependencies.dashboardUrl,
      report: claimed.report,
    });
  } catch {
    const marked = await markDeliverySafely(dependencies.reports, {
      reportId: claimed.id,
      status: 'failed',
      errorCode: 'REPORT_MESSAGE_BUILD_FAILED',
    });
    return marked ? 'failed' : 'pipeline_error';
  }

  let result: ReportEmailSendResult;
  try {
    await startRateGate.acquire();
  } catch {
    const marked = await markDeliverySafely(dependencies.reports, {
      reportId: claimed.id,
      status: 'failed',
      errorCode: 'REPORT_EMAIL_RATE_GATE_FAILED',
    });
    return marked ? 'failed' : 'pipeline_error';
  }
  try {
    result = await dependencies.sendEmail({
      to: client?.email ?? '',
      message,
      // Stable across manual retries. The database remains the long-lived
      // guard; Resend additionally deduplicates this key for 24 hours.
      idempotencyKey: `monthly-report:${claimed.id}`,
    });
  } catch {
    const marked = await markDeliverySafely(dependencies.reports, {
      reportId: claimed.id,
      status: 'delivery_unknown',
      errorCode: 'RESEND_TRANSPORT_THROWN',
    });
    return marked ? 'delivery_unknown' : 'pipeline_error';
  }

  if (result.ok) {
    const sent = await markDeliverySafely(dependencies.reports, {
      reportId: claimed.id,
      status: 'sent',
      providerMessageId: result.providerId,
    });
    if (sent) return 'sent';
    // Provider acceptance is known, but durable sent-state is not. Preserve
    // the provider id when the second DB attempt succeeds; never mark failed.
    const unknown = await markDeliverySafely(dependencies.reports, {
      reportId: claimed.id,
      status: 'delivery_unknown',
      providerMessageId: result.providerId,
      errorCode: 'RESEND_ACCEPTED_PERSISTENCE_UNKNOWN',
    });
    return unknown ? 'delivery_unknown' : 'pipeline_error';
  }
  const failure = reportDeliveryFailure(result);
  const marked = await markDeliverySafely(dependencies.reports, {
    reportId: claimed.id,
    ...failure,
  });
  return marked ? failure.status : 'pipeline_error';
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await task(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
}

/**
 * Idempotent monthly processor. It may run daily: site/month uniqueness keeps
 * report creation once-only, sent/unknown rows cannot be reclaimed, and known
 * failures are left for an explicit admin retry rather than retried forever.
 */
export async function runMonthlyReportsCore(
  dependencies: MonthlyReportRunnerDependencies,
  now: Date = new Date(),
  options: MonthlyReportRunOptions = {},
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
    reconciledUnknownDeliveries: 0,
    skippedSites: 0,
    pipelineErrors: 0,
  };
  const eligibility = new Map<string, Promise<boolean>>();
  const startRateGate = createReportEmailStartRateGate(options.rateGateTiming);

  try {
    summary.reconciledUnknownDeliveries = await dependencies.reports.reconcileStaleDeliveries({
      beforeIso: new Date(now.getTime() - REPORT_DELIVERY_STALE_MS).toISOString(),
      reconciledAt: now.toISOString(),
    });
  } catch {
    summary.pipelineErrors += 1;
  }

  await runWithConcurrency(sites, REPORT_DELIVERY_CONCURRENCY, async (site) => {
    if (!publishedSite(site)) {
      summary.skippedSites += 1;
      return;
    }
    try {
      let active = eligibility.get(site.clientId);
      if (!active) {
        active = dependencies.isSubscriptionActive(site.clientId, now);
        eligibility.set(site.clientId, active);
      }
      if (!(await active)) {
        summary.skippedSites += 1;
        return;
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
        locale: site.siteConfig?.meta.locale,
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
      if (inserted.record.deliveryStatus !== 'pending') return;
      const client = await dependencies.getClient(site.clientId);
      const delivery = await deliverReport({
        record: inserted.record,
        site,
        client,
        dependencies,
        startRateGate,
      });
      if (delivery === 'sent') summary.sentReports += 1;
      else if (delivery === 'failed') summary.failedDeliveries += 1;
      else if (delivery === 'delivery_unknown') summary.unknownDeliveries += 1;
      else summary.pipelineErrors += 1;
    } catch {
      summary.pipelineErrors += 1;
    }
  });
  return summary;
}

export async function retryMonthlyReportCore(input: {
  report: MonthlyReportRecord;
  site: Site;
  client: Client | null;
  subscriptionActive: boolean;
  dependencies: MonthlyReportRunnerDependencies;
  rateGateTiming?: ReportEmailRateGateTiming;
}): Promise<'sent' | 'failed' | 'delivery_unknown' | 'not_retryable' | 'ineligible'> {
  if (!input.subscriptionActive) return 'ineligible';
  if (input.report.deliveryStatus !== 'failed') return 'not_retryable';
  const result = await deliverReport({
    record: input.report,
    site: input.site,
    client: input.client,
    dependencies: input.dependencies,
    startRateGate: createReportEmailStartRateGate(input.rateGateTiming),
  });
  return result === 'pipeline_error' ? 'failed' : result;
}
