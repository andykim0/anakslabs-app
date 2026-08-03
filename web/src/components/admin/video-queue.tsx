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
    badge: "Need to check source",
    message: "There is no original hero image, so posters and videos cannot be safely applied.",
  },
  'asset-policy-v2-required': {
    badge: "Need to check source policy",
    message: "This site does not have an asset provenance policy v2 verified. Please implement it after completing the policy transition.",
  },
  'hero-source-mismatch': {
    badge: "Discrepancies between draft and published version",
    message: "Because the original hero of the draft and published version are different, one poster cannot be applied to both. Please match the original first.",
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
              alt={`${item.siteName}select hero`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-slate-400">No hero sauce</div>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-slate-900">{item.siteName}</h2>
                <Badge tone={SITE_STATUS_TONES[item.siteStatus]}>{item.siteStatus}</Badge>
                {blockedCopy ? <Badge tone="red">{blockedCopy.badge}</Badge> : <Badge tone="amber">waiting for fulfillment</Badge>}
                {item.overdue ? <Badge tone="red">atmosphere {FULFILLMENT_SLA_BUSINESS_DAYS}over business days</Badge> : null}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {item.clientName} · {item.industryClass}
              </p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p className="font-semibold tabular-nums text-slate-700">{formatNumber(item.waitingDays)}days elapsed</p>
              <p>{formatDateTime(item.requestedAt)}</p>
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <dt className="text-slate-400">Select Direction</dt>
              <dd className="mt-0.5 font-medium text-slate-700">{item.motionLabel}</dd>
            </div>
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <dt className="text-slate-400">video concept</dt>
              <dd className="mt-0.5 font-medium text-slate-700">{item.videoConceptLabel ?? "Not selected"}</dd>
            </div>
          </dl>

          {item.timingSource === 'site-created-fallback' ? (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-5 text-amber-700">
              <Clock3 size={12} className="mt-1 shrink-0" aria-hidden />
              For existing requests, the promotion time cannot be restored, so it is displayed based on the site creation date.
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
              Final design approval · 1-time video creation
            </button>
            <label className="min-w-0 flex-1">
              <span className="sr-only">Video Asset ID</span>
              <input
                value={videoAssetId}
                onChange={(event) => setVideoAssetId(event.target.value)}
                placeholder="Video asset UUID confirmed after registering with registry"
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
              fulfillment completed
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-5 text-slate-500">
            Design Candidate does not create videos. The approve button passes the cost guard and creation log and generates it once.
            Only assets whose ownership, site attribution, and AI video source have been confirmed in the server registry are applied.
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
        title="AI video transition queue"
        description={query.data ? `today${formatNumber(query.data.items.length)}Wait for the gun and verify the manually created output before applying it.` : undefined}
        actions={
          <button
            type="button"
            onClick={() => query.refetch()}
            disabled={query.isRefetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={13} className={clsx(query.isRefetching && 'animate-spin')} aria-hidden />
            refresh
          </button>
        }
      />

      {query.data?.integrity.missingCount ? (
        <p role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          Original video request {formatNumber(query.data.integrity.sourceCount)}Requests missing from queue{' '}
          {formatNumber(query.data.integrity.missingCount)}There is something.
        </p>
      ) : null}

      {query.isPending ? (
        <LoadingBlock label="Loading video transition cue..." />
      ) : query.isError ? (
        <ErrorBlock message={query.error.message} onRetry={() => query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="There is no fulfillment waiting video"
          description="Only videos that have both video add-on permission and explicit site-specific requests and do not yet have videos or posters are displayed."
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
            <h2 id="video-completion-history" className="text-sm font-semibold text-slate-800">Recent Fulfillment History</h2>
          </div>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">site</th>
                  <th className="px-4 py-2.5 font-medium">customer</th>
                  <th className="px-4 py-2.5 font-medium">Asset ID</th>
                  <th className="px-4 py-2.5 font-medium">Complete</th>
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
