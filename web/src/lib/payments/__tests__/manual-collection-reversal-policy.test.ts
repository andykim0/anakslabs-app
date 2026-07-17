import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  manualCollectionReversibleEntryIds,
  type ManualPaymentEntry,
} from '../manual-collection-core';

function receipt(
  id: string,
  createdAt: string,
  productKind: ManualPaymentEntry['productKind'] = 'subscription',
): ManualPaymentEntry {
  return {
    id,
    paymentId: `payment-${id}`,
    clientId: 'client-one',
    siteId: null,
    productKind,
    direction: 'receipt',
    amountKrw: 29_900,
    channel: 'kmong',
    collectionReference: `reference-${id}`,
    memo: null,
    reversesEntryId: null,
    createdAt,
  };
}

describe('OPS O4 manual reversal presentation policy', () => {
  test('only the latest unreversed subscription receipt is offered for reversal', () => {
    const first = receipt('first', '2026-06-01T00:00:00.000Z');
    const latest = receipt('latest', '2026-07-01T00:00:00.000Z');
    assert.deepEqual(
      [...manualCollectionReversibleEntryIds([first, latest])],
      [latest.id],
    );
  });

  test('after the latest correction, the preceding subscription becomes reversible', () => {
    const first = receipt('first', '2026-06-01T00:00:00.000Z');
    const latest = receipt('latest', '2026-07-01T00:00:00.000Z');
    const reversal: ManualPaymentEntry = {
      ...latest,
      id: 'latest-reversal',
      paymentId: null,
      direction: 'reversal',
      collectionReference: 'reference-latest-reversal',
      reversesEntryId: latest.id,
      createdAt: '2026-07-02T00:00:00.000Z',
    };
    assert.deepEqual(
      [...manualCollectionReversibleEntryIds([first, latest, reversal])],
      [first.id],
    );
  });

  test('ordinary receipts remain reversible and malformed subscription time fails closed', () => {
    const build = receipt('build', '2026-07-01T00:00:00.000Z', 'launch_build');
    const malformed = receipt('bad-subscription', 'not-a-date');
    assert.deepEqual(
      [...manualCollectionReversibleEntryIds([build, malformed])],
      [build.id],
    );
  });

  test('the admin API reports out-of-order subscription reversal as a conflict', () => {
    const route = readFileSync(
      join(process.cwd(), 'src/app/api/admin/payments/manual/[entryId]/reverse/route.ts'),
      'utf8',
    );
    assert.match(route, /SUBSCRIPTION_NOT_LATEST\|only the latest subscription renewal/);
    assert.match(route, /MANUAL_SUBSCRIPTION_REVERSAL_ORDER_REQUIRED/);
    assert.match(route, /가장 최근 갱신부터 역순/);
  });
});
