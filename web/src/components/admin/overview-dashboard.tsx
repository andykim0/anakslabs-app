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
import { formatCurrency, formatKrw, formatNumber } from './format';
import { Card, ErrorBlock, Gauge, LoadingBlock, PageHeader, StatCard } from './ui';

const GUARANTEE_DECISION_COPY = {
  'not-due': { label: "Not due yet", tone: 'text-slate-600 bg-slate-100' },
  'needs-index-evidence': { label: "Needs index evidence", tone: 'text-amber-800 bg-amber-100' },
  eligible: { label: "Refund due", tone: 'text-red-700 bg-red-100' },
  'not-eligible': { label: "Criteria met", tone: 'text-emerald-700 bg-emerald-100' },
  excluded: { label: "Excluded", tone: 'text-violet-700 bg-violet-100' },
} as const;

export function OverviewDashboard() {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: getOverview,
  });

  if (isPending) {
    return (
      <>
        <PageHeader title="Dashboard" description="Service status at a glance" />
        <LoadingBlock label="Loading status…" />
      </>
    );
  }

  if (isError) {
    return (
      <>
        <PageHeader title="Dashboard" description="Service status at a glance" />
        <ErrorBlock message={error.message} onRetry={() => refetch()} />
      </>
    );
  }

  const hostnameDanger = data.customHostnameCount >= CF_HOSTNAME_ALERT_THRESHOLD;
  const usdRevenue = data.revenue.byCurrency.USD;

  return (
    <>
      <PageHeader title="Dashboard" description="Service status at a glance" />

      {hostnameDanger ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-300 bg-red-50 px-4 py-3"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" aria-hidden />
          <div className="text-sm text-red-800">
            <p className="font-semibold">Approaching the Cloudflare free limit</p>
            <p className="mt-0.5 text-xs text-red-700">
              {formatNumber(data.customHostnameCount)} of {formatNumber(CF_FREE_HOSTNAME_LIMIT)} free
              custom hostnames are in use. Past the limit, each hostname costs $0.10 per month.
              See the Infrastructure tab for details.
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
              {formatNumber(data.fulfillmentAlerts.total)}{' '}
              {data.fulfillmentAlerts.total === 1
                ? 'fulfillment request is'
                : 'fulfillment requests are'}{' '}
              past the {FULFILLMENT_SLA_BUSINESS_DAYS} business-day SLA
            </p>
            <p className="mt-0.5 text-xs text-amber-800">
              <Link href="/admin/edit-queue" className="underline underline-offset-2">
                edits: {formatNumber(data.fulfillmentAlerts.editOverdue)}
              </Link>
              {' · '}
              <Link href="/admin/video-queue" className="underline underline-offset-2">
                video: {formatNumber(data.fulfillmentAlerts.videoOverdue)}
              </Link>
              {' — clear these first so none of them goes quietly unanswered.'}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Clients"
          icon={Users}
          value={formatNumber(data.clients.total)}
          sub={
            <span>
              Default homepage {formatNumber(data.clients.basic)} · AI video homepage{' '}
              {formatNumber(data.clients.premium)}
            </span>
          }
        />
        <StatCard
          label="Live sites"
          icon={MonitorCheck}
          value={formatNumber(data.liveSites)}
          sub="status = live"
        />
        <StatCard
          label="Credits outstanding"
          icon={Coins}
          value={formatNumber(data.credits.circulating)}
          sub={
            <span>
              granted {formatNumber(data.credits.granted)} − consumed{' '}
              {formatNumber(data.credits.consumed)}
            </span>
          }
        />
        <StatCard
          label="Awaiting QA"
          icon={ClipboardCheck}
          value={formatNumber(data.qaPending)}
          sub="Edit requests needing review"
        />
        <StatCard
          label="Custom hostnames"
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

      <section className="mt-7" aria-labelledby="admin-revenue-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="admin-revenue-heading" className="text-sm font-semibold text-slate-900">
              Revenue at a glance
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {data.revenue.month.month} KST · USD and KRW ledgers shown separately · Cash basis
            </p>
          </div>
          <p className="text-xs text-slate-500">
            {Math.round(data.revenue.targetProgress * 100)}% of target
          </p>
        </div>

        <Card className="p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                USD net operating revenue this month
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">
                {formatCurrency(usdRevenue.operatingRevenueNet, 'USD')}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Setup and monthly service, less refunds. Never converted to KRW.
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Payment provider {formatCurrency(usdRevenue.operatingRevenueBySource.provider, 'USD')} · Manual collection{' '}
                {formatCurrency(usdRevenue.operatingRevenueBySource.manual, 'USD')}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-right text-[11px] text-slate-500">
              <span>Setup/build</span>
              <strong className="tabular-nums text-slate-700">
                {formatCurrency(usdRevenue.segments.unclassifiedBuild.net, 'USD')}
              </strong>
              <span>Monthly service</span>
              <strong className="tabular-nums text-slate-700">
                {formatCurrency(usdRevenue.segments.subscription.net, 'USD')}
              </strong>
              <span>Refunds</span>
              <strong className="tabular-nums text-red-600">
                {formatCurrency(usdRevenue.receipts.refunds, 'USD')}
              </strong>
            </div>
          </div>
        </Card>

        <Card className="mt-3 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                KRW net operating revenue this month
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">
                {formatKrw(data.revenue.operatingRevenueNetKrw)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Legacy build and site-operation receipts − refunds and credit packs. Never converted from USD.
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Payment provider {formatKrw(data.revenue.operatingRevenueBySourceKrw.provider)} · Manual collection{' '}
                {formatKrw(data.revenue.operatingRevenueBySourceKrw.manual)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-slate-400">KRW monthly operating target</p>
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
            label="Launch-price builds"
            value={formatKrw(data.revenue.segments.launchBuild.netKrw)}
            icon={Rocket}
          />
          <StatCard
            label="List-price builds"
            value={formatKrw(data.revenue.segments.listBuild.netKrw)}
            icon={Target}
          />
          <StatCard
            label="AI video add-on"
            value={formatKrw(data.revenue.segments.videoAddon.netKrw)}
            icon={Video}
          />
          <StatCard
            label="Subscription receipts"
            value={formatKrw(data.revenue.segments.subscription.netKrw)}
            icon={ReceiptText}
          />
          <StatCard
            label="Unclassified builds"
            value={formatKrw(data.revenue.segments.unclassifiedBuild.netKrw)}
            sub="Legacy, negotiated or unclear pricing · partial-refund allocation"
            icon={CircleDollarSign}
            tone={data.revenue.segments.unclassifiedBuild.netKrw !== 0 ? 'danger' : 'neutral'}
          />
          <StatCard
            label="Refunds"
            value={formatKrw(data.revenue.receipts.refundsKrw)}
            sub="Includes credit packs · dated when the refund was processed"
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
                Index signal comes only from Search Advisor / URL check records · Referrals are Naver pageview totals with no personal data
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
                  <th className="px-4 py-2.5 font-medium">Site</th>
                  <th className="px-4 py-2.5 font-medium">90-day decision date</th>
                  <th className="px-4 py-2.5 font-medium">Naver indexed</th>
                  <th className="px-4 py-2.5 font-medium">Naver referrals</th>
                  <th className="px-4 py-2.5 font-medium">Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.guarantees.map((row) => {
                  const decision = GUARANTEE_DECISION_COPY[row.decision];
                  return (
                    <tr key={row.siteId}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{row.siteName}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-slate-400">{row.domain ?? "No domain yet"}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(row.dueAt).toLocaleDateString('en-US')}
                        {row.daysRemaining ? <span className="ml-1 text-slate-400">({row.daysRemaining} days left)</span> : null}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {row.naverIndexed === null ? "Not checked" : row.naverIndexed ? "Yes" : "No"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">
                        {formatNumber(row.naverReferralCount)} / {formatNumber(row.referralThreshold)}
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
                Legacy launch-price sites
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {formatNumber(data.revenue.launchOffer.contracts)}
                {data.revenue.launchOffer.limit === null ? null : (
                  <span className="text-sm font-normal text-slate-400">
                    {' '}/ {formatNumber(data.revenue.launchOffer.limit)}
                  </span>
                )}
              </p>
            </div>
            <p className="max-w-lg text-right text-[11px] leading-5 text-slate-500">
              Provider payments count a site only when it can be matched to its owner; manual collections count
              only sites attributed in the ledger. A site counted on both sides counts once. New contracts have no cap.
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
                  ? "The limit is reached — check the launch offer before contracting another."
                  : `${formatNumber(data.revenue.launchOffer.remaining ?? 0)} remaining`}
              </p>
            </>
          ) : (
            <p className="mt-2 text-xs text-slate-500">This is a tally for reproducing past ledgers and is not used for new sales.</p>
          )}
        </Card>

        {data.revenue.anomalies.length ? (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
            {formatNumber(data.revenue.anomalies.length)} anomalies across{' '}
            {formatNumber(data.revenue.anomalyPaymentCount)} payment ledger entries. Their
            classification and refunds are reported as-is — nothing was estimated.
          </div>
        ) : null}
      </section>
    </>
  );
}
