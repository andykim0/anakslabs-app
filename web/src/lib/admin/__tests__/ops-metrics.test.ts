import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { INITIAL_GRANT } from '@/lib/credits/constants';
import { LAUNCH_OFFER, PRICING } from '@/lib/pricing';
import type { Payment } from '@/lib/types/domain';
import type { ManualPaymentEntry } from '@/lib/payments/manual-collection-core';
import {
  ADMIN_MONTHLY_REVENUE_TARGET_KRW,
  buildAdminOpsRevenueMetrics,
  classifyBuildContract,
  currentKstRevenueMonth,
} from '../ops-metrics';

const NOW = new Date('2026-07-17T03:00:00.000Z');

function payment(
  id: string,
  patch: Partial<Payment> = {},
): Payment {
  return {
    id,
    clientId: `client-${id}`,
    type: 'build_fee',
    amount: PRICING.base.launch,
    creditsGranted: INITIAL_GRANT.basic,
    providerPaymentKey: `provider-${id}`,
    createdAt: '2026-07-10T03:00:00.000Z',
    refundedAt: null,
    refundAmount: null,
    ...patch,
  };
}

function manualEntry(
  id: string,
  paymentId: string | null,
  patch: Partial<ManualPaymentEntry> = {},
): ManualPaymentEntry {
  return {
    id,
    paymentId,
    clientId: `client-${paymentId ?? id}`,
    siteId: `site-${paymentId ?? id}`,
    customerName: null,
    customerContact: null,
    creditPackCredits: null,
    productKind: 'launch_build',
    direction: paymentId ? 'receipt' : 'reversal',
    amountKrw: PRICING.base.launch,
    channel: 'kmong',
    collectionReference: `kmong-${id}`,
    memo: null,
    reversesEntryId: null,
    createdAt: '2026-07-10T03:00:00.000Z',
    ...patch,
  };
}

describe('ADM4 admin revenue metrics', () => {
  test('uses half-open Korean calendar month boundaries regardless of server timezone', () => {
    assert.deepEqual(currentKstRevenueMonth(new Date('2026-07-01T00:30:00+09:00')), {
      month: '2026-07',
      startIso: '2026-06-30T15:00:00.000Z',
      endExclusiveIso: '2026-07-31T15:00:00.000Z',
    });

    const result = buildAdminOpsRevenueMetrics([
      payment('before', { createdAt: '2026-06-30T14:59:59.999Z' }),
      payment('start', { createdAt: '2026-06-30T15:00:00.000Z' }),
      payment('before-now', { createdAt: '2026-07-17T02:59:59.999Z' }),
      payment('future-in-month', { createdAt: '2026-07-31T14:59:59.999Z' }),
      payment('end', { createdAt: '2026-07-31T15:00:00.000Z' }),
    ], NOW);

    assert.equal(result.segments.launchBuild.grossKrw, PRICING.base.launch * 2);
  });

  test('classifies only exact current-price contracts from immutable payment fields', () => {
    assert.deepEqual(classifyBuildContract(payment('launch-basic')), {
      base: 'launch',
      videoAddon: false,
    });
    assert.deepEqual(classifyBuildContract(payment('list-basic', {
      amount: PRICING.base.list,
    })), { base: 'list', videoAddon: false });
    assert.deepEqual(classifyBuildContract(payment('launch-video', {
      amount: PRICING.base.launch + PRICING.videoHeroAddon,
      creditsGranted: INITIAL_GRANT.premium,
    })), { base: 'launch', videoAddon: true });
    assert.deepEqual(classifyBuildContract(payment('list-video', {
      amount: PRICING.base.list + PRICING.videoHeroAddon,
      creditsGranted: INITIAL_GRANT.premium,
    })), { base: 'list', videoAddon: true });
    assert.deepEqual(classifyBuildContract(payment('ambiguous', {
      amount: PRICING.base.launch + PRICING.videoHeroAddon,
      creditsGranted: 2,
    })), { base: 'unclassified', videoAddon: false });
  });

  test('keeps exact base, add-on, subscription, credit-pack and ambiguous receipts separate', () => {
    const launchVideo = PRICING.base.launch + PRICING.videoHeroAddon;
    const listVideo = PRICING.base.list + PRICING.videoHeroAddon;
    const historicalBuild = 1_290_000;
    const historicalSubscription = 49_000;
    const creditPack = 65_000;
    const result = buildAdminOpsRevenueMetrics([
      payment('launch-basic'),
      payment('list-basic', { amount: PRICING.base.list }),
      payment('launch-video', {
        amount: launchVideo,
        creditsGranted: INITIAL_GRANT.premium,
      }),
      payment('list-video', {
        amount: listVideo,
        creditsGranted: INITIAL_GRANT.premium,
      }),
      payment('historic-build', {
        amount: historicalBuild,
        creditsGranted: INITIAL_GRANT.premium,
      }),
      payment('subscription', {
        type: 'maintenance_subscription',
        amount: historicalSubscription,
        creditsGranted: 0,
      }),
      payment('pack', {
        type: 'credit_pack',
        amount: creditPack,
        creditsGranted: 5,
      }),
    ], NOW);

    assert.equal(result.segments.launchBuild.grossKrw, PRICING.base.launch * 2);
    assert.equal(result.segments.listBuild.grossKrw, PRICING.base.list * 2);
    assert.equal(result.segments.videoAddon.grossKrw, PRICING.videoHeroAddon * 2);
    assert.equal(result.segments.unclassifiedBuild.grossKrw, historicalBuild);
    assert.equal(result.segments.subscription.grossKrw, historicalSubscription);
    assert.equal(result.segments.creditPack.grossKrw, creditPack);
    assert.equal(
      result.receipts.grossKrw,
      PRICING.base.launch
        + PRICING.base.list
        + launchVideo
        + listVideo
        + historicalBuild
        + historicalSubscription
        + creditPack,
    );
    assert.equal(
      result.operatingRevenueNetKrw,
      result.receipts.netKrw - result.segments.creditPack.netKrw,
    );
  });

  test('uses cash-basis refunds and does not invent a partial composite allocation', () => {
    const launchVideo = PRICING.base.launch + PRICING.videoHeroAddon;
    const result = buildAdminOpsRevenueMetrics([
      payment('old-full-refund', {
        amount: launchVideo,
        creditsGranted: INITIAL_GRANT.premium,
        createdAt: '2026-05-10T03:00:00.000Z',
        refundedAt: '2026-07-05T03:00:00.000Z',
        refundAmount: launchVideo,
      }),
      payment('current-partial-refund', {
        amount: launchVideo,
        creditsGranted: INITIAL_GRANT.premium,
        refundedAt: '2026-07-12T03:00:00.000Z',
        refundAmount: 100_000,
      }),
    ], NOW);

    assert.equal(result.receipts.grossKrw, launchVideo);
    assert.equal(result.receipts.refundsKrw, launchVideo + 100_000);
    assert.equal(result.receipts.netKrw, -100_000);
    assert.equal(result.segments.launchBuild.grossKrw, PRICING.base.launch);
    assert.equal(result.segments.launchBuild.refundsKrw, PRICING.base.launch);
    assert.equal(result.segments.videoAddon.grossKrw, PRICING.videoHeroAddon);
    assert.equal(result.segments.videoAddon.refundsKrw, PRICING.videoHeroAddon);
    assert.equal(result.segments.unclassifiedBuild.refundsKrw, 100_000);
    assert.equal(result.operatingRevenueNetKrw, -100_000);
  });

  test('does not count future receipts/refunds/contracts and rejects impossible refund chronology', () => {
    const futurePayment = payment('future-payment', {
      createdAt: '2026-07-18T03:00:00.000Z',
    });
    const futureRefund = payment('future-refund', {
      createdAt: '2026-07-01T03:00:00.000Z',
      refundedAt: '2026-07-18T03:00:00.000Z',
      refundAmount: PRICING.base.launch,
    });
    const impossible = payment('impossible-refund', {
      createdAt: '2026-07-10T03:00:00.000Z',
      refundedAt: '2026-07-09T03:00:00.000Z',
      refundAmount: PRICING.base.launch,
    });
    const result = buildAdminOpsRevenueMetrics([futurePayment, futureRefund, impossible], NOW);

    assert.equal(result.receipts.grossKrw, PRICING.base.launch * 2);
    assert.equal(result.receipts.refundsKrw, 0);
    assert.equal(result.launchOffer.contracts, 1);
    assert.deepEqual(result.anomalies, [
      { paymentId: 'impossible-refund', code: 'invalid_refund' },
    ]);
  });

  test('counts cumulative exact launch contracts, excludes full refunds, and uses the offer limit', () => {
    const launchVideo = PRICING.base.launch + PRICING.videoHeroAddon;
    const fullRefund = payment('full-refund', {
      createdAt: '2026-01-05T03:00:00.000Z',
      refundedAt: '2026-02-05T03:00:00.000Z',
      refundAmount: PRICING.base.launch,
    });
    const result = buildAdminOpsRevenueMetrics([
      payment('launch-old', { createdAt: '2025-12-01T03:00:00.000Z' }),
      payment('launch-video-old', {
        amount: launchVideo,
        creditsGranted: INITIAL_GRANT.premium,
        createdAt: '2026-01-01T03:00:00.000Z',
      }),
      payment('launch-partial', {
        createdAt: '2026-01-10T03:00:00.000Z',
        refundedAt: '2026-03-01T03:00:00.000Z',
        refundAmount: 10_000,
      }),
      fullRefund,
      payment('list', { amount: PRICING.base.list }),
      payment('ambiguous', { amount: launchVideo, creditsGranted: 2 }),
    ], NOW);

    assert.equal(LAUNCH_OFFER.kind, 'quantity');
    assert.equal(result.launchOffer.contracts, 3);
    assert.equal(result.launchOffer.limit, LAUNCH_OFFER.limitCount);
    assert.equal(
      result.launchOffer.remaining,
      (LAUNCH_OFFER.limitCount ?? 0) - result.launchOffer.contracts,
    );
    assert.equal(result.launchOffer.reachedLimit, false);
  });

  test('reports malformed or duplicate rows and fails closed instead of corrupting totals', () => {
    const result = buildAdminOpsRevenueMetrics([
      payment('duplicate'),
      payment('duplicate'),
      payment('bad-amount', { amount: Number.NaN }),
      payment('bad-credits', { creditsGranted: 1.5 }),
      payment('bad-created', { createdAt: 'not-a-date' }),
      payment('bad-refund', { refundedAt: '2026-07-10T00:00:00.000Z', refundAmount: null }),
    ], NOW);

    assert.deepEqual(result.anomalies, [
      { paymentId: 'duplicate', code: 'duplicate_payment_id' },
      { paymentId: 'bad-amount', code: 'invalid_amount' },
      { paymentId: 'bad-credits', code: 'invalid_credits_granted' },
      { paymentId: 'bad-created', code: 'invalid_created_at' },
      { paymentId: 'bad-refund', code: 'invalid_refund' },
    ]);
    assert.equal(result.anomalyPaymentCount, 5);
    assert.equal(result.receipts.grossKrw, PRICING.base.launch * 2);
  });

  test('uses a named operations target and clamps its gauge progress', () => {
    assert.equal(ADMIN_MONTHLY_REVENUE_TARGET_KRW, 10_000_000);
    const result = buildAdminOpsRevenueMetrics([
      payment('huge', {
        amount: ADMIN_MONTHLY_REVENUE_TARGET_KRW + 1,
        creditsGranted: 0,
      }),
    ], NOW);
    assert.equal(result.targetKrw, ADMIN_MONTHLY_REVENUE_TARGET_KRW);
    assert.equal(result.targetProgress, 1);
  });

  test('combines provider and manual cash while preserving an exact source split', () => {
    const manualPayment = payment('manual-launch', {
      clientId: 'manual-client',
      creditsGranted: 0,
      providerPaymentKey: null,
    });
    const entry = manualEntry('manual-entry', manualPayment.id, {
      clientId: manualPayment.clientId,
      siteId: 'manual-site',
    });
    const result = buildAdminOpsRevenueMetrics(
      [payment('provider-launch'), manualPayment],
      NOW,
      {
        manualEntries: [entry],
        sites: [
          { id: 'provider-site', clientId: 'client-provider-launch' },
          { id: 'manual-site', clientId: 'manual-client' },
        ],
      },
    );

    assert.equal(result.sources.provider.grossKrw, PRICING.base.launch);
    assert.equal(result.sources.manual.grossKrw, PRICING.base.launch);
    assert.equal(result.receipts.grossKrw, PRICING.base.launch * 2);
    assert.equal(result.operatingRevenueBySourceKrw.provider, PRICING.base.launch);
    assert.equal(result.operatingRevenueBySourceKrw.manual, PRICING.base.launch);
    assert.equal(result.launchOffer.contracts, 2);
  });

  test('counts launch contracts by unique site across provider/manual evidence and reversals', () => {
    const provider = payment('provider', { clientId: 'same-client' });
    const manualPayment = payment('manual', {
      clientId: 'same-client',
      creditsGranted: 0,
      providerPaymentKey: null,
    });
    const receipt = manualEntry('receipt', manualPayment.id, {
      clientId: 'same-client',
      siteId: 'same-site',
    });
    const duplicateReceipt = manualEntry('receipt-2', 'manual-2', {
      clientId: 'same-client',
      siteId: 'same-site',
      collectionReference: 'kmong-receipt-2',
    });
    const manualPayment2 = payment('manual-2', {
      clientId: 'same-client',
      creditsGranted: 0,
      providerPaymentKey: null,
    });
    const reversal = manualEntry('reversal', null, {
      clientId: 'same-client',
      siteId: 'same-site',
      reversesEntryId: receipt.id,
      collectionReference: 'kmong-correction',
    });
    const result = buildAdminOpsRevenueMetrics(
      [provider, manualPayment, manualPayment2],
      NOW,
      {
        manualEntries: [receipt, duplicateReceipt, reversal],
        sites: [{ id: 'same-site', clientId: 'same-client' }],
      },
    );

    assert.equal(result.launchOffer.contracts, 1, 'one site must never consume several launch slots');
    assert.equal(result.sources.manual.grossKrw, PRICING.base.launch * 2);
    assert.equal(result.sources.manual.refundsKrw, PRICING.base.launch);
  });

  test('fails closed when a provider launch payment cannot be bound to one site', () => {
    const provider = payment('provider-multi-site', { clientId: 'multi-site-client' });
    const result = buildAdminOpsRevenueMetrics([provider], NOW, {
      sites: [
        { id: 'site-one', clientId: 'multi-site-client' },
        { id: 'site-two', clientId: 'multi-site-client' },
      ],
    });

    assert.equal(result.sources.provider.grossKrw, PRICING.base.launch);
    assert.equal(result.launchOffer.contracts, 0);
    assert.deepEqual(result.anomalies, [
      { paymentId: provider.id, code: 'launch_site_unresolved' },
    ]);
  });

  test('fails closed for URL-less/manual-looking payment rows without immutable evidence', () => {
    const unknown = payment('unknown-manual', { providerPaymentKey: null });
    const result = buildAdminOpsRevenueMetrics([unknown], NOW, { manualEntries: [], sites: [] });
    assert.equal(result.receipts.grossKrw, 0);
    assert.deepEqual(result.anomalies, [
      { paymentId: unknown.id, code: 'manual_metadata_missing' },
    ]);
  });

  test('counts accountless site-less cash and deduplicates launch slots by customer contact', () => {
    const first = manualEntry('accountless-one', null, {
      clientId: null,
      siteId: 'site-owner-77',
      customerName: '크몽 고객',
      customerContact: ' KMONG:OWNER-77 ',
      direction: 'receipt',
      collectionReference: 'kmong-accountless-one',
    });
    const second = manualEntry('accountless-two', null, {
      clientId: null,
      siteId: null,
      customerName: '크몽 고객',
      customerContact: 'kmong:owner-77',
      direction: 'receipt',
      collectionReference: 'kmong-accountless-two',
    });
    const reversal = manualEntry('accountless-reversal', null, {
      clientId: null,
      siteId: first.siteId,
      customerName: first.customerName,
      customerContact: first.customerContact,
      direction: 'reversal',
      reversesEntryId: first.id,
      collectionReference: 'cancel-accountless-one',
    });
    const active = buildAdminOpsRevenueMetrics([], NOW, {
      manualEntries: [first, second],
      sites: [],
    });
    assert.equal(
      active.launchOffer.contracts,
      1,
      'a later site link must not double-count an earlier site-less receipt for the same contact',
    );

    const result = buildAdminOpsRevenueMetrics([], NOW, {
      manualEntries: [first, second, reversal],
      sites: [],
    });

    assert.equal(result.sources.manual.grossKrw, PRICING.base.launch * 2);
    assert.equal(result.sources.manual.refundsKrw, PRICING.base.launch);
    assert.equal(result.sources.manual.netKrw, PRICING.base.launch);
    assert.equal(result.launchOffer.contracts, 1, 'one contact consumes at most one launch slot');
    assert.deepEqual(result.anomalies, []);
  });
});
