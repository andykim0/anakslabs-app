'use client';

import { useQuery } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ClientStatus, Tier } from '@/lib/types/domain';
import { getClients } from './api';
import { CLIENT_STATUS_LABELS, TIER_LABELS, formatDate, formatNumber } from './format';
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

export function ClientsTable() {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'clients'],
    queryFn: getClients,
  });

  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<Tier | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<ClientStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
        title="customer"
        description={data ? `gun${formatNumber(data.length)}number of people` : undefined}
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
                placeholder="Name/email search"
                aria-label="customer search"
                className="w-52 rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-2.5 text-xs focus:border-slate-500 focus:outline-none"
              />
            </div>
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value as Tier | 'all')}
              aria-label="tier filter"
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-slate-500 focus:outline-none"
            >
              <option value="all">All tiers</option>
              <option value="basic">default homepage</option>
              <option value="premium">AI video homepage</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ClientStatus | 'all')}
              aria-label="status filter"
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-slate-500 focus:outline-none"
            >
              <option value="all">state full</option>
              <option value="active">active</option>
              <option value="paused">pause</option>
              <option value="cancelled">Termination</option>
            </select>
          </div>
        }
      />

      {isPending ? (
        <LoadingBlock label="Loading customer list..." />
      ) : isError ? (
        <ErrorBlock message={error.message} onRetry={() => refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={data.length === 0 ? "There are no customers" : "There are no customers matching the conditions"}
          description={
            data.length === 0
              ? "Once the build fee payment is completed, the customer is automatically registered."
              : "Try adjusting your search terms or filters."
          }
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5 font-medium">name</th>
                <th className="px-4 py-2.5 font-medium">email</th>
                <th className="px-4 py-2.5 font-medium">tier</th>
                <th className="px-4 py-2.5 font-medium">situation</th>
                <th className="px-4 py-2.5 text-right font-medium">credit balance</th>
                <th className="px-4 py-2.5 font-medium">Join date</th>
                <th className="px-4 py-2.5 text-right font-medium">site</th>
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
        <ClientDetailPanel clientId={selectedId} onClose={() => setSelectedId(null)} />
      ) : null}
    </>
  );
}
