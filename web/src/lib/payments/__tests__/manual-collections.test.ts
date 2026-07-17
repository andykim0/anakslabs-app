import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { CREDIT_PACKS } from '@/lib/credits/constants';
import { DEMO_BASIC_ID, DEMO_PREMIUM_ID, HWARODAM_SITE_ID } from '@/lib/data/mock/seed';
import { getMockStore, resetMockStore } from '@/lib/data/mock/store';
import { PRICING } from '@/lib/pricing';
import { getMockSiteSubscription } from '@/lib/subscriptions/mock';
import {
  manualCollectionQuote,
  normalizeRecordManualCollectionInput,
} from '../manual-collection-core';
import { MockManualCollectionsRepository } from '../manual-collections-mock';

describe('OPS O1 manual collection contract', () => {
  test('derives every accepted amount from pricing and credit-pack sources', () => {
    assert.equal(manualCollectionQuote({ productKind: 'launch_build' })?.amountKrw, PRICING.base.launch);
    assert.equal(manualCollectionQuote({ productKind: 'list_build' })?.amountKrw, PRICING.base.list);
    assert.equal(manualCollectionQuote({ productKind: 'video_addon' })?.amountKrw, PRICING.videoHeroAddon);
    assert.equal(manualCollectionQuote({ productKind: 'subscription' })?.amountKrw, PRICING.subscription.monthly);
    for (const pack of CREDIT_PACKS) {
      assert.deepEqual(manualCollectionQuote({
        productKind: 'credit_pack',
        creditPackCredits: pack.credits,
      }), {
        paymentType: 'credit_pack',
        amountKrw: pack.priceKrw,
        creditsGranted: pack.credits,
      });
    }
    assert.equal(manualCollectionQuote({ productKind: 'credit_pack', creditPackCredits: 2 }), null);
  });

  test('rejects arbitrary money and requires site evidence for build/video receipts', () => {
    assert.throws(() => normalizeRecordManualCollectionInput({
      clientId: DEMO_PREMIUM_ID,
      siteId: HWARODAM_SITE_ID,
      productKind: 'launch_build',
      amountKrw: PRICING.base.launch + 1,
      channel: 'kmong',
      collectionReference: 'order-bad-price',
    }), /AMOUNT_MISMATCH/);
    assert.throws(() => normalizeRecordManualCollectionInput({
      clientId: DEMO_PREMIUM_ID,
      productKind: 'video_addon',
      amountKrw: PRICING.videoHeroAddon,
      channel: 'kmong',
      collectionReference: 'order-no-site',
    }), /SITE_REQUIRED/);
  });

  test('mock receipt/retry/reversal preserves one payment row and immutable companion history', async () => {
    resetMockStore();
    const repository = new MockManualCollectionsRepository();
    const input = {
      clientId: DEMO_PREMIUM_ID,
      siteId: HWARODAM_SITE_ID,
      productKind: 'launch_build' as const,
      amountKrw: PRICING.base.launch,
      channel: 'kmong' as const,
      collectionReference: 'KMONG-OPS-001',
      memo: '런칭 고객 수금',
    };
    const before = getMockStore().payments.size;
    const first = await repository.record(input);
    const retry = await repository.record(input);
    assert.equal(first.duplicated, false);
    assert.equal(retry.duplicated, true);
    assert.equal(retry.record.entry.id, first.record.entry.id);
    assert.equal(getMockStore().payments.size, before + 1);

    await assert.rejects(repository.record({ ...input, siteId: null }), /SITE_REQUIRED/);
    const reversed = await repository.reverse({
      entryId: first.record.entry.id,
      collectionReference: 'KMONG-OPS-001-CORRECTION',
      memo: '중복 입금 기록 정정',
    });
    const reversedRetry = await repository.reverse({
      entryId: first.record.entry.id,
      collectionReference: 'KMONG-OPS-001-CORRECTION',
      memo: '중복 입금 기록 정정',
    });
    assert.equal(reversed.record.entry.direction, 'reversal');
    assert.equal(reversed.record.payment, null);
    assert.equal(reversedRetry.duplicated, true);
    assert.equal(getMockStore().payments.size, before + 1, 'correction must not forge a positive payment');
    assert.equal((await repository.listAll()).length, 2);
  });

  test('manual subscription receipt and reversal keep period and monthly credits atomic', async () => {
    resetMockStore();
    const repository = new MockManualCollectionsRepository();
    const creditsBefore = getMockStore().ledger
      .filter((entry) => entry.clientId === DEMO_BASIC_ID)
      .reduce((sum, entry) => sum + entry.amount, 0);
    const receipt = await repository.record({
      clientId: DEMO_BASIC_ID,
      productKind: 'subscription',
      amountKrw: PRICING.subscription.monthly,
      channel: 'kmong',
      collectionReference: 'KMONG-SUB-001',
    });
    assert.equal(getMockSiteSubscription(DEMO_BASIC_ID)?.status, 'active');
    const creditsAfterReceipt = getMockStore().ledger
      .filter((entry) => entry.clientId === DEMO_BASIC_ID)
      .reduce((sum, entry) => sum + entry.amount, 0);
    assert.equal(creditsAfterReceipt, creditsBefore + PRICING.subscription.creditsPerMonth);

    await repository.reverse({
      entryId: receipt.record.entry.id,
      collectionReference: 'KMONG-SUB-001-CORRECTION',
      memo: '잘못 연결한 구독 수금 정정',
    });
    assert.equal(getMockSiteSubscription(DEMO_BASIC_ID)?.status, 'cancelled');
    const creditsAfterReversal = getMockStore().ledger
      .filter((entry) => entry.clientId === DEMO_BASIC_ID)
      .reduce((sum, entry) => sum + entry.amount, 0);
    assert.equal(creditsAfterReversal, creditsBefore);
  });

  test('migration makes manual evidence and attached payments append-only and service-only', () => {
    const sql = readFileSync(
      join(process.cwd(), '../supabase/migrations/0017_manual_payment_entries.sql'),
      'utf8',
    );
    assert.match(sql, /create table public\.manual_payment_entries/);
    assert.match(sql, /manual_payment_entries_append_only[\s\S]*before update or delete/);
    assert.match(sql, /manual_payments_append_only[\s\S]*before update or delete on public\.payments/);
    assert.match(sql, /alter table public\.manual_payment_entries enable row level security/);
    assert.match(sql, /revoke all on table public\.manual_payment_entries from public, anon, authenticated, service_role/);
    assert.match(sql, /grant select on table public\.manual_payment_entries to service_role/);
    assert.match(sql, /perform public\.renew_site_subscription\(/);
    assert.match(sql, /perform public\.grant_credits\(/);
    assert.match(sql, /direction = 'reversal'[\s\S]*reverses_entry_id is not null/);
  });
});
