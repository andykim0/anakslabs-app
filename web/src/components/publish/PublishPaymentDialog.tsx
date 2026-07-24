'use client';

import type { PublishPaymentQuote } from '@/lib/billing/publish-payment-contract';

function won(value: number): string {
  return `${value.toLocaleString('ko-KR')}원`;
}

export function PublishPaymentDialog({
  quote,
  paying,
  onClose,
  onConfirm,
}: {
  quote: PublishPaymentQuote | null;
  paying: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!quote) return null;
  const canPay = quote.checkoutMode === 'mock';
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#07142F]/55 px-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-payment-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 text-[#0B1736] shadow-2xl"
      >
        <p className="text-xs font-semibold text-[#174DDA]">발행할 때 결제</p>
        <h2 id="publish-payment-title" className="mt-2 text-xl font-bold">
          결과를 확인하셨다면 발행하세요
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#5F6B7C]">
          첫 해 이용료는 {won(quote.amountKrw)}이며 홈페이지 1개, {quote.periodMonths}개월 이용 기준입니다.
          별도 제작비는 없고 다음 기간부터 자동 갱신됩니다.
        </p>
        <div className="mt-5 rounded-xl bg-[#F3F7FF] px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-[#5F6B7C]">첫 해 선결제</span>
            <strong className="text-lg">{won(quote.amountKrw)}</strong>
          </div>
          <p className="mt-1 text-[11px] text-[#7A8699]">부가세 별도 · 홈페이지 1개 기준</p>
        </div>
        {!canPay ? (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            실제 결제 승인을 준비하고 있어 지금은 결제가 진행되지 않습니다.
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={paying}
            className="h-10 rounded-lg border border-[#DCE4F0] px-4 text-sm font-medium"
          >
            닫기
          </button>
          {canPay ? (
            <button
              type="button"
              onClick={onConfirm}
              disabled={paying}
              className="h-10 rounded-lg bg-[#174DDA] px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {paying ? '확인 중…' : '결제하고 발행하기'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
