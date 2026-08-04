import { createHash } from 'node:crypto';
import type { Site } from '@/lib/types/domain';
import {
  CURRENT_SUBSCRIPTION_PRICE,
  US_ENTERPRISE_PRICING,
  type PublishSubscriptionPriceContract,
} from '@/lib/pricing';
import type { PublishPaymentQuote } from './publish-payment-contract';

export const PUBLISH_PAYMENT_ERROR_CODE = 'PUBLISH_PAYMENT_REQUIRED' as const;

function quoteDigest(
  clientId: string,
  siteId: string,
  pricing: PublishSubscriptionPriceContract,
): string {
  const amount = 'amountUsd' in pricing ? pricing.amountUsd : pricing.amountKrw;
  const currency = 'currency' in pricing ? pricing.currency : 'KRW';
  const taxIncluded = 'taxMode' in pricing ? false : pricing.vatIncluded;
  return createHash('sha256')
    .update(
      `${pricing.modelVersion}|${'industryProfileId' in pricing ? pricing.industryProfileId : 'legacy'}|${clientId}|${siteId}|${amount}|${currency}|${pricing.periodMonths}|tax-${taxIncluded ? 'included' : 'separate'}`,
    )
    .digest('hex')
    .slice(0, 32);
}

export function publishPaymentQuote(input: {
  clientId: string;
  siteId: string;
  mock: boolean;
  stripe?: boolean;
  pricing?: PublishSubscriptionPriceContract;
}): PublishPaymentQuote {
  const pricing = input.pricing ?? CURRENT_SUBSCRIPTION_PRICE;
  const amount = 'amountUsd' in pricing ? pricing.amountUsd : pricing.amountKrw;
  const currency = 'currency' in pricing ? pricing.currency : 'KRW';
  const taxIncluded = 'taxMode' in pricing ? false : pricing.vatIncluded;
  return {
    quoteId: quoteDigest(input.clientId, input.siteId, pricing),
    pricingModelVersion: pricing.modelVersion,
    ...('industryProfileId' in pricing
      ? { industryProfileId: pricing.industryProfileId }
      : {}),
    amount,
    setupAmount: currency === 'USD' ? US_ENTERPRISE_PRICING.setupUsd : 0,
    currency,
    periodMonths: pricing.periodMonths,
    billingInterval: pricing.billingInterval,
    automaticRenewal: pricing.automaticRenewal,
    siteCount: 1,
    taxIncluded,
    checkoutMode: input.mock ? 'mock' : input.stripe ? 'stripe' : 'unavailable',
  };
}

export function quoteMatchesSite(
  quoteId: string,
  input: {
    clientId: string;
    siteId: string;
    pricing?: PublishSubscriptionPriceContract;
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
  pricing: PublishSubscriptionPriceContract = CURRENT_SUBSCRIPTION_PRICE,
): string {
  return `mock-publish:${pricing.modelVersion}:${siteId}`;
}

export function mockPublishSetupPaymentKey(
  siteId: string,
  pricing: PublishSubscriptionPriceContract = CURRENT_SUBSCRIPTION_PRICE,
): string {
  return `mock-publish:${pricing.modelVersion}:${siteId}:setup`;
}
