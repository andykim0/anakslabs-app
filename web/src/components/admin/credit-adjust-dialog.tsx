'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Loader2, Minus, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { adjustCredits } from './api';
import { formatNumber } from './format';

type Mode = 'grant' | 'deduct';
type Step = 'form' | 'confirm' | 'done';

/**
 * 크레딧 수동 조정 다이얼로그.
 * 양수 = 지급(admin_adjust 지급 lot, 만료 365일 — 서버 처리), 음수 = 차감(잔액 부족 시 서버가 거부).
 * 음수 조정은 확인 단계를 한 번 더 거친다.
 */
export function CreditAdjustDialog({
  clientId,
  clientName,
  currentBalance,
  onClose,
}: {
  clientId: string;
  clientName: string;
  currentBalance: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('grant');
  const [qty, setQty] = useState('1');
  const [memo, setMemo] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [newBalance, setNewBalance] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: adjustCredits,
    onSuccess: (result) => {
      setNewBalance(result.newBalance);
      setStep('done');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'client', clientId] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'clients'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });

  const parsedQty = Number(qty);
  const qtyValid = Number.isInteger(parsedQty) && parsedQty >= 1;
  const signedAmount = mode === 'grant' ? parsedQty : -parsedQty;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !mutation.isPending) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mutation.isPending, onClose]);

  const submit = () => {
    setValidationError(null);
    if (!qtyValid) {
      setValidationError('수량은 1 이상의 정수여야 합니다.');
      return;
    }
    if (memo.trim().length === 0) {
      setValidationError('조정 사유(메모)를 입력하세요.');
      return;
    }
    if (mode === 'deduct' && step !== 'confirm') {
      setStep('confirm');
      return;
    }
    mutation.mutate({ clientId, amount: signedAmount, memo: memo.trim() });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4"
      onClick={() => {
        if (!mutation.isPending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="크레딧 수동 조정"
        className="w-full max-w-md rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-900">크레딧 수동 조정</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            aria-label="닫기"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        {step === 'done' && newBalance !== null ? (
          <div className="px-5 py-6 text-center">
            <CheckCircle2 size={28} className="mx-auto text-emerald-500" aria-hidden />
            <p className="mt-3 text-sm font-medium text-slate-900">조정이 완료되었습니다</p>
            <p className="mt-1 text-xs text-slate-500">
              {clientName} 님의 잔액: {formatNumber(currentBalance)} →{' '}
              <span className="font-semibold text-slate-900">{formatNumber(newBalance)}</span>{' '}
              크레딧
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-700"
            >
              닫기
            </button>
          </div>
        ) : (
          <div className="px-5 py-4">
            <p className="text-xs text-slate-500">
              대상: <span className="font-medium text-slate-800">{clientName}</span> · 현재 잔액{' '}
              <span className="font-medium text-slate-800">{formatNumber(currentBalance)}</span>{' '}
              크레딧
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="조정 방향">
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'grant'}
                onClick={() => {
                  setMode('grant');
                  setStep('form');
                }}
                className={clsx(
                  'flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium',
                  mode === 'grant'
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50',
                )}
              >
                <Plus size={13} aria-hidden />
                지급 (+)
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'deduct'}
                onClick={() => {
                  setMode('deduct');
                  setStep('form');
                }}
                className={clsx(
                  'flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium',
                  mode === 'deduct'
                    ? 'border-red-400 bg-red-50 text-red-700'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50',
                )}
              >
                <Minus size={13} aria-hidden />
                차감 (−)
              </button>
            </div>

            <label className="mt-3 block">
              <span className="text-xs font-medium text-slate-600">수량</span>
              <input
                type="number"
                min={1}
                step={1}
                value={qty}
                onChange={(e) => {
                  setQty(e.target.value);
                  setStep('form');
                }}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm tabular-nums focus:border-slate-500 focus:outline-none"
              />
            </label>

            <label className="mt-3 block">
              <span className="text-xs font-medium text-slate-600">메모 (조정 사유 — 필수)</span>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={2}
                placeholder="예: CS 보상 지급 / 중복 지급분 회수"
                className="mt-1 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              />
            </label>

            {step === 'confirm' ? (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2.5">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-600" aria-hidden />
                <p className="text-xs text-red-700">
                  <span className="font-semibold">음수 조정 확인:</span> {clientName} 님의 잔액에서{' '}
                  {qtyValid ? formatNumber(parsedQty) : qty}크레딧이 차감됩니다. 잔액이 부족하면
                  조정이 거부됩니다. 계속하시겠습니까?
                </p>
              </div>
            ) : null}

            {validationError ? (
              <p className="mt-2 text-xs text-red-600">{validationError}</p>
            ) : null}
            {mutation.isError ? (
              <p className="mt-2 text-xs text-red-600">{mutation.error.message}</p>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={mutation.isPending}
                className="rounded-md border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={mutation.isPending}
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-medium text-white disabled:opacity-50',
                  step === 'confirm'
                    ? 'bg-red-600 hover:bg-red-500'
                    : 'bg-slate-900 hover:bg-slate-700',
                )}
              >
                {mutation.isPending ? (
                  <Loader2 size={13} className="animate-spin" aria-hidden />
                ) : null}
                {step === 'confirm'
                  ? '차감 확정'
                  : mode === 'deduct'
                    ? '차감 진행'
                    : '지급 적용'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
