import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { INITIAL_GRANT } from '@/lib/credits/constants';
import { LAUNCH_OFFER, PRICING } from '@/lib/pricing';
import type { Payment } from '@/lib/types/domain';
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
      payment('last', { createdAt: '2026-07-31T14:59:59.999Z' }),
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
});
