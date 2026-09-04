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
import {
  v2Metrics,
  type ReportAiAnswersSection,
  type ReportMetric,
} from '@/lib/reporting/types';
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
    return <span className="text-[11px] text-[#6a7286]">Same as previous month</span>;
  }
  const increased = metric.changePercent > 0;
  const Icon = increased ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11px] font-medium',
        increased ? 'text-[#10714F]' : 'text-[#B42318]',
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
    <div className="rounded-xl border border-[#DFE1E6] bg-[#F6F7F9] p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-[#545C70]">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EAEFFE] text-[#2D63F0]">
          {icon}
        </span>
        {label}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-[#141A3A]">
        {formatCount(metric.current)}
        <span className="ml-1 text-xs font-normal text-[#6a7286]">events</span>
      </p>
      <div className="mt-1"><Trend metric={metric} /></div>
    </div>
  );
}

const ENGINE_DISPLAY_NAMES: Record<string, string> = {
  openai: 'ChatGPT',
  anthropic: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
};

function engineName(engine: string): string {
  return ENGINE_DISPLAY_NAMES[engine] ?? engine;
}

/**
 * [CITE$] "Who got named in AI answers". Rendered only when the period has probes, so a
 * report without them looks exactly as it did before the feature existed.
 *
 * The copy states the basis in plain words. These are API probes: no personalization, no
 * memory, no location history, and Google Search's AI answers have no API to ask at all.
 */
function AiAnswersSection({
  section,
  headingId,
}: {
  section: ReportAiAnswersSection;
  headingId: string;
}) {
  return (
    <section
      aria-labelledby={`${headingId}-ai`}
      className="rounded-xl border border-[#DFE1E6] p-4"
    >
      <h3 id={`${headingId}-ai`} className="text-sm font-semibold text-[#232C52]">
        Who got named in AI answers
      </h3>
      <p className="mt-1 text-[11px] text-[#6a7286]">
        We asked each engine your customers&rsquo; key questions through its API.
      </p>
      <table className="mt-3 w-full text-xs">
        <thead>
          <tr className="text-left text-[#6a7286]">
            <th scope="col" className="pb-1.5 font-medium">Engine</th>
            <th scope="col" className="pb-1.5 text-right font-medium">Asked</th>
            <th scope="col" className="pb-1.5 text-right font-medium">Named</th>
            <th scope="col" className="pb-1.5 text-right font-medium">Linked</th>
          </tr>
        </thead>
        <tbody>
          {section.engines.map((engine) => (
            <tr key={engine.engine} className="border-t border-[#EEF1F5]">
              <td className="py-1.5 font-medium text-[#475467]">{engineName(engine.engine)}</td>
              {engine.status === 'not_configured' ? (
                <td colSpan={3} className="py-1.5 text-right text-[#8B9AB0]">Not connected</td>
              ) : (
                <>
                  <td className="py-1.5 text-right text-[#6a7286]">{formatCount(engine.asked)}</td>
                  <td className="py-1.5 text-right text-[#141A3A]">{formatCount(engine.named)}</td>
                  <td className="py-1.5 text-right text-[#141A3A]">{formatCount(engine.linked)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {section.questions.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {section.questions.map((question) => (
            <li key={question.question} className="text-xs text-[#475467]">
              {question.question}
              <div className="text-[11px] text-[#6a7286]">
                {question.namedBy.length > 0
                  ? `Named by ${question.namedBy.map(engineName).join(', ')}`
                  : 'Not named'}
                {question.linkedBy.length > 0
                  ? ` · Linked by ${question.linkedBy.map(engineName).join(', ')}`
                  : ''}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-[11px] leading-5 text-[#6a7286]">{section.footnote}</p>
    </section>
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
  const aiAnswers = report.schemaVersion === 2 ? report.aiAnswers : undefined;
  const headingId = `report-${record.id}`;

  return (
    <article aria-labelledby={headingId}>
      <Card className="p-0 overflow-hidden">
        <div className="border-b border-[#E8EEF6] bg-gradient-to-r from-[#F7F8FB] to-[#EFF3FE] px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 id={headingId} className="text-base font-semibold text-[#141A3A]">
                  {siteName}
                </h2>
                <DeliveryBadge record={record} />
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-[#6a7286]">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                {monthLabel(record.periodMonth)} · generated {formatDate(record.createdAt)}
              </p>
            </div>
            <a
              href={`/dashboard/sites/${record.siteId}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#2D63F0] hover:underline"
            >
              View site <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="space-y-6 px-5 py-5 sm:px-6">
          {!report.hasComparisonData ? (
            <div className="rounded-xl border border-[#BBD0FA] bg-[#EAEFFE] px-4 py-3">
              <p className="text-sm font-medium text-[#2D63F0]">This is the first comparison period.</p>
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
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#6a7286]">
                <span>Chat clicks {formatCount(connectorMetrics.chatClicks.current)}</span>
                <span>Form submissions {formatCount(report.metrics.formSubmissions.current)}</span>
                <span>Booking clicks {formatCount(report.metrics.reservationClicks.current)}</span>
                <span className="inline-flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  Instagram clicks {formatCount(connectorMetrics.instagramClicks.current)}
                </span>
              </p>
            ) : (
              <p className="mt-3 text-xs text-[#6a7286]">
                Form submissions {formatCount(report.metrics.formSubmissions.current)}
              </p>
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(240px,.65fr)]">
            <section
              aria-labelledby={`${headingId}-sources`}
              className="rounded-xl border border-[#DFE1E6] p-4"
            >
              <h3 id={`${headingId}-sources`} className="text-sm font-semibold text-[#232C52]">
                Traffic sources
              </h3>
              {sourcesWithTraffic.length === 0 ? (
                <p className="mt-3 text-xs text-[#6a7286]">No measured traffic sources yet.</p>
              ) : (
                <dl className="mt-4 space-y-3">
                  {sourcesWithTraffic.map((source) => (
                    <div key={source.source}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                        <dt className="font-medium text-[#475467]">{source.label}</dt>
                        <dd className="text-[#6a7286]">
                          {formatCount(source.count)} · {source.sharePercent}%
                        </dd>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[#E8EEF6]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#2D63F0] to-[#4D7CFF]"
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
              className="rounded-xl border border-[#C4E3D2] bg-[#F2F9F5] p-4"
            >
              <p className="text-[11px] font-semibold tracking-wide text-[#10714F]">MONTHLY NOTE</p>
              <h3 id={`${headingId}-insight`} className="mt-2 text-sm leading-6 font-semibold text-[#163D3A]">
                {report.insight}
              </h3>
              <p className="mt-3 text-[11px] leading-5 text-[#47706C]">
                This guide is made using only stored anonymous aggregate numbers.
              </p>
            </section>
          </div>

          {aiAnswers ? <AiAnswersSection section={aiAnswers} headingId={headingId} /> : null}
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
