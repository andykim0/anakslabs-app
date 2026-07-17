import { MockCreditsService } from '@/lib/data/mock/credits';
import { getMockStore } from '@/lib/data/mock/store';
import {
  getMockSiteSubscription,
  reconcileMockSiteSubscriptionManualReversal,
  renewMockSiteSubscription,
} from '@/lib/subscriptions/mock';
import { subscriptionGrantIdempotencyKey } from '@/lib/subscriptions/core';
import type { Payment } from '@/lib/types/domain';
import {
  manualCollectionIdempotencyKey,
  normalizeRecordManualCollectionInput,
  normalizeReverseManualCollectionInput,
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

function sameReceipt(
  entry: ManualPaymentEntry,
  input: ReturnType<typeof normalizeRecordManualCollectionInput>,
): boolean {
  return entry.direction === 'receipt'
    && entry.clientId === input.clientId
    && entry.siteId === input.siteId
    && entry.productKind === input.productKind
    && entry.amountKrw === input.amountKrw
    && entry.channel === input.channel;
}

export class MockManualCollectionsRepository implements ManualCollectionsRepository {
  async listAll(): Promise<ManualPaymentRecord[]> {
    const store = getMockStore();
    return [...mockEntries().values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((entry) => ({
        entry: structuredClone(entry),
        payment: entry.paymentId
          ? structuredClone(store.payments.get(entry.paymentId) ?? null)
          : null,
      }));
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
      if (!sameReceipt(existing, input) || !existing.paymentId) {
        throw new Error('MANUAL_COLLECTION_REFERENCE_CONFLICT');
      }
      const payment = store.payments.get(existing.paymentId);
      if (!payment) throw new Error('MANUAL_COLLECTION_PAYMENT_MISSING');
      return {
        duplicated: true,
        record: { entry: structuredClone(existing), payment: structuredClone(payment) },
      };
    }

    if (!store.clients.has(input.clientId)) throw new Error('MANUAL_COLLECTION_CLIENT_NOT_FOUND');
    if (input.siteId) {
      const site = store.sites.get(input.siteId);
      if (!site || site.clientId !== input.clientId) {
        throw new Error('MANUAL_COLLECTION_SITE_OWNERSHIP_MISMATCH');
      }
    }

    if (input.productKind === 'subscription') getMockSiteSubscription(input.clientId);
    const createdAt = new Date().toISOString();
    const payment: Payment = {
      id: crypto.randomUUID(),
      clientId: input.clientId,
      type: input.quote.paymentType,
      amount: input.amountKrw,
      creditsGranted: input.productKind === 'subscription' ? 0 : input.quote.creditsGranted,
      providerPaymentKey: null,
      createdAt,
      refundedAt: null,
      refundAmount: null,
    };
    store.payments.set(payment.id, payment);

    if (input.productKind === 'subscription') {
      const at = new Date(createdAt);
      renewMockSiteSubscription({
        clientId: input.clientId,
        idempotencyKey: manualCollectionIdempotencyKey(input),
        source: 'admin_manual',
        at,
      });
      const credits = new MockCreditsService();
      const before = (await credits.getLedger(input.clientId)).length;
      await credits.grant({
        clientId: input.clientId,
        amount: input.quote.creditsGranted,
        reason: 'subscription_grant',
        referenceId: payment.id,
        idempotencyKey: subscriptionGrantIdempotencyKey(input.clientId, at),
      });
      const after = (await credits.getLedger(input.clientId)).length;
      payment.creditsGranted = after > before ? input.quote.creditsGranted : 0;
    } else if (input.productKind === 'credit_pack') {
      await new MockCreditsService().grant({
        clientId: input.clientId,
        amount: input.quote.creditsGranted,
        reason: 'purchase',
        referenceId: payment.id,
        idempotencyKey: `purchase:${manualCollectionIdempotencyKey(input)}`,
      });
    }

    const entry: ManualPaymentEntry = {
      id: crypto.randomUUID(),
      paymentId: payment.id,
      clientId: input.clientId,
      siteId: input.siteId,
      productKind: input.productKind,
      direction: 'receipt',
      amountKrw: input.amountKrw,
      channel: input.channel,
      collectionReference: input.collectionReference,
      memo: input.memo,
      reversesEntryId: null,
      createdAt,
    };
    entries.set(entry.id, entry);
    return {
      duplicated: false,
      record: { payment: structuredClone(payment), entry: structuredClone(entry) },
    };
  }

  async reverse(rawInput: ReverseManualCollectionInput): Promise<ManualCollectionMutationResult> {
    const input = normalizeReverseManualCollectionInput(rawInput);
    const store = getMockStore();
    const entries = mockEntries();
    const original = entries.get(input.entryId);
    if (!original || original.direction !== 'receipt' || !original.paymentId) {
      throw new Error('MANUAL_REVERSAL_RECEIPT_NOT_FOUND');
    }
    const existing = [...entries.values()].find(
      (entry) => entry.reversesEntryId === original.id,
    );
    if (existing) {
      if (existing.collectionReference !== input.collectionReference) {
        throw new Error('MANUAL_REVERSAL_ALREADY_EXISTS');
      }
      return { duplicated: true, record: { payment: null, entry: structuredClone(existing) } };
    }
    if ([...entries.values()].some(
      (entry) => entry.channel === original.channel
        && entry.collectionReference === input.collectionReference,
    )) {
      throw new Error('MANUAL_REVERSAL_REFERENCE_CONFLICT');
    }

    const payment = store.payments.get(original.paymentId);
    if (!payment) throw new Error('MANUAL_COLLECTION_PAYMENT_MISSING');
    const credits = new MockCreditsService();
    let clawed = 0;
    let originalExpiry: string | null = null;
    if (original.productKind === 'subscription' || original.productKind === 'credit_pack') {
      const grantReason = original.productKind === 'subscription'
        ? 'subscription_grant'
        : 'purchase';
      originalExpiry = (await credits.getLedger(original.clientId)).find(
        (candidate) => candidate.referenceId === payment.id
          && candidate.reason === grantReason
          && candidate.amount > 0,
      )?.expiresAt ?? null;
      clawed = await credits.clawbackGrant({
        clientId: original.clientId,
        referenceId: payment.id,
        grantReason,
      });
    }
    if (original.productKind === 'subscription') {
      const reconciliation = reconcileMockSiteSubscriptionManualReversal({
        clientId: original.clientId,
        idempotencyKey: manualCollectionIdempotencyKey(original),
      });
      if (clawed > 0 && Date.parse(reconciliation.state.currentPeriodEnd) > Date.now()) {
        await credits.grant({
          clientId: original.clientId,
          amount: clawed,
          reason: 'subscription_grant',
          referenceId: reconciliation.replacementPaymentId ?? undefined,
          idempotencyKey: `manual_reversal_regrant:${original.id}`,
          expiresAt: originalExpiry ?? undefined,
        });
      }
    }

    const reversal: ManualPaymentEntry = {
      id: crypto.randomUUID(),
      paymentId: null,
      clientId: original.clientId,
      siteId: original.siteId,
      productKind: original.productKind,
      direction: 'reversal',
      amountKrw: original.amountKrw,
      channel: original.channel,
      collectionReference: input.collectionReference,
      memo: input.memo,
      reversesEntryId: original.id,
      createdAt: new Date().toISOString(),
    };
    entries.set(reversal.id, reversal);
    return { duplicated: false, record: { payment: null, entry: structuredClone(reversal) } };
  }
}

