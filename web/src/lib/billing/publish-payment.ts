import { createHash } from 'node:crypto';
import type { Site } from '@/lib/types/domain';
import {
  CURRENT_SUBSCRIPTION_PRICE,
  type SubscriptionPriceContract,
} from '@/lib/pricing';
import type { PublishPaymentQuote } from './publish-payment-contract';

export const PUBLISH_PAYMENT_ERROR_CODE = 'PUBLISH_PAYMENT_REQUIRED' as const;

function quoteDigest(
  clientId: string,
  siteId: string,
  pricing: SubscriptionPriceContract,
): string {
  return createHash('sha256')
    .update(
      `${pricing.modelVersion}|${pricing.industryProfileId}|${clientId}|${siteId}|${pricing.amountKrw}|${pricing.periodMonths}|vat-included`,
    )
    .digest('hex')
    .slice(0, 32);
}

export function publishPaymentQuote(input: {
  clientId: string;
  siteId: string;
  mock: boolean;
  pricing?: SubscriptionPriceContract;
}): PublishPaymentQuote {
  const pricing = input.pricing ?? CURRENT_SUBSCRIPTION_PRICE;
  return {
    quoteId: quoteDigest(input.clientId, input.siteId, pricing),
    pricingModelVersion: pricing.modelVersion,
    industryProfileId: pricing.industryProfileId,
    amountKrw: pricing.amountKrw,
    periodMonths: pricing.periodMonths,
    billingInterval: pricing.billingInterval,
    automaticRenewal: pricing.automaticRenewal,
    siteCount: 1,
    vatIncluded: pricing.vatIncluded,
    checkoutMode: input.mock ? 'mock' : 'unavailable',
  };
}

export function quoteMatchesSite(
  quoteId: string,
  input: {
    clientId: string;
    siteId: string;
    pricing?: SubscriptionPriceContract;
  },
): boolean {
  return quoteId === quoteDigest(
    input.clientId,
    input.siteId,
    input.pricing ?? CURRENT_SUBSCRIPTION_PRICE,
  );
}

/** A published site can be republished without another build payment. */
export function needsPublishPayment(site: Pick<Site, 'publishedAt'>, subscriptionActive: boolean): boolean {
  return !site.publishedAt && !subscriptionActive;
}

export function mockPublishPaymentKey(
  siteId: string,
  pricing: SubscriptionPriceContract = CURRENT_SUBSCRIPTION_PRICE,
): string {
  return `mock-publish:${pricing.modelVersion}:${siteId}`;
}
