'use client';

/* eslint-disable @next/next/no-img-element -- Runtime QA assets intentionally bypass the Next image optimizer. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Inbox,
  Loader2,
  RefreshCw,
  Undo2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { EditType } from '@/lib/types/domain';
import { qaAuditChecklist } from '@/lib/design/quality-standards';
import { approveQaRequest, getQaQueue, rejectQaRequest, type AdminQaItem } from './api';
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

// ---------- AI 결과(aiOutput: unknown) 정규화 ----------

interface QaPreview {
  kind: 'image' | 'text' | 'video' | 'json' | 'none';
  imageUrl?: string;
  before?: string;
  after?: string;
  videoUrl?: string;
  posterUrl?: string;
  raw?: string;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

/** aiOutput 스키마가 유형별로 느슨해서(웹훅/AI 어댑터 산출물) 방어적으로 해석한다. */
function normalizeAiOutput(type: EditType, aiOutput: unknown): QaPreview {
  if (aiOutput === null || aiOutput === undefined) return { kind: 'none' };
  const asJson = () => JSON.stringify(aiOutput, null, 2);

  if (type === 'image') {
    if (typeof aiOutput === 'string') return { kind: 'image', imageUrl: aiOutput };
    if (typeof aiOutput === 'object') {
      const url = pickString(aiOutput as Record<string, unknown>, ['url', 'imageUrl', 'src']);
      if (url) return { kind: 'image', imageUrl: url };
    }
    return { kind: 'json', raw: asJson() };
  }

  if (type === 'text') {
    if (typeof aiOutput === 'string') return { kind: 'text', after: aiOutput };
    if (typeof aiOutput === 'object') {
      const obj = aiOutput as Record<string, unknown>;
      const after = pickString(obj, ['after', 'text', 'result', 'content']);
      const before = pickString(obj, ['before', 'currentText', 'original']);
      if (after) return { kind: 'text', before, after };
    }
    return { kind: 'json', raw: asJson() };
  }

  if (type === 'video') {
    if (typeof aiOutput === 'string') return { kind: 'video', videoUrl: aiOutput };
    if (typeof aiOutput === 'object') {
      const obj = aiOutput as Record<string, unknown>;
      const url = pickString(obj, ['url', 'videoUrl', 'src']);
      if (url) return { kind: 'video', videoUrl: url, posterUrl: pickString(obj, ['poster', 'posterUrl']) };
    }
    return { kind: 'json', raw: asJson() };
  }

  // structure 등 — JSON 그대로 확인
  return { kind: 'json', raw: asJson() };
}

// ---------- QA 큐 ----------

/** [motion 1단계 이월분] 검수 기준 참조 — qaAuditChecklist()(quality-standards) 직접 렌더. 규칙 파일과 단일 소스. */
function QaAuditReference() {
  const items = qaAuditChecklist();
  return (
    <details className="mb-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-700">
        <ClipboardCheck size={14} className="text-slate-400" aria-hidden />
        Inspection criteria checklist ({items.length}) — What makes the difference between $200 and $10,000
      </summary>
      <ul className="mt-2.5 space-y-1.5">
        {items.map((it) => (
          <li key={it.id} className="text-[11px] leading-5 text-slate-500">
            <span className="font-medium text-slate-700">{it.title}</span> — {it.description}
          </li>
        ))}
      </ul>
    </details>
  );
}

type ProcessedState = 'applied' | 'rejected';

export function QaQueue() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['admin', 'qa'],
    queryFn: getQaQueue,
  });

  /** 처리 직후에도 카드를 유지해 "적용됨 / 크레딧 환불됨"을 보여주기 위한 로컬 상태 */
  const [processed, setProcessed] = useState<Record<string, ProcessedState>>({});
  const [rejectTarget, setRejectTarget] = useState<AdminQaItem | null>(null);

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveQaRequest(id),
    onSuccess: (_result, id) => {
      setProcessed((prev) => ({ ...prev, [id]: 'applied' }));
      void queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectQaRequest(id, reason),
    onSuccess: (_result, { id }) => {
      setProcessed((prev) => ({ ...prev, [id]: 'rejected' }));
      setRejectTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });

  const pendingCount = useMemo(
    () => (data ?? []).filter((item) => !processed[item.id]).length,
    [data, processed],
  );

  return (
    <>
      <PageHeader
        title="QA queue"
        description={data ? `waiting for inspection${formatNumber(pendingCount)} records` : undefined}
        actions={
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={13} className={clsx(isRefetching && 'animate-spin')} aria-hidden />
            refresh
          </button>
        }
      />

      {/* [motion 1단계 이월분] 검수 기준 = quality-standards의 qa-audit 8요소 파생 (규칙 파일과 단일 소스) */}
      <QaAuditReference />

      {isPending ? (
        <LoadingBlock label="Loading QA queue…" />
      ) : isError ? (
        <ErrorBlock message={error.message} onRetry={() => refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="There are no QA cases waiting"
          description="Once a customer's edit request has completed AI processing and reached the review stage, it will appear here."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {data.map((item) => (
            <QaCard
              key={item.id}
              item={item}
              processedState={processed[item.id]}
              approving={approveMutation.isPending && approveMutation.variables === item.id}
              approveError={
                approveMutation.isError && approveMutation.variables === item.id
                  ? approveMutation.error.message
                  : null
              }
              onApprove={() => approveMutation.mutate(item.id)}
              onReject={() => setRejectTarget(item)}
            />
          ))}
        </div>
      )}

      {rejectTarget ? (
        <RejectDialog
          item={rejectTarget}
          pending={rejectMutation.isPending}
          errorMessage={rejectMutation.isError ? rejectMutation.error.message : null}
          onConfirm={(reason) => rejectMutation.mutate({ id: rejectTarget.id, reason })}
          onClose={() => {
            if (!rejectMutation.isPending) setRejectTarget(null);
          }}
        />
      ) : null}
    </>
  );
}

// ---------- 개별 카드 ----------

function QaCard({
  item,
  processedState,
  approving,
  approveError,
  onApprove,
  onReject,
}: {
  item: AdminQaItem;
  processedState?: ProcessedState;
  approving: boolean;
  approveError: string | null;
  onApprove: () => void;
  onReject: () => void;
}) {
  const preview = useMemo(() => normalizeAiOutput(item.type, item.aiOutput), [item]);
  const reviewable = item.status === 'qa_review' && !processedState;

  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">
            {item.clientName}
            <span className="mx-1.5 font-normal text-slate-300">/</span>
            <span className="font-medium text-slate-600">{item.siteName}</span>
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            request {formatDateTime(item.createdAt)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          <Badge tone="neutral">{EDIT_TYPE_LABELS[item.type]}</Badge>
          <Badge tone="amber">{formatNumber(item.creditCost)} credits</Badge>
          <Badge tone={EDIT_STATUS_TONES[item.status]}>{EDIT_STATUS_LABELS[item.status]}</Badge>
        </div>
      </div>

      <div className="mt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Request details
        </p>
        <p className="mt-1 whitespace-pre-wrap rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700 ring-1 ring-slate-200">
          {item.requestedContent}
        </p>
      </div>

      <div className="mt-3 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Preview AI results
        </p>
        <div className="mt-1">
          <QaPreviewBlock preview={preview} requested={item.requestedContent} />
        </div>
      </div>

      {approveError ? <p className="mt-2 text-xs text-red-600">{approveError}</p> : null}

      <div className="mt-3 border-t border-slate-100 pt-3">
        {processedState === 'applied' ? (
          <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <CheckCircle2 size={14} aria-hidden />
            Applied — Site reflection has been triggered.
          </p>
        ) : processedState === 'rejected' ? (
          <p className="flex items-center gap-1.5 text-xs font-medium text-sky-700">
            <Undo2 size={14} aria-hidden />
            Refusal Processing — Credit Refunded (+{formatNumber(item.creditCost)})
          </p>
        ) : item.status === 'ai_processing' ? (
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <Loader2 size={13} className="animate-spin" aria-hidden />
            AI Processing — Can be inspected upon completion.
          </p>
        ) : (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onReject}
              disabled={!reviewable || approving}
              className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              companion
            </button>
            <button
              type="button"
              onClick={onApprove}
              disabled={!reviewable || approving}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {approving ? <Loader2 size={12} className="animate-spin" aria-hidden /> : null}
              Approval/Apply
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

function QaPreviewBlock({ preview, requested }: { preview: QaPreview; requested: string }) {
  if (preview.kind === 'none') {
    return <p className="text-xs text-slate-400">There are no AI results yet.</p>;
  }

  if (preview.kind === 'image' && preview.imageUrl) {
    // 고객 콘텐츠 이미지 — next/image 대신 plain img 사용 (프로젝트 규약)
    return (
      <img
        src={preview.imageUrl}
        alt="Preview AI-generated images"
        className="max-h-60 w-auto rounded-md border border-slate-200 object-contain"
      />
    );
  }

  if (preview.kind === 'text') {
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-slate-200 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase text-slate-400">Before</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500">
            {preview.before ?? `(Original text not included – see request)${requested}`}
          </p>
        </div>
        <div className="rounded-md border border-emerald-200 bg-emerald-50/50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase text-emerald-600">After</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-slate-800">{preview.after}</p>
        </div>
      </div>
    );
  }

  if (preview.kind === 'video' && preview.videoUrl) {
    return (
      <div className="flex items-center gap-3">
        {preview.posterUrl ? (
          <img
            src={preview.posterUrl}
            alt="Video poster preview"
            className="h-20 w-32 rounded-md border border-slate-200 object-cover"
          />
        ) : null}
        <a
          href={preview.videoUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 underline underline-offset-2 hover:text-sky-500"
        >
          <ExternalLink size={13} aria-hidden />
          Check out the video in a new tab
        </a>
      </div>
    );
  }

  return (
    <pre className="max-h-48 overflow-auto rounded-md bg-slate-950 px-3 py-2 text-[11px] leading-relaxed text-slate-100">
      {preview.raw}
    </pre>
  );
}

// ---------- 반려 사유 모달 ----------

function RejectDialog({
  item,
  pending,
  errorMessage,
  onConfirm,
  onClose,
}: {
  item: AdminQaItem;
  pending: boolean;
  errorMessage: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const valid = reason.trim().length > 0;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit request rejected"
        className="w-full max-w-md rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-900">Edit request rejected</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Close"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-xs text-slate-500">
            {item.clientName} · {item.siteName} — {EDIT_TYPE_LABELS[item.type]} We reject your request.
            Credits consumed when returning a product {formatNumber(item.creditCost)}Your dog will receive an automatic refund.
          </p>

          <label className="mt-3 block">
            <span className="text-xs font-medium text-slate-600">Reason for rejection (notified to customer)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setTouched(true)}
              rows={3}
              placeholder="Example: Poor generated image quality — scheduled for re-inspection after regeneration"
              className="mt-1 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </label>
          {touched && !valid ? (
            <p className="mt-1 text-xs text-red-600">Please enter the reason for rejection.</p>
          ) : null}
          {errorMessage ? <p className="mt-2 text-xs text-red-600">{errorMessage}</p> : null}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-md border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setTouched(true);
                if (valid) onConfirm(reason.trim());
              }}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              {pending ? <Loader2 size={12} className="animate-spin" aria-hidden /> : null}
              Confirmation of return (credit refund)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
