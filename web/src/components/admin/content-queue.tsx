'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  CalendarPlus,
  CheckCircle2,
  FileCheck2,
  Inbox,
  Loader2,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import {
  approveAdminContent,
  approveSwapAdminContent,
  generateAdminContent,
  getAdminContentQueue,
  provisionAdminContentSlots,
  rejectAdminContent,
  reworkAdminContent,
  runAdminContentMonth,
  type AdminContentBatchResponse,
  type AdminContentFulfillmentSite,
  type AdminContentQueueCover,
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
  draft: "wait for creation",
  generating: "Creating",
  pending_approval: "Waiting for approval",
  rejected: "Rejected",
  published: "Live on the site",
};

const STATUS_TONES: Record<AdminContentQueueStatus, BadgeTone> = {
  draft: 'neutral',
  generating: 'blue',
  pending_approval: 'amber',
  rejected: 'red',
  published: 'green',
};

const DEFAULT_TOPIC = "Criteria for customers to check before making a decision";

/**
 * Fulfillment is counted against the month a slot was promised for, so the same sentence the
 * customer reads is the one the operator works from. Safe-catalog publications are excluded on
 * the server and never appear in this numerator.
 */
function fulfillmentSentence(site: AdminContentFulfillmentSite): string {
  const month = site.periodMonth.slice(0, 7);
  return site.committed === null
    ? `${month}: ${formatNumber(site.delivered)} delivered`
    : `${month}: ${formatNumber(site.delivered)} of ${formatNumber(site.committed)} delivered`;
}

function FulfillmentRow({ site }: { site: AdminContentFulfillmentSite }) {
  const queryClient = useQueryClient();
  const provision = useMutation({
    mutationFn: () => provisionAdminContentSlots(site.clientId, site.siteId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'content-queue'] });
    },
  });
  const missing = site.committed === null ? 0 : Math.max(0, site.committed - site.slotCount);

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{site.siteName}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {fulfillmentSentence(site)} · {formatNumber(site.slotCount)} slots · {site.timezone}
        </p>
        {provision.error ? (
          <p role="alert" className="mt-1 text-xs text-red-600">{provision.error.message}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {missing > 0 ? (
          <Badge tone="amber">{formatNumber(missing)} missing</Badge>
        ) : (
          <Badge tone="green">Month is provisioned</Badge>
        )}
        <button
          type="button"
          onClick={() => provision.mutate()}
          disabled={provision.isPending}
          className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {provision.isPending
            ? <Loader2 size={13} className="animate-spin" aria-hidden />
            : <CalendarPlus size={13} aria-hidden />}
          Provision this month
        </button>
      </div>
    </li>
  );
}

const STOP_REASONS: Record<
  AdminContentBatchResponse['contentFulfillment']['stoppedBy'],
  string
> = {
  complete: 'everything due this run was attempted',
  disabled: 'the batch is switched off',
  run_cap: 'the per-run generation cap was reached',
  month_cap: 'the monthly generation cap was reached',
  deadline: 'the run reached its dispatch deadline',
};

function batchSentence(result: AdminContentBatchResponse['contentFulfillment']): string {
  return [
    `${formatNumber(result.provisionedSlots)} slots provisioned`,
    `${formatNumber(result.generated)} drafts written`,
    result.failed > 0 ? `${formatNumber(result.failed)} failed` : null,
    result.reclaimedSlots > 0
      ? `${formatNumber(result.reclaimedSlots)} stuck slots released`
      : null,
    result.remaining > 0 ? `${formatNumber(result.remaining)} left for the next run` : null,
  ].filter(Boolean).join(' · ');
}

function FulfillmentPanel({ sites }: { sites: readonly AdminContentFulfillmentSite[] }) {
  const queryClient = useQueryClient();
  const runMonth = useMutation({
    mutationFn: () => runAdminContentMonth(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'content-queue'] });
    },
  });
  if (sites.length === 0) return null;
  return (
    <Card className="mb-4 p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">Monthly fulfillment</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Each site&apos;s current month is read in that site&apos;s own time zone. Provisioning is
            idempotent — it adds only the slots the month is still missing.
          </p>
        </div>
        <button
          type="button"
          onClick={() => runMonth.mutate()}
          disabled={runMonth.isPending}
          className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {runMonth.isPending
            ? <Loader2 size={13} className="animate-spin" aria-hidden />
            : <PlayCircle size={13} aria-hidden />}
          Run this month
        </button>
      </div>
      <div className="border-b border-slate-100 px-4 py-2">
        <p className="text-[11px] text-slate-500">
          Runs the same job the nightly cron runs: it provisions the missing slots and writes a
          draft for each one, for every published site with an active subscription. It never
          approves and never publishes — every post still needs your review below.
        </p>
        {runMonth.isPending ? (
          <p className="mt-1 text-xs text-slate-600">
            Generating. Each article can take up to two minutes; the run stops handing out new work
            after 170 seconds and the rest is picked up by the next run.
          </p>
        ) : null}
        {runMonth.error ? (
          <p role="alert" className="mt-1 text-xs text-red-600">{runMonth.error.message}</p>
        ) : null}
        {runMonth.data ? (
          <p className="mt-1 text-xs text-slate-700">
            {batchSentence(runMonth.data.contentFulfillment)}
            {' — '}
            {STOP_REASONS[runMonth.data.contentFulfillment.stoppedBy]}.
          </p>
        ) : null}
      </div>
      <ul className="divide-y divide-slate-100">
        {sites.map((site) => <FulfillmentRow key={site.siteId} site={site} />)}
      </ul>
    </Card>
  );
}

/**
 * The hero image a version carries, so approval covers the picture and not only the copy.
 *
 * Rendered at the same 21:9 the tenant template reserves, which is the point: an operator who
 * approves here has seen the crop the reader will see. A version without a cover prints one line
 * of prose instead of a placeholder box, because no cover is the ordinary, finished state — the
 * article page paints a brand plate from the practice's own tokens.
 */
function CoverPreview({ cover }: { cover?: AdminContentQueueCover }) {
  if (!cover) {
    return (
      <p className="mb-2 text-[11px] text-slate-500">
        No generated cover. The blog paints this practice&apos;s brand plate instead.
      </p>
    );
  }
  return (
    <figure className="mb-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- a registry-canonical Storage URL,
          not a configured Next image domain, and this console never optimizes admin thumbnails. */}
      <img
        src={cover.url}
        alt=""
        loading="lazy"
        className="block aspect-[21/9] w-full rounded border border-slate-200 object-cover"
        {...(cover.width ? { width: cover.width } : {})}
        {...(cover.height ? { height: cover.height } : {})}
      />
      <figcaption className="mt-1 text-[11px] text-slate-500">
        Generated cover · publishes with this version
      </figcaption>
    </figure>
  );
}

function ContentQueueCard({ item }: { item: AdminContentQueueItem }) {
  const queryClient = useQueryClient();
  const [topic, setTopic] = useState(DEFAULT_TOPIC);
  const [reason, setReason] = useState('');
  const [approvalConfirmed, setApprovalConfirmed] = useState(false);
  const [safeCatalogOverrideConfirmed, setSafeCatalogOverrideConfirmed] = useState(false);
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
    mutationFn: () => approveAdminContent(
      item.id,
      item.currentVersionId!,
      safeCatalogOverrideConfirmed,
    ),
    onSuccess: refresh,
  });
  const rework = useMutation({
    mutationFn: () => reworkAdminContent(item.id, topic),
    onSuccess: refresh,
  });
  const swap = useMutation({
    mutationFn: () => approveSwapAdminContent(item.id, item.pendingVersionId!),
    onSuccess: refresh,
  });
  const mutationError = generation.error ?? rejection.error ?? approval.error
    ?? rework.error ?? swap.error;
  const busy = generation.isPending || rejection.isPending || approval.isPending
    || rework.isPending || swap.isPending;
  const version = item.currentVersion;
  const isSafeCatalog = version?.generationMetadata.attempt === 'safe-catalog';
  // A published row only reaches this queue while a replacement is staged against it.
  const live = item.status === 'published';
  const staged = live ? item.pendingVersion : null;
  const stagedIsSafeCatalog = staged?.generationMetadata.attempt === 'safe-catalog';

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-slate-900">
              {version?.title ?? `${item.periodMonth.slice(0, 7)} post #${item.ordinal}`}
            </h2>
            <Badge tone={STATUS_TONES[item.status]}>{STATUS_LABELS[item.status]}</Badge>
            <Badge tone="blue">/{item.slug}</Badge>
            {isSafeCatalog ? <Badge tone="amber">Safe-catalog fallback</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            site {item.siteId} · Price list {item.pricingModelVersion}
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          {version ? <p>immutable version v{formatNumber(version.versionNumber)}</p> : null}
          <p>{formatDateTime(item.updatedAt)}</p>
        </div>
      </div>

      {version ? (
        <div className="mt-3 rounded-md border border-slate-100 bg-slate-50 p-3">
          <CoverPreview cover={version.cover} />
          <p className="text-sm leading-6 text-slate-700">{version.summary}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {version.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Verified source items: {formatNumber(version.sourceRefs.length)} · External image cost{' '}
            {version.generationMetadata.externalImageCostKrw === 0 ? "0 won" : "Confirmation required"}
          </p>
          {isSafeCatalog ? (
            <p role="alert" className="mt-2 text-xs font-medium text-amber-700">
              This draft is the safe-catalog fallback and is blocked from approval by default.
            </p>
          ) : null}
        </div>
      ) : null}

      {staged ? (
        <div className="mt-3 rounded-md border border-sky-200 bg-sky-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="blue">Staged replacement</Badge>
            <p className="text-sm font-semibold text-slate-900">{staged.title}</p>
          </div>
          <CoverPreview cover={staged.cover} />
          <p className="mt-1 text-sm leading-6 text-slate-700">{staged.summary}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {staged.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            The post above is still live. Approving replaces it at the same address; nothing the
            customer sees changes until then.
          </p>
          {stagedIsSafeCatalog ? (
            <p role="alert" className="mt-2 text-xs font-medium text-amber-700">
              This replacement is the safe-catalog fallback and cannot be swapped in — it is the
              boilerplate the rework exists to remove. Generate another version.
            </p>
          ) : null}
        </div>
      ) : null}

      {live ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="min-w-0 flex-1">
              <span className="sr-only">rework topic</span>
              <input
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                maxLength={240}
                className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
                placeholder="This post topic"
              />
            </label>
            <button
              type="button"
              onClick={() => rework.mutate()}
              disabled={busy || topic.trim().length < 2}
              className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {rework.isPending
                ? <Loader2 size={13} className="animate-spin" aria-hidden />
                : <RotateCcw size={13} aria-hidden />}
              {staged ? "Generate another replacement" : "Rework this post"}
            </button>
          </div>
          {staged ? (
            <div className="flex flex-col items-end gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={approvalConfirmed}
                  onChange={(event) => setApprovalConfirmed(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                I personally checked the text, tables, and sources.
              </label>
              <button
                type="button"
                onClick={() => swap.mutate()}
                disabled={busy || !approvalConfirmed || stagedIsSafeCatalog}
                className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                {swap.isPending
                  ? <Loader2 size={13} className="animate-spin" aria-hidden />
                  : <CheckCircle2 size={13} aria-hidden />}
                Replace the live post
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {item.status === 'draft' || item.status === 'rejected' ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="min-w-0 flex-1">
            <span className="sr-only">create topic</span>
            <input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              maxLength={240}
              className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
              placeholder="This post topic"
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
            {item.status === 'rejected' ? "Regenerate new version" : "Create a draft"}
          </button>
        </div>
      ) : null}

      {item.status === 'generating' ? (
        <p className="mt-3 inline-flex items-center gap-2 text-xs text-sky-700">
          <Loader2 size={13} className="animate-spin" aria-hidden />
          Structured documents and sources are being examined.
        </p>
      ) : null}

      {item.status === 'pending_approval' && item.currentVersionId ? (
        <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 lg:grid-cols-[1fr_auto]">
          <div>
            <label className="text-xs font-medium text-slate-600" htmlFor={`reject-${item.id}`}>
              Reason for rejection
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id={`reject-${item.id}`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={2_000}
                className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
                placeholder="Specific reasons for preservation when recreating"
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
                companion
              </button>
            </div>
          </div>
          <div className="flex flex-col items-end justify-end gap-2">
            {isSafeCatalog ? (
              <label className="flex items-center gap-2 text-xs font-medium text-amber-700">
                <input
                  type="checkbox"
                  checked={safeCatalogOverrideConfirmed}
                  onChange={(event) => setSafeCatalogOverrideConfirmed(event.target.checked)}
                  className="h-4 w-4 rounded border-amber-400"
                />
                Approve this safe-catalog fallback as an explicit exception.
              </label>
            ) : null}
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={approvalConfirmed}
                onChange={(event) => setApprovalConfirmed(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              I personally checked the text, tables, and sources.
            </label>
            <button
              type="button"
              onClick={() => approval.mutate()}
              disabled={busy || !approvalConfirmed || (isSafeCatalog && !safeCatalogOverrideConfirmed)}
              className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {approval.isPending
                ? <Loader2 size={13} className="animate-spin" aria-hidden />
                : <CheckCircle2 size={13} aria-hidden />}
              Approval/Issuance
            </button>
          </div>
        </div>
      ) : null}

      {item.status === 'rejected' ? (
        <p className="mt-2 text-[11px] text-slate-500">
          The previous version and reason for rejection remain in the ledger, and regeneration adds a new immutable version.
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
        title="Content Approval Queue"
        description={query.data
          ? `${formatNumber(query.data.items.length)} awaiting review · Only approved versions appear on the site.`
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
            refresh
          </button>
        }
      />
      {query.data ? <FulfillmentPanel sites={query.data.fulfillment} /> : null}
      {query.data?.integrity.missingCount ? (
        <p role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {formatNumber(query.data.integrity.missingCount)} source posts are missing from this queue projection.
        </p>
      ) : null}
      {query.isPending ? (
        <LoadingBlock label="Loading content approval queue..." />
      ) : query.isError ? (
        <ErrorBlock message={query.error.message} onRetry={() => query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="There is no content to review"
          description="Use Provision this month above to create the month's slots for a site."
        />
      ) : (
        <div className="space-y-3">
          {query.data.items.map((item) => (
            <ContentQueueCard
              key={`${item.id}:${item.currentVersionId ?? 'unversioned'}`}
              item={item}
            />
          ))}
        </div>
      )}
      <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-500">
        <FileCheck2 size={13} aria-hidden />
        Upon approval, the current raw materials, honesty, and medical policies are reexamined, and only the exact versions that pass are atomically released.
      </div>
    </>
  );
}
