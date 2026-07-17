'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, ReceiptText, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CREDIT_PACKS } from '@/lib/credits/constants';
import {
  MANUAL_COLLECTION_LABELS,
  manualCollectionNeedsSite,
  manualCollectionQuote,
  type ManualCollectionChannel,
  type ManualCollectionProductKind,
} from '@/lib/payments/manual-collection-core';
import {
  getClientDetail,
  getClients,
  recordManualCollection,
  reverseManualCollection,
  type AdminManualCollectionRow,
} from './api';
import { formatDateTime, formatKrw } from './format';
import { Badge, Card } from './ui';

const PRODUCT_KINDS = Object.keys(MANUAL_COLLECTION_LABELS) as ManualCollectionProductKind[];
const CHANNEL_LABELS: Record<ManualCollectionChannel, string> = {
  kmong: '크몽',
  bank_transfer: '계좌이체',
  other: '기타',
};

const inputClass = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

export function ManualCollectionPanel({ rows }: { rows: AdminManualCollectionRow[] }) {
  const queryClient = useQueryClient();
  const clients = useQuery({ queryKey: ['admin', 'clients'], queryFn: getClients });
  const [clientId, setClientId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [productKind, setProductKind] = useState<ManualCollectionProductKind>('launch_build');
  const [creditPackCredits, setCreditPackCredits] = useState(CREDIT_PACKS[0]?.credits ?? 1);
  const [channel, setChannel] = useState<ManualCollectionChannel>('kmong');
  const [reference, setReference] = useState('');
  const [memo, setMemo] = useState('');
  const [reversalEntryId, setReversalEntryId] = useState<string | null>(null);
  const [reversalReference, setReversalReference] = useState('');
  const [reversalMemo, setReversalMemo] = useState('');

  const effectiveClientId = clientId || clients.data?.[0]?.id || '';

  const detail = useQuery({
    queryKey: ['admin', 'client', effectiveClientId],
    queryFn: () => getClientDetail(effectiveClientId),
    enabled: Boolean(effectiveClientId),
  });
  const effectiveSiteId = detail.data?.sites.some((site) => site.id === siteId)
    ? siteId
    : detail.data?.sites[0]?.id ?? '';

  const quote = useMemo(() => manualCollectionQuote({
    productKind,
    creditPackCredits: productKind === 'credit_pack' ? creditPackCredits : undefined,
  }), [creditPackCredits, productKind]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'client', effectiveClientId] }),
    ]);
  };

  const record = useMutation({
    mutationFn: () => {
      if (!quote) throw new Error('가격표 조합을 확인할 수 없습니다.');
      return recordManualCollection({
        clientId: effectiveClientId,
        siteId: effectiveSiteId || null,
        productKind,
        amountKrw: quote.amountKrw,
        channel,
        collectionReference: reference,
        memo: memo || null,
        creditPackCredits: productKind === 'credit_pack' ? creditPackCredits : undefined,
      });
    },
    onSuccess: async () => {
      setReference('');
      setMemo('');
      await refresh();
    },
  });

  const reversal = useMutation({
    mutationFn: () => {
      if (!reversalEntryId) throw new Error('정정할 원장 행을 선택해 주세요.');
      return reverseManualCollection(reversalEntryId, {
        collectionReference: reversalReference,
        memo: reversalMemo,
      });
    },
    onSuccess: async () => {
      setReversalEntryId(null);
      setReversalReference('');
      setReversalMemo('');
      await refresh();
    },
  });

  const siteRequired = manualCollectionNeedsSite(productKind);
  const canSubmit = Boolean(
    effectiveClientId
    && quote
    && reference.trim()
    && (!siteRequired || effectiveSiteId)
    && !record.isPending,
  );

  return (
    <section className="mt-7" aria-labelledby="manual-collection-heading">
      <div className="mb-3">
        <h2 id="manual-collection-heading" className="text-sm font-semibold text-slate-900">
          수동 수금 원장
        </h2>
        <p className="mt-0.5 text-[11px] leading-5 text-slate-500">
          크몽·계좌 수금을 기존 결제 원장에 기록합니다. 원본은 수정·삭제할 수 없고 정정은 반대 분개만 허용됩니다.
        </p>
      </div>

      <Card className="p-4">
        <form
          className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4"
          onSubmit={(event) => { event.preventDefault(); record.mutate(); }}
        >
          <label className="text-xs font-medium text-slate-600">
            고객
            <select className={`${inputClass} mt-1`} value={effectiveClientId} onChange={(event) => { setClientId(event.target.value); setSiteId(''); }}>
              {(clients.data ?? []).map((client) => (
                <option key={client.id} value={client.id}>{client.name} · {client.email}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            사이트 {siteRequired ? '(필수)' : '(선택)'}
            <select className={`${inputClass} mt-1`} value={effectiveSiteId} onChange={(event) => setSiteId(event.target.value)}>
              {!siteRequired ? <option value="">사이트 귀속 없음</option> : null}
              {(detail.data?.sites ?? []).map((site) => (
                <option key={site.id} value={site.id}>{site.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            수금 유형
            <select className={`${inputClass} mt-1`} value={productKind} onChange={(event) => setProductKind(event.target.value as ManualCollectionProductKind)}>
              {PRODUCT_KINDS.map((kind) => <option key={kind} value={kind}>{MANUAL_COLLECTION_LABELS[kind]}</option>)}
            </select>
          </label>
          {productKind === 'credit_pack' ? (
            <label className="text-xs font-medium text-slate-600">
              크레딧 팩
              <select className={`${inputClass} mt-1`} value={creditPackCredits} onChange={(event) => setCreditPackCredits(Number(event.target.value))}>
                {CREDIT_PACKS.map((pack) => <option key={pack.credits} value={pack.credits}>{pack.label} · {formatKrw(pack.priceKrw)}</option>)}
              </select>
            </label>
          ) : (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-500">가격표 검증 금액</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{quote ? formatKrw(quote.amountKrw) : '—'}</p>
            </div>
          )}
          <label className="text-xs font-medium text-slate-600">
            수금 채널
            <select className={`${inputClass} mt-1`} value={channel} onChange={(event) => setChannel(event.target.value as ManualCollectionChannel)}>
              {(Object.keys(CHANNEL_LABELS) as ManualCollectionChannel[]).map((value) => <option key={value} value={value}>{CHANNEL_LABELS[value]}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            거래·주문 참조번호
            <input className={`${inputClass} mt-1`} value={reference} onChange={(event) => setReference(event.target.value)} maxLength={160} placeholder="예: 크몽 주문번호" />
          </label>
          <label className="text-xs font-medium text-slate-600 lg:col-span-2">
            메모
            <input className={`${inputClass} mt-1`} value={memo} onChange={(event) => setMemo(event.target.value)} maxLength={500} placeholder="선택 · 고객 요청이나 입금 확인 메모" />
          </label>
          <div className="flex items-end xl:col-span-4">
            <button type="submit" disabled={!canSubmit} className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">
              {record.isPending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <ReceiptText size={15} aria-hidden />}
              {quote ? `${formatKrw(quote.amountKrw)} 수금 기록` : '수금 기록'}
            </button>
          </div>
          {record.isError ? <p role="alert" className="text-xs text-red-600 xl:col-span-4">{record.error.message}</p> : null}
          {record.isSuccess ? <p role="status" className="inline-flex items-center gap-1.5 text-xs text-emerald-700 xl:col-span-4"><CheckCircle2 size={13} aria-hidden />원장에 기록했습니다.</p> : null}
        </form>
      </Card>

      <Card className="mt-3 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
            <thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2">시각</th><th className="px-3 py-2">고객·사이트</th><th className="px-3 py-2">유형</th><th className="px-3 py-2">채널·참조</th><th className="px-3 py-2 text-right">금액</th><th className="px-3 py-2 text-right">정정</th></tr></thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.length ? rows.map((row) => (
                <tr key={row.entryId}>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{formatDateTime(row.createdAt)}</td>
                  <td className="px-3 py-2"><p className="font-medium text-slate-800">{row.clientName}</p><p className="text-[11px] text-slate-500">{row.siteName ?? '사이트 귀속 없음'}</p></td>
                  <td className="px-3 py-2"><Badge tone={row.direction === 'receipt' ? 'green' : 'red'}>{row.direction === 'receipt' ? MANUAL_COLLECTION_LABELS[row.productKind] : '반대 분개'}</Badge>{row.memo ? <p className="mt-1 max-w-xs text-[11px] text-slate-500">{row.memo}</p> : null}</td>
                  <td className="px-3 py-2 text-slate-600">{CHANNEL_LABELS[row.channel]}<p className="font-mono text-[11px] text-slate-400">{row.collectionReference}</p></td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums ${row.direction === 'reversal' ? 'text-red-600' : 'text-slate-800'}`}>{row.direction === 'reversal' ? '−' : ''}{formatKrw(row.amountKrw)}</td>
                  <td className="px-3 py-2 text-right">{row.reversible ? <button type="button" onClick={() => { setReversalEntryId(row.entryId); setReversalReference(''); setReversalMemo(''); }} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"><RotateCcw size={11} aria-hidden />반대 분개</button> : '—'}</td>
                </tr>
              )) : <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">아직 수동 수금 기록이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {reversalEntryId ? (
        <Card className="mt-3 border-red-200 bg-red-50/40 p-4">
          <h3 className="text-sm font-semibold text-red-900">반대 분개 추가</h3>
          <p className="mt-1 text-[11px] leading-5 text-red-700">원본은 보존됩니다. 구독·크레딧 팩은 연결된 미사용 혜택도 같은 서버 트랜잭션에서 정리됩니다.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input className={inputClass} value={reversalReference} onChange={(event) => setReversalReference(event.target.value)} placeholder="정정 참조번호" maxLength={160} />
            <input className={inputClass} value={reversalMemo} onChange={(event) => setReversalMemo(event.target.value)} placeholder="정정 사유 (필수)" maxLength={500} />
          </div>
          <div className="mt-3 flex gap-2"><button type="button" onClick={() => reversal.mutate()} disabled={!reversalReference.trim() || !reversalMemo.trim() || reversal.isPending} className="rounded-md bg-red-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">반대 분개 확정</button><button type="button" onClick={() => setReversalEntryId(null)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-600">취소</button></div>
          {reversal.isError ? <p role="alert" className="mt-2 text-xs text-red-700">{reversal.error.message}</p> : null}
        </Card>
      ) : null}
    </section>
  );
}
