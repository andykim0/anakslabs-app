import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { subscriptionStatusLabel } from '../billing-view';
import type { ResolvedSubscription, SiteSubscriptionStatus } from '@/lib/subscriptions/core';

function resolved(status: SiteSubscriptionStatus, active: boolean): ResolvedSubscription {
  return {
    active,
    state: {
      clientId: 'client-1',
      status,
      currentPeriodEnd: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
  };
}

describe('billing authoritative subscription label', () => {
  test('resolved active만 이용 중으로 표시한다', () => {
    assert.equal(subscriptionStatusLabel(resolved('active', true)), 'In use');
    assert.notEqual(subscriptionStatusLabel(resolved('past_due', false)), 'In use');
    assert.notEqual(subscriptionStatusLabel(resolved('suspended', false)), 'In use');
    assert.notEqual(subscriptionStatusLabel(resolved('cancelled', false)), 'In use');
  });

  test('기간이 끝난 persisted active 행은 이용 중이 아니라 만료로 표시한다', () => {
    assert.equal(subscriptionStatusLabel(resolved('active', false)), 'Expiration of usage period');
  });

  test('상태 행이 없으면 구독 전으로 표시한다', () => {
    assert.equal(subscriptionStatusLabel({ state: null, active: false }), 'Before subscribing');
  });
});
