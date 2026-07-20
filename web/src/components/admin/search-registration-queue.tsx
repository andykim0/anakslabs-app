'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, RefreshCw, SearchCheck } from 'lucide-react';
import { useState } from 'react';
import {
  getSearchRegistrationQueue,
  updateSearchRegistration,
  type AdminSearchRegistrationItem,
} from './api';
import { formatDateTime, formatNumber } from './format';
import { Badge, Card, EmptyState, ErrorBlock, LoadingBlock, PageHeader } from './ui';

function QueueItem({ item }: { item: AdminSearchRegistrationItem }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(item.status);
  const [accountLabel, setAccountLabel] = useState(item.accountLabel ?? 'NAVER-OPS-01');
  const [naverVerification, setNaverVerification] = useState(item.naverVerification ?? '');
  const [googleVerification, setGoogleVerification] = useState(item.googleVerification ?? '');
  const [indexStatus, setIndexStatus] = useState(item.indexStatus);
  const save = useMutation({
    mutationFn: () => updateSearchRegistration(item.siteId, {
      status,
      accountLabel: accountLabel.trim() || null,
      naverVerification: naverVerification.trim() || null,
      googleVerification: googleVerification.trim() || null,
      indexStatus,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'search-registration'] }),
  });

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-slate-900">{item.siteName}</h2>
            <Badge tone={item.status === 'completed' ? 'green' : 'amber'}>{item.status === 'completed' ? '등록 완료' : '등록 대기'}</Badge>
            <Badge tone="neutral">{item.domainType === 'custom' ? '커스텀 도메인' : '다보임 서브도메인'}</Badge>
          </div>
          <a href={item.siteUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-sky-700 hover:underline">
            {item.siteUrl} <ExternalLink size={11} aria-hidden />
          </a>
        </div>
        <p className="text-[11px] text-slate-400">최근 저장 {formatDateTime(item.updatedAt)}</p>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <label className="text-xs font-medium text-slate-600">
          등록 계정 라벨
          <input value={accountLabel} onChange={(event) => setAccountLabel(event.target.value.toUpperCase())} className="mt-1 h-9 w-full rounded-md border border-slate-300 px-3 font-mono text-xs text-slate-800 outline-none focus:border-sky-500" />
        </label>
        <label className="text-xs font-medium text-slate-600">
          네이버 소유확인 값
          <input value={naverVerification} onChange={(event) => setNaverVerification(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-300 px-3 font-mono text-xs text-slate-800 outline-none focus:border-sky-500" />
        </label>
        <label className="text-xs font-medium text-slate-600">
          구글 소유확인 값 <span className="font-normal text-slate-400">(루트 도메인 DNS 확인 시 생략)</span>
          <input value={googleVerification} onChange={(event) => setGoogleVerification(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-300 px-3 font-mono text-xs text-slate-800 outline-none focus:border-sky-500" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-medium text-slate-600">
            등록 상태
            <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800">
              <option value="pending">등록 대기</option>
              <option value="completed">등록 완료</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            네이버 색인
            <select value={indexStatus} onChange={(event) => setIndexStatus(event.target.value as typeof indexStatus)} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800">
              <option value="unchecked">확인 전</option>
              <option value="present">확인됨</option>
              <option value="absent">없음</option>
            </select>
          </label>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <p className="text-[11px] leading-5 text-slate-500">메타태그 저장 → 네이버 계정 등록 → 소유확인 → 완료 체크. IndexNow 연결은 그대로 유지됩니다.</p>
        <button type="button" onClick={() => save.mutate()} disabled={save.isPending} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
          {save.isPending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <CheckCircle2 size={13} aria-hidden />}
          저장
        </button>
      </div>
      {save.isError ? <p className="mt-2 text-xs text-red-600">{save.error.message}</p> : null}
    </Card>
  );
}

export function SearchRegistrationQueue() {
  const query = useQuery({ queryKey: ['admin', 'search-registration'], queryFn: getSearchRegistrationQueue });
  return (
    <>
      <PageHeader
        title="검색 등록 대행 큐"
        description="소유확인 값은 서버가 head에 넣고, 네이버의 사이트별 등록은 운영 계정으로 완료합니다."
        actions={<button type="button" onClick={() => query.refetch()} disabled={query.isRefetching} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600"><RefreshCw size={13} className={query.isRefetching ? 'animate-spin' : ''} aria-hidden />새로고침</button>}
      />

      {query.data?.accounts.length ? (
        <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {query.data.accounts.map((account) => (
            <Card key={account.accountLabel} className={`p-3 ${account.warning ? 'border-amber-300 bg-amber-50' : ''}`}>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-mono font-semibold text-slate-700">{account.accountLabel}</span>
                <span className="tabular-nums text-slate-600">{formatNumber(account.registeredCount)} / 100곳</span>
              </div>
              {account.warning ? <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-800"><AlertTriangle size={13} aria-hidden />다음 계정으로 전환</p> : null}
            </Card>
          ))}
        </div>
      ) : null}

      {query.isPending ? <LoadingBlock label="검색 등록 큐를 불러오는 중…" />
        : query.isError ? <ErrorBlock message={query.error.message} onRetry={() => query.refetch()} />
          : query.data.items.length === 0 ? <EmptyState icon={SearchCheck} title="등록할 사이트가 없습니다" description="도메인이 배정된 사이트가 생기면 자동으로 대기 목록에 표시됩니다." />
            : <div className="space-y-3">{query.data.items.map((item) => <QueueItem key={item.siteId} item={item} />)}</div>}
    </>
  );
}
