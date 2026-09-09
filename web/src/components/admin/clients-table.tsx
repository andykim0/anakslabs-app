'use client';

import { useQuery } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { ClientStatus, Tier } from '@/lib/types/domain';
import { getClients } from './api';
import { CLIENT_STATUS_LABELS, TIER_LABELS, countLabel, formatDate, formatNumber } from './format';
import { ClientDetailPanel } from './client-detail-panel';
import {
  Badge,
  CLIENT_STATUS_TONES,
  Card,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  TIER_TONES,
} from './ui';
import { OperatorClientInviteForm } from './operator-client-actions';

export function ClientsTable() {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'clients'],
    queryFn: getClients,
  });

  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<Tier | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<ClientStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /**
   * The US demo pipeline hands the approved preview over as `?previewId=`. It is carried, not
   * consumed, here: the create form uses it to open on the delivery mode.
   */
  const approvedPreviewId = useSearchParams().get('previewId') ?? undefined;

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data
      .filter((row) => {
        if (tierFilter !== 'all' && row.tier !== tierFilter) return false;
        if (statusFilter !== 'all' && row.status !== statusFilter) return false;
        if (q && !row.name.toLowerCase().includes(q) && !row.email.toLowerCase().includes(q)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [data, search, tierFilter, statusFilter]);

  return (
    <>
      <PageHeader
        title="Clients"
        description={data ? countLabel(data.length, 'client', 'clients') : undefined}
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or email"
                aria-label="Search clients"
                className="w-52 rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-2.5 text-xs focus:border-slate-500 focus:outline-none"
              />
            </div>
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value as Tier | 'all')}
              aria-label="Filter by tier"
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-slate-500 focus:outline-none"
            >
              <option value="all">All tiers</option>
              <option value="basic">Default homepage</option>
              <option value="premium">AI video homepage</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ClientStatus | 'all')}
              aria-label="Filter by status"
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-slate-500 focus:outline-none"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        }
      />

      <OperatorClientInviteForm />

      {isPending ? (
        <LoadingBlock label="Loading clients…" />
      ) : isError ? (
        <ErrorBlock message={error.message} onRetry={() => refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={data.length === 0 ? "No clients yet" : "No clients match these filters"}
          description={
            data.length === 0
              ? "A client is registered automatically once their build fee is paid."
              : "Try adjusting the search term or the filters."
          }
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Tier</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Credit balance</th>
                <th className="px-4 py-2.5 font-medium">Joined</th>
                <th className="px-4 py-2.5 text-right font-medium">Sites</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelectedId(row.id)}
                  className="cursor-pointer border-b border-slate-100 transition-colors last:border-b-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-2.5 font-medium text-slate-800">{row.name}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{row.email}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={TIER_TONES[row.tier]}>{TIER_LABELS[row.tier]}</Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={CLIENT_STATUS_TONES[row.status]}>
                      {CLIENT_STATUS_LABELS[row.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-800">
                    {formatNumber(row.balance)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {formatDate(row.createdAt)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                    {formatNumber(row.siteCount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {selectedId ? (
        <ClientDetailPanel
          clientId={selectedId}
          onClose={() => setSelectedId(null)}
          approvedPreviewId={approvedPreviewId}
        />
      ) : null}
    </>
  );
}
