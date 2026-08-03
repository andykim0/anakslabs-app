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
import { getMonthlyReportsRepository } from '@/lib/reporting/repository';
import type {
  MonthlyReportDeliveryStatus,
  MonthlyReportRecord,
} from '@/lib/reporting/repository-core';
import { v2Metrics, type ReportMetric } from '@/lib/reporting/types';
import { getCurrentClient } from '@/lib/services/auth';
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
    return <span className="text-[11px] text-[#667085]">Same as previous month</span>;
  }
  const increased = metric.changePercent > 0;
  const Icon = increased ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11px] font-medium',
        increased ? 'text-[#087D70]' : 'text-[#B42318]',
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {increased ? '+' : ''}{metric.changePercent}% from prior month
    </span>
  );
}

function MetricCard({
  label,
  metric,
  icon,
}: {
  label: string;
  metric: ReportMetric;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#DCE4F0] bg-[#F8FBFF] p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-[#5F6B7C]">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EDF4FF] text-[#174DDA]">
          {icon}
        </span>
        {label}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-[#0B1736]">
        {formatCount(metric.current)}
        <span className="ml-1 text-xs font-normal text-[#667085]">events</span>
      </p>
      <div className="mt-1"><Trend metric={metric} /></div>
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
}: {
  record: MonthlyReportRecord;
  siteName: string;
}) {
  const { report } = record;
  const sourcesWithTraffic = report.sources.filter((source) => source.count > 0);
  const connectorMetrics = v2Metrics(report);
  const headingId = `report-${record.id}`;

  return (
    <article aria-labelledby={headingId}>
      <Card className="p-0 overflow-hidden">
        <div className="border-b border-[#E8EEF6] bg-gradient-to-r from-[#F7FAFF] to-[#F0FCF9] px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 id={headingId} className="text-base font-semibold text-[#0B1736]">
                  {siteName}
                </h2>
                <DeliveryBadge record={record} />
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-[#667085]">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                {monthLabel(record.periodMonth)} · generated {formatDate(record.createdAt)}
              </p>
            </div>
            <a
              href={`/dashboard/sites/${record.siteId}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#174DDA] hover:underline"
            >
              View site <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="space-y-6 px-5 py-5 sm:px-6">
          {!report.hasComparisonData ? (
            <div className="rounded-xl border border-[#BBD0FA] bg-[#EDF4FF] px-4 py-3">
              <p className="text-sm font-medium text-[#174DDA]">This is the first comparison period.</p>
              <p className="mt-1 text-xs leading-5 text-[#475467]">
                {report.hasCurrentData
                  ? "This month’s performance was calculated normally. Starting with the next report, we will show you a comparison from the previous month."
                  : "We're collecting visits and customer behavior. As data accumulates, we will show you a comparison from the previous month."}
              </p>
            </div>
          ) : null}

          <section aria-labelledby={`${headingId}-metrics`}>
            <h3 id={`${headingId}-metrics`} className="mb-3 text-sm font-semibold text-[#26354D]">
              Key activity
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Page Views"
                metric={report.metrics.pageviews}
                icon={<MousePointerClick className="h-4 w-4" aria-hidden="true" />}
              />
              <MetricCard
                label="Phone clicks"
                metric={report.metrics.phoneClicks}
                icon={<Phone className="h-4 w-4" aria-hidden="true" />}
              />
              <MetricCard
                label={connectorMetrics ? "Inquiry actions" : "Booking clicks"}
                metric={connectorMetrics?.consultationActions ?? report.metrics.reservationClicks}
                icon={
                  connectorMetrics
                    ? <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    : <CalendarDays className="h-4 w-4" aria-hidden="true" />
                }
              />
              <MetricCard
                label="Directions clicks"
                metric={report.metrics.directionsClicks}
                icon={<MapPin className="h-4 w-4" aria-hidden="true" />}
              />
            </div>
            {connectorMetrics ? (
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#667085]">
                <span>Chat clicks {formatCount(connectorMetrics.chatClicks.current)}</span>
                <span>Form submissions {formatCount(report.metrics.formSubmissions.current)}</span>
                <span>Booking clicks {formatCount(report.metrics.reservationClicks.current)}</span>
                <span className="inline-flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  Instagram clicks {formatCount(connectorMetrics.instagramClicks.current)}
                </span>
              </p>
            ) : (
              <p className="mt-3 text-xs text-[#667085]">
                Form submissions {formatCount(report.metrics.formSubmissions.current)}
              </p>
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(240px,.65fr)]">
            <section
              aria-labelledby={`${headingId}-sources`}
              className="rounded-xl border border-[#DCE4F0] p-4"
            >
              <h3 id={`${headingId}-sources`} className="text-sm font-semibold text-[#26354D]">
                Traffic sources
              </h3>
              {sourcesWithTraffic.length === 0 ? (
                <p className="mt-3 text-xs text-[#667085]">No measured traffic sources yet.</p>
              ) : (
                <dl className="mt-4 space-y-3">
                  {sourcesWithTraffic.map((source) => (
                    <div key={source.source}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                        <dt className="font-medium text-[#475467]">{source.label}</dt>
                        <dd className="text-[#667085]">
                          {formatCount(source.count)} · {source.sharePercent}%
                        </dd>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[#E8EEF6]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#174DDA] to-[#03A995]"
                          style={{ width: `${source.sharePercent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </dl>
              )}
            </section>

            <section
              aria-labelledby={`${headingId}-insight`}
              className="rounded-xl border border-[#A8E5D8] bg-[#F1FCF9] p-4"
            >
              <p className="text-[11px] font-semibold tracking-wide text-[#087D70]">MONTHLY NOTE</p>
              <h3 id={`${headingId}-insight`} className="mt-2 text-sm leading-6 font-semibold text-[#163D3A]">
                {report.insight}
              </h3>
              <p className="mt-3 text-[11px] leading-5 text-[#47706C]">
                This guide is made using only stored anonymous aggregate numbers.
              </p>
            </section>
          </div>
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
          {records.map((record) => (
            <ReportCard
              key={record.id}
              record={record}
              siteName={siteNameById.get(record.siteId) ?? "my site"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
