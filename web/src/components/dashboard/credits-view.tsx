'use client';

/**
 * 크레딧 페이지 (/dashboard/credits) —
 * 잔액 + 만료 임박 안내 · 팩 구매 · 편집 요청 제출 · 원장 테이블.
 * 원장(credit_ledger)이 잔액의 원본이므로 화면도 원장을 그대로 보여준다.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock3, Coins, ShoppingCart } from 'lucide-react';
import type { CreditLedgerEntry, Tier } from '@/lib/types/domain';
import { CREDIT_PACKS, CREDIT_PURCHASE_COOLING_OFF_DAYS } from '@/lib/credits/constants';
import { CREDIT_CONTRACT_COPY } from '@/lib/credits/contract-copy';
import { DYNAMIC_FEATURE_NOTICE } from '@/lib/legal/notices';
import { getCredits, purchaseCreditPack } from './api';
import { EditRequestForm } from './edit-request-form';
import { useToast } from './toast';
import {
  Button,
  Card,
  cn,
  CREDIT_REASON_LABELS,
  EmptyState,
  ErrorState,
  formatDate,
  formatDateTime,
  formatKrw,
  PageHeader,
  Skeleton,
} from './ui';

/** 만료 임박(60일 이내) 지급 lot 중 가장 이른 것 */
function nextExpiry(ledger: CreditLedgerEntry[]): { date: string; amount: number } | null {
  const now = Date.now();
  const horizon = now + 60 * 86_400_000;
  const upcoming = ledger
    .filter((e) => e.amount > 0 && e.expiresAt)
    .map((e) => ({ date: e.expiresAt as string, amount: e.amount, t: new Date(e.expiresAt as string).getTime() }))
    .filter((e) => e.t > now && e.t <= horizon)
    .sort((a, b) => a.t - b.t);
  return upcoming[0] ?? null;
}

function BalanceCard() {
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ['credits'], queryFn: getCredits });

  if (isPending) return <Skeleton className="h-32" />;
  if (isError) return <ErrorState message="Failed to load credit information." onRetry={() => refetch()} />;

  const expiry = nextExpiry(data.ledger);

  return (
    <Card className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2a2117] text-[#d9b878]">
          <Coins className="h-6 w-6" />
        </span>
        <div>
          <p className="text-xs text-neutral-500">Credits held</p>
          <p className="text-3xl font-semibold tracking-tight text-[#d9b878]">{data.balance} items</p>
          {data.updatedAt ? (
            <p className="mt-0.5 text-[11px] text-neutral-600">standard {formatDateTime(data.updatedAt)}</p>
          ) : null}
        </div>
      </div>
      {expiry ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-900 bg-amber-950/30 px-3 py-2.5 text-xs leading-5 text-amber-300 sm:max-w-xs">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-medium">{formatDate(expiry.date)}</span> There is a payment scheduled to expire (the payment is scheduled to expire){' '}
            {expiry.amount}dog). Deductions are used starting from credits that are about to expire.
          </span>
        </div>
      ) : (
        <p className="text-xs text-neutral-600">I have no credits due to expire within 60 days.</p>
      )}
    </Card>
  );
}

function PackGrid() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // [§8] 결제 직전 동의 — 미체크 시 결제 진행 불가
  const [consented, setConsented] = useState(false);

  const mutation = useMutation({
    mutationFn: purchaseCreditPack,
    onSuccess: (result, packCredits) => {
      if (result.paid) {
        queryClient.invalidateQueries({ queryKey: ['credits'] });
        toast(
          'success',
          `credits${result.credits ?? packCredits}Charged (${formatKrw(result.amount ?? 0)}) — balance${result.balance ?? '-'} items`,
        );
      } else {
        // [T1] 실모드 — PG(토스) 연동 전이라 결제창이 없다. 죽은 안내 대신 준비 중 + 문의 유도.
        toast('info', "Credit purchases are currently unavailable. Contact contact@anakslabs.com if you need assistance.");
      }
    },
    onError: (err) => {
      toast('error', err instanceof Error ? err.message : "Credit purchase failed.");
    },
  });

  return (
    <section id="packs" className="mt-8 scroll-mt-20">
      <h2 className="mb-3 text-sm font-semibold text-neutral-300">Buy Credit Packs</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {CREDIT_PACKS.map((pack, i) => {
          const perCredit = Math.round(pack.priceKrw / pack.credits);
          const recommended = i === 1;
          return (
            <Card
              key={pack.credits}
              className={cn('relative flex flex-col', recommended && 'border-[#4a3a22] bg-[#151310]')}
            >
              {recommended ? (
                <span className="absolute -top-2.5 right-4 rounded-full bg-[#c8a96a] px-2.5 py-0.5 text-[10px] font-semibold text-neutral-950">
                  popularity
                </span>
              ) : null}
              <p className="text-sm font-semibold text-neutral-100">credits {pack.label}</p>
              <p className="mt-2 text-2xl font-semibold text-neutral-50">{formatKrw(pack.priceKrw)}</p>
              <p className="mt-0.5 flex-1 text-xs text-neutral-500">per piece {formatKrw(perCredit)}</p>
              <Button
                className="mt-4"
                variant={recommended ? 'primary' : 'secondary'}
                loading={mutation.isPending && mutation.variables === pack.credits}
                disabled={mutation.isPending}
                onClick={() => {
                  // [T1] 동의 미체크 = 무설명 disabled(버튼 미동작 체감) 대신 명확한 안내
                  if (!consented) {
                    toast('info', "Please first agree to the payment instructions below.");
                    document.querySelector('#purchase-consent')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    return;
                  }
                  mutation.mutate(pack.credits);
                }}
              >
                <ShoppingCart className="h-4 w-4" />
                purchase
              </Button>
            </Card>
          );
        })}
      </div>
      <label id="purchase-consent" className="mt-4 flex items-start gap-2.5 rounded-lg border border-neutral-800 bg-neutral-900/40 px-3.5 py-3 text-[11px] leading-5 text-neutral-400">
        <input
          type="checkbox"
          checked={consented}
          onChange={(e) => setConsented(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#c8a96a]"
        />
        <span>
          I agree to the instructions before payment. Purchase credit is credited after purchase {CREDIT_PURCHASE_COOLING_OFF_DAYS}If not used within 1 day
          You can cancel your subscription (full refund) and it expires 365 days later. {DYNAMIC_FEATURE_NOTICE}
        </span>
      </label>
      <p className="mt-2 text-[11px] text-neutral-600">
        {CREDIT_CONTRACT_COPY}
      </p>
    </section>
  );
}

function LedgerTable() {
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ['credits'], queryFn: getCredits });

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-neutral-300">credit history</h2>
      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : isError ? (
        <ErrorState message="Failed to load credit history." onRetry={() => refetch()} />
      ) : data.ledger.length === 0 ? (
        <EmptyState
          title="No credit history"
          description="When credits are paid or used, they are recorded here."
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-120 text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-[11px] text-neutral-500">
                <th className="px-4 py-2.5 font-medium">date</th>
                <th className="px-4 py-2.5 font-medium">division</th>
                <th className="px-4 py-2.5 text-right font-medium">change</th>
                <th className="px-4 py-2.5 text-right font-medium">expiration date</th>
              </tr>
            </thead>
            <tbody>
              {[...data.ledger]
                .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
                .map((entry) => (
                  <tr key={entry.id} className="border-b border-neutral-900 last:border-0">
                    <td className="px-4 py-3 text-xs whitespace-nowrap text-neutral-500">
                      {formatDateTime(entry.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-300">
                      {CREDIT_REASON_LABELS[entry.reason] ?? entry.reason}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-3 text-right text-sm font-semibold tabular-nums',
                        entry.amount > 0 ? 'text-emerald-400' : 'text-red-400',
                      )}
                    >
                      {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
                    </td>
                    <td className="px-4 py-3 text-right text-xs whitespace-nowrap text-neutral-600">
                      {entry.expiresAt ? formatDate(entry.expiresAt) : '—'}
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

export function CreditsView({ tier }: { tier: Tier }) {
  return (
    <div>
      <PageHeader
        title="credits"
        description="Manage the credits you use for edit requests. Balances are calculated on a ledger basis."
      />
      <BalanceCard />
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-neutral-300">Request an edit</h2>
        <EditRequestForm tier={tier} />
      </section>
      <PackGrid />
      <LedgerTable />
    </div>
  );
}
