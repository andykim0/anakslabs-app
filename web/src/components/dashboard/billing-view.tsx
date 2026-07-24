'use client';

/**
 * 결제·구독 페이지 (/dashboard/billing) —
 * 구독 상태 카드(단일 월 요금·mock 표기) · suspended 경고 배너 · 결제 이력 테이블.
 */
import Link from 'next/link';
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
  build_fee: '제작비 (과거 결제)',
  maintenance_subscription: '사이트 운영 구독',
  premium_addon: 'AI 영상 애드온',
  credit_pack: '크레딧 팩',
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
          일시중지된 사이트가 있습니다 — {suspended.map((s) => s.name).join(', ')}
        </p>
        <p className="mt-0.5 text-xs text-red-300/80">
          사이트 운영 구독 결제가 실패하면 사이트가 일시중지됩니다. 유예기간 {SUSPENSION_GRACE_DAYS}일 안에
          결제 수단을 갱신하면 자동으로 복구돼요. 문의: hello@anakslabs.com
        </p>
      </div>
    </div>
  );
}

const INACTIVE_SUBSCRIPTION_STATUS_LABELS: Record<Exclude<SiteSubscriptionStatus, 'active'>, string> = {
  past_due: '결제 확인 필요',
  suspended: '일시중지',
  cancelled: '해지됨',
};

/** Display the canonical resolved entitlement, never the persisted status alone. */
export function subscriptionStatusLabel(subscription: ResolvedSubscription): string {
  const state = subscription.state;
  if (!state) return '구독 전';
  if (subscription.active) return '이용 중';
  if (state.status === 'active') return '이용기간 만료';
  return INACTIVE_SUBSCRIPTION_STATUS_LABELS[state.status];
}

function SubscriptionCard({
  tier,
  subscription,
}: {
  tier: Tier;
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
            <p className="text-sm font-semibold text-neutral-100">사이트 운영 구독</p>
            <Badge tone={tier === 'premium' ? 'gold' : 'neutral'}>
              {tier === 'premium' ? 'AI 영상 홈페이지 적용' : '기본 모션 포함'}
            </Badge>
            {mock ? <Badge tone="blue">데모 결제</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            연 {PRICING.subscription.annual.toLocaleString()}원 · {SUBSCRIPTION_BENEFIT_COPY.report} ·{' '}
            {SUBSCRIPTION_BENEFIT_COPY.credits} · {SUBSCRIPTION_BENEFIT_COPY.operations}
          </p>
          <p className="mt-1 text-[11px] leading-5 text-blue-300/80">
            {SUBSCRIPTION_VALUE_COPY}
          </p>
        </div>
      </div>
      <div className="text-left sm:text-right">
        <p className="text-xs text-neutral-500">상태</p>
        <p className={subscription.active ? 'text-sm font-medium text-emerald-400' : 'text-sm font-medium text-amber-500'}>
          {statusLabel}
        </p>
        {state ? (
          <p className="mt-1 text-[11px] text-neutral-500">
            현재 이용기간 {formatDateTime(state.currentPeriodEnd)}까지
          </p>
        ) : null}
        {tier === 'basic' ? (
          <Link
            href="/dashboard/settings"
            className="mt-1 inline-block text-xs text-[#c8a96a] hover:underline"
          >
            AI 영상 홈페이지 문의 →
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

function PaymentsTable() {
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ['payments'], queryFn: listPayments });

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-neutral-300">결제 이력</h2>
      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : isError ? (
        <ErrorState message="결제 이력을 불러오지 못했습니다." onRetry={() => refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={<ReceiptText className="h-8 w-8" />}
          title="결제 이력이 없습니다"
          description="제작비, 사이트 운영 구독, 크레딧 팩 결제 내역이 이곳에 표시됩니다."
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-130 text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-[11px] text-neutral-500">
                <th className="px-4 py-2.5 font-medium">일시</th>
                <th className="px-4 py-2.5 font-medium">유형</th>
                <th className="px-4 py-2.5 text-right font-medium">금액</th>
                <th className="px-4 py-2.5 text-right font-medium">지급 크레딧</th>
                <th className="px-4 py-2.5 text-right font-medium">결제 키</th>
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
                      {payment.creditsGranted > 0 ? `+${payment.creditsGranted}개` : '—'}
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

export function BillingView({ tier, subscription }: { tier: Tier; subscription: ResolvedSubscription }) {
  return (
    <div>
      <PageHeader
        title="결제·구독"
        description="사이트 운영 구독 상태와 결제 이력을 확인하세요."
      />
      <SuspendedBanner />
      <SubscriptionCard tier={tier} subscription={subscription} />
      <PaymentsTable />
    </div>
  );
}
