'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  RotateCcw,
  UsersRound,
} from 'lucide-react';
import type { MonthlyReportDeliveryStatus } from '@/lib/reporting/repository-core';
import { INTERNAL_REPORT_TEST_DOMAIN } from '@/lib/reporting/test-send-core';
import type { SiteSubscriptionStatus } from '@/lib/subscriptions/core';
import {
  getAdminSubscriptions,
  retryAdminMonthlyReport,
  sendAdminMonthlyReportTest,
  type AdminSubscriptionItem,
  type AdminSubscriptionReportItem,
} from './api';
import { formatDateTime, formatNumber } from './format';
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
  active: { label: "Active", tone: 'green' },
  past_due: { label: "Past due", tone: 'amber' },
  suspended: { label: "Suspended", tone: 'amber' },
  cancelled: { label: "Cancelled", tone: 'red' },
};

const REPORT_STATE: Record<
  MonthlyReportDeliveryStatus | 'not-generated' | 'not-eligible',
  { label: string; tone: 'green' | 'amber' | 'red' | 'blue' | 'neutral' }
> = {
  pending: { label: "Queued", tone: 'neutral' },
  sending: { label: "Sending", tone: 'blue' },
  sent: { label: "Accepted by Resend", tone: 'green' },
  failed: { label: "Send failed", tone: 'red' },
  delivery_unknown: { label: "Delivery unknown", tone: 'amber' },
  'not-generated': { label: "Not generated", tone: 'neutral' },
  'not-eligible': { label: "Not eligible", tone: 'neutral' },
};

/**
 * Sends the stored report's real email to an internal address. Deliberately separate from
 * Resend: this is a preview for whoever is on shift, and the customer's delivery status
 * must come out of it unchanged — so it is never offered as a substitute for a retry.
 */
function TestSendControl({ reportId }: { reportId: string }) {
  const [open, setOpen] = useState(false);
  const [recipient, setRecipient] = useState('');
  const send = useMutation({
    mutationFn: () => sendAdminMonthlyReportTest(reportId, recipient),
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
      >
        <Mail size={12} aria-hidden />
        Test send
      </button>
    );
  }

  return (
    <form
      className="flex w-full flex-wrap items-center gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        send.mutate();
      }}
    >
      <label className="sr-only" htmlFor={`test-send-${reportId}`}>
        Internal recipient for the report test send
      </label>
      <input
        id={`test-send-${reportId}`}
        type="email"
        required
        value={recipient}
        onChange={(event) => setRecipient(event.target.value)}
        placeholder={`ops@${INTERNAL_REPORT_TEST_DOMAIN}`}
        className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-[11px] text-slate-700 placeholder:text-slate-400"
      />
      <button
        type="submit"
        disabled={send.isPending || recipient.trim() === ''}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        {send.isPending ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Mail size={12} aria-hidden />}
        Send
      </button>
      <button
        type="button"
        onClick={() => { setOpen(false); send.reset(); }}
        className="rounded-md px-2 py-1.5 text-[11px] font-medium text-slate-500 hover:text-slate-700"
      >
        Cancel
      </button>
      {send.isSuccess ? (
        <p className="w-full text-[11px] text-emerald-700">
          Sent to {send.data.recipient}. The customer&rsquo;s delivery status is unchanged.
        </p>
      ) : null}
      {send.isError ? <p className="w-full text-[11px] text-red-600">{send.error.message}</p> : null}
    </form>
  );
}

function ReportRow({ report }: { report: AdminSubscriptionReportItem }) {
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: () => {
      if (!report.reportId) throw new Error("This row has no report id.");
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
            ? `Accepted by Resend ${formatDateTime(report.sentAt)}`
            : report.lastErrorCode
              ? `Error code ${report.lastErrorCode}`
              : `${report.siteStatus} · ${formatNumber(report.deliveryAttempts)} attempts`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {report.deliveryStatus === 'failed' && report.reportId ? (
          <button
            type="button"
            onClick={() => retry.mutate()}
            disabled={retry.isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {retry.isPending ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <RotateCcw size={12} aria-hidden />}
            Resend
          </button>
        ) : null}
        {report.reportId ? <TestSendControl reportId={report.reportId} /> : null}
      </div>
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
            {!item.active && item.status === 'active' ? <Badge tone="red">Period ended</Badge> : null}
            {item.chargedAfterCancelRequest
              ? <Badge tone="red">Charged after cancelling</Badge>
              : item.cancelRequestedAt
                ? <Badge tone="amber">Cancels at period end</Badge>
                : null}
          </div>
          <p className="mt-1 text-xs text-slate-500">{item.clientEmail}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-slate-400">End of current period</p>
          <p className="mt-0.5 text-xs font-medium tabular-nums text-slate-700">{formatDateTime(item.currentPeriodEnd)}</p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {item.reports.length ? item.reports.map((report) => <ReportRow key={report.siteId} report={report} />) : (
          <p className="rounded-md bg-slate-50 px-3 py-3 text-xs text-slate-500">No published site, so there is nothing to report on.</p>
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
        title="Subscriptions & reports"
        description={query.data ? `${query.data.reportPeriodMonth} report email status · eligibility and totals are counted in KST.` : undefined}
        actions={
          <button
            type="button"
            onClick={() => query.refetch()}
            disabled={query.isRefetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={13} className={clsx(query.isRefetching && 'animate-spin')} aria-hidden />
            Refresh
          </button>
        }
      />

      {query.isPending ? (
        <LoadingBlock label="Loading subscriptions and reports…" />
      ) : query.isError ? (
        <ErrorBlock message={query.error.message} onRetry={() => query.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            <StatCard label="Active subscriptions" value={formatNumber(query.data.summary.active)} icon={UsersRound} />
            <StatCard label="MRR" value={`$${formatNumber(query.data.summary.mrrUsd)}`} icon={CircleDollarSign} />
            <StatCard label="New this month" value={formatNumber(query.data.summary.newThisMonth)} sub="Counted at first renewal" icon={CheckCircle2} />
            <StatCard label="Cancelled this month" value={formatNumber(query.data.summary.cancelledThisMonth)} sub="Counted when the status turned cancelled" icon={AlertTriangle} tone={query.data.summary.cancelledThisMonth ? 'danger' : 'neutral'} />
            <StatCard
              label="Charged after cancelling"
              value={formatNumber(query.data.summary.chargedAfterCancelRequest)}
              sub="The billing stop did not take"
              icon={AlertTriangle}
              tone={query.data.summary.chargedAfterCancelRequest ? 'danger' : 'neutral'}
            />
            <StatCard label="Reports failed / not generated" value={`${formatNumber(query.data.summary.reportFailed)} / ${formatNumber(query.data.summary.reportMissing)}`} sub={`${formatNumber(query.data.summary.reportAccepted)} accepted`} icon={Clock3} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
            <Badge tone="amber">Past due {formatNumber(query.data.summary.pastDue)}</Badge>
            <Badge tone="amber">Suspended {formatNumber(query.data.summary.suspended)}</Badge>
            <Badge tone="red">Cancelled {formatNumber(query.data.summary.cancelled)}</Badge>
            <span className="self-center text-[11px] text-slate-400">Sent means Resend accepted the request; it does not confirm inbox delivery.</span>
          </div>

          {query.data.items.length === 0 ? (
            <div className="mt-5">
              <EmptyState icon={Inbox} title="No subscriptions yet" description="A subscription appears here as soon as one is recorded." />
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
