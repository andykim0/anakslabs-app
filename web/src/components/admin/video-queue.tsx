'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { CheckCircle2, Clapperboard, Clock3, Inbox, Loader2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import {
  completeVideoFulfillment,
  getVideoQueue,
  type AdminVideoQueueItem,
} from './api';
import { formatDateTime, formatNumber } from './format';
import {
  Badge,
  Card,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  SITE_STATUS_TONES,
} from './ui';
import { FULFILLMENT_SLA_BUSINESS_DAYS } from '@/lib/fulfillment-sla';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BLOCKED_REASON_COPY: Record<
  NonNullable<AdminVideoQueueItem['blockedReason']>,
  { badge: string; message: string }
> = {
  'hero-source-missing': {
    badge: '소스 확인 필요',
    message: '히어로 원본 이미지가 없어 poster와 영상을 안전하게 적용할 수 없습니다.',
  },
  'asset-policy-v2-required': {
    badge: '출처 정책 확인 필요',
    message: '자산 출처 정책 v2가 확인되지 않은 사이트입니다. 정책 전환을 마친 뒤 이행해 주세요.',
  },
  'hero-source-mismatch': {
    badge: '초안·발행본 불일치',
    message: '초안과 발행본의 히어로 원본이 달라 하나의 poster를 양쪽에 적용할 수 없습니다. 먼저 원본을 일치시켜 주세요.',
  },
};

function VideoQueueCard({ item }: { item: AdminVideoQueueItem }) {
  const queryClient = useQueryClient();
  const [videoAssetId, setVideoAssetId] = useState('');
  const completion = useMutation({
    mutationFn: () => completeVideoFulfillment(item.siteId, videoAssetId.trim()),
    onSuccess: async () => {
      setVideoAssetId('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'video-queue'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] }),
      ]);
    },
  });
  const blockedCopy = item.blockedReason ? BLOCKED_REASON_COPY[item.blockedReason] : null;
  const blocked = blockedCopy !== null;
  const validAssetId = UUID_PATTERN.test(videoAssetId.trim());

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-4 p-4 sm:grid-cols-[160px_minmax(0,1fr)]">
        <div className="aspect-[4/3] overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
          {item.heroImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- tenant/user media has no fixed loader domain.
            <img
              src={item.heroImageUrl}
              alt={`${item.siteName} 선택 히어로`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-slate-400">히어로 소스 없음</div>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-slate-900">{item.siteName}</h2>
                <Badge tone={SITE_STATUS_TONES[item.siteStatus]}>{item.siteStatus}</Badge>
                {blockedCopy ? <Badge tone="red">{blockedCopy.badge}</Badge> : <Badge tone="amber">이행 대기</Badge>}
                {item.overdue ? <Badge tone="red">대기 {FULFILLMENT_SLA_BUSINESS_DAYS}영업일 초과</Badge> : null}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {item.clientName} · {item.industryClass}
              </p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p className="font-semibold tabular-nums text-slate-700">{formatNumber(item.waitingDays)}일 경과</p>
              <p>{formatDateTime(item.requestedAt)}</p>
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <dt className="text-slate-400">선택 연출</dt>
              <dd className="mt-0.5 font-medium text-slate-700">{item.motionLabel}</dd>
            </div>
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <dt className="text-slate-400">영상 컨셉</dt>
              <dd className="mt-0.5 font-medium text-slate-700">{item.videoConceptLabel ?? '미선택'}</dd>
            </div>
          </dl>

          {item.timingSource === 'site-created-fallback' ? (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-5 text-amber-700">
              <Clock3 size={12} className="mt-1 shrink-0" aria-hidden />
              기존 요청은 승급 시각을 복원할 수 없어 사이트 생성일을 기준으로 표시합니다.
            </p>
          ) : null}

          {blockedCopy ? (
            <p className="mt-2 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-[11px] leading-5 text-red-700">
              {blockedCopy.message}
            </p>
          ) : null}

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <label className="min-w-0 flex-1">
              <span className="sr-only">영상 자산 ID</span>
              <input
                value={videoAssetId}
                onChange={(event) => setVideoAssetId(event.target.value)}
                placeholder="registry 등록 후 확인한 영상 자산 UUID"
                disabled={blocked || completion.isPending}
                className="h-9 w-full rounded-md border border-slate-300 px-3 text-xs text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100"
              />
            </label>
            <button
              type="button"
              onClick={() => completion.mutate()}
              disabled={blocked || !validAssetId || completion.isPending}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {completion.isPending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <CheckCircle2 size={13} aria-hidden />}
              이행 완료
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-5 text-slate-500">
            URL은 입력받지 않습니다. 서버 registry의 소유·사이트 귀속·AI 영상 출처가 확인된 자산만 적용됩니다.
          </p>
          {completion.isError ? <p className="mt-2 text-xs text-red-600">{completion.error.message}</p> : null}
        </div>
      </div>
    </Card>
  );
}

export function VideoQueue() {
  const query = useQuery({
    queryKey: ['admin', 'video-queue'],
    queryFn: getVideoQueue,
  });

  return (
    <>
      <PageHeader
        title="AI 영상 이행 큐"
        description={query.data ? `현재 ${formatNumber(query.data.items.length)}건 대기 · 수동 생성 산출물을 검증한 뒤 적용합니다.` : undefined}
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
          원천 영상 요청 {formatNumber(query.data.integrity.sourceCount)}건 중 큐에서 누락된 요청이{' '}
          {formatNumber(query.data.integrity.missingCount)}건 있습니다.
        </p>
      ) : null}

      {query.isPending ? (
        <LoadingBlock label="영상 이행 큐를 불러오는 중…" />
      ) : query.isError ? (
        <ErrorBlock message={query.error.message} onRetry={() => query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="이행 대기 영상이 없습니다"
          description="영상 애드온 권한과 사이트별 명시적 요청이 모두 있고, 영상과 poster가 아직 없는 건만 표시됩니다."
        />
      ) : (
        <div className="space-y-3">
          {query.data.items.map((item) => <VideoQueueCard key={item.siteId} item={item} />)}
        </div>
      )}

      {query.data?.recentCompletions.length ? (
        <section className="mt-8" aria-labelledby="video-completion-history">
          <div className="mb-3 flex items-center gap-2">
            <Clapperboard size={15} className="text-slate-400" aria-hidden />
            <h2 id="video-completion-history" className="text-sm font-semibold text-slate-800">최근 이행 이력</h2>
          </div>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">사이트</th>
                  <th className="px-4 py-2.5 font-medium">고객</th>
                  <th className="px-4 py-2.5 font-medium">자산 ID</th>
                  <th className="px-4 py-2.5 font-medium">완료</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {query.data.recentCompletions.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 font-medium text-slate-800">{row.siteName}</td>
                    <td className="px-4 py-3 text-slate-600">{row.clientName}</td>
                    <td className="max-w-[260px] truncate px-4 py-3 font-mono text-[11px] text-slate-500">{row.videoAssetId}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDateTime(row.completedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      ) : null}
    </>
  );
}
