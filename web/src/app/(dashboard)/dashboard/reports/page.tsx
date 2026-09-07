import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  CalendarDays,
  ExternalLink,
  MapPin,
  MessageCircle,
  MousePointerClick,
  Phone,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { getDataServices } from '@/lib/data';
import { loadCustomerBlogView } from '@/lib/content-fulfillment/customer-view';
import { getMonthlyReportsRepository } from '@/lib/reporting/repository';
import { publishedPostsForMonth } from '@/lib/reporting/published-posts';
import type {
  MonthlyReportDeliveryStatus,
  MonthlyReportRecord,
} from '@/lib/reporting/repository-core';
import {
  v2Metrics,
  type ReportMetric,
  type ReportPublishedPost,
  type ReportSeriesSection,
} from '@/lib/reporting/types';
import { getCurrentClient } from '@/lib/services/auth';
import {
  AnswerMatrix,
  KpiSparkline,
  PublishedList,
  SourcesDonut,
  WeeklyBars,
} from '@/components/dashboard/report-charts';
import { Badge, Card, EmptyState, PageHeader, cn, formatDate } from '@/components/dashboard/ui';

export const metadata: Metadata = { title: "Performance Report — Anaks Labs" };

const DELIVERY_STATE: Record<
  MonthlyReportDeliveryStatus,
  { label: string; tone: 'neutral' | 'blue' | 'emerald' | 'amber' | 'red' }
> = {
  pending: { label: "Awaiting email request", tone: 'neutral' },
  sending: { label: "Sending email", tone: 'blue' },
  sent: { label: "Email request accepted", tone: 'emerald' },
  failed: { label: "Delivery failed · retry available", tone: 'red' },
  delivery_unknown: { label: "Delivery status unavailable", tone: 'amber' },
};

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function formatCount(count: number): string {
  return count.toLocaleString('en-US');
}

function Trend({ metric }: { metric: ReportMetric }) {
  if (metric.changePercent === null) {
    return <span className="text-[11px] text-[#8B9AB0]">No basis for comparison</span>;
  }
  if (metric.changePercent === 0) {
    return <span className="text-[11px] text-ob-muted">Same as previous month</span>;
  }
  const increased = metric.changePercent > 0;
  const Icon = increased ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11px] font-medium',
        increased ? 'text-ob-success' : 'text-ob-danger',
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {increased ? '+' : ''}{metric.changePercent}% from prior month
    </span>
  );
}

/**
 * [SERIES$] A KPI tile, with the six-month trend under the number when the report carries
 * one. Reports written before the series existed are insert-once and are never backfilled,
 * so the sparkline has to be genuinely optional rather than a chart of zeroes.
 */
function MetricCard({
  id,
  label,
  metric,
  icon,
  months,
  values,
}: {
  id: string;
  label: string;
  metric: ReportMetric;
  icon: React.ReactNode;
  months: readonly string[];
  values: readonly number[];
}) {
  return (
    <div className="rounded-xl border border-ob-border bg-ob-bg p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-ob-muted">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ob-accent-soft text-ob-accent">
          {icon}
        </span>
        {label}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-ob-ink">
        {formatCount(metric.current)}
        <span className="ml-1 text-xs font-normal text-ob-muted">events</span>
      </p>
      <div className="mt-1"><Trend metric={metric} /></div>
      <KpiSparkline id={id} label={label} months={months} values={values} />
    </div>
  );
}

function DeliveryBadge({ record }: { record: MonthlyReportRecord }) {
  const state = DELIVERY_STATE[record.deliveryStatus];
  return <Badge tone={state.tone}>{state.label}</Badge>;
}

function ReportCard({
  record,
  siteName,
  publishedPosts,
}: {
  record: MonthlyReportRecord;
  siteName: string;
  publishedPosts: readonly ReportPublishedPost[];
}) {
  const { report } = record;
  const connectorMetrics = v2Metrics(report);
  const aiAnswers = report.schemaVersion === 2 ? report.aiAnswers : undefined;
  const series: ReportSeriesSection | undefined = report.schemaVersion === 2
    ? report.series
    : undefined;
  const headingId = `report-${record.id}`;

  // A single point draws a dot, not a trend; the chart components require two.
  const seriesMonths = (series?.months.length ?? 0) >= 2 ? series!.months : [];
  const monthKeys = seriesMonths.map((month) => month.month);
  const trendOf = (pick: (month: (typeof seriesMonths)[number]) => number) =>
    seriesMonths.map(pick);

  return (
    <article aria-labelledby={headingId}>
      <Card className="p-0 overflow-hidden">
        <div className="border-b border-[#E8EEF6] bg-gradient-to-r from-[#F7F8FB] to-[#EFF3FE] px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 id={headingId} className="text-base font-semibold text-ob-ink">
                  {siteName}
                </h2>
                <DeliveryBadge record={record} />
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-ob-muted">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                {monthLabel(record.periodMonth)} · generated {formatDate(record.createdAt)}
                {/*
                  The badge says the email was accepted but never said when, and `sentAt`
                  was already on the record — a customer comparing this card against their
                  inbox had no date to match it to.
                */}
                {record.sentAt ? ` · emailed ${formatDate(record.sentAt)}` : null}
              </p>
            </div>
            <a
              href={`/dashboard/sites/${record.siteId}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-ob-accent hover:underline"
            >
              View site <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="space-y-6 px-5 py-5 sm:px-6">
          {!report.hasComparisonData ? (
            <div className="rounded-xl border border-[#BBD0FA] bg-ob-accent-soft px-4 py-3">
              <p className="text-sm font-medium text-ob-accent">This is the first comparison period.</p>
              <p className="mt-1 text-xs leading-5 text-[#475467]">
                {report.hasCurrentData
                  ? "This month’s performance was calculated normally. Starting with the next report, we will show you a comparison from the previous month."
                  : "We're collecting visits and customer behavior. As data accumulates, we will show you a comparison from the previous month."}
              </p>
            </div>
          ) : null}

          <section aria-labelledby={`${headingId}-metrics`}>
            <h3 id={`${headingId}-metrics`} className="mb-3 text-sm font-semibold text-[#232C52]">
              Key activity
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                id={`${headingId}-pv`}
                label="Page Views"
                metric={report.metrics.pageviews}
                icon={<MousePointerClick className="h-4 w-4" aria-hidden="true" />}
                months={monthKeys}
                values={trendOf((month) => month.pageviews)}
              />
              <MetricCard
                id={`${headingId}-calls`}
                label="Phone clicks"
                metric={report.metrics.phoneClicks}
                icon={<Phone className="h-4 w-4" aria-hidden="true" />}
                months={monthKeys}
                values={trendOf((month) => month.calls)}
              />
              <MetricCard
                id={`${headingId}-inq`}
                label={connectorMetrics ? "Inquiry actions" : "Booking clicks"}
                metric={connectorMetrics?.consultationActions ?? report.metrics.reservationClicks}
                icon={
                  connectorMetrics
                    ? <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    : <CalendarDays className="h-4 w-4" aria-hidden="true" />
                }
                months={monthKeys}
                // `inquiries` is form + chat, i.e. exactly `consultationActions`. A v1
                // report's fourth tile is booking clicks, which that series does not trend.
                values={connectorMetrics ? trendOf((month) => month.inquiries) : []}
              />
              <MetricCard
                id={`${headingId}-dir`}
                label="Directions clicks"
                metric={report.metrics.directionsClicks}
                icon={<MapPin className="h-4 w-4" aria-hidden="true" />}
                months={monthKeys}
                values={trendOf((month) => month.directions)}
              />
            </div>
            {connectorMetrics ? (
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ob-muted">
                <span>Chat clicks {formatCount(connectorMetrics.chatClicks.current)}</span>
                <span>Form submissions {formatCount(report.metrics.formSubmissions.current)}</span>
                <span>Booking clicks {formatCount(report.metrics.reservationClicks.current)}</span>
                <span className="inline-flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  Instagram clicks {formatCount(connectorMetrics.instagramClicks.current)}
                </span>
              </p>
            ) : (
              <p className="mt-3 text-xs text-ob-muted">
                Form submissions {formatCount(report.metrics.formSubmissions.current)}
              </p>
            )}
          </section>

          <section
            aria-labelledby={`${headingId}-insight`}
            className="rounded-xl border border-[#C4D4F8] bg-[#E6EDFD] px-4 py-3.5"
          >
            <h3 id={`${headingId}-insight`} className="text-base leading-6 font-semibold text-[#173B9E]">
              {report.insight}
            </h3>
            <p className="mt-2 text-[11px] leading-5 text-ob-muted">
              Derived only from the stored anonymous aggregate numbers on this report.
            </p>
          </section>

          {/*
            `items-start`, so each panel is only as tall as its own content. Stretching
            them to a common height leaves the shorter chart sitting above a band of empty
            bordered space, which reads as a chart that failed to draw.
          */}
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(240px,.65fr)]">
            <section
              aria-labelledby={`${headingId}-weeks`}
              className="rounded-xl border border-ob-border p-4"
            >
              <h3 id={`${headingId}-weeks`} className="text-sm font-semibold text-[#232C52]">
                When they got in touch
              </h3>
              <p className="mt-1 text-[11px] tracking-wide text-ob-muted">
                CALLS · DIRECTIONS · INQUIRIES, BY WEEK
              </p>
              {series && series.weeks.length > 0 ? (
                <WeeklyBars id={`${headingId}-weekchart`} weeks={series.weeks} />
              ) : (
                <p className="mt-3 text-xs text-ob-muted">
                  Weekly detail starts with reports generated from this month onward.
                </p>
              )}
            </section>

            <section
              aria-labelledby={`${headingId}-sources`}
              className="rounded-xl border border-ob-border p-4"
            >
              <h3 id={`${headingId}-sources`} className="text-sm font-semibold text-[#232C52]">
                Traffic sources
              </h3>
              <p className="mt-1 text-[11px] tracking-wide text-ob-muted">
                {formatCount(report.sources.reduce((sum, source) => sum + source.count, 0))} PAGE VIEWS
              </p>
              {report.sources.some((source) => source.count > 0) ? (
                <SourcesDonut id={`${headingId}-donut`} sources={report.sources} />
              ) : (
                <p className="mt-3 text-xs text-ob-muted">No measured traffic sources yet.</p>
              )}
            </section>
          </div>

          {/*
            One column unless BOTH panels have something to say. The published list is a
            join against the content queue and is legitimately empty for a site with no
            posts that month; reserving its column anyway would squeeze the matrix into
            half the width and leave the other half blank.
          */}
          {aiAnswers || publishedPosts.length > 0 ? (
            <div
              className={cn(
                'grid items-start gap-4',
                aiAnswers && publishedPosts.length > 0
                  ? 'lg:grid-cols-[minmax(0,1.25fr)_minmax(240px,1fr)]'
                  : 'grid-cols-1',
              )}
            >
              {aiAnswers ? <AnswerMatrix section={aiAnswers} headingId={headingId} /> : null}
              <PublishedList posts={publishedPosts} headingId={headingId} />
            </div>
          ) : null}
        </div>
      </Card>
    </article>
  );
}

export default async function ReportsPage() {
  const client = await getCurrentClient();
  if (!client) redirect('/login');

  const [records, sites] = await Promise.all([
    getMonthlyReportsRepository().listByClient({ clientId: client.id, limit: 24 }),
    getDataServices().sites.listByClient(client.id),
  ]);
  const siteNameById = new Map(sites.map((site) => [site.id, site.name]));

  /**
   * [SERIES$] "What we published" is a join, not stored report data. One blog view per
   * SITE (not per report) covers every month this client has a report for, because the
   * view already carries the site's whole published history. A failure is swallowed: a
   * content-queue problem must not blank the measurement report.
   */
  const reportedSiteIds = new Set(records.map((record) => record.siteId));
  const blogViews = new Map(
    (await Promise.all(
      sites
        .filter((site) => reportedSiteIds.has(site.id))
        .map(async (site) => {
          try {
            return [site.id, await loadCustomerBlogView(site)] as const;
          } catch {
            return [site.id, null] as const;
          }
        }),
    )).filter((entry): entry is readonly [string, NonNullable<(typeof entry)[1]>] => entry[1] !== null),
  );

  return (
    <div>
      <PageHeader
        title="Performance report"
        description="Check the inflow and customer behavior on your website in numbers every month."
      />

      {records.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="h-8 w-8" aria-hidden="true" />}
          title="No performance reports have been created yet"
          description="As the site is published and data accumulates, we create a report every month and send it to you by email."
        />
      ) : (
        <div className="space-y-5">
          {records.map((record) => {
            const view = blogViews.get(record.siteId);
            return (
              <ReportCard
                key={record.id}
                record={record}
                siteName={siteNameById.get(record.siteId) ?? "my site"}
                publishedPosts={view ? publishedPostsForMonth(view, record.periodMonth) : []}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
