'use client';

/**
 * 결제·구독 페이지 (/dashboard/billing) —
 * 구독 상태 카드(단일 월 요금·mock 표기) · suspended 경고 배너 · 결제 이력 테이블.
 */
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BadgeCheck, ReceiptText } from 'lucide-react';
import type { PaymentType, Tier } from '@/lib/types/domain';
import { SUSPENSION_GRACE_DAYS } from '@/lib/credits/constants';
import { isMockMode } from '@/lib/env';
import {
  PRICING,
  SUBSCRIPTION_BENEFIT_COPY,
  SUBSCRIPTION_VALUE_COPY,
} from '@/lib/pricing';
import type { ResolvedSubscription, SiteSubscriptionStatus } from '@/lib/subscriptions/core';
import { listPayments, listSites } from './api';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  formatDateTime,
  formatKrw,
  PageHeader,
  Skeleton,
} from './ui';

const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  build_fee: "Production cost (past payment)",
  maintenance_subscription: "Site operation subscription",
  premium_addon: "AI video add-on",
  credit_pack: "credit pack",
};

const PAYMENT_TYPE_TONES: Record<PaymentType, 'gold' | 'blue' | 'emerald'> = {
  build_fee: 'gold',
  maintenance_subscription: 'blue',
  premium_addon: 'gold',
  credit_pack: 'emerald',
};

function SuspendedBanner() {
  const { data } = useQuery({ queryKey: ['sites'], queryFn: listSites });
  const suspended = (data ?? []).filter((s) => s.status === 'suspended');
  if (suspended.length === 0) return null;

  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-900 bg-red-950/30 px-4 py-3.5">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
      <div className="text-sm leading-6 text-red-200">
        <p className="font-semibold">
          There is a suspended site — {suspended.map((s) => s.name).join(', ')}
        </p>
        <p className="mt-0.5 text-xs text-red-300/80">
          If your site operation subscription payment fails, your site will be suspended. grace period {SUSPENSION_GRACE_DAYS}within days
          Service resumes after the payment method is renewed. Contact help@anakslabs.com for assistance.
        </p>
      </div>
    </div>
  );
}

const INACTIVE_SUBSCRIPTION_STATUS_LABELS: Record<Exclude<SiteSubscriptionStatus, 'active'>, string> = {
  past_due: "Payment confirmation required",
  suspended: "pause",
  cancelled: "Terminated",
};

/** Display the canonical resolved entitlement, never the persisted status alone. */
export function subscriptionStatusLabel(subscription: ResolvedSubscription): string {
  const state = subscription.state;
  if (!state) return "Before subscribing";
  if (subscription.active) return "In use";
  if (state.status === 'active') return "Expiration of usage period";
  return INACTIVE_SUBSCRIPTION_STATUS_LABELS[state.status];
}

function SubscriptionCard({
  subscription,
}: {
  subscription: ResolvedSubscription;
}) {
  const mock = isMockMode();
  const state = subscription.state;
  const statusLabel = subscriptionStatusLabel(subscription);

  return (
    <Card className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2a2117] text-[#d9b878]">
          <BadgeCheck className="h-6 w-6" />
        </span>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-neutral-100">Site operation subscription</p>
            <Badge tone="neutral">Includes video hero</Badge>
            {mock ? <Badge tone="blue">demo payment</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            ${PRICING.subscription.amountUsd.toLocaleString('en-US')}/month · {SUBSCRIPTION_BENEFIT_COPY.operations} ·{' '}
            {SUBSCRIPTION_BENEFIT_COPY.selfEdit}
          </p>
          <p className="mt-1 text-[11px] leading-5 text-blue-300/80">
            {SUBSCRIPTION_VALUE_COPY}
          </p>
        </div>
      </div>
      <div className="text-left sm:text-right">
        <p className="text-xs text-neutral-500">Status</p>
        <p className={subscription.active ? 'text-sm font-medium text-emerald-400' : 'text-sm font-medium text-amber-500'}>
          {statusLabel}
        </p>
        {state ? (
          <p className="mt-1 text-[11px] text-neutral-500">
            Current period ends {formatDateTime(state.currentPeriodEnd)}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function PaymentsTable() {
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ['payments'], queryFn: listPayments });

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-neutral-300">Payment history</h2>
      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : isError ? (
        <ErrorState message="Failed to load payment history." onRetry={() => refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={<ReceiptText className="h-8 w-8" />}
          title="There is no payment history"
          description="Your payment history, including past production costs and monthly site maintenance fees, will be displayed here."
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-130 text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-[11px] text-neutral-500">
                <th className="px-4 py-2.5 font-medium">date</th>
                <th className="px-4 py-2.5 font-medium">category</th>
                <th className="px-4 py-2.5 text-right font-medium">amount</th>
                <th className="px-4 py-2.5 text-right font-medium">credit paid</th>
                <th className="px-4 py-2.5 text-right font-medium">payment key</th>
              </tr>
            </thead>
            <tbody>
              {[...data]
                .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
                .map((payment) => (
                  <tr key={payment.id} className="border-b border-neutral-900 last:border-0">
                    <td className="px-4 py-3 text-xs whitespace-nowrap text-neutral-500">
                      {formatDateTime(payment.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={PAYMENT_TYPE_TONES[payment.type]}>
                        {PAYMENT_TYPE_LABELS[payment.type] ?? payment.type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-neutral-100">
                      {formatKrw(payment.amount)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-neutral-400">
                      {payment.creditsGranted > 0 ? `+${payment.creditsGranted} items` : '—'}
                    </td>
                    <td
                      className="max-w-32 truncate px-4 py-3 text-right font-mono text-[11px] text-neutral-600"
                      title={payment.providerPaymentKey ?? undefined}
                    >
                      {payment.providerPaymentKey ?? '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}

export function BillingView({ subscription }: { tier: Tier; subscription: ResolvedSubscription }) {
  return (
    <div>
      <PageHeader
        title="Payment/Subscription"
        description="Check site operation subscription status and payment history."
      />
      <SuspendedBanner />
      <SubscriptionCard subscription={subscription} />
      <PaymentsTable />
    </div>
  );
}
