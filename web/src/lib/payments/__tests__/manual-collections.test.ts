import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { CREDIT_PACKS } from '@/lib/credits/constants';
import { DEMO_BASIC_ID, DEMO_PREMIUM_ID, HWARODAM_SITE_ID } from '@/lib/data/mock/seed';
import { getMockStore, resetMockStore } from '@/lib/data/mock/store';
import { LEGACY_PRICING, PRICING } from '@/lib/pricing';
import { getMockSiteSubscription } from '@/lib/subscriptions/mock';
import {
  manualCollectionQuote,
  normalizeRecordManualCollectionInput,
} from '../manual-collection-core';
import { MockManualCollectionsRepository } from '../manual-collections-mock';

describe('OPS O1 manual collection contract', () => {
  test('현재 수금은 유지비만 허용하고 과거 견적은 읽기 경계에만 남긴다', () => {
    assert.equal(manualCollectionQuote({ productKind: 'launch_build' })?.amountKrw, LEGACY_PRICING.build.launch);
    assert.equal(manualCollectionQuote({ productKind: 'list_build' })?.amountKrw, LEGACY_PRICING.build.list);
    assert.equal(manualCollectionQuote({ productKind: 'video_addon' })?.amountKrw, LEGACY_PRICING.videoHeroAddon);
    assert.equal(manualCollectionQuote({ productKind: 'subscription' })?.amountKrw, PRICING.subscription.amountKrw);
    for (const pack of CREDIT_PACKS) assert.equal(manualCollectionQuote({ productKind: 'credit_pack', creditPackCredits: pack.credits }), null);
    assert.equal(manualCollectionQuote({ productKind: 'credit_pack', creditPackCredits: 2 }), null);
  });

  test('rejects arbitrary money and ambiguous customers while allowing collection before a site exists', () => {
    assert.throws(() => normalizeRecordManualCollectionInput({
      clientId: DEMO_PREMIUM_ID,
      siteId: HWARODAM_SITE_ID,
      productKind: 'video_addon',
      amountKrw: LEGACY_PRICING.videoHeroAddon,
      channel: 'kmong',
      collectionReference: 'order-bad-price',
    }), /PRODUCT_RETIRED/);
    const withoutSite = normalizeRecordManualCollectionInput({
      clientId: DEMO_PREMIUM_ID,
      productKind: 'subscription',
      amountKrw: PRICING.subscription.amountKrw,
      channel: 'kmong',
      collectionReference: 'order-no-site',
    });
    assert.equal(withoutSite.siteId, null);
    assert.throws(() => normalizeRecordManualCollectionInput({
      productKind: 'subscription',
      amountKrw: PRICING.subscription.amountKrw,
      channel: 'kmong',
      collectionReference: 'order-no-customer',
    }), /CUSTOMER_REQUIRED/);
    assert.throws(() => normalizeRecordManualCollectionInput({
      clientId: DEMO_PREMIUM_ID,
      customerName: '중복 고객',
      customerContact: '010-0000-0000',
      productKind: 'subscription',
      amountKrw: PRICING.subscription.amountKrw,
      channel: 'kmong',
      collectionReference: 'order-ambiguous-customer',
    }), /CUSTOMER_AMBIGUOUS/);
  });

  test('site-less mock receipt/retry/reversal preserves one payment row and immutable companion history', async () => {
    resetMockStore();
    const repository = new MockManualCollectionsRepository();
    const input = {
      clientId: DEMO_PREMIUM_ID,
      siteId: null,
      productKind: 'subscription' as const,
      amountKrw: PRICING.subscription.amountKrw,
      channel: 'kmong' as const,
      collectionReference: 'KMONG-OPS-001',
      memo: '영상 옵션 수금',
    };
    const before = getMockStore().payments.size;
    const first = await repository.record(input);
    const retry = await repository.record(input);
    assert.equal(first.duplicated, false);
    assert.equal(retry.duplicated, true);
    assert.equal(retry.record.entry.id, first.record.entry.id);
    assert.equal(getMockStore().payments.size, before + 1);

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

  test('accountless receipt links account then site without mutating its original evidence', async () => {
    resetMockStore();
    const repository = new MockManualCollectionsRepository();
    const store = getMockStore();
    const paymentsBefore = store.payments.size;
    const receipt = await repository.record({
      customerName: '크몽 고객',
      customerContact: 'kmong:owner-1024',
      productKind: 'subscription',
      amountKrw: PRICING.subscription.amountKrw,
      channel: 'kmong',
      collectionReference: 'KMONG-OPS2-ACCOUNTLESS-001',
      memo: '가입 전 선입금',
    });

    assert.equal(receipt.record.payment, null);
    assert.equal(receipt.record.entry.clientId, null);
    assert.equal(receipt.record.entry.siteId, null);
    assert.equal(store.payments.size, paymentsBefore);
    const original = store.manualPaymentEntries?.get(receipt.record.entry.id);
    assert.ok(original);
    assert.equal(original.clientId, null);
    assert.equal(original.siteId, null);

    const clientLink = await repository.linkClient({
      entryId: receipt.record.entry.id,
      clientId: DEMO_PREMIUM_ID,
      memo: '가입 완료 후 계정 연결',
    });
    assert.equal(clientLink.duplicated, false);
    assert.equal(clientLink.record.entry.clientId, DEMO_PREMIUM_ID);
    assert.ok(clientLink.record.payment);
    assert.equal(clientLink.record.links.length, 1);
    assert.equal(store.payments.size, paymentsBefore + 1);
    const clientRetry = await repository.linkClient({
      entryId: receipt.record.entry.id,
      clientId: DEMO_PREMIUM_ID,
    });
    assert.equal(clientRetry.duplicated, true);
    assert.equal(store.payments.size, paymentsBefore + 1);
    assert.equal(clientRetry.record.links.length, 1);

    const siteLink = await repository.linkSite({
      entryId: receipt.record.entry.id,
      siteId: HWARODAM_SITE_ID,
      memo: '제작 시작 후 사이트 연결',
    });
    assert.equal(siteLink.duplicated, false);
    assert.equal(siteLink.record.entry.siteId, HWARODAM_SITE_ID);
    assert.equal(siteLink.record.links.length, 2);
    const siteRetry = await repository.linkSite({
      entryId: receipt.record.entry.id,
      siteId: HWARODAM_SITE_ID,
    });
    assert.equal(siteRetry.duplicated, true);
    assert.equal(siteRetry.record.links.length, 2);
    assert.equal(original.clientId, null, 'append-only receipt must not be rewritten after linking');
    assert.equal(original.siteId, null, 'append-only receipt must not be rewritten after linking');
  });

  test('one-click cancellation is idempotent and retains the receipt plus one reversal', async () => {
    resetMockStore();
    const repository = new MockManualCollectionsRepository();
    const receipt = await repository.record({
      customerName: '취소 고객',
      customerContact: 'kmong:cancel-owner',
      productKind: 'subscription',
      amountKrw: PRICING.subscription.amountKrw,
      channel: 'kmong',
      collectionReference: 'KMONG-OPS2-CANCEL-001',
    });
    const cancellation = {
      entryId: receipt.record.entry.id,
      collectionReference: `cancel:${receipt.record.entry.id}`,
      memo: '관리자 원클릭 취소',
    };
    const first = await repository.reverse(cancellation);
    const retry = await repository.reverse(cancellation);
    assert.equal(first.duplicated, false);
    assert.equal(retry.duplicated, true);
    assert.equal(retry.record.entry.id, first.record.entry.id);
    const rows = await repository.listAll();
    assert.equal(rows.length, 2);
    assert.ok(rows.some(({ entry }) => entry.id === receipt.record.entry.id));
    assert.equal(rows.filter(({ entry }) => entry.reversesEntryId === receipt.record.entry.id).length, 1);
  });

  test('mock rejects another client site and retired credit-pack sales', async () => {
    resetMockStore();
    const repository = new MockManualCollectionsRepository();
    await assert.rejects(repository.record({
      clientId: DEMO_BASIC_ID,
      siteId: HWARODAM_SITE_ID,
      productKind: 'subscription',
      amountKrw: PRICING.subscription.amountKrw,
      channel: 'kmong',
      collectionReference: 'KMONG-WRONG-OWNER',
    }), /SITE_OWNERSHIP_MISMATCH/);

    const pack = CREDIT_PACKS[0];
    assert.ok(pack);
    await assert.rejects(repository.record({
      clientId: DEMO_BASIC_ID,
      productKind: 'credit_pack',
      creditPackCredits: pack.credits,
      amountKrw: pack.priceKrw,
      channel: 'kmong',
      collectionReference: 'KMONG-CREDIT-PACK-001',
    }), /PRODUCT_RETIRED/);
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
      amountKrw: PRICING.subscription.amountKrw,
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

  test('manual subscription corrections are LIFO and keep period/unused monthly credits authoritative', async () => {
    resetMockStore();
    const repository = new MockManualCollectionsRepository();
    const balance = () => getMockStore().ledger
      .filter((entry) => entry.clientId === DEMO_BASIC_ID)
      .reduce((sum, entry) => sum + entry.amount, 0);
    const creditsBefore = balance();
    const recordSubscription = (reference: string) => repository.record({
      clientId: DEMO_BASIC_ID,
      productKind: 'subscription',
      amountKrw: PRICING.subscription.amountKrw,
      channel: 'kmong',
      collectionReference: reference,
    });

    const first = await recordSubscription('KMONG-SUB-LIFO-001');
    const firstPeriodEnd = getMockSiteSubscription(DEMO_BASIC_ID)?.currentPeriodEnd;
    assert.ok(firstPeriodEnd);
    const latest = await recordSubscription('KMONG-SUB-LIFO-002');
    const latestPeriodEnd = getMockSiteSubscription(DEMO_BASIC_ID)?.currentPeriodEnd;
    assert.ok(latestPeriodEnd);
    assert.ok(Date.parse(latestPeriodEnd) > Date.parse(firstPeriodEnd));
    assert.equal(
      balance(),
      creditsBefore + PRICING.subscription.creditsPerMonth,
      'two collections in one calendar month still grant only one monthly benefit',
    );

    await assert.rejects(repository.reverse({
      entryId: first.record.entry.id,
      collectionReference: 'KMONG-SUB-LIFO-001-CORRECTION',
      memo: '과거 기간을 먼저 취소하려는 잘못된 순서',
    }), /MANUAL_REVERSAL_SUBSCRIPTION_NOT_LATEST/);
    assert.equal(getMockSiteSubscription(DEMO_BASIC_ID)?.currentPeriodEnd, latestPeriodEnd);
    assert.equal(balance(), creditsBefore + PRICING.subscription.creditsPerMonth);
    assert.equal((await repository.listAll()).length, 2, 'rejected correction must append nothing');

    const latestReversalInput = {
      entryId: latest.record.entry.id,
      collectionReference: 'KMONG-SUB-LIFO-002-CORRECTION',
      memo: '최신 구독 수금 정정',
    };
    await repository.reverse(latestReversalInput);
    assert.equal((await repository.reverse(latestReversalInput)).duplicated, true);
    assert.equal(getMockSiteSubscription(DEMO_BASIC_ID)?.currentPeriodEnd, firstPeriodEnd);
    assert.equal(
      balance(),
      creditsBefore + PRICING.subscription.creditsPerMonth,
      'the surviving active renewal keeps the one earned monthly benefit',
    );

    await repository.reverse({
      entryId: first.record.entry.id,
      collectionReference: 'KMONG-SUB-LIFO-001-CORRECTION-AFTER-LATEST',
      memo: '최신 기간 정정 후 남은 구독 수금 정정',
    });
    assert.equal(getMockSiteSubscription(DEMO_BASIC_ID)?.status, 'cancelled');
    assert.equal(balance(), creditsBefore, 'no surviving renewal means no unused monthly benefit remains');
  });

  test('cross-month LIFO corrections transfer every grant to stable receipt evidence', async () => {
    let at = new Date('2026-07-31T14:50:00.000Z');
    resetMockStore();
    const repository = new MockManualCollectionsRepository(() => new Date(at));
    const store = getMockStore();
    const balance = () => store.ledger
      .filter((entry) => entry.clientId === DEMO_BASIC_ID)
      .reduce((sum, entry) => sum + entry.amount, 0);
    const creditsBefore = balance();
    const recordSubscription = (reference: string) => repository.record({
      clientId: DEMO_BASIC_ID,
      productKind: 'subscription',
      amountKrw: PRICING.subscription.amountKrw,
      channel: 'kmong',
      collectionReference: reference,
    });

    const july = await recordSubscription('KMONG-SUB-CROSS-MONTH-07');
    assert.ok(july.record.payment);
    at = new Date('2026-07-31T15:10:00.000Z'); // Korea billing month is now August.
    const august = await recordSubscription('KMONG-SUB-CROSS-MONTH-08');
    assert.ok(august.record.payment);
    assert.equal(
      balance(),
      creditsBefore + PRICING.subscription.creditsPerMonth * 2,
      'collections in two Korean billing months each grant their earned benefit',
    );

    await repository.reverse({
      entryId: august.record.entry.id,
      collectionReference: 'KMONG-SUB-CROSS-MONTH-08-CORRECTION',
      memo: '최신 월 구독 수금 정정',
    });
    assert.equal(
      balance(),
      creditsBefore + PRICING.subscription.creditsPerMonth * 2,
      'the still-active July renewal retains both calendar-month benefits',
    );
    const julyLinkedRemaining = store.lots
      .filter((lot) => lot.clientId === DEMO_BASIC_ID && lot.remaining > 0)
      .filter((lot) => store.ledger.some((entry) =>
        entry.id === lot.entryId
          && entry.reason === 'subscription_grant'
          && entry.referenceId === july.record.payment?.id))
      .reduce((sum, lot) => sum + lot.remaining, 0);
    assert.equal(
      julyLinkedRemaining,
      PRICING.subscription.creditsPerMonth * 2,
      'transferred credits use the surviving immutable receipt payment id',
    );

    await repository.reverse({
      entryId: july.record.entry.id,
      collectionReference: 'KMONG-SUB-CROSS-MONTH-07-CORRECTION',
      memo: '남은 월 구독 수금 정정',
    });
    assert.equal(getMockSiteSubscription(DEMO_BASIC_ID)?.status, 'cancelled');
    assert.equal(
      balance(),
      creditsBefore,
      'reversing the final renewal claws every transferred unused month',
    );
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
    assert.match(
      sql,
      /only the latest subscription renewal can be reversed/,
      'SQL must reject a non-latest subscription correction before mutating its benefits',
    );
    assert.match(
      sql,
      /select r\.id into v_latest_renewal_id[\s\S]*?order by r\.period_end desc, r\.created_at desc, r\.id desc[\s\S]*?if v_latest_renewal_id is distinct from v_subscription_renewal_id/,
    );
    assert.ok(
      sql.indexOf('if v_latest_renewal_id is distinct from v_subscription_renewal_id')
        < sql.indexOf('-- Credits are append-only too:'),
      'latest-renewal rejection must happen before any credit or subscription side effect',
    );
    assert.match(
      sql,
      /v_replacement_source = 'admin_manual'[\s\S]*?select e\.payment_id into v_replacement_payment_id[\s\S]*?replacement manual payment evidence is missing/,
      'an active manual renewal must resolve to its immutable receipt payment id before transfer',
    );
    assert.match(
      sql,
      /for v_lot in[\s\S]*?manual_reversal_clawback:[\s\S]*?v_lot\.id::text[\s\S]*?manual_reversal_regrant:[\s\S]*?v_lot\.id::text/,
      'every transferred calendar-month lot keeps an independently idempotent append-only trail',
    );
    assert.match(
      sql,
      /revoke execute on function public\.record_manual_collection\([\s\S]*?\) from public, anon, authenticated;/,
    );
    assert.match(
      sql,
      /revoke execute on function public\.reverse_manual_collection\([\s\S]*?\) from public, anon, authenticated;/,
    );
    assert.match(
      sql,
      /grant execute on function public\.record_manual_collection\([\s\S]*?\) to service_role;/,
    );
    assert.match(
      sql,
      /grant execute on function public\.reverse_manual_collection\([\s\S]*?\) to service_role;/,
    );
  });

  test('0040 keeps account/site links append-only and obeys migration parser safeguards', () => {
    const sql = readFileSync(
      join(process.cwd(), '../supabase/migrations/0040_manual_payment_entries_flexible.sql'),
      'utf8',
    );
    assert.match(sql, /create table public\.manual_payment_entry_links/);
    assert.match(sql, /manual_payment_entry_links_append_only[\s\S]*before update or delete/);
    assert.match(sql, /alter column client_id drop not null/);
    assert.match(sql, /record_manual_collection_v2/);
    assert.match(sql, /link_manual_collection_client/);
    assert.match(sql, /link_manual_collection_site/);
    assert.match(sql, /reverse_manual_collection_v2/);
    for (const amount of [
      LEGACY_PRICING.build.launch,
      LEGACY_PRICING.build.list,
      LEGACY_PRICING.videoHeroAddon,
      LEGACY_PRICING.subscriptionMonthly,
      ...CREDIT_PACKS.map((pack) => pack.priceKrw),
    ]) {
      assert.match(sql, new RegExp(`${amount}::numeric`), `SQL price snapshot missing ${amount}`);
    }
    for (const comment of sql.split('\n').filter((line) => line.trimStart().startsWith('--'))) {
      assert.doesNotMatch(comment, /\$/, `migration comment contains forbidden dollar sign: ${comment}`);
    }
    assert.doesNotMatch(sql, /\bif\b[^;\n]*\bcase\b/i, 'IF conditions must precompute CASE values');
  });
});
