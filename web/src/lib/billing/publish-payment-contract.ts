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
    || (value.checkoutMode !== 'mock' && value.checkoutMode !== 'unavailable')
  ) {
    return null;
  }
  return value as unknown as PublishPaymentQuote;
}
