/**
 * Lives here rather than in publish-payment.ts because the admin console branches on it, and
 * that module imports node:crypto for the quote digest — importing it from a client component
 * pulls a node builtin into the browser bundle and the page fails to build.
 */
export const PUBLISH_PAYMENT_ERROR_CODE = 'PUBLISH_PAYMENT_REQUIRED' as const;

export interface PublishPaymentQuote {
  quoteId: string;
  pricingModelVersion: string;
  industryProfileId?: 'interior' | 'clinic';
  amount: number;
  setupAmount: number;
  currency: 'USD' | 'KRW';
  periodMonths: number;
  billingInterval: 'month';
  automaticRenewal: true;
  siteCount: 1;
  taxIncluded: boolean;
  checkoutMode: 'mock' | 'stripe' | 'unavailable';
}

export type PublishPaymentConfirmation =
  | { paid: true; duplicated: boolean; quote: PublishPaymentQuote }
  | {
      paid: false;
      checkoutUrl: string;
      checkoutSessionId: string;
      quote: PublishPaymentQuote;
    };

export function publishPaymentQuoteFromExtra(
  extra: Record<string, unknown>,
): PublishPaymentQuote | null {
  const quote = extra.quote;
  if (!quote || typeof quote !== 'object') return null;
  const value = quote as Record<string, unknown>;
  if (
    typeof value.quoteId !== 'string'
    || typeof value.pricingModelVersion !== 'string'
    || (
      value.industryProfileId !== undefined
      && value.industryProfileId !== 'interior'
      && value.industryProfileId !== 'clinic'
    )
    || typeof value.amount !== 'number'
    || typeof value.setupAmount !== 'number'
    || (value.currency !== 'USD' && value.currency !== 'KRW')
    || typeof value.periodMonths !== 'number'
    || value.billingInterval !== 'month'
    || value.automaticRenewal !== true
    || value.siteCount !== 1
    || typeof value.taxIncluded !== 'boolean'
    || (
      value.checkoutMode !== 'mock'
      && value.checkoutMode !== 'stripe'
      && value.checkoutMode !== 'unavailable'
    )
  ) {
    return null;
  }
  return value as unknown as PublishPaymentQuote;
}
