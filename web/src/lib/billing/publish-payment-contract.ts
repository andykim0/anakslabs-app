export interface PublishPaymentQuote {
  quoteId: string;
  pricingModelVersion: string;
  amountKrw: number;
  periodMonths: number;
  billingInterval: 'month';
  automaticRenewal: true;
  siteCount: 1;
  vatIncluded: false;
  checkoutMode: 'mock' | 'unavailable';
}

export function publishPaymentQuoteFromExtra(
  extra: Record<string, unknown>,
): PublishPaymentQuote | null {
  const quote = extra.quote;
  if (!quote || typeof quote !== 'object') return null;
  const value = quote as Record<string, unknown>;
  if (
    typeof value.quoteId !== 'string'
    || typeof value.pricingModelVersion !== 'string'
    || typeof value.amountKrw !== 'number'
    || typeof value.periodMonths !== 'number'
    || value.billingInterval !== 'month'
    || value.automaticRenewal !== true
    || value.siteCount !== 1
    || value.vatIncluded !== false
    || (value.checkoutMode !== 'mock' && value.checkoutMode !== 'unavailable')
  ) {
    return null;
  }
  return value as unknown as PublishPaymentQuote;
}
