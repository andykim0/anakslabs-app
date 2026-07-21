'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { CheckCircle2, Clock3, Inbox, Loader2, RefreshCw, WalletCards } from 'lucide-react';
import { useState } from 'react';
import {
  completeAdminEditRequest,
  getAdminEditQueue,
  type AdminEditQueueItem,
} from './api';
import { EDIT_STATUS_LABELS, EDIT_TYPE_LABELS, formatDateTime, formatNumber } from './format';
import {
  Badge,
  Card,
  EDIT_STATUS_TONES,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
} from './ui';
import { FULFILLMENT_SLA_BUSINESS_DAYS } from '@/lib/fulfillment-sla';

function elapsedLabel(hours: number): string {
  if (hours < 24) return `${formatNumber(hours)}시간 경과`;
  const days = Math.floor(hours / 24);
  const remainder = hours % 24;
  return remainder ? `${formatNumber(days)}일 ${formatNumber(remainder)}시간 경과` : `${formatNumber(days)}일 경과`;
}

function EditQueueCard({ item }: { item: AdminEditQueueItem }) {
  const queryClient = useQueryClient();
  const [siteAppliedConfirmed, setSiteAppliedConfirmed] = useState(false);
  const canComplete = item.status === 'qa_review';
  const completion = useMutation({
    mutationFn: () => completeAdminEditRequest(item.id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'edit-queue'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] }),
      ]);
    },
  });

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-slate-900">{item.siteName}</h2>
            <Badge tone={EDIT_STATUS_TONES[item.status]}>{EDIT_STATUS_LABELS[item.status]}</Badge>
            <Badge tone="blue">{EDIT_TYPE_LABELS[item.type]}</Badge>
            {item.overdue ? <Badge tone="red">대기 {FULFILLMENT_SLA_BUSINESS_DAYS}영업일 초과</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-slate-500">{item.clientName}</p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p className="flex items-center justify-end gap-1 font-semibold tabular-nums text-slate-700">
            <Clock3 size={12} aria-hidden />
            {elapsedLabel(item.waitingHours)}
          </p>
          <p className="mt-0.5">{formatDateTime(item.createdAt)}</p>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-3">
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
          {item.requestedContent}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <WalletCards size={13} aria-hidden />
            {item.creditCharged
              ? `원장 순차감 ${formatNumber(item.netCreditCharge)}크레딧`
              : '원장 순차감 없음'}
          </span>
          <span className="text-[11px] text-slate-400">
            관련 원장 {formatNumber(item.ledgerEntryCount)}행
          </span>
          {item.isInitialRevision ? <Badge tone="green">초기 무료 수정</Badge> : null}
        </div>

        <div className="flex flex-col items-end gap-2">
          {canComplete ? (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={siteAppliedConfirmed}
                onChange={(event) => setSiteAppliedConfirmed(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900"
              />
              AI 결과와 적용 대상을 확인했습니다
            </label>
          ) : (
            <p className="text-[11px] text-amber-700">처리·QA 준비가 끝난 요청만 완료할 수 있습니다.</p>
          )}
          <button
            type="button"
            onClick={() => completion.mutate()}
            disabled={!canComplete || !siteAppliedConfirmed || completion.isPending}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {completion.isPending ? (
              <Loader2 size={13} className="animate-spin" aria-hidden />
            ) : (
              <CheckCircle2 size={13} aria-hidden />
            )}
            발행본 반영·완료
          </button>
        </div>
      </div>
      <p className="mt-1.5 text-right text-[11px] text-slate-400">
        버튼을 누르면 검증된 결과를 초안과 현재 발행본에 원자적으로 반영한 뒤에만 완료로 기록합니다.
      </p>
      {completion.isError ? (
        <p role="alert" className="mt-2 text-right text-xs text-red-600">
          {completion.error.message}
        </p>
      ) : null}
    </Card>
  );
}

export function EditQueue() {
  const query = useQuery({
    queryKey: ['admin', 'edit-queue'],
    queryFn: getAdminEditQueue,
  });

  return (
    <>
      <PageHeader
        title="수정 대행 큐"
        description={query.data ? `미완료 요청 ${formatNumber(query.data.items.length)}건 · 오래된 요청부터 표시합니다.` : undefined}
        actions={
          <button
            type="button"
            onClick={() => query.refetch()}
            disabled={query.isRefetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={13} className={clsx(query.isRefetching && 'animate-spin')} aria-hidden />
            새로고침
          </button>
        }
      />

      {query.data?.integrity.missingCount ? (
        <p role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          원천 요청 {formatNumber(query.data.integrity.sourceCount)}건 중 큐에서 누락된 요청이{' '}
          {formatNumber(query.data.integrity.missingCount)}건 있습니다.
        </p>
      ) : null}

      {query.isPending ? (
        <LoadingBlock label="수정 대행 큐를 불러오는 중…" />
      ) : query.isError ? (
        <ErrorBlock message={query.error.message} onRetry={() => query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="대기 중인 수정 요청이 없습니다"
          description="pending·AI 처리·QA 검수 상태의 요청만 이 운영 큐에 표시됩니다."
        />
      ) : (
        <div className="space-y-3">
          {query.data.items.map((item) => <EditQueueCard key={item.id} item={item} />)}
        </div>
      )}
    </>
  );
}
