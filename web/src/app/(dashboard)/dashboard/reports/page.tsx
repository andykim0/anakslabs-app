import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  CalendarDays,
  ExternalLink,
  MapPin,
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
import type { ReportMetric } from '@/lib/reporting/types';
import { getCurrentClient } from '@/lib/services/auth';
import { Badge, Card, EmptyState, PageHeader, cn, formatDate } from '@/components/dashboard/ui';

export const metadata: Metadata = { title: '성과 리포트 — Daboim' };

const DELIVERY_STATE: Record<
  MonthlyReportDeliveryStatus,
  { label: string; tone: 'neutral' | 'blue' | 'emerald' | 'amber' | 'red' }
> = {
  pending: { label: '이메일 발송 대기', tone: 'neutral' },
  sending: { label: '이메일 발송 중', tone: 'blue' },
  sent: { label: '이메일 발송 완료', tone: 'emerald' },
  failed: { label: '발송 실패 · 재시도 예정', tone: 'red' },
  delivery_unknown: { label: '발송 상태 확인 필요', tone: 'amber' },
};

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-');
  return `${year}년 ${Number(monthNumber)}월`;
}

function formatCount(count: number): string {
  return count.toLocaleString('ko-KR');
}

function Trend({ metric }: { metric: ReportMetric }) {
  if (metric.changePercent === null) {
    return <span className="text-[11px] text-[#8B9AB0]">비교 기준 없음</span>;
  }
  if (metric.changePercent === 0) {
    return <span className="text-[11px] text-[#667085]">전월과 같음</span>;
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
      전월 대비 {increased ? '+' : ''}{metric.changePercent}%
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
        <span className="ml-1 text-xs font-normal text-[#667085]">건</span>
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
                {monthLabel(record.periodMonth)} 성과 · {formatDate(record.createdAt)} 생성
              </p>
            </div>
            <a
              href={`/dashboard/sites/${record.siteId}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#174DDA] hover:underline"
            >
              사이트 보기 <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="space-y-6 px-5 py-5 sm:px-6">
          {!report.hasCurrentData ? (
            <div className="rounded-xl border border-[#BBD0FA] bg-[#EDF4FF] px-4 py-3">
              <p className="text-sm font-medium text-[#174DDA]">성과 데이터 수집을 시작했어요</p>
              <p className="mt-1 text-xs leading-5 text-[#475467]">
                방문과 고객 행동이 쌓이면 다음 리포트부터 전월 비교를 함께 보여드릴게요.
              </p>
            </div>
          ) : null}

          <section aria-labelledby={`${headingId}-metrics`}>
            <h3 id={`${headingId}-metrics`} className="mb-3 text-sm font-semibold text-[#26354D]">
              핵심 성과
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="페이지 조회"
                metric={report.metrics.pageviews}
                icon={<MousePointerClick className="h-4 w-4" aria-hidden="true" />}
              />
              <MetricCard
                label="전화 클릭"
                metric={report.metrics.phoneClicks}
                icon={<Phone className="h-4 w-4" aria-hidden="true" />}
              />
              <MetricCard
                label="예약 클릭"
                metric={report.metrics.reservationClicks}
                icon={<CalendarDays className="h-4 w-4" aria-hidden="true" />}
              />
              <MetricCard
                label="길찾기 클릭"
                metric={report.metrics.directionsClicks}
                icon={<MapPin className="h-4 w-4" aria-hidden="true" />}
              />
            </div>
            <p className="mt-3 text-xs text-[#667085]">
              문의 폼 제출 {formatCount(report.metrics.formSubmissions.current)}건
            </p>
          </section>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(240px,.65fr)]">
            <section
              aria-labelledby={`${headingId}-sources`}
              className="rounded-xl border border-[#DCE4F0] p-4"
            >
              <h3 id={`${headingId}-sources`} className="text-sm font-semibold text-[#26354D]">
                유입 출처 구성
              </h3>
              {sourcesWithTraffic.length === 0 ? (
                <p className="mt-3 text-xs text-[#667085]">아직 분류할 유입 데이터가 없습니다.</p>
              ) : (
                <dl className="mt-4 space-y-3">
                  {sourcesWithTraffic.map((source) => (
                    <div key={source.source}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                        <dt className="font-medium text-[#475467]">{source.label}</dt>
                        <dd className="text-[#667085]">
                          {formatCount(source.count)}건 · {source.sharePercent}%
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
              <p className="text-[11px] font-semibold tracking-wide text-[#087D70]">이번 달 한 줄</p>
              <h3 id={`${headingId}-insight`} className="mt-2 text-sm leading-6 font-semibold text-[#163D3A]">
                {report.insight}
              </h3>
              <p className="mt-3 text-[11px] leading-5 text-[#47706C]">
                저장된 익명 집계 숫자만으로 만든 안내입니다.
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
        title="성과 리포트"
        description="홈페이지에서 발생한 유입과 고객 행동을 매달 숫자로 확인하세요."
      />

      {records.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="h-8 w-8" aria-hidden="true" />}
          title="아직 생성된 성과 리포트가 없습니다"
          description="사이트가 발행되고 데이터가 쌓이면 매달 리포트를 만들고 이메일로도 보내드려요."
        />
      ) : (
        <div className="space-y-5">
          {records.map((record) => (
            <ReportCard
              key={record.id}
              record={record}
              siteName={siteNameById.get(record.siteId) ?? '내 사이트'}
            />
          ))}
        </div>
      )}
    </div>
  );
}
