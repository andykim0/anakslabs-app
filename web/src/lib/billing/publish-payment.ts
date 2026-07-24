import { createHash } from 'node:crypto';
import type { Site } from '@/lib/types/domain';
import { PRICING, PRICING_MODEL_VERSION } from '@/lib/pricing';
import type { PublishPaymentQuote } from './publish-payment-contract';

export const PUBLISH_PAYMENT_ERROR_CODE = 'PUBLISH_PAYMENT_REQUIRED' as const;

function quoteDigest(clientId: string, siteId: string): string {
  return createHash('sha256')
    .update(`${PRICING_MODEL_VERSION}|${clientId}|${siteId}|${PRICING.subscription.annual}`)
    .digest('hex')
    .slice(0, 32);
}

export function publishPaymentQuote(input: {
  clientId: string;
  siteId: string;
  mock: boolean;
}): PublishPaymentQuote {
  return {
    quoteId: quoteDigest(input.clientId, input.siteId),
    pricingModelVersion: PRICING_MODEL_VERSION,
    amountKrw: PRICING.subscription.annual,
    periodMonths: PRICING.subscription.periodMonths,
    automaticRenewal: true,
    siteCount: 1,
    vatIncluded: false,
    checkoutMode: input.mock ? 'mock' : 'unavailable',
  };
}

export function quoteMatchesSite(
  quoteId: string,
  input: { clientId: string; siteId: string },
): boolean {
  return quoteId === quoteDigest(input.clientId, input.siteId);
}

/** A published site can be republished without another build payment. */
export function needsPublishPayment(site: Pick<Site, 'publishedAt'>, subscriptionActive: boolean): boolean {
  return !site.publishedAt && !subscriptionActive;
}

export function mockPublishPaymentKey(siteId: string): string {
  return `mock-publish:${PRICING_MODEL_VERSION}:${siteId}`;
}
