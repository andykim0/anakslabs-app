import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { describe } from 'node:test';
import { REFUND_POLICY } from '@/lib/credits/constants';
import { buildAdminSiteSubscriptionListing, isSiteSubscriptionActiveAt } from '../core';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('subscription cancellation — the customer keeps what they paid for', () => {
  test('해지 요청 시점에 자격을 뺏지 않는다 — status 를 건드리지 않는 것이 그 방법이다', () => {
    const route = source('src/app/api/subscription/cancel/route.ts');
    /**
     * The defect this pins: the route used to call setSiteSubscriptionStatus('cancelled') at
     * request time, and isSiteSubscriptionActiveAt fails the instant status !== 'active'. So the
     * customer lost publishing and monthly reporting the moment they clicked cancel, while
     * Stripe carried on charging. Either half alone is a bug; together they bill for a period the
     * customer cannot use.
     */
    assert.doesNotMatch(route, /setSiteSubscriptionStatus/u);
    assert.match(route, /cancelStripeSubscriptionAtPeriodEnd/u);
  });

  test('자격은 기간말에 스스로 만료한다 — 배치는 장부일 뿐 게이트가 아니다', () => {
    const periodEnd = '2026-09-01T00:00:00.000Z';
    const state = {
      clientId: 'c1',
      status: 'active' as const,
      currentPeriodEnd: periodEnd,
      updatedAt: periodEnd,
    };
    // Still inside the paid period: the customer who cancelled keeps working.
    assert.equal(isSiteSubscriptionActiveAt(state, new Date('2026-08-31T23:59:59.000Z')), true);
    // Past it: locked out without anything having to run.
    assert.equal(isSiteSubscriptionActiveAt(state, new Date('2026-09-01T00:00:01.000Z')), false);
  });

  test('기간말 해지인 이유는 월 구독에 환불 경로가 없기 때문이다', () => {
    /**
     * REFUND_POLICY is the BUILD FEE policy — 빌드비 — and governs the one-time setup charge.
     * There is no pro-rata or refund mechanism for the monthly subscription anywhere, so an
     * immediate cancel would keep money for a period we then refuse to serve, with no route to
     * return it. That absence is the justification, and this test exists so that if a monthly
     * refund mechanism is ever added, someone revisits the semantics deliberately.
     */
    assert.equal(REFUND_POLICY.fullRefundWindowDays, 7);
    assert.equal(REFUND_POLICY.partialRefundWindowDays, 14);
    assert.equal(REFUND_POLICY.partialRefundRate, 0.5);
    const constants = source('src/lib/credits/constants.ts');
    assert.match(constants, /빌드비 환불 정책/u, 'REFUND_POLICY must still be the build-fee policy');
    assert.doesNotMatch(constants, /monthlyRefund|proRata|subscriptionRefund/u);
  });

  test('어댑터는 기간말 예약이지 즉시 취소가 아니다', () => {
    const adapter = source('src/lib/payments/stripe-live.ts');
    assert.match(adapter, /cancel_at_period_end:\s*true/u);
    // An immediate cancel would forfeit the paid remainder. Match the call, not the comment that
    // warns against it.
    assert.doesNotMatch(adapter, /client\(\)\.subscriptions\.(cancel|del)\(/u);
    assert.match(adapter, /client\(\)\.subscriptions\.update\(/u);
  });

  test('스트라이프가 실패해도 해지 요청은 남고, 되돌리지 않는다', () => {
    const route = source('src/app/api/subscription/cancel/route.ts');
    // Skip the import block: indexOf would otherwise find the imported symbol, not the call.
    const body = route.slice(route.indexOf('export const POST'));
    const recordAt = body.indexOf('setCancelRequested');
    const stripeAt = body.indexOf('cancelStripeSubscriptionAtPeriodEnd');
    assert.ok(recordAt > 0 && stripeAt > 0);
    // Recorded first: everything after may fail and the intent still stands.
    assert.ok(recordAt < stripeAt, 'the request must be recorded before Stripe is called');
    assert.match(route, /needsAttention/u);
    assert.doesNotMatch(route, /rollback|revert/iu);
  });

  test('배치는 해지를 요청한 고객만 정리한다', () => {
    const sweep = source('src/lib/subscriptions/cancellation.ts');
    assert.match(sweep, /cancelRequestedAt/u);
    assert.match(sweep, /status !== 'active'/u);
    // An expired period without a request is a lapse, not a cancellation.
    assert.match(sweep, /continue/u);
  });
});

describe('cancellation — an operator can see a billing stop that did not take', () => {
  const state = (over: Partial<{ clientId: string; currentPeriodEnd: string }> = {}) => ({
    clientId: over.clientId ?? 'c1',
    status: 'active' as const,
    currentPeriodEnd: over.currentPeriodEnd ?? '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  });

  test('취소 요청 뒤의 갱신을 최신 갱신일로 노출한다 — 그것이 감지 근거다', () => {
    const listing = buildAdminSiteSubscriptionListing({
      states: [state()],
      renewals: [
        { clientId: 'c1', periodStart: '2026-07-01T00:00:00.000Z', reversedAt: null },
        { clientId: 'c1', periodStart: '2026-09-01T00:00:00.000Z', reversedAt: null },
      ],
      at: new Date('2026-09-15T00:00:00.000Z'),
    });
    const item = listing.items[0];
    assert.equal(item.firstRenewedAt, '2026-07-01T00:00:00.000Z');
    assert.equal(item.lastRenewedAt, '2026-09-01T00:00:00.000Z');
    // The comparison the admin route makes: a renewal dated after the request is a wrong charge.
    const cancelRequestedAt = '2026-08-10T00:00:00.000Z';
    assert.equal(Date.parse(item.lastRenewedAt!) > Date.parse(cancelRequestedAt), true);
  });

  test('취소 전 갱신만 있으면 깃발은 서지 않는다 — 정상 해지는 조용해야 한다', () => {
    const listing = buildAdminSiteSubscriptionListing({
      states: [state()],
      renewals: [{ clientId: 'c1', periodStart: '2026-07-01T00:00:00.000Z', reversedAt: null }],
      at: new Date('2026-09-15T00:00:00.000Z'),
    });
    const cancelRequestedAt = '2026-08-10T00:00:00.000Z';
    assert.equal(
      Date.parse(listing.items[0].lastRenewedAt!) > Date.parse(cancelRequestedAt),
      false,
    );
  });

  test('되돌린 갱신은 청구로 치지 않는다', () => {
    const listing = buildAdminSiteSubscriptionListing({
      states: [state()],
      renewals: [
        { clientId: 'c1', periodStart: '2026-09-01T00:00:00.000Z', reversedAt: '2026-09-02T00:00:00.000Z' },
      ],
      at: new Date('2026-09-15T00:00:00.000Z'),
    });
    assert.equal(listing.items[0].lastRenewedAt, null);
  });

  test('운영자 화면이 그 상태를 실제로 그린다', () => {
    const route = source('src/app/api/admin/subscriptions/route.ts');
    assert.match(route, /chargedAfterCancelRequest/u);
    const board = source('src/components/admin/subscriptions-board.tsx');
    assert.match(board, /Charged after cancelling/u);
    assert.match(board, /Cancels at period end/u);
  });
});
