'use client';

import type { PublishPaymentQuote } from '@/lib/billing/publish-payment-contract';

function money(value: number, currency: 'USD' | 'KRW'): string {
  return new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'ko-KR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
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
  const canPay = quote.checkoutMode === 'mock' || quote.checkoutMode === 'stripe';
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#07142F]/55 px-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-payment-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 text-[#0B1736] shadow-2xl"
      >
        <p className="text-xs font-semibold text-[#174DDA]">Enterprise publishing</p>
        <h2 id="publish-payment-title" className="mt-2 text-xl font-bold">
          Review and publish your clinic site
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#5F6B7C]">
          The Enterprise contract includes a {money(quote.setupAmount, quote.currency)} setup fee and a {money(quote.amount, quote.currency)} monthly service for one clinic website.
        </p>
        <div className="mt-5 rounded-xl bg-[#F3F7FF] px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-[#5F6B7C]">Monthly Enterprise service</span>
            <strong className="text-lg">{money(quote.amount, quote.currency)}</strong>
          </div>
          <div className="mt-2 flex items-center justify-between gap-4 border-t border-[#DCE4F0] pt-2">
            <span className="text-sm text-[#5F6B7C]">One-time setup</span>
            <strong className="text-base">{money(quote.setupAmount, quote.currency)}</strong>
          </div>
          <p className="mt-1 text-[11px] text-[#7A8699]">Taxes, if applicable, are calculated at checkout.</p>
        </div>
        {!canPay ? (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            Live Stripe checkout is not enabled yet. No charge will be made.
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={paying}
            className="h-10 rounded-lg border border-[#DCE4F0] px-4 text-sm font-medium"
          >
            Close
          </button>
          {canPay ? (
            <button
              type="button"
              onClick={onConfirm}
              disabled={paying}
              className="h-10 rounded-lg bg-[#174DDA] px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {paying
                ? 'Opening checkout…'
                : quote.checkoutMode === 'stripe'
                  ? 'Continue to secure checkout'
                  : 'Confirm mock payment and publish'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
