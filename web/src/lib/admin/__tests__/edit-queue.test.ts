import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { getMockStore, resetMockStore } from '@/lib/data/mock/store';
import type { CreditLedgerEntry, EditRequest, EditStatus } from '@/lib/types/domain';
import {
  ADMIN_EDIT_QUEUE_STATUSES,
  AdminEditQueueError,
  deriveEditCreditAudit,
} from '../edit-queue-core';
import { MockAdminEditQueueRepository } from '../edit-queue-repository-mock';

const CLIENT_ID = 'demo-premium';
const SITE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function request(id: string, status: EditStatus, createdAt: string, creditCost = 1): EditRequest {
  return {
    id,
    clientId: CLIENT_ID,
    siteId: SITE_ID,
    type: 'image',
    creditCost,
    status,
    requestedContent: `${id} 수정 요청`,
    aiOutput: null,
    createdAt,
    appliedAt: status === 'applied' ? '2026-07-10T00:00:00.000Z' : null,
  };
}

function ledger(
  id: string,
  referenceId: string,
  amount: number,
  reason: CreditLedgerEntry['reason'] = amount < 0 ? 'edit_image' : 'refund',
  clientId = CLIENT_ID,
): CreditLedgerEntry {
  return {
    id,
    clientId,
    amount,
    reason,
    referenceId,
    expiresAt: amount > 0 ? '2027-07-01T00:00:00.000Z' : null,
    createdAt: '2026-07-01T00:00:00.000Z',
  };
}

describe('ADM3 credit audit core', () => {
  test('actual charge comes from matching append-only ledger rows, not creditCost', () => {
    const edit = request('request-1', 'pending', '2026-07-01T00:00:00.000Z', 9);
    assert.deepEqual(deriveEditCreditAudit(edit, [
      ledger('charge', edit.id, -2),
      ledger('partial-refund', edit.id, 1),
      ledger('foreign-owner', edit.id, -8, 'edit_image', 'another-client'),
      ledger('another-request', 'request-2', -5),
    ]), {
      ledgerEntryCount: 2,
      netCreditCharge: 1,
      creditCharged: true,
    });
  });

  test('full refund and no-ledger direct edits both report no remaining charge', () => {
    const refunded = request('request-refunded', 'rejected', '2026-07-01T00:00:00.000Z');
    assert.deepEqual(deriveEditCreditAudit(refunded, [
      ledger('charge', refunded.id, -1),
      ledger('refund', refunded.id, 1),
    ]), {
      ledgerEntryCount: 2,
      netCreditCharge: 0,
      creditCharged: false,
    });
    assert.equal(deriveEditCreditAudit(
      request('free-direct', 'pending', '2026-07-01T00:00:00.000Z', 0),
      [],
    ).creditCharged, false);
  });
});

function mockRepository() {
  resetMockStore();
  const store = getMockStore();
  store.editRequests.clear();
  store.ledger.splice(0, store.ledger.length);
  const repository = new MockAdminEditQueueRepository(
    store,
    () => '2026-07-17T12:00:00.000Z',
  );
  return { store, repository };
}

function completionInput(store: ReturnType<typeof getMockStore>, editRequestId: string) {
  const site = store.sites.get(SITE_ID)!;
  return {
    editRequestId,
    actorType: 'admin' as const,
    actorId: 'admin-test',
    expectedDraftConfig: structuredClone(site.draftConfig),
    expectedSiteConfig: structuredClone(site.siteConfig),
    nextDraftConfig: structuredClone(site.draftConfig),
    nextSiteConfig: structuredClone(site.siteConfig),
  };
}

describe('ADM3 admin edit queue repository', () => {
  test('lists every nonterminal state oldest-first and audits actual net charges', async () => {
    const { store, repository } = mockRepository();
    const pending = request('pending-id', 'pending', '2026-07-03T00:00:00.000Z', 2);
    const processing = request('processing-id', 'ai_processing', '2026-07-01T00:00:00.000Z');
    const review = request('review-id', 'qa_review', '2026-07-02T00:00:00.000Z');
    for (const edit of [pending, processing, review, request('done-id', 'applied', '2026-06-01T00:00:00.000Z')]) {
      store.editRequests.set(edit.id, edit);
    }
    store.ledger.push(
      ledger('pending-charge', pending.id, -2),
      ledger('review-charge', review.id, -1),
      ledger('review-refund', review.id, 1),
    );

    const queue = await repository.listNonterminal();
    assert.equal(await repository.countNonterminal(), 3);
    assert.deepEqual(queue.map((item) => item.id), ['processing-id', 'review-id', 'pending-id']);
    assert.deepEqual(queue.map((item) => item.status), ['ai_processing', 'qa_review', 'pending']);
    assert.equal(queue.find((item) => item.id === pending.id)?.netCreditCharge, 2);
    assert.equal(queue.find((item) => item.id === review.id)?.creditCharged, false);
  });

  test('conditional completion is race-safe and duplicate application preserves the first timestamp', async () => {
    const { store, repository } = mockRepository();
    const edit = request('race-id', 'qa_review', '2026-07-01T00:00:00.000Z');
    store.editRequests.set(edit.id, edit);
    store.ledger.push(ledger('race-charge', edit.id, -1));
    const ledgerBefore = structuredClone(store.ledger);
    const input = completionInput(store, edit.id);
    const [first, second] = await Promise.all([
      repository.complete(input),
      repository.complete(input),
    ]);
    assert.deepEqual([first.duplicated, second.duplicated].sort(), [false, true]);
    assert.equal(first.record.appliedAt, '2026-07-17T12:00:00.000Z');
    assert.equal(second.record.appliedAt, first.record.appliedAt);
    assert.equal(store.editRequests.get(edit.id)?.status, 'applied');
    assert.equal(store.editRequests.get(edit.id)?.qaNote, 'ADMIN_APPLIED_TO_PUBLISHED_SITE');
    assert.deepEqual(store.ledger, ledgerBefore, 'completion only closes the request; it never rewrites credits');
  });

  test('only QA-ready work completes; in-flight, rejected and missing requests fail closed', async () => {
    const { store, repository } = mockRepository();
    const ready = request('open-qa_review', 'qa_review', '2026-07-01T00:00:00.000Z');
    store.editRequests.set(ready.id, ready);
    assert.equal((await repository.complete(completionInput(store, ready.id))).record.status, 'applied');
    for (const status of ADMIN_EDIT_QUEUE_STATUSES.filter((value) => value !== 'qa_review')) {
      const edit = request(`in-flight-${status}`, status, '2026-07-01T00:00:00.000Z');
      store.editRequests.set(edit.id, edit);
      await assert.rejects(
        repository.complete(completionInput(store, edit.id)),
        (error) => error instanceof AdminEditQueueError && error.code === 'ADMIN_EDIT_REQUEST_STATE_CONFLICT',
      );
    }
    const rejected = request('rejected-id', 'rejected', '2026-07-01T00:00:00.000Z');
    store.editRequests.set(rejected.id, rejected);
    await assert.rejects(
      repository.complete(completionInput(store, rejected.id)),
      (error) => error instanceof AdminEditQueueError && error.code === 'ADMIN_EDIT_REQUEST_REJECTED',
    );
    await assert.rejects(
      repository.complete(completionInput(store, 'missing-id')),
      (error) => error instanceof AdminEditQueueError && error.code === 'ADMIN_EDIT_REQUEST_NOT_FOUND',
    );
  });
});

describe('ADM3 Supabase repository wiring', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/lib/admin/edit-queue-repository.ts'),
    'utf8',
  );

  test('queue query includes all and only nonterminal states and reads ledger by referenceId', () => {
    assert.match(source, /\.in\('status', ADMIN_EDIT_QUEUE_STATUSES\)/);
    assert.match(source, /\.in\('reference_id', requests\.map\(\(request\) => request\.id\)\)/);
    assert.match(source, /deriveAdminEditQueueItem\(request, ledger\)/);
  });

  test('completion delegates site application and terminal state to one transactional RPC', () => {
    assert.match(source, /rpc\('complete_edit_request_fulfillment'/);
    assert.match(source, /p_expected_draft_config: input\.expectedDraftConfig/);
    assert.match(source, /p_next_site_config: input\.nextSiteConfig/);
  });
});
