import { INITIAL_GRANT } from '@/lib/credits/constants';
import { LAUNCH_OFFER, PRICING } from '@/lib/pricing';
import type { Payment } from '@/lib/types/domain';

/** Internal operating target, not a customer-facing product price. */
export const ADMIN_MONTHLY_REVENUE_TARGET_KRW = 10_000_000;

const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;

export interface KstRevenueMonth {
  /** Korean calendar month (`YYYY-MM`). */
  month: string;
  startIso: string;
  endExclusiveIso: string;
}

export interface RevenueBucket {
  grossKrw: number;
  refundsKrw: number;
  netKrw: number;
}

export interface AdminRevenueSegments {
  launchBuild: RevenueBucket;
  listBuild: RevenueBucket;
  videoAddon: RevenueBucket;
  /** Build-fee money whose current base/add-on contract cannot be proven. */
  unclassifiedBuild: RevenueBucket;
  subscription: RevenueBucket;
  creditPack: RevenueBucket;
}

export type AdminPaymentAnomalyCode =
  | 'duplicate_payment_id'
  | 'invalid_amount'
  | 'invalid_credits_granted'
  | 'invalid_created_at'
  | 'invalid_refund';

export interface AdminPaymentAnomaly {
  paymentId: string;
  code: AdminPaymentAnomalyCode;
}

export interface LaunchOfferCounterMetrics {
  /** Exact current-price launch build-fee contracts, excluding full refunds. */
  contracts: number;
  limit: number | null;
  remaining: number | null;
  reachedLimit: boolean;
}

export interface AdminOpsRevenueMetrics {
  month: KstRevenueMonth;
  segments: AdminRevenueSegments;
  /** All payment types, including credit packs. */
  receipts: RevenueBucket;
  /** Build fee + video add-on + operating subscription. Credit packs are excluded. */
  operatingRevenueNetKrw: number;
  targetKrw: number;
  /** Clamped to 0..1 for the overview gauge. */
  targetProgress: number;
  launchOffer: LaunchOfferCounterMetrics;
  anomalies: AdminPaymentAnomaly[];
}

type BuildContract =
  | { base: 'launch' | 'list'; videoAddon: boolean }
  | { base: 'unclassified'; videoAddon: false };

type SegmentKey = keyof AdminRevenueSegments;

function emptyBucket(): RevenueBucket {
  return { grossKrw: 0, refundsKrw: 0, netKrw: 0 };
}

function emptySegments(): AdminRevenueSegments {
  return {
    launchBuild: emptyBucket(),
    listBuild: emptyBucket(),
    videoAddon: emptyBucket(),
    unclassifiedBuild: emptyBucket(),
    subscription: emptyBucket(),
    creditPack: emptyBucket(),
  };
}

function isKrw(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function instant(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function currentKstRevenueMonth(now: Date = new Date()): KstRevenueMonth {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new TypeError('A valid revenue date is required');
  const kst = new Date(nowMs + KST_OFFSET_MS);
  const year = kst.getUTCFullYear();
  const zeroBasedMonth = kst.getUTCMonth();
  const startMs = Date.UTC(year, zeroBasedMonth, 1) - KST_OFFSET_MS;
  const endMs = Date.UTC(year, zeroBasedMonth + 1, 1) - KST_OFFSET_MS;
  return {
    month: `${year}-${String(zeroBasedMonth + 1).padStart(2, '0')}`,
    startIso: new Date(startMs).toISOString(),
    endExclusiveIso: new Date(endMs).toISOString(),
  };
}

/**
 * Only immutable payment fields and exact current price combinations are used.
 * Historical/negotiated prices, separate manual collections, and malformed rows
 * remain unclassified rather than being inferred from the client's current tier.
 */
export function classifyBuildContract(payment: Pick<Payment, 'amount' | 'creditsGranted'>): BuildContract {
  if (
    payment.creditsGranted === INITIAL_GRANT.basic
    && payment.amount === PRICING.base.launch
  ) {
    return { base: 'launch', videoAddon: false };
  }
  if (
    payment.creditsGranted === INITIAL_GRANT.basic
    && payment.amount === PRICING.base.list
  ) {
    return { base: 'list', videoAddon: false };
  }
  if (
    payment.creditsGranted === INITIAL_GRANT.premium
    && payment.amount === PRICING.base.launch + PRICING.videoHeroAddon
  ) {
    return { base: 'launch', videoAddon: true };
  }
  if (
    payment.creditsGranted === INITIAL_GRANT.premium
    && payment.amount === PRICING.base.list + PRICING.videoHeroAddon
  ) {
    return { base: 'list', videoAddon: true };
  }
  return { base: 'unclassified', videoAddon: false };
}

function addGross(bucket: RevenueBucket, amount: number): void {
  bucket.grossKrw += amount;
  bucket.netKrw += amount;
}

function addRefund(bucket: RevenueBucket, amount: number): void {
  bucket.refundsKrw += amount;
  bucket.netKrw -= amount;
}

function buildAllocations(
  payment: Payment,
  classification: BuildContract,
): Array<{ segment: SegmentKey; amount: number }> {
  if (classification.base === 'unclassified') {
    return [{ segment: 'unclassifiedBuild', amount: payment.amount }];
  }
  const baseSegment = classification.base === 'launch' ? 'launchBuild' : 'listBuild';
  return classification.videoAddon
    ? [
        { segment: baseSegment, amount: PRICING.base[classification.base] },
        { segment: 'videoAddon', amount: PRICING.videoHeroAddon },
      ]
    : [{ segment: baseSegment, amount: payment.amount }];
}

function grossAllocations(
  payment: Payment,
  classification: BuildContract | null,
): Array<{ segment: SegmentKey; amount: number }> {
  if (payment.type === 'build_fee') {
    return buildAllocations(payment, classification ?? { base: 'unclassified', videoAddon: false });
  }
  if (payment.type === 'maintenance_subscription') {
    return [{ segment: 'subscription', amount: payment.amount }];
  }
  return [{ segment: 'creditPack', amount: payment.amount }];
}

function refundAllocations(
  payment: Payment,
  refundAmount: number,
  classification: BuildContract | null,
): Array<{ segment: SegmentKey; amount: number }> {
  if (payment.type === 'maintenance_subscription') {
    return [{ segment: 'subscription', amount: refundAmount }];
  }
  if (payment.type === 'credit_pack') {
    return [{ segment: 'creditPack', amount: refundAmount }];
  }
  // A full refund exactly reverses a known composite. A partial build refund
  // has no authoritative base/add-on allocation, so it stays unclassified.
  if (refundAmount === payment.amount) {
    return buildAllocations(payment, classification ?? { base: 'unclassified', videoAddon: false });
  }
  return [{ segment: 'unclassifiedBuild', amount: refundAmount }];
}

function inRange(value: number, start: number, end: number): boolean {
  return value >= start && value < end;
}

function quantityOfferLimit(): number | null {
  return LAUNCH_OFFER.kind === 'quantity'
    && Number.isSafeInteger(LAUNCH_OFFER.limitCount)
    && (LAUNCH_OFFER.limitCount ?? 0) > 0
    ? LAUNCH_OFFER.limitCount
    : null;
}

/**
 * Builds cash-basis operational metrics. Payments enter gross receipts in the
 * KST month they were created; refunds reduce receipts in the KST month they
 * were actually recorded, even when the original payment is older.
 */
export function buildAdminOpsRevenueMetrics(
  payments: readonly Payment[],
  now: Date = new Date(),
): AdminOpsRevenueMetrics {
  const month = currentKstRevenueMonth(now);
  const start = Date.parse(month.startIso);
  const end = Date.parse(month.endExclusiveIso);
  const segments = emptySegments();
  const receipts = emptyBucket();
  const anomalies: AdminPaymentAnomaly[] = [];
  const seenIds = new Set<string>();
  let launchContracts = 0;

  for (const payment of payments) {
    if (seenIds.has(payment.id)) {
      anomalies.push({ paymentId: payment.id, code: 'duplicate_payment_id' });
      continue;
    }
    seenIds.add(payment.id);

    const amountValid = isKrw(payment.amount);
    const creditsValid = isKrw(payment.creditsGranted);
    const createdAt = instant(payment.createdAt);
    if (!amountValid) anomalies.push({ paymentId: payment.id, code: 'invalid_amount' });
    if (!creditsValid) {
      anomalies.push({ paymentId: payment.id, code: 'invalid_credits_granted' });
    }
    if (createdAt === null) anomalies.push({ paymentId: payment.id, code: 'invalid_created_at' });
    if (!amountValid || !creditsValid) continue;

    const classification = payment.type === 'build_fee' ? classifyBuildContract(payment) : null;
    const refundAt = instant(payment.refundedAt);
    const hasRefundMarker = payment.refundedAt !== null && payment.refundedAt !== undefined;
    const hasRefundAmount = payment.refundAmount !== null && payment.refundAmount !== undefined;
    const refundAmount: number | null = payment.refundAmount ?? null;
    const refundValid =
      hasRefundMarker === hasRefundAmount
      && (!hasRefundMarker || (
        refundAt !== null
        && refundAmount !== null
        && isKrw(refundAmount)
        && refundAmount <= payment.amount
      ));
    if (!refundValid) anomalies.push({ paymentId: payment.id, code: 'invalid_refund' });

    if (createdAt !== null && inRange(createdAt, start, end)) {
      for (const allocation of grossAllocations(payment, classification)) {
        addGross(segments[allocation.segment], allocation.amount);
      }
      addGross(receipts, payment.amount);
    }

    if (
      refundValid
      && refundAt !== null
      && refundAmount !== null
      && inRange(refundAt, start, end)
    ) {
      for (const allocation of refundAllocations(payment, refundAmount, classification)) {
        addRefund(segments[allocation.segment], allocation.amount);
      }
      addRefund(receipts, refundAmount);
    }

    const fullyRefunded = refundValid
      && refundAt !== null
      && refundAmount === payment.amount;
    if (
      createdAt !== null
      && refundValid
      && payment.type === 'build_fee'
      && classification?.base === 'launch'
      && !fullyRefunded
    ) {
      launchContracts += 1;
    }
  }

  const operatingRevenueNetKrw =
    segments.launchBuild.netKrw
    + segments.listBuild.netKrw
    + segments.videoAddon.netKrw
    + segments.unclassifiedBuild.netKrw
    + segments.subscription.netKrw;
  const targetProgress = Math.min(
    Math.max(operatingRevenueNetKrw / ADMIN_MONTHLY_REVENUE_TARGET_KRW, 0),
    1,
  );
  const limit = quantityOfferLimit();

  return {
    month,
    segments,
    receipts,
    operatingRevenueNetKrw,
    targetKrw: ADMIN_MONTHLY_REVENUE_TARGET_KRW,
    targetProgress,
    launchOffer: {
      contracts: launchContracts,
      limit,
      remaining: limit === null ? null : Math.max(limit - launchContracts, 0),
      reachedLimit: limit !== null && launchContracts >= limit,
    },
    anomalies,
  };
}
