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
        title="고객"
        description={data ? `총 ${formatNumber(data.length)}명` : undefined}
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
                placeholder="이름·이메일 검색"
                aria-label="고객 검색"
                className="w-52 rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-2.5 text-xs focus:border-slate-500 focus:outline-none"
              />
            </div>
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value as Tier | 'all')}
              aria-label="티어 필터"
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-slate-500 focus:outline-none"
            >
              <option value="all">티어 전체</option>
              <option value="basic">Basic</option>
              <option value="premium">Premium</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ClientStatus | 'all')}
              aria-label="상태 필터"
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-slate-500 focus:outline-none"
            >
              <option value="all">상태 전체</option>
              <option value="active">활성</option>
              <option value="paused">일시중지</option>
              <option value="cancelled">해지</option>
            </select>
          </div>
        }
      />

      {isPending ? (
        <LoadingBlock label="고객 목록을 불러오는 중…" />
      ) : isError ? (
        <ErrorBlock message={error.message} onRetry={() => refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={data.length === 0 ? '고객이 없습니다' : '조건에 맞는 고객이 없습니다'}
          description={
            data.length === 0
              ? '빌드비 결제가 완료되면 고객이 자동 등록됩니다.'
              : '검색어나 필터를 조정해 보세요.'
          }
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5 font-medium">이름</th>
                <th className="px-4 py-2.5 font-medium">이메일</th>
                <th className="px-4 py-2.5 font-medium">티어</th>
                <th className="px-4 py-2.5 font-medium">상태</th>
                <th className="px-4 py-2.5 text-right font-medium">크레딧 잔액</th>
                <th className="px-4 py-2.5 font-medium">가입일</th>
                <th className="px-4 py-2.5 text-right font-medium">사이트</th>
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
