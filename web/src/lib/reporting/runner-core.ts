import type { Client, Site } from '@/lib/types/domain';
import type { SiteEventAggregate as StoredSiteEventAggregate } from '@/lib/data/types';
import { DEFAULT_US_SITE_TIMEZONE } from '@/lib/types/site';
import { buildMonthlyReportEmail } from './email';
import { buildMonthlyPerformanceReport } from './monthly-report';
import {
  previousMonthRangesKst,
  trailingMonthRangesInTimeZone,
  trailingMonthRangesKst,
} from './period';
import { buildReportSeries } from './series';
import type {
  MonthlyReportRecord,
  MonthlyReportsRepository,
} from './repository-core';
import type { ReportEmailSendResult } from './resend-core';
import type { ReportAiAnswersSection, ReportPublishedPost } from './types';
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
  /**
   * [CITE$] Stored citation probes for THIS report's period — the previous month, not
   * the current one. Optional: a deployment without it produces exactly the report it
   * produced before the feature existed. Never makes a live call.
   */
  loadAiAnswers?(input: {
    siteId: string;
    periodMonth: string;
  }): Promise<ReportAiAnswersSection | null>;
  /**
   * [SERIES$] "What we published" — a JOIN against the content queue, performed at send
   * time rather than stored on the report. Optional: a deployment without it sends exactly
   * the email it sent before the section existed. A throw here is swallowed, because a
   * missing blog list must never cost the customer their measurement report.
   */
  loadPublishedPosts?(input: {
    siteId: string;
    periodMonth: string;
  }): Promise<readonly ReportPublishedPost[]>;
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

/**
 * Narrow stored rows to what the (pure) report builder accepts.
 *
 * This used to be applied to the WHOLE fetch, which is how the day grain was lost: the
 * store is day-grained with 24-month retention, and `eventDate` was thrown away one line
 * after being read. The rows are now sliced by date FIRST (see `rowsWithin`) and narrowed
 * only at the point the builder is called, so the same fetch feeds both the month totals
 * and the trailing/weekly series.
 */
function reportAggregates(rows: readonly StoredSiteEventAggregate[]) {
  return rows.map(({ eventType, source, count }) => ({ eventType, source, count }));
}

/** Half-open [startDate, endExclusiveDate) slice, in the site's own calendar days. */
function rowsWithin(
  rows: readonly StoredSiteEventAggregate[],
  range: { startDate: string; endExclusiveDate: string },
): StoredSiteEventAggregate[] {
  return rows.filter(
    (row) => row.eventDate >= range.startDate && row.eventDate < range.endExclusiveDate,
  );
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

  let publishedPosts: readonly ReportPublishedPost[] = [];
  if (dependencies.loadPublishedPosts) {
    try {
      publishedPosts = await dependencies.loadPublishedPosts({
        siteId: record.siteId,
        periodMonth: record.periodMonth,
      });
    } catch {
      // The measurement report is the product; the blog list is context on top of it.
      publishedPosts = [];
    }
  }

  let message: ReturnType<typeof buildMonthlyReportEmail>;
  try {
    message = buildMonthlyReportEmail({
      siteName: site.name,
      dashboardUrl: dependencies.dashboardUrl,
      report: claimed.report,
      publishedPosts,
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

/** Shared by the citation-check runner, which needs the identical bounded fan-out. */
export async function runWithConcurrency<T>(
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
  const legacyPeriods = previousMonthRangesKst(now);
  const sites = await dependencies.listSites();
  const summary: MonthlyReportRunSummary = {
    periodMonth: legacyPeriods.report.month,
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

      /**
       * [SERIES$] One widened read instead of two adjacent ones.
       *
       * `trailingMonthRanges*` end on exactly the month `previousMonthRanges*` calls the
       * report period, and the element before it is exactly the comparison period, so the
       * report/comparison windows are the last two entries of this array by construction
       * and cannot drift from the series axis. Six months is well inside the store's
       * 24-month retention, and this is one round trip fewer than the pair it replaces.
       */
      const seriesMonths = site.siteConfig?.meta.locale === 'en-US'
        ? trailingMonthRangesInTimeZone(
          site.siteConfig.meta.timezone ?? DEFAULT_US_SITE_TIMEZONE,
          now,
        )
        : trailingMonthRangesKst(now);
      const periods = {
        report: seriesMonths[seriesMonths.length - 1],
        comparison: seriesMonths[seriesMonths.length - 2],
      };

      // Day-grained rows, kept day-grained: the series is derived from these same rows.
      const windowRows = await dependencies.listSiteEvents({
        siteId: site.id,
        fromDate: seriesMonths[0].startDate,
        toDate: periods.report.endExclusiveDate,
      });
      const current = rowsWithin(windowRows, periods.report);
      const previous = rowsWithin(windowRows, periods.comparison);
      const series = buildReportSeries({ months: seriesMonths, rows: windowRows });
      // The report for month M is built on the 1st of M+1 and is insert-once, so the
      // probes it must quote are the ones stored under M — its own period — never the
      // month the cron happens to be running in.
      let aiAnswers: ReportAiAnswersSection | null = null;
      if (dependencies.loadAiAnswers) {
        try {
          aiAnswers = await dependencies.loadAiAnswers({
            siteId: site.id,
            periodMonth: periods.report.month,
          });
        } catch {
          // A missing citation section must never cost the customer their report.
          aiAnswers = null;
        }
      }

      const report = buildMonthlyPerformanceReport({
        siteId: site.id,
        period: periods.report,
        comparisonPeriod: periods.comparison,
        current: reportAggregates(current),
        previous: reportAggregates(previous),
        locale: site.siteConfig?.meta.locale,
        ...(aiAnswers ? { aiAnswers } : {}),
        series,
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
