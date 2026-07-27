'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  CheckCircle2,
  FileCheck2,
  Inbox,
  Loader2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import {
  approveAdminContent,
  generateAdminContent,
  getAdminContentQueue,
  rejectAdminContent,
  type AdminContentQueueItem,
  type AdminContentQueueStatus,
} from './api';
import { formatDateTime, formatNumber } from './format';
import {
  Badge,
  type BadgeTone,
  Card,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
} from './ui';

const STATUS_LABELS: Record<AdminContentQueueStatus, string> = {
  draft: '생성 대기',
  generating: '생성 중',
  pending_approval: '승인 대기',
  rejected: '반려됨',
};

const STATUS_TONES: Record<AdminContentQueueStatus, BadgeTone> = {
  draft: 'neutral',
  generating: 'blue',
  pending_approval: 'amber',
  rejected: 'red',
};

const DEFAULT_TOPIC = '고객이 결정 전에 확인할 기준';

function ContentQueueCard({ item }: { item: AdminContentQueueItem }) {
  const queryClient = useQueryClient();
  const [topic, setTopic] = useState(DEFAULT_TOPIC);
  const [reason, setReason] = useState('');
  const [approvalConfirmed, setApprovalConfirmed] = useState(false);
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'content-queue'] });
  };
  const generation = useMutation({
    mutationFn: () => generateAdminContent(item.id, topic, item.status === 'rejected'),
    onSuccess: refresh,
  });
  const rejection = useMutation({
    mutationFn: () => rejectAdminContent(item.id, item.currentVersionId!, reason),
    onSuccess: refresh,
  });
  const approval = useMutation({
    mutationFn: () => approveAdminContent(item.id, item.currentVersionId!),
    onSuccess: refresh,
  });
  const mutationError = generation.error ?? rejection.error ?? approval.error;
  const busy = generation.isPending || rejection.isPending || approval.isPending;
  const version = item.currentVersion;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-slate-900">
              {version?.title ?? `${item.periodMonth.slice(0, 7)} 콘텐츠 ${item.ordinal}`}
            </h2>
            <Badge tone={STATUS_TONES[item.status]}>{STATUS_LABELS[item.status]}</Badge>
            <Badge tone="blue">/{item.slug}</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            사이트 {item.siteId} · 가격표 {item.pricingModelVersion}
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          {version ? <p>불변 버전 v{formatNumber(version.versionNumber)}</p> : null}
          <p>{formatDateTime(item.updatedAt)}</p>
        </div>
      </div>

      {version ? (
        <div className="mt-3 rounded-md border border-slate-100 bg-slate-50 p-3">
          <p className="text-sm leading-6 text-slate-700">{version.summary}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {version.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            확인된 원료 참조 {formatNumber(version.sourceRefs.length)}개 · 외부 이미지 비용{' '}
            {version.generationMetadata.externalImageCostKrw === 0 ? '0원' : '확인 필요'}
          </p>
        </div>
      ) : null}

      {item.status === 'draft' || item.status === 'rejected' ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="min-w-0 flex-1">
            <span className="sr-only">생성 주제</span>
            <input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              maxLength={240}
              className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
              placeholder="이번 포스트 주제"
            />
          </label>
          <button
            type="button"
            onClick={() => generation.mutate()}
            disabled={busy || topic.trim().length < 2}
            className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {generation.isPending ? (
              <Loader2 size={13} className="animate-spin" aria-hidden />
            ) : item.status === 'rejected' ? (
              <RotateCcw size={13} aria-hidden />
            ) : (
              <Sparkles size={13} aria-hidden />
            )}
            {item.status === 'rejected' ? '새 버전 재생성' : '초안 생성'}
          </button>
        </div>
      ) : null}

      {item.status === 'generating' ? (
        <p className="mt-3 inline-flex items-center gap-2 text-xs text-sky-700">
          <Loader2 size={13} className="animate-spin" aria-hidden />
          구조화 문서와 출처를 검사하고 있습니다.
        </p>
      ) : null}

      {item.status === 'pending_approval' && item.currentVersionId ? (
        <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 lg:grid-cols-[1fr_auto]">
          <div>
            <label className="text-xs font-medium text-slate-600" htmlFor={`reject-${item.id}`}>
              반려 사유
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id={`reject-${item.id}`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={2_000}
                className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
                placeholder="재생성할 때 보존할 구체적인 사유"
              />
              <button
                type="button"
                onClick={() => rejection.mutate()}
                disabled={busy || reason.trim().length < 2}
                className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-red-300 bg-white px-3 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {rejection.isPending
                  ? <Loader2 size={13} className="animate-spin" aria-hidden />
                  : <XCircle size={13} aria-hidden />}
                반려
              </button>
            </div>
          </div>
          <div className="flex flex-col items-end justify-end gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={approvalConfirmed}
                onChange={(event) => setApprovalConfirmed(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              본문·표·출처를 직접 확인했습니다
            </label>
            <button
              type="button"
              onClick={() => approval.mutate()}
              disabled={busy || !approvalConfirmed}
              className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {approval.isPending
                ? <Loader2 size={13} className="animate-spin" aria-hidden />
                : <CheckCircle2 size={13} aria-hidden />}
              승인·발행
            </button>
          </div>
        </div>
      ) : null}

      {item.status === 'rejected' ? (
        <p className="mt-2 text-[11px] text-slate-500">
          이전 버전과 반려 사유는 장부에 그대로 남고, 재생성은 새 불변 버전을 추가합니다.
        </p>
      ) : null}
      {mutationError ? (
        <p role="alert" className="mt-2 text-xs text-red-600">{mutationError.message}</p>
      ) : null}
    </Card>
  );
}

export function ContentQueue() {
  const query = useQuery({
    queryKey: ['admin', 'content-queue'],
    queryFn: getAdminContentQueue,
  });

  return (
    <>
      <PageHeader
        title="콘텐츠 승인 큐"
        description={query.data
          ? `공개 전 검수 ${formatNumber(query.data.items.length)}건 · 승인된 버전만 사이트에 나타납니다.`
          : undefined}
        actions={
          <button
            type="button"
            onClick={() => query.refetch()}
            disabled={query.isRefetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw
              size={13}
              className={clsx(query.isRefetching && 'animate-spin')}
              aria-hidden
            />
            새로고침
          </button>
        }
      />
      {query.data?.integrity.missingCount ? (
        <p role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          원천 포스트 중 큐 투영에서 누락된 항목이 {formatNumber(query.data.integrity.missingCount)}건 있습니다.
        </p>
      ) : null}
      {query.isPending ? (
        <LoadingBlock label="콘텐츠 승인 큐를 불러오는 중…" />
      ) : query.isError ? (
        <ErrorBlock message={query.error.message} onRetry={() => query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="검수할 콘텐츠가 없습니다"
          description="월간 슬롯은 P4 케이던스가 활성화된 뒤 생성됩니다."
        />
      ) : (
        <div className="space-y-3">
          {query.data.items.map((item) => <ContentQueueCard key={item.id} item={item} />)}
        </div>
      )}
      <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-500">
        <FileCheck2 size={13} aria-hidden />
        승인 시 현재 원료·정직성·의료 정책을 다시 검사하고, 통과한 정확한 버전만 원자적으로 공개합니다.
      </div>
    </>
  );
}
