import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { CREDIT_EXPIRY_DAYS, CREDIT_PACKS, CREDIT_COSTS } from '@/lib/credits/constants';
import { MockCreditsService } from '@/lib/data/mock/credits';
import { DEMO_BASIC_ID, DEMO_PREMIUM_ID } from '@/lib/data/mock/seed';
import { getMockStore, resetMockStore } from '@/lib/data/mock/store';
import { PRICING } from '@/lib/pricing';
import type { Payment } from '@/lib/types/domain';
import {
  isSiteSubscriptionActiveAt,
  addUtcCalendarMonthsClamped,
  subscriptionGrantIdempotencyKey,
  subscriptionGrantMonth,
  type SiteSubscriptionState,
} from '../core';
import {
  assertMockSiteSubscriptionRefundEvidence,
  getMockSiteSubscription,
  reconcileMockSiteSubscriptionFullRefund,
  renewMockSiteSubscription,
  resolveMockSiteSubscription,
  setMockSiteSubscriptionStatus,
} from '../mock';

const LEGACY_SUBSCRIPTION_GRANT = 2;

const at = new Date('2026-07-17T03:00:00.000Z');

function state(status: SiteSubscriptionState['status'], end: string): SiteSubscriptionState {
  return {
    clientId: 'client-1',
    status,
    currentPeriodEnd: end,
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
}

async function addMockMaintenancePayment(input: {
  id: string;
  providerPaymentKey: string;
  at?: Date;
}): Promise<Payment> {
  const paidAt = input.at ?? at;
  const store = getMockStore();
  getMockSiteSubscription(DEMO_BASIC_ID);
  const payment: Payment = {
    id: input.id,
    clientId: DEMO_BASIC_ID,
    type: 'maintenance_subscription',
    amount: PRICING.subscription.amountKrw,
    creditsGranted: LEGACY_SUBSCRIPTION_GRANT,
    providerPaymentKey: input.providerPaymentKey,
    createdAt: paidAt.toISOString(),
  };
  store.payments.set(payment.id, payment);
  store.paymentKeys.set(input.providerPaymentKey, payment.id);
  renewMockSiteSubscription({
    clientId: payment.clientId,
    idempotencyKey: `payment:${input.providerPaymentKey}`,
    source: 'payment_webhook',
    paymentId: payment.id,
    at: paidAt,
  });
  await new MockCreditsService().grant({
    clientId: payment.clientId,
    amount: LEGACY_SUBSCRIPTION_GRANT,
    reason: 'subscription_grant',
    referenceId: payment.id,
    idempotencyKey: subscriptionGrantIdempotencyKey(payment.clientId, paidAt),
  });
  return payment;
}

async function applyMockFullMaintenanceRefund(payment: Payment, refundedAt = at): Promise<void> {
  // The service initializes legacy evidence before recording refundedAt.
  getMockSiteSubscription(payment.clientId);
  assertMockSiteSubscriptionRefundEvidence({ clientId: payment.clientId, paymentId: payment.id });
  const credits = new MockCreditsService();
  const originalGrant = (await credits.getLedger(payment.clientId)).find(
    (entry) =>
      entry.referenceId === payment.id && entry.reason === 'subscription_grant' && entry.amount > 0,
  );
  payment.refundedAt = refundedAt.toISOString();
  payment.refundAmount = payment.amount;
  const clawed = await credits.clawbackGrant({
    clientId: payment.clientId,
    referenceId: payment.id,
    grantReason: 'subscription_grant',
  });
  const reconciliation = reconcileMockSiteSubscriptionFullRefund({
    clientId: payment.clientId,
    paymentId: payment.id,
    at: refundedAt,
  });
  if (clawed > 0 && Date.parse(reconciliation.state.currentPeriodEnd) > refundedAt.getTime()) {
    await credits.grant({
      clientId: payment.clientId,
      amount: clawed,
      reason: 'subscription_grant',
      referenceId: reconciliation.replacementPaymentId ?? undefined,
      idempotencyKey: `subscription_refund_regrant:${payment.id}`,
      expiresAt: originalGrant?.expiresAt ?? undefined,
    });
  }
}

describe('RPT$ authoritative subscription resolver', () => {
  test('only active status with a future authoritative period is eligible', () => {
    assert.equal(isSiteSubscriptionActiveAt(state('active', '2026-07-18T00:00:00.000Z'), at), true);
    assert.equal(isSiteSubscriptionActiveAt(state('active', at.toISOString()), at), false);
    assert.equal(isSiteSubscriptionActiveAt(state('past_due', '2026-08-18T00:00:00.000Z'), at), false);
    assert.equal(isSiteSubscriptionActiveAt(state('suspended', '2026-08-18T00:00:00.000Z'), at), false);
    assert.equal(isSiteSubscriptionActiveAt(state('cancelled', '2026-08-18T00:00:00.000Z'), at), false);
    assert.equal(isSiteSubscriptionActiveAt(null, at), false);
    assert.equal(isSiteSubscriptionActiveAt(state('active', 'not-a-date'), at), false);
  });

  test('monthly grant key is deterministic in the Korean billing month', () => {
    assert.equal(subscriptionGrantMonth(new Date('2026-06-30T14:59:59.999Z')), '2026-06');
    assert.equal(subscriptionGrantMonth(new Date('2026-06-30T15:00:00.000Z')), '2026-07');
    assert.equal(
      subscriptionGrantIdempotencyKey('client-1', new Date('2026-07-31T15:00:00.000Z')),
      'subscription_grant:client-1:2026-08',
    );
  });

  test('calendar renewal clamps month-end instead of overflowing', () => {
    assert.equal(
      addUtcCalendarMonthsClamped(new Date('2027-01-31T09:30:00.000Z'), 1).toISOString(),
      '2027-02-28T09:30:00.000Z',
    );
  });

  test('mock compatibility projects a recent seed payment into authority exactly once', () => {
    resetMockStore();
    const payment = [...getMockStore().payments.values()]
      .filter((row) => row.clientId === DEMO_PREMIUM_ID && row.type === 'maintenance_subscription')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    assert.ok(payment);
    const projected = getMockSiteSubscription(DEMO_PREMIUM_ID);
    assert.ok(projected);
    assert.equal(projected.status, 'active');
    assert.equal(
      projected.currentPeriodEnd,
      addUtcCalendarMonthsClamped(new Date(payment.createdAt), 1).toISOString(),
    );

    // Adding a raw payment after bootstrap cannot mutate authority.
    getMockStore().payments.set('late-unprojected-payment', {
      ...payment,
      id: 'late-unprojected-payment',
      providerPaymentKey: 'late-unprojected-payment',
      createdAt: new Date().toISOString(),
    });
    assert.equal(getMockSiteSubscription(DEMO_PREMIUM_ID)?.currentPeriodEnd, projected.currentPeriodEnd);
  });

  test('compatibility bootstrap excludes refunded maintenance payments', () => {
    resetMockStore();
    const payment = [...getMockStore().payments.values()].find(
      (row) => row.clientId === DEMO_PREMIUM_ID && row.type === 'maintenance_subscription',
    );
    assert.ok(payment);
    payment.refundedAt = new Date().toISOString();
    payment.refundAmount = payment.amount;
    assert.equal(getMockSiteSubscription(DEMO_PREMIUM_ID), null);
  });

  test('manual renewals extend the current period, dedupe, and re-activate only through renewal', () => {
    resetMockStore();
    const first = renewMockSiteSubscription({
      clientId: DEMO_BASIC_ID,
      idempotencyKey: 'manual:receipt-1',
      source: 'admin_manual',
      at,
    });
    assert.equal(first.duplicated, false);
    assert.equal(first.state.currentPeriodEnd, '2026-08-17T03:00:00.000Z');

    const duplicate = renewMockSiteSubscription({
      clientId: DEMO_BASIC_ID,
      idempotencyKey: 'manual:receipt-1',
      source: 'admin_manual',
      at: new Date('2026-07-20T00:00:00.000Z'),
    });
    assert.equal(duplicate.duplicated, true);
    assert.equal(duplicate.state.currentPeriodEnd, first.state.currentPeriodEnd);

    const second = renewMockSiteSubscription({
      clientId: DEMO_BASIC_ID,
      idempotencyKey: 'manual:receipt-2',
      source: 'admin_manual',
      at: new Date('2026-07-20T00:00:00.000Z'),
    });
    assert.equal(second.state.currentPeriodEnd, '2026-09-17T03:00:00.000Z');
    setMockSiteSubscriptionStatus(DEMO_BASIC_ID, 'suspended', at);
    assert.equal(resolveMockSiteSubscription(DEMO_BASIC_ID, at).active, false);
    assert.equal(getMockSiteSubscription(DEMO_BASIC_ID)?.status, 'suspended');
  });
});

describe('RPT$ mock renewal/credit parity', () => {
  test('과거 유료 구독 증거의 2크레딧은 90일·월 1회 계약으로 계속 해석된다', async () => {
    resetMockStore();
    const credits = new MockCreditsService();
    const before = await credits.getBalance(DEMO_BASIC_ID);
    renewMockSiteSubscription({
      clientId: DEMO_BASIC_ID,
      idempotencyKey: 'payment:maintenance-2026-07-a',
      source: 'admin_manual',
      at,
    });
    assert.equal(resolveMockSiteSubscription(DEMO_BASIC_ID, at).active, true);

    const grantKey = subscriptionGrantIdempotencyKey(DEMO_BASIC_ID, at);
    await credits.grant({
      clientId: DEMO_BASIC_ID,
      amount: LEGACY_SUBSCRIPTION_GRANT,
      reason: 'subscription_grant',
      idempotencyKey: grantKey,
    });
    const after = await credits.getBalance(DEMO_BASIC_ID);
    assert.equal(after.balance - before.balance, LEGACY_SUBSCRIPTION_GRANT);
    const grant = (await credits.getLedger(DEMO_BASIC_ID)).find(
      (entry) => entry.reason === 'subscription_grant',
    );
    assert.ok(grant);
    assert.equal(
      Math.round((Date.parse(grant.expiresAt ?? '') - Date.parse(grant.createdAt)) / 86_400_000),
      90,
    );

    await credits.grant({
      clientId: DEMO_BASIC_ID,
      amount: LEGACY_SUBSCRIPTION_GRANT,
      reason: 'subscription_grant',
      idempotencyKey: grantKey,
    });
    const final = await credits.getBalance(DEMO_BASIC_ID);
    assert.equal(final.balance, after.balance, 'a second collection in one month must not double grant');
  });

  test('inactive subscription is rejected by the canonical resolver', () => {
    resetMockStore();
    assert.equal(getMockSiteSubscription(DEMO_BASIC_ID), null);
    assert.equal(resolveMockSiteSubscription(DEMO_BASIC_ID, at).active, false);
  });

  test('full maintenance refund reverses its period and claws back only unused linked credits', async () => {
    resetMockStore();
    const credits = new MockCreditsService();
    const balanceBefore = await credits.getBalance(DEMO_BASIC_ID);
    const payment = await addMockMaintenancePayment({
      id: 'maintenance-refund-full',
      providerPaymentKey: 'maintenance-refund-full',
    });
    const originalGrant = (await credits.getLedger(DEMO_BASIC_ID)).find(
      (entry) =>
        entry.reason === 'subscription_grant' &&
        entry.referenceId === payment.id &&
        entry.amount > 0,
    );
    assert.ok(originalGrant);
    assert.equal(
      (await credits.getBalance(DEMO_BASIC_ID)).balance,
      balanceBefore.balance + LEGACY_SUBSCRIPTION_GRANT,
    );

    await applyMockFullMaintenanceRefund(payment);

    const stateAfter = getMockSiteSubscription(DEMO_BASIC_ID);
    assert.ok(stateAfter);
    assert.equal(stateAfter.status, 'cancelled');
    assert.equal(resolveMockSiteSubscription(DEMO_BASIC_ID).active, false);
    assert.equal((await credits.getBalance(DEMO_BASIC_ID)).balance, balanceBefore.balance);
    assert.equal(
      (await credits.getLedger(DEMO_BASIC_ID)).some(
        (entry) =>
          entry.reason === 'admin_clawback' &&
          entry.referenceId === originalGrant.id &&
          entry.amount === -LEGACY_SUBSCRIPTION_GRANT,
      ),
      true,
    );
  });

  test('partial maintenance refund leaves authority and monthly grant intact', async () => {
    resetMockStore();
    const credits = new MockCreditsService();
    const before = await credits.getBalance(DEMO_BASIC_ID);
    const payment = await addMockMaintenancePayment({
      id: 'maintenance-refund-partial',
      providerPaymentKey: 'maintenance-refund-partial',
    });
    const stateBefore = getMockSiteSubscription(DEMO_BASIC_ID);
    assert.ok(stateBefore);

    payment.refundedAt = at.toISOString();
    payment.refundAmount = payment.amount - 1;

    assert.deepEqual(getMockSiteSubscription(DEMO_BASIC_ID), stateBefore);
    assert.equal(resolveMockSiteSubscription(DEMO_BASIC_ID).active, true);
    assert.equal(
      (await credits.getBalance(DEMO_BASIC_ID)).balance,
      before.balance + LEGACY_SUBSCRIPTION_GRANT,
    );
  });

  test('refunding an earlier paid period keeps a later valid renewal authoritative', async () => {
    resetMockStore();
    const credits = new MockCreditsService();
    const balanceBefore = await credits.getBalance(DEMO_BASIC_ID);
    const first = await addMockMaintenancePayment({
      id: 'maintenance-period-one',
      providerPaymentKey: 'maintenance-period-one',
    });
    const firstEnd = getMockSiteSubscription(DEMO_BASIC_ID)?.currentPeriodEnd;
    assert.ok(firstEnd);

    const second = await addMockMaintenancePayment({
      id: 'maintenance-period-two',
      providerPaymentKey: 'maintenance-period-two',
    });
    const laterEnd = getMockSiteSubscription(DEMO_BASIC_ID)?.currentPeriodEnd;
    assert.ok(laterEnd);
    assert.ok(laterEnd > firstEnd);

    await applyMockFullMaintenanceRefund(first);

    assert.equal(getMockSiteSubscription(DEMO_BASIC_ID)?.currentPeriodEnd, laterEnd);
    assert.equal(resolveMockSiteSubscription(DEMO_BASIC_ID).active, true);
    assert.equal(
      (await credits.getBalance(DEMO_BASIC_ID)).balance,
      balanceBefore.balance + LEGACY_SUBSCRIPTION_GRANT,
      'the surviving paid period keeps the already-earned monthly benefit',
    );
    const transferred = (await credits.getLedger(DEMO_BASIC_ID)).find(
      (entry) =>
        entry.reason === 'subscription_grant' &&
        entry.referenceId === 'maintenance-period-two',
    );
    assert.ok(transferred);

    await applyMockFullMaintenanceRefund(second);
    assert.equal(getMockSiteSubscription(DEMO_BASIC_ID)?.status, 'cancelled');
    assert.equal((await credits.getBalance(DEMO_BASIC_ID)).balance, balanceBefore.balance);
  });

  test('targeted clawback never consumes an older FIFO lot and expiry does not double-subtract it', async () => {
    resetMockStore();
    const credits = new MockCreditsService();
    await credits.grant({
      clientId: DEMO_BASIC_ID,
      amount: 3,
      reason: 'purchase',
      referenceId: 'older-payment',
      idempotencyKey: 'older-multi-month-lot',
      expiresAt: '2026-08-01T00:00:00.000Z',
    });
    await credits.grant({
      clientId: DEMO_BASIC_ID,
      amount: 2,
      reason: 'subscription_grant',
      referenceId: 'target-subscription-payment',
      idempotencyKey: 'target-multi-month-lot',
      expiresAt: '2026-09-01T00:00:00.000Z',
    });
    const grants = await credits.getLedger(DEMO_BASIC_ID);
    const older = grants.find((entry) => entry.referenceId === 'older-payment' && entry.amount > 0);
    const target = grants.find(
      (entry) => entry.referenceId === 'target-subscription-payment' && entry.amount > 0,
    );
    assert.ok(older);
    assert.ok(target);

    assert.equal(
      await credits.clawbackGrant({
        clientId: DEMO_BASIC_ID,
        referenceId: 'target-subscription-payment',
        grantReason: 'subscription_grant',
      }),
      2,
    );
    const store = getMockStore();
    assert.equal(store.lots.find((lot) => lot.entryId === older.id)?.remaining, 3);
    assert.equal(store.lots.find((lot) => lot.entryId === target.id)?.remaining, 0);
    assert.equal(
      store.ledger.some(
        (entry) =>
          entry.reason === 'admin_clawback' &&
          entry.referenceId === target.id &&
          entry.amount === -2,
      ),
      true,
    );

    await credits.expireDue(new Date('2026-10-01T00:00:00.000Z'));
    const afterExpiry = await credits.getLedger(DEMO_BASIC_ID);
    assert.equal(
      afterExpiry.some(
        (entry) => entry.reason === 'expired' && entry.referenceId === older.id && entry.amount === -3,
      ),
      true,
    );
    assert.equal(
      afterExpiry.some(
        (entry) => entry.reason === 'expired' && entry.referenceId === target.id,
      ),
      false,
      'the already-targeted lot must not be expired a second time',
    );
  });

});

describe('RPT$ contract and SQL invariants', () => {
  test('신규 유지 계약은 월 29,000원이고 크레딧 판매·지급은 동면한다', () => {
    assert.equal(PRICING.subscription.amountKrw, 29_000);
    assert.equal(PRICING.subscription.periodMonths, 1);
    assert.equal(PRICING.subscription.automaticRenewal, true);
    assert.equal(PRICING.subscription.annualCommitment.status, 'unavailable');
    assert.equal(PRICING.subscription.creditsPerMonth, 0);
    assert.equal(CREDIT_EXPIRY_DAYS.subscription_grant, 90);
    assert.deepEqual(CREDIT_COSTS, { text: 1, image: 1, video: 3, structure: 2 });
    assert.deepEqual(CREDIT_PACKS, [
      { credits: 1, priceKrw: 15_000, label: '1개' },
      { credits: 5, priceKrw: 65_000, label: '5개 (13% 할인)' },
      { credits: 10, priceKrw: 120_000, label: '10개 (20% 할인)' },
    ]);
  });

  test('migration makes state authoritative, service-only, atomic and ledger-based', () => {
    const legacySql = readFileSync(
      join(process.cwd(), '../supabase/migrations/0013_site_subscriptions.sql'),
      'utf8',
    );
    const pricingSql = readFileSync(
      join(process.cwd(), '../supabase/migrations/0043_pricing_v2.sql'),
      'utf8',
    );
    const sql = `${legacySql}\n${pricingSql}`;
    assert.match(sql, /create table public\.site_subscriptions/);
    assert.match(sql, /current_period_end timestamptz not null/);
    assert.match(sql, /create or replace function public\.is_site_subscription_active/);
    assert.match(sql, /s\.status = 'active'[\s\S]*s\.current_period_end > p_as_of/);
    assert.match(sql, /create or replace function public\.admin_renew_site_subscription/);
    assert.match(sql, /create or replace function public\.handle_maintenance_payment/);
    assert.match(sql, /where p\.type = 'maintenance_subscription'[\s\S]*p\.refunded_at is null/);
    assert.match(sql, /reversed_at\s+timestamptz/);
    assert.match(sql, /'refund', 'expired', 'admin_clawback', 'admin_adjust'/);
    assert.match(sql, /credit_ledger_admin_clawback_shape_check[\s\S]*amount < 0[\s\S]*reference_id is not null/);
    assert.match(sql, /create unique index site_subscription_renewals_payment_idx/);
    assert.match(sql, /create or replace function public\.admin_refund_payment/);
    assert.match(sql, /p\.refunded_at is null[\s\S]*verified maintenance payment is required/);
    assert.match(sql, /p_amount <> trunc\(p_amount\)/);
    assert.match(sql, /p_amount = v_payment_amount[\s\S]*set reversed_at = v_now/);
    assert.match(sql, /r\.reversed_at is null[\s\S]*order by r\.period_end desc/);
    assert.match(sql, /l\.reason = case[\s\S]*'subscription_grant'/);
    assert.equal(
      [...sql.matchAll(/v_row\.reason in \('expired', 'admin_clawback'\)/g)].length,
      2,
      'both lot-remaining and expiry replay must apply targeted clawbacks to their referenced lot',
    );
    assert.match(sql, /-v_remaining,[\s\S]*'admin_clawback',[\s\S]*v_lot_id/);
    assert.match(sql, /v_original_expires_at[\s\S]*subscription_refund_regrant:/);
    assert.match(sql, /public\.renew_site_subscription[\s\S]*public\.grant_subscription_month_credits/);
    assert.match(sql, /subscription_grant:' \|\| p_client_id::text \|\| ':'/);
    assert.match(sql, /to_char\(p_as_of at time zone 'Asia\/Seoul', 'YYYY-MM'\)/);
    assert.match(sql, /perform public\.grant_credits\([\s\S]*'subscription_grant'[\s\S]*90/);
    assert.match(sql, /revoke execute on function public\.admin_renew_site_subscription[\s\S]*authenticated/);
    assert.doesNotMatch(sql, /grant execute[^;]+to authenticated/);
    assert.doesNotMatch(
      sql,
      /grant execute on function public\.(?:renew_site_subscription|grant_subscription_month_credits)/,
      'internal state/grant primitives must only be reachable through atomic wrappers',
    );

    const mockPayments = readFileSync(
      join(process.cwd(), 'src/lib/data/mock/services.ts'),
      'utf8',
    );
    assert.match(mockPayments, /payload\.amount !== expectedPricing\.amountKrw/);
    assert.match(
      mockPayments,
      /periodMonths: payload\.periodMonths \?\? PRICING\.subscription\.periodMonths/,
    );
    assert.match(mockPayments, /renewMockSiteSubscription\(\{/);
    assert.match(mockPayments, /reason: 'subscription_grant'/);
    assert.match(mockPayments, /input\.amount > payment\.amount/);
    assert.match(mockPayments, /Number\.isInteger\(input\.amount\)/);
    assert.match(mockPayments, /isFullMaintenanceRefund/);
    assert.match(mockPayments, /assertMockSiteSubscriptionRefundEvidence/);
    assert.match(mockPayments, /reconcileMockSiteSubscriptionFullRefund\(\{/);
    assert.match(mockPayments, /subscription_refund_regrant:/);
    assert.match(
      mockPayments,
      /assertMockSiteSubscriptionRefundEvidence[\s\S]*payment\.refundedAt = refundedAt/,
      'mock preflights renewal evidence before mutating payment/ledger state',
    );

    const refundRoute = readFileSync(
      join(process.cwd(), 'src/app/api/admin/payments/[id]/refund/route.ts'),
      'utf8',
    );
    assert.match(refundRoute, /z\s*\.number\(\)\s*\.int\(/);
  });
});
