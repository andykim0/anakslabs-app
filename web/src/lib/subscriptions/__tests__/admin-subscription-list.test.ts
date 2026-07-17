import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DEMO_BASIC_ID } from '@/lib/data/mock/seed';
import { resetMockStore } from '@/lib/data/mock/store';
import {
  buildAdminSiteSubscriptionListing,
  type SiteSubscriptionState,
} from '../core';
import {
  listMockSiteSubscriptionsForAdmin,
  renewMockSiteSubscription,
  setMockSiteSubscriptionStatus,
} from '../mock';

const AS_OF = new Date('2026-07-17T03:00:00.000Z');

function state(
  clientId: string,
  status: SiteSubscriptionState['status'],
  currentPeriodEnd: string,
  updatedAt = '2026-07-01T00:00:00.000Z',
): SiteSubscriptionState {
  return { clientId, status, currentPeriodEnd, updatedAt };
}

describe('ADM2 authoritative subscription admin listing', () => {
  test('lists every state, resolves active fail-closed and counts the KST month from evidence', () => {
    const listing = buildAdminSiteSubscriptionListing({
      at: AS_OF,
      states: [
        state('active-current', 'active', '2026-08-01T00:00:00.000Z'),
        state('active-expired', 'active', '2026-07-01T00:00:00.000Z'),
        state(
          'cancelled-current',
          'cancelled',
          '2026-08-01T00:00:00.000Z',
          '2026-07-31T14:59:59.999Z',
        ),
        state('past-due', 'past_due', '2026-08-01T00:00:00.000Z'),
      ],
      renewals: [
        {
          clientId: 'active-current',
          periodStart: '2026-06-20T00:00:00.000Z',
          reversedAt: '2026-06-21T00:00:00.000Z',
        },
        {
          clientId: 'active-current',
          periodStart: '2026-06-30T15:00:00.000Z',
          reversedAt: null,
        },
        {
          clientId: 'active-expired',
          periodStart: '2026-06-30T14:59:59.999Z',
          reversedAt: null,
        },
        {
          clientId: 'cancelled-current',
          periodStart: '2026-05-01T00:00:00.000Z',
          reversedAt: null,
        },
      ],
    });

    assert.equal(listing.asOf, AS_OF.toISOString());
    assert.equal(listing.items.length, 4);
    assert.deepEqual(
      listing.items.filter((item) => item.active).map((item) => item.state.clientId),
      ['active-current'],
    );
    assert.equal(
      listing.items.find((item) => item.state.clientId === 'past-due')?.firstRenewedAt,
      null,
    );
    assert.deepEqual(listing.summary, {
      periodMonth: '2026-07',
      newCount: 1,
      cancelledCount: 1,
      calculation: 'simple-churn',
    });
  });

  test('reversed or malformed evidence cannot silently inflate operational counts', () => {
    const listing = buildAdminSiteSubscriptionListing({
      at: AS_OF,
      states: [state('client-1', 'cancelled', AS_OF.toISOString(), AS_OF.toISOString())],
      renewals: [
        {
          clientId: 'client-1',
          periodStart: '2026-07-01T00:00:00.000Z',
          reversedAt: '2026-07-02T00:00:00.000Z',
        },
      ],
    });
    assert.equal(listing.items[0]?.firstRenewedAt, null);
    assert.equal(listing.summary.newCount, 0);
    assert.equal(listing.summary.cancelledCount, 1);

    assert.throws(
      () =>
        buildAdminSiteSubscriptionListing({
          at: AS_OF,
          states: [],
          renewals: [{ clientId: 'client-1', periodStart: 'invalid', reversedAt: null }],
        }),
      /RENEWAL_EVIDENCE_INVALID/,
    );
  });

  test('mock listing uses the same canonical state and simple-churn projection', () => {
    resetMockStore();
    renewMockSiteSubscription({
      clientId: DEMO_BASIC_ID,
      idempotencyKey: 'admin:adm2-mock',
      source: 'admin_manual',
      at: AS_OF,
    });
    const active = listMockSiteSubscriptionsForAdmin(AS_OF).items.find(
      (item) => item.state.clientId === DEMO_BASIC_ID,
    );
    assert.equal(active?.active, true);
    assert.equal(active?.firstRenewedAt, AS_OF.toISOString());

    setMockSiteSubscriptionStatus(DEMO_BASIC_ID, 'cancelled', AS_OF);
    const cancelled = listMockSiteSubscriptionsForAdmin(AS_OF);
    assert.equal(
      cancelled.items.find((item) => item.state.clientId === DEMO_BASIC_ID)?.active,
      false,
    );
    assert.ok(cancelled.summary.cancelledCount >= 1);
  });
});
