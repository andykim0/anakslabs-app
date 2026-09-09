'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Coins, ExternalLink, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Client, ClientStatus, Tier } from '@/lib/types/domain';
import { getClientDetail, updateClient } from './api';
import {
  CLIENT_STATUS_LABELS,
  CREDIT_REASON_LABELS,
  DOMAIN_TYPE_LABELS,
  PAYMENT_TYPE_LABELS,
  SITE_STATUS_LABELS,
  TIER_LABELS,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
} from './format';
import { CreditAdjustDialog } from './credit-adjust-dialog';
import {
  Badge,
  CLIENT_STATUS_TONES,
  ErrorBlock,
  LoadingBlock,
  PanelSection,
  SITE_STATUS_TONES,
  TIER_TONES,
} from './ui';
import {
  OperatorSiteCreateForm,
  OperatorSiteDeliveryControls,
} from './operator-client-actions';

/** 고객 행 클릭 시 우측에 뜨는 상세 패널. */
/**
 * `approvedPreviewId` arrives from the US demo pipeline via `?previewId=` on the clients page, so
 * the operator who just made a preview lands on the delivery mode instead of a crawl.
 */
export function ClientDetailPanel({
  clientId,
  onClose,
  approvedPreviewId,
}: {
  clientId: string;
  onClose: () => void;
  approvedPreviewId?: string;
}) {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'client', clientId],
    queryFn: () => getClientDetail(clientId),
  });
  const [adjustOpen, setAdjustOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !adjustOpen) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [adjustOpen, onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/20" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Client details"
        className="fixed inset-y-0 right-0 z-50 flex w-[540px] max-w-full flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-2xl"
      >
        {isPending ? (
          <LoadingBlock label="Loading client…" />
        ) : isError ? (
          <div className="p-5">
            <ErrorBlock message={error.message} onRetry={() => refetch()} />
            <button
              type="button"
              onClick={onClose}
              className="mt-3 text-xs text-slate-500 underline"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{data.client.name}</h2>
                  <p className="mt-0.5 text-xs text-slate-500">{data.client.email}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge tone={TIER_TONES[data.client.tier]}>
                      {TIER_LABELS[data.client.tier]}
                    </Badge>
                    <Badge tone={CLIENT_STATUS_TONES[data.client.status]}>
                      {CLIENT_STATUS_LABELS[data.client.status]}
                    </Badge>
                    <Badge tone="neutral">Joined {formatDate(data.client.createdAt)}</Badge>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close panel"
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X size={17} aria-hidden />
                </button>
              </div>

              <div className="mt-3 flex items-center justify-between rounded-md bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200">
                <p className="flex items-center gap-1.5 text-xs text-slate-600">
                  <Coins size={14} className="text-amber-500" aria-hidden />
                  Credit balance{' '}
                  <span className="text-sm font-semibold tabular-nums text-slate-900">
                    {formatNumber(data.balance)}
                  </span>
                </p>
                {data.creditsEnabled ? (
                  <button
                    type="button"
                    onClick={() => setAdjustOpen(true)}
                    className="rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-slate-700"
                  >
                    Adjust credits
                  </button>
                ) : null}
              </div>
            </div>

            <ClientEditControls key={data.client.id} client={data.client} />

            <OperatorSiteCreateForm
              clientId={data.client.id}
              disabled={data.sites.length > 0}
              approvedPreviewId={approvedPreviewId}
            />

            <PanelSection title={`Sites (${data.sites.length})`}>
              {data.sites.length === 0 ? (
                <p className="text-xs text-slate-400">No sites yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.sites.map((site) => (
                    <li
                      key={site.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">{site.name}</p>
                        <p className="truncate text-[11px] text-slate-500">
                          {site.domain ?? "No domain assigned"} ·{' '}
                          {DOMAIN_TYPE_LABELS[site.domainType]}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Badge tone={SITE_STATUS_TONES[site.status]}>
                          {SITE_STATUS_LABELS[site.status]}
                        </Badge>
                        {site.domain && site.status === 'live' ? (
                          <a
                            href={`https://${site.domain}`}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Open ${site.name}`}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                          >
                            <ExternalLink size={13} aria-hidden />
                          </a>
                        ) : null}
                      </div>
                      {site.deliveredFromPreviewId ? (
                        <OperatorSiteDeliveryControls clientId={data.client.id} site={site} />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </PanelSection>

            <PanelSection title="Credit ledger (last 20)">
              {data.ledger.length === 0 ? (
                <p className="text-xs text-slate-400">No ledger entries.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] text-slate-400">
                      <th className="py-1.5 pr-2 font-medium">Date</th>
                      <th className="py-1.5 pr-2 font-medium">Reason</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Change</th>
                      <th className="py-1.5 font-medium">Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ledger.slice(0, 20).map((entry) => (
                      <tr key={entry.id} className="border-b border-slate-100">
                        <td className="py-1.5 pr-2 whitespace-nowrap text-slate-500">
                          {formatDateTime(entry.createdAt)}
                        </td>
                        <td className="py-1.5 pr-2 text-slate-700">
                          {CREDIT_REASON_LABELS[entry.reason]}
                        </td>
                        <td
                          className={`py-1.5 pr-2 text-right font-semibold tabular-nums ${
                            entry.amount >= 0 ? 'text-emerald-600' : 'text-red-600'
                          }`}
                        >
                          {entry.amount >= 0 ? `+${formatNumber(entry.amount)}` : formatNumber(entry.amount)}
                        </td>
                        <td className="py-1.5 whitespace-nowrap text-slate-400">
                          {entry.expiresAt ? formatDate(entry.expiresAt) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </PanelSection>

            <PanelSection title={`Payments (${data.payments.length})`}>
              {data.payments.length === 0 ? (
                <p className="text-xs text-slate-400">No payments recorded.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] text-slate-400">
                      <th className="py-1.5 pr-2 font-medium">Date</th>
                      <th className="py-1.5 pr-2 font-medium">Type</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Amount</th>
                      <th className="py-1.5 text-right font-medium">Credits granted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((payment) => (
                      <tr key={payment.id} className="border-b border-slate-100">
                        <td className="py-1.5 pr-2 whitespace-nowrap text-slate-500">
                          {formatDateTime(payment.createdAt)}
                        </td>
                        <td className="py-1.5 pr-2 text-slate-700">
                          {PAYMENT_TYPE_LABELS[payment.type]}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-slate-800">
                          {formatCurrency(payment.amount, payment.currency)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-slate-600">
                          {payment.creditsGranted > 0
                            ? `+${formatNumber(payment.creditsGranted)}`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </PanelSection>
          </>
        )}
      </aside>

      {adjustOpen && data?.creditsEnabled ? (
        <CreditAdjustDialog
          clientId={data.client.id}
          clientName={data.client.name}
          currentBalance={data.balance}
          onClose={() => setAdjustOpen(false)}
        />
      ) : null}
    </>
  );
}

/** 티어/상태 변경 폼 — client.id를 key로 받아 값 초기화. */
function ClientEditControls({ client }: { client: Client }) {
  const queryClient = useQueryClient();
  const [tier, setTier] = useState<Tier>(client.tier);
  const [status, setStatus] = useState<ClientStatus>(client.status);

  const dirty = tier !== client.tier || status !== client.status;

  const mutation = useMutation({
    mutationFn: () => updateClient(client.id, { tier, status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'client', client.id] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'clients'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });

  return (
    <PanelSection title="Change tier or status">
      <div className="flex items-end gap-2">
        <label className="flex-1">
          <span className="text-[11px] font-medium text-slate-500">Tier</span>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as Tier)}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-slate-500 focus:outline-none"
          >
            <option value="basic">Default homepage</option>
            <option value="premium">AI video homepage</option>
          </select>
        </label>
        <label className="flex-1">
          <span className="text-[11px] font-medium text-slate-500">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ClientStatus)}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-slate-500 focus:outline-none"
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={!dirty || mutation.isPending}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40"
        >
          {mutation.isPending ? <Loader2 size={12} className="animate-spin" aria-hidden /> : null}
          Save
        </button>
      </div>
      {mutation.isError ? (
        <p className="mt-2 text-xs text-red-600">{mutation.error.message}</p>
      ) : null}
      {tier === 'basic' ? (
        <p className="mt-2 text-[11px] text-slate-400">
          This tier cannot request video edits — the client sees an upgrade prompt instead.
        </p>
      ) : null}
    </PanelSection>
  );
}
