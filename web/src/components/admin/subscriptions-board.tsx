'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Inbox,
  Loader2,
  RefreshCw,
  RotateCcw,
  UsersRound,
} from 'lucide-react';
import type { MonthlyReportDeliveryStatus } from '@/lib/reporting/repository-core';
import type { SiteSubscriptionStatus } from '@/lib/subscriptions/core';
import {
  getAdminSubscriptions,
  retryAdminMonthlyReport,
  type AdminSubscriptionItem,
  type AdminSubscriptionReportItem,
} from './api';
import { formatDateTime, formatKrw, formatNumber } from './format';
import {
  Badge,
  Card,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  StatCard,
} from './ui';

const SUBSCRIPTION_STATE: Record<SiteSubscriptionStatus, { label: string; tone: 'green' | 'amber' | 'red' | 'neutral' }> = {
  active: { label: '활성', tone: 'green' },
  past_due: { label: '결제 지연', tone: 'amber' },
  suspended: { label: '유예·정지', tone: 'amber' },
  cancelled: { label: '해지', tone: 'red' },
};

const REPORT_STATE: Record<
  MonthlyReportDeliveryStatus | 'not-generated' | 'not-eligible',
  { label: string; tone: 'green' | 'amber' | 'red' | 'blue' | 'neutral' }
> = {
  pending: { label: '발송 대기', tone: 'neutral' },
  sending: { label: '발송 중', tone: 'blue' },
  sent: { label: '발송 요청 접수', tone: 'green' },
  failed: { label: '발송 실패', tone: 'red' },
  delivery_unknown: { label: '상태 확인 필요', tone: 'amber' },
  'not-generated': { label: '미발송', tone: 'neutral' },
  'not-eligible': { label: '비활성 미발송', tone: 'neutral' },
};

function ReportRow({ report }: { report: AdminSubscriptionReportItem }) {
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: () => {
      if (!report.reportId) throw new Error('리포트 ID가 없습니다.');
      return retryAdminMonthlyReport(report.reportId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] }),
  });
  const state = REPORT_STATE[report.deliveryStatus];

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50/70 px-3 py-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-xs font-medium text-slate-700">{report.siteName}</p>
          <Badge tone={state.tone}>{state.label}</Badge>
        </div>
        <p className="mt-0.5 text-[11px] text-slate-500">
          {report.deliveryStatus === 'sent' && report.sentAt
            ? `Resend 접수 ${formatDateTime(report.sentAt)}`
            : report.lastErrorCode
              ? `오류 코드 ${report.lastErrorCode}`
              : `${report.siteStatus} · 시도 ${formatNumber(report.deliveryAttempts)}회`}
        </p>
      </div>
      {report.deliveryStatus === 'failed' && report.reportId ? (
        <button
          type="button"
          onClick={() => retry.mutate()}
          disabled={retry.isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {retry.isPending ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <RotateCcw size={12} aria-hidden />}
          재발송
        </button>
      ) : null}
      {retry.isError ? <p className="w-full text-[11px] text-red-600">{retry.error.message}</p> : null}
    </div>
  );
}

function SubscriptionCard({ item }: { item: AdminSubscriptionItem }) {
  const state = SUBSCRIPTION_STATE[item.status];
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">{item.clientName}</h2>
            <Badge tone={state.tone}>{state.label}</Badge>
            {!item.active && item.status === 'active' ? <Badge tone="red">기간 만료</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-slate-500">{item.clientEmail}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-slate-400">현재 기간 종료</p>
          <p className="mt-0.5 text-xs font-medium tabular-nums text-slate-700">{formatDateTime(item.currentPeriodEnd)}</p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {item.reports.length ? item.reports.map((report) => <ReportRow key={report.siteId} report={report} />) : (
          <p className="rounded-md bg-slate-50 px-3 py-3 text-xs text-slate-500">발행된 사이트가 없어 리포트 대상이 아닙니다.</p>
        )}
      </div>
    </Card>
  );
}

export function SubscriptionsBoard() {
  const query = useQuery({
    queryKey: ['admin', 'subscriptions'],
    queryFn: getAdminSubscriptions,
  });

  return (
    <>
      <PageHeader
        title="구독·성과 리포트"
        description={query.data ? `${query.data.reportPeriodMonth} 성과 리포트 이메일 상태 · 자격과 집계는 KST 기준입니다.` : undefined}
        actions={
          <button
            type="button"
            onClick={() => query.refetch()}
            disabled={query.isRefetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={13} className={clsx(query.isRefetching && 'animate-spin')} aria-hidden />
            새로고침
          </button>
        }
      />

      {query.isPending ? (
        <LoadingBlock label="구독·리포트 상태를 불러오는 중…" />
      ) : query.isError ? (
        <ErrorBlock message={query.error.message} onRetry={() => query.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            <StatCard label="활성 구독" value={`${formatNumber(query.data.summary.active)}건`} icon={UsersRound} />
            <StatCard label="월 구독 매출(MRR)" value={formatKrw(query.data.summary.mrrKrw)} icon={CircleDollarSign} />
            <StatCard label="이번 달 신규" value={`${formatNumber(query.data.summary.newThisMonth)}건`} sub="최초 갱신 기준" icon={CheckCircle2} />
            <StatCard label="이번 달 간이 해지" value={`${formatNumber(query.data.summary.cancelledThisMonth)}건`} sub="cancelled 전환 기준" icon={AlertTriangle} tone={query.data.summary.cancelledThisMonth ? 'danger' : 'neutral'} />
            <StatCard label="리포트 실패/미발송" value={`${formatNumber(query.data.summary.reportFailed)} / ${formatNumber(query.data.summary.reportMissing)}`} sub={`접수 ${formatNumber(query.data.summary.reportAccepted)}건`} icon={Clock3} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
            <Badge tone="amber">결제 지연 {formatNumber(query.data.summary.pastDue)}</Badge>
            <Badge tone="amber">유예·정지 {formatNumber(query.data.summary.suspended)}</Badge>
            <Badge tone="red">해지 {formatNumber(query.data.summary.cancelled)}</Badge>
            <span className="self-center text-[11px] text-slate-400">sent는 이메일 배달 완료가 아니라 Resend의 발송 요청 접수를 뜻합니다.</span>
          </div>

          {query.data.items.length === 0 ? (
            <div className="mt-5">
              <EmptyState icon={Inbox} title="구독 상태 기록이 없습니다" description="권위 구독 상태가 생기면 이 화면에 표시됩니다." />
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-2">
              {query.data.items.map((item) => <SubscriptionCard key={item.clientId} item={item} />)}
            </div>
          )}
        </>
      )}
    </>
  );
}
