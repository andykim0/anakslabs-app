'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { CheckCircle2, Clapperboard, Clock3, Inbox, Loader2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import {
  completeVideoFulfillment,
  generateApprovedHeroVideo,
  getVideoQueue,
  type AdminVideoQueueItem,
} from './api';
import { countLabel, formatDateTime, formatNumber } from './format';
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
    badge: "No hero source",
    message: "This site has no original hero image, so a poster and a video cannot be applied safely.",
  },
  'asset-policy-v2-required': {
    badge: "Provenance policy v2 required",
    message: "This site has not been verified against asset provenance policy v2. Finish the policy migration before fulfilling it.",
  },
  'hero-source-mismatch': {
    badge: "Draft and live heroes differ",
    message: "The draft and the published version use different hero originals, so one poster cannot apply to both. Match the originals first.",
  },
};

function VideoQueueCard({ item }: { item: AdminVideoQueueItem }) {
  const queryClient = useQueryClient();
  const [videoAssetId, setVideoAssetId] = useState('');
  const generation = useMutation({
    mutationFn: () => generateApprovedHeroVideo(item.siteId),
    onSuccess: (result) => setVideoAssetId(result.videoAssetId),
  });
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
              alt={`${item.siteName} hero image`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-slate-400">No hero image</div>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-slate-900">{item.siteName}</h2>
                <Badge tone={SITE_STATUS_TONES[item.siteStatus]}>{item.siteStatus}</Badge>
                {blockedCopy ? <Badge tone="red">{blockedCopy.badge}</Badge> : <Badge tone="amber">Awaiting fulfillment</Badge>}
                {item.overdue ? <Badge tone="red">over {FULFILLMENT_SLA_BUSINESS_DAYS} business days</Badge> : null}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {item.clientName} · {item.industryClass}
              </p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p className="font-semibold tabular-nums text-slate-700">{countLabel(item.waitingDays, 'day', 'days')} elapsed</p>
              <p>{formatDateTime(item.requestedAt)}</p>
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <dt className="text-slate-400">Motion direction</dt>
              <dd className="mt-0.5 font-medium text-slate-700">{item.motionLabel}</dd>
            </div>
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <dt className="text-slate-400">Video concept</dt>
              <dd className="mt-0.5 font-medium text-slate-700">{item.videoConceptLabel ?? "None selected"}</dd>
            </div>
          </dl>

          {item.timingSource === 'site-created-fallback' ? (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-5 text-amber-700">
              <Clock3 size={12} className="mt-1 shrink-0" aria-hidden />
              This request predates request-time tracking, so the wait is measured from the site&apos;s creation date.
            </p>
          ) : null}

          {blockedCopy ? (
            <p className="mt-2 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-[11px] leading-5 text-red-700">
              {blockedCopy.message}
            </p>
          ) : null}

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => generation.mutate()}
              disabled={blocked || generation.isPending || Boolean(videoAssetId)}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-3 text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {generation.isPending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Clapperboard size={13} aria-hidden />}
              Approve final design · generate one video
            </button>
            <label className="min-w-0 flex-1">
              <span className="sr-only">Video Asset ID</span>
              <input
                value={videoAssetId}
                onChange={(event) => setVideoAssetId(event.target.value)}
                placeholder="Video asset UUID, once it is registered in the registry"
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
              Mark fulfilled
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-5 text-slate-500">
            Design candidates never generate video. This button generates exactly one clip, through the cost guard and the generation log.
            Only assets whose ownership, site attribution and AI-video origin the server registry has confirmed can be applied.
          </p>
          {generation.isError ? <p className="mt-2 text-xs text-red-600">{generation.error.message}</p> : null}
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
        title="Video fulfillment"
        description={query.data
          ? `${countLabel(query.data.items.length, 'request', 'requests')} waiting. Check each manually produced clip before applying it.`
          : undefined}
        actions={
          <button
            type="button"
            onClick={() => query.refetch()}
            disabled={query.isRefetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={13} className={clsx(query.isRefetching && 'animate-spin')} aria-hidden />
            Refresh
          </button>
        }
      />

      {query.data?.integrity.missingCount ? (
        <p role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {formatNumber(query.data.integrity.missingCount)} of{' '}
          {formatNumber(query.data.integrity.sourceCount)} source video requests are missing from this queue.
        </p>
      ) : null}

      {query.isPending ? (
        <LoadingBlock label="Loading the video queue…" />
      ) : query.isError ? (
        <ErrorBlock message={query.error.message} onRetry={() => query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Nothing waiting for video fulfillment"
          description="A site appears here only when it has the video add-on, an explicit request, and no video or poster yet."
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
            <h2 id="video-completion-history" className="text-sm font-semibold text-slate-800">Recently fulfilled</h2>
          </div>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Site</th>
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  <th className="px-4 py-2.5 font-medium">Asset ID</th>
                  <th className="px-4 py-2.5 font-medium">Completed</th>
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
