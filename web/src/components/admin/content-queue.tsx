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
  draft: "wait for creation",
  generating: "Creating",
  pending_approval: "Waiting for approval",
  rejected: "Rejected",
};

const STATUS_TONES: Record<AdminContentQueueStatus, BadgeTone> = {
  draft: 'neutral',
  generating: 'blue',
  pending_approval: 'amber',
  rejected: 'red',
};

const DEFAULT_TOPIC = "Criteria for customers to check before making a decision";

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
  const mutationError = generation.error ?? rejection.error ?? approval.error;
  const busy = generation.isPending || rejection.isPending || approval.isPending;
  const version = item.currentVersion;
  const isSafeCatalog = version?.generationMetadata.attempt === 'safe-catalog';

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
          ? `Inspection before disclosure${formatNumber(query.data.items.length)}· Only approved versions will appear on the site.`
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
          description="Monthly slots are created after the P4 cadence is activated."
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
