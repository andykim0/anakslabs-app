import { INITIAL_GRANT } from '@/lib/credits/constants';
import {
  manualCollectionCustomerKey,
  manualCollectionLaunchCounterKey,
  manualCollectionQuote,
  type ManualPaymentEntry,
} from '@/lib/payments/manual-collection-core';
import { LAUNCH_OFFER, LEGACY_PRICING, PRICING } from '@/lib/pricing';
import type { Payment, Site } from '@/lib/types/domain';

/** Internal operating target, not a customer-facing product price. */
export const ADMIN_MONTHLY_REVENUE_TARGET_KRW = 10_000_000;

const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;

export interface KstRevenueMonth {
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
  unclassifiedBuild: RevenueBucket;
  subscription: RevenueBucket;
  creditPack: RevenueBucket;
}

export type AdminPaymentAnomalyCode =
  | 'duplicate_payment_id'
  | 'invalid_amount'
  | 'invalid_credits_granted'
  | 'invalid_created_at'
  | 'invalid_refund'
  | 'manual_metadata_missing'
  | 'manual_evidence_invalid'
  | 'launch_site_unresolved';

export interface AdminPaymentAnomaly {
  paymentId: string;
  code: AdminPaymentAnomalyCode;
}

export interface LaunchOfferCounterMetrics {
  /** Unique sites with at least one unreversed exact launch receipt. */
  contracts: number;
  limit: number | null;
  remaining: number | null;
  reachedLimit: boolean;
}

export interface AdminOpsRevenueMetrics {
  month: KstRevenueMonth;
  segments: AdminRevenueSegments;
  receipts: RevenueBucket;
  sources: {
    provider: RevenueBucket;
    manual: RevenueBucket;
  };
  operatingRevenueBySourceKrw: {
    provider: number;
    manual: number;
  };
  operatingRevenueNetKrw: number;
  targetKrw: number;
  targetProgress: number;
  launchOffer: LaunchOfferCounterMetrics;
  anomalies: AdminPaymentAnomaly[];
  anomalyPaymentCount: number;
}

export interface AdminOpsRevenueOptions {
  manualEntries?: readonly ManualPaymentEntry[];
  /** Server-owned site evidence. Provider rows without a site bind only when ownership is unambiguous. */
  sites?: readonly Pick<Site, 'id' | 'clientId'>[];
}

type BuildContract =
  | { base: 'launch' | 'list'; videoAddon: boolean }
  | { base: 'unclassified'; videoAddon: false };
type SegmentKey = keyof AdminRevenueSegments;
type SourceKey = 'provider' | 'manual';
type Allocation = { segment: SegmentKey; amount: number };

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

/** Exact provider build combinations. Historical/negotiated rows fail closed. */
export function classifyBuildContract(payment: Pick<Payment, 'amount' | 'creditsGranted'>): BuildContract {
  if (payment.creditsGranted === INITIAL_GRANT.basic
    && payment.amount === LEGACY_PRICING.build.launch) {
    return { base: 'launch', videoAddon: false };
  }
  if (payment.creditsGranted === INITIAL_GRANT.basic
    && payment.amount === LEGACY_PRICING.build.list) {
    return { base: 'list', videoAddon: false };
  }
  if (
    payment.creditsGranted === INITIAL_GRANT.premium
    && payment.amount === LEGACY_PRICING.build.launch + PRICING.videoHeroAddon
  ) {
    return { base: 'launch', videoAddon: true };
  }
  if (
    payment.creditsGranted === INITIAL_GRANT.premium
    && payment.amount === LEGACY_PRICING.build.list + PRICING.videoHeroAddon
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

function buildAllocations(payment: Pick<Payment, 'amount'>, classification: BuildContract): Allocation[] {
  if (classification.base === 'unclassified') {
    return [{ segment: 'unclassifiedBuild', amount: payment.amount }];
  }
  const baseSegment = classification.base === 'launch' ? 'launchBuild' : 'listBuild';
  return classification.videoAddon
    ? [
        { segment: baseSegment, amount: LEGACY_PRICING.build[classification.base] },
        { segment: 'videoAddon', amount: PRICING.videoHeroAddon },
      ]
    : [{ segment: baseSegment, amount: payment.amount }];
}

function providerGrossAllocations(payment: Payment, classification: BuildContract | null): Allocation[] {
  if (payment.type === 'build_fee') {
    return buildAllocations(payment, classification ?? { base: 'unclassified', videoAddon: false });
  }
  if (payment.type === 'maintenance_subscription') {
    return [{ segment: 'subscription', amount: payment.amount }];
  }
  if (payment.type === 'premium_addon') {
    return [{ segment: 'videoAddon', amount: payment.amount }];
  }
  return [{ segment: 'creditPack', amount: payment.amount }];
}

function providerRefundAllocations(
  payment: Payment,
  refundAmount: number,
  classification: BuildContract | null,
): Allocation[] {
  if (payment.type === 'maintenance_subscription') {
    return [{ segment: 'subscription', amount: refundAmount }];
  }
  if (payment.type === 'premium_addon') {
    return [{ segment: 'videoAddon', amount: refundAmount }];
  }
  if (payment.type === 'credit_pack') return [{ segment: 'creditPack', amount: refundAmount }];
  if (refundAmount === payment.amount) {
    return buildAllocations(payment, classification ?? { base: 'unclassified', videoAddon: false });
  }
  return [{ segment: 'unclassifiedBuild', amount: refundAmount }];
}

function manualAllocations(entry: ManualPaymentEntry): Allocation[] {
  switch (entry.productKind) {
    case 'launch_build':
      return [{ segment: 'launchBuild', amount: entry.amountKrw }];
    case 'list_build':
      return [{ segment: 'listBuild', amount: entry.amountKrw }];
    case 'video_addon':
      return [{ segment: 'videoAddon', amount: entry.amountKrw }];
    case 'subscription':
      return [{ segment: 'subscription', amount: entry.amountKrw }];
    case 'credit_pack':
      return [{ segment: 'creditPack', amount: entry.amountKrw }];
  }
}

function inRangeAsOf(value: number, start: number, end: number, nowMs: number): boolean {
  return value >= start && value < end && value <= nowMs;
}

function quantityOfferLimit(): number | null {
  return LAUNCH_OFFER.kind === 'quantity'
    && Number.isSafeInteger(LAUNCH_OFFER.limitCount)
    && (LAUNCH_OFFER.limitCount ?? 0) > 0
    ? LAUNCH_OFFER.limitCount
    : null;
}

function manualReceiptMatchesPayment(entry: ManualPaymentEntry, payment: Payment): boolean {
  const quote = manualCollectionQuote({
    productKind: entry.productKind,
    creditPackCredits: entry.productKind === 'credit_pack' ? payment.creditsGranted : undefined,
  });
  return entry.direction === 'receipt'
    && entry.paymentId === payment.id
    && entry.clientId !== null
    && entry.clientId === payment.clientId
    && quote !== null
    && quote.paymentType === payment.type
    && quote.amountKrw === payment.amount
    && entry.amountKrw === payment.amount;
}

function providerLaunchSiteId(input: {
  payment: Payment;
  options: AdminOpsRevenueOptions;
}): string | null {
  if (!input.options.sites) {
    // Backward-compatible pure-call fallback. Production always supplies sites.
    return `legacy-client:${input.payment.clientId}`;
  }
  const owned = input.options.sites.filter((site) => site.clientId === input.payment.clientId);
  return owned.length === 1 ? owned[0].id : null;
}

function applyEconomicEvent(input: {
  allocations: readonly Allocation[];
  amount: number;
  direction: 'gross' | 'refund';
  source: SourceKey;
  segments: AdminRevenueSegments;
  receipts: RevenueBucket;
  sources: Record<SourceKey, RevenueBucket>;
  operatingBySource: Record<SourceKey, number>;
}): void {
  const add = input.direction === 'gross' ? addGross : addRefund;
  for (const allocation of input.allocations) {
    add(input.segments[allocation.segment], allocation.amount);
    if (allocation.segment !== 'creditPack') {
      input.operatingBySource[input.source] += input.direction === 'gross'
        ? allocation.amount
        : -allocation.amount;
    }
  }
  add(input.receipts, input.amount);
  add(input.sources[input.source], input.amount);
}

/** Cash-basis metrics from provider payments plus immutable manual evidence. */
export function buildAdminOpsRevenueMetrics(
  payments: readonly Payment[],
  now: Date = new Date(),
  options: AdminOpsRevenueOptions = {},
): AdminOpsRevenueMetrics {
  const month = currentKstRevenueMonth(now);
  const nowMs = now.getTime();
  const start = Date.parse(month.startIso);
  const end = Date.parse(month.endExclusiveIso);
  const segments = emptySegments();
  const receipts = emptyBucket();
  const sources = { provider: emptyBucket(), manual: emptyBucket() };
  const operatingBySource = { provider: 0, manual: 0 };
  const anomalies: AdminPaymentAnomaly[] = [];
  const seenIds = new Set<string>();
  const launchContractBalance = new Map<string, number>();

  const manualEntries = options.manualEntries ?? [];
  const manualReceiptByPaymentId = new Map(
    manualEntries.flatMap((entry) =>
      entry.direction === 'receipt' && entry.paymentId ? [[entry.paymentId, entry] as const] : []),
  );
  const manualReceiptById = new Map(
    manualEntries.filter((entry) => entry.direction === 'receipt').map((entry) => [entry.id, entry]),
  );
  const launchSitesByCustomer = new Map<string, Set<string>>();
  for (const entry of manualReceiptById.values()) {
    if (entry.productKind !== 'launch_build' || !entry.siteId) continue;
    const customerKey = manualCollectionCustomerKey(entry);
    if (!customerKey) continue;
    const sites = launchSitesByCustomer.get(customerKey) ?? new Set<string>();
    sites.add(entry.siteId);
    launchSitesByCustomer.set(customerKey, sites);
  }

  const resolvedManualLaunchCounterKey = (entry: ManualPaymentEntry): string | null => {
    const customerKey = manualCollectionCustomerKey(entry);
    const linkedSites = customerKey ? launchSitesByCustomer.get(customerKey) : undefined;
    if (linkedSites?.size === 1) return `site:${[...linkedSites][0]}`;
    return manualCollectionLaunchCounterKey(entry);
  };

  const adjustLaunchContract = (counterKey: string | null, delta: number, evidenceId: string) => {
    if (!counterKey) {
      anomalies.push({ paymentId: evidenceId, code: 'launch_site_unresolved' });
      return;
    }
    launchContractBalance.set(
      counterKey,
      (launchContractBalance.get(counterKey) ?? 0) + delta,
    );
  };

  const adjustLaunchSite = (siteId: string | null, delta: number, evidenceId: string) =>
    adjustLaunchContract(siteId ? `site:${siteId}` : null, delta, evidenceId);

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
    if (!creditsValid) anomalies.push({ paymentId: payment.id, code: 'invalid_credits_granted' });
    if (createdAt === null) anomalies.push({ paymentId: payment.id, code: 'invalid_created_at' });
    if (!amountValid || !creditsValid) continue;

    const manualEntry = manualReceiptByPaymentId.get(payment.id);
    if (manualEntry) {
      if (!manualReceiptMatchesPayment(manualEntry, payment) || createdAt === null) {
        anomalies.push({ paymentId: payment.id, code: 'manual_evidence_invalid' });
        continue;
      }
      if (payment.refundedAt || payment.refundAmount !== null && payment.refundAmount !== undefined) {
        anomalies.push({ paymentId: payment.id, code: 'invalid_refund' });
      }
      const entryAt = instant(manualEntry.createdAt);
      if (entryAt === null) {
        anomalies.push({ paymentId: payment.id, code: 'invalid_created_at' });
        continue;
      }
      if (inRangeAsOf(entryAt, start, end, nowMs)) {
        applyEconomicEvent({
          allocations: manualAllocations(manualEntry),
          amount: manualEntry.amountKrw,
          direction: 'gross',
          source: 'manual',
          segments,
          receipts,
          sources,
          operatingBySource,
        });
      }
      if (manualEntry.productKind === 'launch_build' && entryAt <= nowMs) {
        adjustLaunchContract(resolvedManualLaunchCounterKey(manualEntry), 1, manualEntry.id);
      }
      continue;
    }

    if (payment.providerPaymentKey === null) {
      anomalies.push({ paymentId: payment.id, code: 'manual_metadata_missing' });
      continue;
    }

    const classification = payment.type === 'build_fee' ? classifyBuildContract(payment) : null;
    const refundAt = instant(payment.refundedAt);
    const hasRefundMarker = payment.refundedAt !== null && payment.refundedAt !== undefined;
    const hasRefundAmount = payment.refundAmount !== null && payment.refundAmount !== undefined;
    const refundAmount = payment.refundAmount ?? null;
    const refundValid = hasRefundMarker === hasRefundAmount
      && (!hasRefundMarker || (
        createdAt !== null
        && refundAt !== null
        && refundAmount !== null
        && isKrw(refundAmount)
        && refundAmount <= payment.amount
        && refundAt >= createdAt
      ));
    if (!refundValid) anomalies.push({ paymentId: payment.id, code: 'invalid_refund' });

    if (createdAt !== null && inRangeAsOf(createdAt, start, end, nowMs)) {
      applyEconomicEvent({
        allocations: providerGrossAllocations(payment, classification),
        amount: payment.amount,
        direction: 'gross',
        source: 'provider',
        segments,
        receipts,
        sources,
        operatingBySource,
      });
    }
    if (refundValid && refundAt !== null && refundAmount !== null
      && inRangeAsOf(refundAt, start, end, nowMs)) {
      applyEconomicEvent({
        allocations: providerRefundAllocations(payment, refundAmount, classification),
        amount: refundAmount,
        direction: 'refund',
        source: 'provider',
        segments,
        receipts,
        sources,
        operatingBySource,
      });
    }

    if (
      createdAt !== null
      && createdAt <= nowMs
      && refundValid
      && payment.type === 'build_fee'
      && classification?.base === 'launch'
    ) {
      const siteId = providerLaunchSiteId({ payment, options });
      adjustLaunchSite(siteId, 1, payment.id);
      const fullyRefunded = refundAt !== null && refundAt <= nowMs && refundAmount === payment.amount;
      if (fullyRefunded) adjustLaunchSite(siteId, -1, payment.id);
    }
  }

  // 계정 연결 전 수금은 payments 행이 아직 없지만, 가격표와 일치하는 append-only
  // 수금 증거 자체로 현금주의 매출에 포함한다. 사후 연결되면 paymentId가 투영되어 위 경로만 탄다.
  for (const entry of manualEntries.filter((candidate) =>
    candidate.direction === 'receipt' && candidate.paymentId === null)) {
    const quote = manualCollectionQuote({
      productKind: entry.productKind,
      creditPackCredits: entry.creditPackCredits ?? undefined,
    });
    const entryAt = instant(entry.createdAt);
    if (!quote || quote.amountKrw !== entry.amountKrw || entryAt === null) {
      anomalies.push({ paymentId: entry.id, code: 'manual_evidence_invalid' });
      continue;
    }
    if (inRangeAsOf(entryAt, start, end, nowMs)) {
      applyEconomicEvent({
        allocations: manualAllocations(entry),
        amount: entry.amountKrw,
        direction: 'gross',
        source: 'manual',
        segments,
        receipts,
        sources,
        operatingBySource,
      });
    }
    if (entry.productKind === 'launch_build' && entryAt <= nowMs) {
      adjustLaunchContract(resolvedManualLaunchCounterKey(entry), 1, entry.id);
    }
  }

  for (const reversal of manualEntries.filter((entry) => entry.direction === 'reversal')) {
    const original = reversal.reversesEntryId
      ? manualReceiptById.get(reversal.reversesEntryId)
      : undefined;
    const reversalAt = instant(reversal.createdAt);
    if (
      !original
      || reversal.paymentId !== null
      || reversal.clientId !== original.clientId
      || reversal.siteId !== original.siteId
      || reversal.productKind !== original.productKind
      || reversal.amountKrw !== original.amountKrw
      || reversalAt === null
    ) {
      anomalies.push({ paymentId: reversal.id, code: 'manual_evidence_invalid' });
      continue;
    }
    if (inRangeAsOf(reversalAt, start, end, nowMs)) {
      applyEconomicEvent({
        allocations: manualAllocations(reversal),
        amount: reversal.amountKrw,
        direction: 'refund',
        source: 'manual',
        segments,
        receipts,
        sources,
        operatingBySource,
      });
    }
    if (reversal.productKind === 'launch_build' && reversalAt <= nowMs) {
      adjustLaunchContract(resolvedManualLaunchCounterKey(reversal), -1, reversal.id);
    }
  }

  const operatingRevenueNetKrw = operatingBySource.provider + operatingBySource.manual;
  const targetProgress = Math.min(
    Math.max(operatingRevenueNetKrw / ADMIN_MONTHLY_REVENUE_TARGET_KRW, 0),
    1,
  );
  const limit = quantityOfferLimit();
  const launchContracts = [...launchContractBalance.values()].filter((balance) => balance > 0).length;

  return {
    month,
    segments,
    receipts,
    sources,
    operatingRevenueBySourceKrw: operatingBySource,
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
    anomalyPaymentCount: new Set(anomalies.map((anomaly) => anomaly.paymentId)).size,
  };
}
