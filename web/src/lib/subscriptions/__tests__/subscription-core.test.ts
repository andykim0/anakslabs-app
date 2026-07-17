import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { CREDIT_EXPIRY_DAYS, CREDIT_PACKS, CREDIT_COSTS } from '@/lib/credits/constants';
import { MockCreditsService } from '@/lib/data/mock/credits';
import { DEMO_BASIC_ID, DEMO_PREMIUM_ID } from '@/lib/data/mock/seed';
import { getMockStore, resetMockStore } from '@/lib/data/mock/store';
import { PRICING } from '@/lib/pricing';
import {
  isSiteSubscriptionActiveAt,
  addUtcCalendarMonthsClamped,
  subscriptionGrantIdempotencyKey,
  subscriptionGrantMonth,
  type SiteSubscriptionState,
} from '../core';
import {
  getMockSiteSubscription,
  renewMockSiteSubscription,
  resolveMockSiteSubscription,
  setMockSiteSubscriptionStatus,
} from '../mock';

const at = new Date('2026-07-17T03:00:00.000Z');

function state(status: SiteSubscriptionState['status'], end: string): SiteSubscriptionState {
  return {
    clientId: 'client-1',
    status,
    currentPeriodEnd: end,
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
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
  test('active renewal grants two 90-day credits once per Korean month', async () => {
    resetMockStore();
    const credits = new MockCreditsService();
    const before = await credits.getBalance(DEMO_BASIC_ID);
    renewMockSiteSubscription({
      clientId: DEMO_BASIC_ID,
      idempotencyKey: 'payment:maintenance-2026-07-a',
      source: 'payment_webhook',
      at,
    });
    assert.equal(resolveMockSiteSubscription(DEMO_BASIC_ID, at).active, true);

    const grantKey = subscriptionGrantIdempotencyKey(DEMO_BASIC_ID, at);
    await credits.grant({
      clientId: DEMO_BASIC_ID,
      amount: PRICING.subscription.creditsPerMonth,
      reason: 'subscription_grant',
      idempotencyKey: grantKey,
    });
    const after = await credits.getBalance(DEMO_BASIC_ID);
    assert.equal(after.balance - before.balance, PRICING.subscription.creditsPerMonth);
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
      amount: PRICING.subscription.creditsPerMonth,
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
});

describe('RPT$ contract and SQL invariants', () => {
  test('subscription benefit is additive and existing costs/packs remain unchanged', () => {
    assert.equal(PRICING.subscription.monthly, 29_900);
    assert.equal(PRICING.subscription.creditsPerMonth, 2);
    assert.equal(PRICING.subscription.creditValueKrw, 30_000);
    assert.equal(CREDIT_EXPIRY_DAYS.subscription_grant, 90);
    assert.deepEqual(CREDIT_COSTS, { text: 1, image: 1, video: 3, structure: 2 });
    assert.deepEqual(CREDIT_PACKS, [
      { credits: 1, priceKrw: 15_000, label: '1개' },
      { credits: 5, priceKrw: 65_000, label: '5개 (13% 할인)' },
      { credits: 10, priceKrw: 120_000, label: '10개 (20% 할인)' },
    ]);
  });

  test('migration makes state authoritative, service-only, atomic and ledger-based', () => {
    const sql = readFileSync(
      join(process.cwd(), '../supabase/migrations/0013_site_subscriptions.sql'),
      'utf8',
    );
    assert.match(sql, /create table public\.site_subscriptions/);
    assert.match(sql, /current_period_end timestamptz not null/);
    assert.match(sql, /create or replace function public\.is_site_subscription_active/);
    assert.match(sql, /s\.status = 'active'[\s\S]*s\.current_period_end > p_as_of/);
    assert.match(sql, /create or replace function public\.admin_renew_site_subscription/);
    assert.match(sql, /create or replace function public\.handle_maintenance_payment/);
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
    assert.match(mockPayments, /payload\.amount !== PRICING\.subscription\.monthly/);
    assert.match(mockPayments, /renewMockSiteSubscription\(\{/);
    assert.match(mockPayments, /reason: 'subscription_grant'/);
  });
});
