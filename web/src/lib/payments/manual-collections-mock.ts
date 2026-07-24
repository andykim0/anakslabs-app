import { MockCreditsService } from '@/lib/data/mock/credits';
import { getMockStore, type MockStore } from '@/lib/data/mock/store';
import {
  getMockSiteSubscription,
  reconcileMockSiteSubscriptionManualReversal,
  renewMockSiteSubscription,
} from '@/lib/subscriptions/mock';
import { PRICING } from '@/lib/pricing';
import { subscriptionGrantIdempotencyKey } from '@/lib/subscriptions/core';
import type { Payment } from '@/lib/types/domain';
import {
  manualCollectionIdempotencyKey,
  manualCollectionQuote,
  normalizeLinkManualCollectionClientInput,
  normalizeLinkManualCollectionSiteInput,
  normalizeRecordManualCollectionInput,
  normalizeReverseManualCollectionInput,
  type LinkManualCollectionClientInput,
  type LinkManualCollectionSiteInput,
  type ManualCollectionLink,
  type ManualCollectionMutationResult,
  type ManualCollectionsRepository,
  type ManualPaymentEntry,
  type ManualPaymentRecord,
  type RecordManualCollectionInput,
  type ReverseManualCollectionInput,
} from './manual-collection-core';

function mockEntries(): Map<string, ManualPaymentEntry> {
  const store = getMockStore();
  return (store.manualPaymentEntries ??= new Map());
}

function mockLinks(): ManualCollectionLink[] {
  const store = getMockStore();
  return (store.manualPaymentLinks ??= []);
}

// Manual entry rows intentionally stay aligned with the real SQL contract, so
// the mock keeps its renewal-period join as server-only side state. resetMockStore
// swaps the key and therefore resets this evidence without widening persisted rows.
const manualRenewalPeriodEnds = new WeakMap<MockStore, Map<string, string>>();

function renewalPeriodEnds(store: MockStore): Map<string, string> {
  let periods = manualRenewalPeriodEnds.get(store);
  if (!periods) {
    periods = new Map();
    manualRenewalPeriodEnds.set(store, periods);
  }
  return periods;
}

function sourceEntry(entry: ManualPaymentEntry): ManualPaymentEntry {
  if (entry.direction === 'receipt' || !entry.reversesEntryId) return entry;
  return mockEntries().get(entry.reversesEntryId) ?? entry;
}

function linksFor(entry: ManualPaymentEntry): ManualCollectionLink[] {
  const source = sourceEntry(entry);
  return mockLinks()
    .filter((link) => link.entryId === source.id)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function projectEntry(entry: ManualPaymentEntry): ManualPaymentEntry {
  const source = sourceEntry(entry);
  const links = linksFor(source);
  const clientLink = links.find((link) => link.kind === 'client');
  const siteLink = links.find((link) => link.kind === 'site');
  return {
    ...structuredClone(entry),
    clientId: source.clientId ?? clientLink?.clientId ?? null,
    siteId: source.siteId ?? siteLink?.siteId ?? null,
    paymentId: entry.direction === 'receipt'
      ? (source.paymentId ?? clientLink?.paymentId ?? null)
      : null,
  };
}

function recordFor(entry: ManualPaymentEntry): ManualPaymentRecord {
  const store = getMockStore();
  const projected = projectEntry(entry);
  return {
    entry: projected,
    payment: projected.paymentId
      ? structuredClone(store.payments.get(projected.paymentId) ?? null)
      : null,
    links: structuredClone(linksFor(entry)),
  };
}

function sameReceipt(
  entry: ManualPaymentEntry,
  input: ReturnType<typeof normalizeRecordManualCollectionInput>,
): boolean {
  return entry.direction === 'receipt'
    && entry.clientId === input.clientId
    && entry.customerName === input.customerName
    && entry.customerContact === input.customerContact
    && entry.siteId === input.siteId
    && entry.productKind === input.productKind
    && entry.creditPackCredits === input.creditPackCredits
    && entry.amountKrw === input.amountKrw
    && entry.channel === input.channel;
}

function hasReversal(entryId: string): boolean {
  return [...mockEntries().values()].some((entry) => entry.reversesEntryId === entryId);
}

function manualRenewalPaymentId(
  entries: ReadonlyMap<string, ManualPaymentEntry>,
  idempotencyKey: string,
): string | null {
  const reversedReceiptIds = new Set([...entries.values()].flatMap((entry) =>
    entry.direction === 'reversal' && entry.reversesEntryId
      ? [entry.reversesEntryId]
      : []));
  const receipt = [...entries.values()].find((entry) => {
    const projected = projectEntry(entry);
    return projected.direction === 'receipt'
      && projected.productKind === 'subscription'
      && projected.paymentId !== null
      && !reversedReceiptIds.has(projected.id)
      && manualCollectionIdempotencyKey(projected) === idempotencyKey;
  });
  return receipt ? projectEntry(receipt).paymentId : null;
}

export class MockManualCollectionsRepository implements ManualCollectionsRepository {
  constructor(private readonly now: () => Date = () => new Date()) {}

  private async materializeClient(
    entry: ManualPaymentEntry,
    clientId: string,
    memo: string | null,
    at: Date,
  ): Promise<void> {
    const store = getMockStore();
    const quote = manualCollectionQuote({
      productKind: entry.productKind,
      creditPackCredits: entry.creditPackCredits ?? undefined,
    });
    if (!quote) throw new Error('MANUAL_COLLECTION_PRODUCT_INVALID');
    if (entry.productKind === 'subscription') getMockSiteSubscription(clientId);

    const payment: Payment = {
      id: crypto.randomUUID(),
      clientId,
      type: quote.paymentType,
      amount: entry.amountKrw,
      creditsGranted: entry.productKind === 'subscription' ? 0 : quote.creditsGranted,
      providerPaymentKey: null,
      createdAt: entry.createdAt,
      refundedAt: null,
      refundAmount: null,
    };
    store.payments.set(payment.id, payment);

    let subscriptionPeriodEnd: string | null = null;
    if (entry.productKind === 'subscription') {
      const renewal = renewMockSiteSubscription({
        clientId,
        idempotencyKey: manualCollectionIdempotencyKey(entry),
        source: 'admin_manual',
        periodMonths: PRICING.subscription.periodMonths,
        at,
      });
      subscriptionPeriodEnd = renewal.state.currentPeriodEnd;
      const credits = new MockCreditsService();
      const before = (await credits.getLedger(clientId)).length;
      await credits.grant({
        clientId,
        amount: quote.creditsGranted,
        reason: 'subscription_grant',
        referenceId: payment.id,
        idempotencyKey: subscriptionGrantIdempotencyKey(clientId, at),
      });
      const after = (await credits.getLedger(clientId)).length;
      payment.creditsGranted = after > before ? quote.creditsGranted : 0;
    } else if (entry.productKind === 'credit_pack') {
      await new MockCreditsService().grant({
        clientId,
        amount: quote.creditsGranted,
        reason: 'purchase',
        referenceId: payment.id,
        idempotencyKey: `purchase:${manualCollectionIdempotencyKey(entry)}`,
      });
    }

    mockLinks().push({
      id: crypto.randomUUID(),
      entryId: entry.id,
      kind: 'client',
      clientId,
      siteId: null,
      paymentId: payment.id,
      memo,
      createdAt: at.toISOString(),
    });
    if (subscriptionPeriodEnd) {
      renewalPeriodEnds(store).set(manualCollectionIdempotencyKey(entry), subscriptionPeriodEnd);
    }
  }

  async listAll(): Promise<ManualPaymentRecord[]> {
    return [...mockEntries().values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(recordFor);
  }

  async record(rawInput: RecordManualCollectionInput): Promise<ManualCollectionMutationResult> {
    const input = normalizeRecordManualCollectionInput(rawInput);
    const store = getMockStore();
    const entries = mockEntries();
    const existing = [...entries.values()].find(
      (entry) => entry.channel === input.channel
        && entry.collectionReference === input.collectionReference,
    );
    if (existing) {
      if (!sameReceipt(existing, input)) {
        throw new Error('MANUAL_COLLECTION_REFERENCE_CONFLICT');
      }
      return { duplicated: true, record: recordFor(existing) };
    }

    if (input.clientId && !store.clients.has(input.clientId)) {
      throw new Error('MANUAL_COLLECTION_CLIENT_NOT_FOUND');
    }
    if (input.siteId) {
      const site = store.sites.get(input.siteId);
      if (!site || site.clientId !== input.clientId) {
        throw new Error('MANUAL_COLLECTION_SITE_OWNERSHIP_MISMATCH');
      }
    }

    const createdAt = this.now();
    const entry: ManualPaymentEntry = {
      id: crypto.randomUUID(),
      paymentId: null,
      clientId: input.clientId,
      siteId: input.siteId,
      customerName: input.customerName,
      customerContact: input.customerContact,
      creditPackCredits: input.creditPackCredits,
      productKind: input.productKind,
      direction: 'receipt',
      amountKrw: input.amountKrw,
      channel: input.channel,
      collectionReference: input.collectionReference,
      memo: input.memo,
      reversesEntryId: null,
      createdAt: createdAt.toISOString(),
    };
    entries.set(entry.id, entry);
    if (input.clientId) {
      await this.materializeClient(entry, input.clientId, '수금 기록 시 기존 계정 연결', createdAt);
    }
    return { duplicated: false, record: recordFor(entry) };
  }

  async linkClient(
    rawInput: LinkManualCollectionClientInput,
  ): Promise<ManualCollectionMutationResult> {
    const input = normalizeLinkManualCollectionClientInput(rawInput);
    const store = getMockStore();
    const entry = mockEntries().get(input.entryId);
    if (!entry || entry.direction !== 'receipt') {
      throw new Error('MANUAL_COLLECTION_NOT_FOUND');
    }
    if (hasReversal(entry.id)) throw new Error('MANUAL_COLLECTION_CANCELLED');
    if (!store.clients.has(input.clientId)) throw new Error('MANUAL_COLLECTION_CLIENT_NOT_FOUND');

    const existing = projectEntry(entry).clientId;
    if (existing) {
      if (existing !== input.clientId) throw new Error('MANUAL_COLLECTION_CLIENT_ALREADY_LINKED');
      return { duplicated: true, record: recordFor(entry) };
    }
    await this.materializeClient(entry, input.clientId, input.memo, this.now());
    return { duplicated: false, record: recordFor(entry) };
  }

  async linkSite(
    rawInput: LinkManualCollectionSiteInput,
  ): Promise<ManualCollectionMutationResult> {
    const input = normalizeLinkManualCollectionSiteInput(rawInput);
    const store = getMockStore();
    const entry = mockEntries().get(input.entryId);
    if (!entry || entry.direction !== 'receipt') {
      throw new Error('MANUAL_COLLECTION_NOT_FOUND');
    }
    if (hasReversal(entry.id)) throw new Error('MANUAL_COLLECTION_CANCELLED');
    const projected = projectEntry(entry);
    if (!projected.clientId) throw new Error('MANUAL_COLLECTION_CLIENT_REQUIRED');
    if (projected.siteId) {
      if (projected.siteId !== input.siteId) throw new Error('MANUAL_COLLECTION_SITE_ALREADY_LINKED');
      return { duplicated: true, record: recordFor(entry) };
    }
    const site = store.sites.get(input.siteId);
    if (!site || site.clientId !== projected.clientId) {
      throw new Error('MANUAL_COLLECTION_SITE_OWNERSHIP_MISMATCH');
    }
    mockLinks().push({
      id: crypto.randomUUID(),
      entryId: entry.id,
      kind: 'site',
      clientId: projected.clientId,
      siteId: site.id,
      paymentId: null,
      memo: input.memo,
      createdAt: this.now().toISOString(),
    });
    return { duplicated: false, record: recordFor(entry) };
  }

  async reverse(rawInput: ReverseManualCollectionInput): Promise<ManualCollectionMutationResult> {
    const input = normalizeReverseManualCollectionInput(rawInput);
    const reversedAt = this.now();
    const store = getMockStore();
    const entries = mockEntries();
    const original = entries.get(input.entryId);
    if (!original || original.direction !== 'receipt') {
      throw new Error('MANUAL_REVERSAL_RECEIPT_NOT_FOUND');
    }
    const existing = [...entries.values()].find(
      (entry) => entry.reversesEntryId === original.id,
    );
    if (existing) {
      if (existing.collectionReference !== input.collectionReference) {
        throw new Error('MANUAL_REVERSAL_ALREADY_EXISTS');
      }
      return { duplicated: true, record: recordFor(existing) };
    }
    if ([...entries.values()].some(
      (entry) => entry.channel === original.channel
        && entry.collectionReference === input.collectionReference,
    )) {
      throw new Error('MANUAL_REVERSAL_REFERENCE_CONFLICT');
    }

    const projected = projectEntry(original);
    const payment = projected.paymentId ? store.payments.get(projected.paymentId) : null;
    if (projected.paymentId && !payment) throw new Error('MANUAL_COLLECTION_PAYMENT_MISSING');
    if (payment && projected.clientId && original.productKind === 'subscription') {
      const renewalKey = manualCollectionIdempotencyKey(original);
      const periodEnd = renewalPeriodEnds(store).get(renewalKey);
      const authoritative = getMockSiteSubscription(projected.clientId);
      if (!periodEnd || authoritative?.currentPeriodEnd !== periodEnd) {
        throw new Error('MANUAL_REVERSAL_SUBSCRIPTION_NOT_LATEST');
      }
    }

    if (payment && projected.clientId) {
      const credits = new MockCreditsService();
      let clawed = 0;
      const transferableSubscriptionLots: Array<{
        grantId: string;
        amount: number;
        expiresAt: string | null;
      }> = [];
      if (original.productKind === 'subscription' || original.productKind === 'credit_pack') {
        const grantReason = original.productKind === 'subscription'
          ? 'subscription_grant'
          : 'purchase';
        if (original.productKind === 'subscription') {
          for (const candidate of await credits.getLedger(projected.clientId)) {
            if (
              candidate.referenceId !== payment.id
              || candidate.reason !== grantReason
              || candidate.amount <= 0
            ) continue;
            const lot = store.lots.find((value) => value.entryId === candidate.id);
            if (!lot || lot.remaining <= 0) continue;
            transferableSubscriptionLots.push({
              grantId: candidate.id,
              amount: lot.remaining,
              expiresAt: candidate.expiresAt,
            });
          }
        }
        clawed = await credits.clawbackGrant({
          clientId: projected.clientId,
          referenceId: payment.id,
          grantReason,
        });
      }
      if (original.productKind === 'subscription') {
        const reconciliation = reconcileMockSiteSubscriptionManualReversal({
          clientId: projected.clientId,
          idempotencyKey: manualCollectionIdempotencyKey(original),
          resolveManualPaymentId: (idempotencyKey) =>
            manualRenewalPaymentId(entries, idempotencyKey),
          at: reversedAt,
        });
        if (clawed > 0 && Date.parse(reconciliation.state.currentPeriodEnd) > reversedAt.getTime()) {
          if (!reconciliation.replacementPaymentId) {
            throw new Error('MANUAL_REVERSAL_REPLACEMENT_PAYMENT_MISSING');
          }
          for (const lot of transferableSubscriptionLots) {
            await credits.grant({
              clientId: projected.clientId,
              amount: lot.amount,
              reason: 'subscription_grant',
              referenceId: reconciliation.replacementPaymentId,
              idempotencyKey: `manual_reversal_regrant:${original.id}:${lot.grantId}`,
              expiresAt: lot.expiresAt ?? undefined,
            });
          }
        }
      }
    }

    const reversal: ManualPaymentEntry = {
      id: crypto.randomUUID(),
      paymentId: null,
      clientId: original.clientId,
      siteId: original.siteId,
      customerName: original.customerName,
      customerContact: original.customerContact,
      creditPackCredits: original.creditPackCredits,
      productKind: original.productKind,
      direction: 'reversal',
      amountKrw: original.amountKrw,
      channel: original.channel,
      collectionReference: input.collectionReference,
      memo: input.memo,
      reversesEntryId: original.id,
      createdAt: reversedAt.toISOString(),
    };
    entries.set(reversal.id, reversal);
    return { duplicated: false, record: recordFor(reversal) };
  }
}
