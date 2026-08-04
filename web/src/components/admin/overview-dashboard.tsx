'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  AlertTriangle,
  CircleDollarSign,
  ClipboardCheck,
  Coins,
  Globe,
  MonitorCheck,
  ReceiptText,
  Rocket,
  ShieldCheck,
  Target,
  Users,
  Video,
} from 'lucide-react';
import { CF_FREE_HOSTNAME_LIMIT, CF_HOSTNAME_ALERT_THRESHOLD } from '@/lib/credits/constants';
import { FULFILLMENT_SLA_BUSINESS_DAYS } from '@/lib/fulfillment-sla';
import { getOverview } from './api';
import { formatKrw, formatNumber } from './format';
import { ManualCollectionPanel } from './manual-collection-panel';
import { Card, ErrorBlock, Gauge, LoadingBlock, PageHeader, StatCard } from './ui';

const GUARANTEE_DECISION_COPY = {
  'not-due': { label: "Before decision", tone: 'text-slate-600 bg-slate-100' },
  'needs-index-evidence': { label: "Need to check index", tone: 'text-amber-800 bg-amber-100' },
  eligible: { label: "Refund Eligibility", tone: 'text-red-700 bg-red-100' },
  'not-eligible': { label: "Meets the criteria", tone: 'text-emerald-700 bg-emerald-100' },
  excluded: { label: "Exceptions apply", tone: 'text-violet-700 bg-violet-100' },
} as const;

export function OverviewDashboard() {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: getOverview,
  });

  if (isPending) {
    return (
      <>
        <PageHeader title="dashboard" description="Summary of overall service status" />
        <LoadingBlock label="Loading status..." />
      </>
    );
  }

  if (isError) {
    return (
      <>
        <PageHeader title="dashboard" description="Summary of overall service status" />
        <ErrorBlock message={error.message} onRetry={() => refetch()} />
      </>
    );
  }

  const hostnameDanger = data.customHostnameCount >= CF_HOSTNAME_ALERT_THRESHOLD;

  return (
    <>
      <PageHeader title="dashboard" description="Summary of overall service status" />

      {hostnameDanger ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-300 bg-red-50 px-4 py-3"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" aria-hidden />
          <div className="text-sm text-red-800">
            <p className="font-semibold">Cloudflare free limits coming soon</p>
            <p className="mt-0.5 text-xs text-red-700">
              custom hostname {formatNumber(data.customHostnameCount)}/
              {formatNumber(CF_FREE_HOSTNAME_LIMIT)}The dog is in use. Exceeding the limit is per hostname per month.
              $0.10 will be charged. Check the details in the Infrastructure tab.
            </p>
          </div>
        </div>
      ) : null}

      {data.fulfillmentAlerts.total > 0 ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" aria-hidden />
          <div className="text-sm text-amber-900">
            <p className="font-semibold">
              atmosphere {FULFILLMENT_SLA_BUSINESS_DAYS}Fulfillment requests that extend beyond business days {formatNumber(data.fulfillmentAlerts.total)} records
            </p>
            <p className="mt-0.5 text-xs text-amber-800">
              <Link href="/admin/edit-queue" className="underline underline-offset-2">
                correction {formatNumber(data.fulfillmentAlerts.editOverdue)} records
              </Link>
              {' · '}
              <Link href="/admin/video-queue" className="underline underline-offset-2">
                video {formatNumber(data.fulfillmentAlerts.videoOverdue)} records
              </Link>
              Please check first to make sure this is not quietly missing.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="number of customers"
          icon={Users}
          value={formatNumber(data.clients.total)}
          sub={
            <span>
              default homepage {formatNumber(data.clients.basic)} · AI video homepage{' '}
              {formatNumber(data.clients.premium)}
            </span>
          }
        />
        <StatCard
          label="live site"
          icon={MonitorCheck}
          value={formatNumber(data.liveSites)}
          sub="status = live standard"
        />
        <StatCard
          label="credit circulation"
          icon={Coins}
          value={formatNumber(data.credits.circulating)}
          sub={
            <span>
              payment {formatNumber(data.credits.granted)} − consumption{' '}
              {formatNumber(data.credits.consumed)}
            </span>
          }
        />
        <StatCard
          label="Waiting for QA"
          icon={ClipboardCheck}
          value={formatNumber(data.qaPending)}
          sub="Review required Edit request"
        />
        <StatCard
          label="custom hostname"
          icon={Globe}
          tone={hostnameDanger ? 'danger' : 'neutral'}
          value={
            <span>
              {formatNumber(data.customHostnameCount)}
              <span className="text-sm font-normal text-slate-400">
                {' '}
                / {formatNumber(CF_FREE_HOSTNAME_LIMIT)}
              </span>
            </span>
          }
          sub={
            <Gauge
              value={data.customHostnameCount}
              max={CF_FREE_HOSTNAME_LIMIT}
              warnAt={CF_HOSTNAME_ALERT_THRESHOLD}
              className="mt-1.5"
            />
          }
        />
      </div>

      <ManualCollectionPanel rows={data.manualCollections} />

      <section className="mt-7" aria-labelledby="admin-revenue-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="admin-revenue-heading" className="text-sm font-semibold text-slate-900">
              Sales at a glance
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {data.revenue.month.month} KST · PG and manual collection ledger combined · Cash basis
            </p>
          </div>
          <p className="text-xs text-slate-500">
            Goal achievement rate {Math.round(data.revenue.targetProgress * 100)}%
          </p>
        </div>

        <Card className="p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Net proceeds from operations this month
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">
                {formatKrw(data.revenue.operatingRevenueNetKrw)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Production/AI video/site operation Subscription collection − Excluding refunds and credit packs
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                PG {formatKrw(data.revenue.operatingRevenueBySourceKrw.provider)} · Manual collection{' '}
                {formatKrw(data.revenue.operatingRevenueBySourceKrw.manual)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-slate-400">Monthly operating goal</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-700">
                {formatKrw(data.revenue.targetKrw)}
              </p>
            </div>
          </div>
          <Gauge
            value={Math.max(data.revenue.operatingRevenueNetKrw, 0)}
            max={data.revenue.targetKrw}
            className="mt-4 h-2"
          />
        </Card>

        <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-6">
          <StatCard
            label="Launch price production"
            value={formatKrw(data.revenue.segments.launchBuild.netKrw)}
            icon={Rocket}
          />
          <StatCard
            label="fixed price production"
            value={formatKrw(data.revenue.segments.listBuild.netKrw)}
            icon={Target}
          />
          <StatCard
            label="AI video add-on"
            value={formatKrw(data.revenue.segments.videoAddon.netKrw)}
            icon={Video}
          />
          <StatCard
            label="Operational Subscription Collection"
            value={formatKrw(data.revenue.segments.subscription.netKrw)}
            icon={ReceiptText}
          />
          <StatCard
            label="Uncategorized Production"
            value={formatKrw(data.revenue.segments.unclassifiedBuild.netKrw)}
            sub="Past, negotiated price, unclear combination, partial refund distribution"
            icon={CircleDollarSign}
            tone={data.revenue.segments.unclassifiedBuild.netKrw !== 0 ? 'danger' : 'neutral'}
          />
          <StatCard
            label="full refund"
            value={formatKrw(data.revenue.receipts.refundsKrw)}
            sub="Credit pack included · Actual processing time"
            icon={ReceiptText}
            tone={data.revenue.receipts.refundsKrw > 0 ? 'danger' : 'neutral'}
          />
        </div>

        <Card className="mt-3 overflow-x-auto" >
          <div className="flex items-start gap-2 border-b border-slate-200 px-4 py-3">
            <ShieldCheck size={16} className="mt-0.5 text-slate-400" aria-hidden />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">90-day performance guarantee decision</h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Index signal uses only Search Advisor/URL confirmation records · Inflow is the sum of Naver pageviews without PII
              </p>
              <p className="mt-1 text-[11px] text-slate-500" data-guarantee-population>
                KR/legacy eligible: {formatNumber(data.guaranteePopulation.eligibleSiteCount)} · Evaluated now: {formatNumber(data.guaranteePopulation.evaluatedSiteCount)} · US sites not covered: {formatNumber(data.guaranteePopulation.excludedEnUsSiteCount)}
              </p>
            </div>
          </div>
          {!data.guaranteeProgramEnabled ? (
            <p className="px-4 py-8 text-center text-xs text-slate-500">
              The legacy guarantee program is paused. No site is currently being evaluated.
            </p>
          ) : data.guarantees.length ? (
            <table data-guarantee-admin className="w-full min-w-[880px] text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">site</th>
                  <th className="px-4 py-2.5 font-medium">90 days decision date</th>
                  <th className="px-4 py-2.5 font-medium">Naver Index</th>
                  <th className="px-4 py-2.5 font-medium">Naver influx</th>
                  <th className="px-4 py-2.5 font-medium">verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.guarantees.map((row) => {
                  const decision = GUARANTEE_DECISION_COPY[row.decision];
                  return (
                    <tr key={row.siteId}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{row.siteName}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-slate-400">{row.domain ?? "domain standby"}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(row.dueAt).toLocaleDateString('ko-KR')}
                        {row.daysRemaining ? <span className="ml-1 text-slate-400">({row.daysRemaining}days left)</span> : null}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {row.naverIndexed === null ? "Confirmation required" : row.naverIndexed ? "Yes" : "doesn't exist"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">
                        {formatNumber(row.naverReferralCount)} / {formatNumber(row.referralThreshold)} times
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded px-2 py-1 text-[11px] font-semibold ${decision.tone}`}>{decision.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-8 text-center text-xs text-slate-500">There are no eligible KR/legacy sites awaiting a guarantee decision.</p>
          )}
        </Card>

        <Card className="mt-3 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Past launch price collection site
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {formatNumber(data.revenue.launchOffer.contracts)}
                {data.revenue.launchOffer.limit === null ? null : (
                  <span className="text-sm font-normal text-slate-400">
                    {' '}/ {formatNumber(data.revenue.launchOffer.limit)} records
                  </span>
                )}
              </p>
            </div>
            <p className="max-w-lg text-right text-[11px] leading-5 text-slate-500">
              PG only counts the sites owned by the customer when identified as one, while manual collections only counts sites attributed to the ledger.
              PG/manual duplicates on the same site are counted as one, and there is no quantity limit for new contracts.
            </p>
          </div>
          {data.revenue.launchOffer.limit !== null ? (
            <>
              <Gauge
                value={data.revenue.launchOffer.contracts}
                max={data.revenue.launchOffer.limit}
                className="mt-3"
              />
              <p className="mt-2 text-[11px] text-slate-500">
                {data.revenue.launchOffer.reachedLimit
                  ? "The limit has been reached. Have the operator review the launch offer status."
                  : `${formatNumber(data.revenue.launchOffer.remaining ?? 0)}There's nothing left`}
              </p>
            </>
          ) : (
            <p className="mt-2 text-xs text-slate-500">This is a tally for reproducing past ledgers and is not used for new sales.</p>
          )}
        </Card>

        {data.revenue.anomalies.length ? (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
            payment ledger {formatNumber(data.revenue.anomalyPaymentCount)}error in gun{' '}
            {formatNumber(data.revenue.anomalies.length)}I found a dog. Classification and refund reflection of the field is
            No estimates were made.
          </div>
        ) : null}
      </section>
    </>
  );
}
