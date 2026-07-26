import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { PRICING, PRICING_MODEL_VERSION } from '@/lib/pricing';
import { acceptedPaymentAmounts, paymentAmountSubject } from '../amount-policy';

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');

describe('PRICE R1 monthly-retainer publish-payment contract', () => {
  test('신규 인테리어 가격은 제작비 0·월 49만원·1개월·자동 갱신·1사이트다', () => {
    assert.equal(PRICING.modelVersion, PRICING_MODEL_VERSION);
    assert.deepEqual(PRICING.build, { amountKrw: 0, paymentTiming: 'publish' });
    assert.equal(PRICING.subscription.amountKrw, 490_000);
    assert.equal(PRICING.subscription.periodMonths, 1);
    assert.equal(PRICING.subscription.billingInterval, 'month');
    assert.equal(PRICING.subscription.automaticRenewal, true);
    assert.equal(PRICING.subscription.annualCommitment.status, 'available');
    assert.equal(PRICING.subscription.annualCommitment.amountKrw, 4_900_000);
    assert.equal(PRICING.subscription.annualCommitment.freeMonths, 2);
    assert.equal(PRICING.siteCount, 1);
  });

  test('신규 제작비 주문은 fail-closed하고 월 구독·애드온만 현재 가격을 갖는다', () => {
    assert.equal(paymentAmountSubject({ type: 'build_fee' }), null);
    assert.deepEqual(acceptedPaymentAmounts({ type: 'maintenance_subscription' }), [490_000]);
    assert.deepEqual(acceptedPaymentAmounts({ type: 'premium_addon' }), [200_000]);
  });

  test('0043의 프리미엄·TTL·비용 이벤트를 유지하고 0044가 구독 계약을 파라미터화한다', () => {
    const base = read('../supabase/migrations/0043_pricing_v2.sql');
    const sql = read('../supabase/migrations/0044_monthly_retainer_pricing.sql');
    assert.match(base, /'premium_addon'/);
    assert.match(base, /create or replace function public\.handle_premium_addon_payment/);
    assert.match(base, /manual_payment_entries_reject_retired_receipt/);
    assert.match(base, /new\.product_kind in \('launch_build', 'list_build'\)/);
    assert.match(base, /add column draft_expires_at timestamptz/);
    assert.match(
      base,
      /alter column draft_expires_at set default \(now\(\) \+ interval '30 days'\)/,
    );
    assert.match(base, /now\(\) \+ interval '30 days'/);
    assert.match(base, /create table public\.build_economics_events/);
    assert.match(base, /cost_usd_micros\s+bigint/);
    assert.match(base, /pricing_model_version text not null/);
    assert.match(base, /idempotency_key\s+text not null unique/);
    assert.match(sql, /p_pricing_model_version text/);
    assert.match(sql, /p_period_months integer/);
    assert.match(
      sql,
      /'payment_webhook',[\s\S]*?p_period_months,[\s\S]*?v_payment_id/,
    );
    assert.doesNotMatch(
      sql.match(
        /create or replace function public\.handle_maintenance_payment\([\s\S]*?\n\$\$;/,
      )?.[0] ?? '',
      /150000|390000|29900/,
    );
    assert.match(sql, /pricing_model_version, service_period_months/);
    assert.match(sql, /record_manual_collection_v3/);

    for (const comment of `${base}\n${sql}`.split('\n').filter((line) => line.trimStart().startsWith('--'))) {
      assert.doesNotMatch(comment, /\$/, `migration comment contains forbidden dollar sign: ${comment}`);
    }
    assert.doesNotMatch(sql, /\bif\b[^;\n]*\bcase\b/i, 'IF conditions must precompute CASE values');
  });

  test('개발 seed의 기존 연간 증거는 가격 버전·기간을 명시해 보존된다', () => {
    const seed = read('../supabase/seed.sql');
    assert.match(
      seed,
      /handle_maintenance_payment\([\s\S]*?'mock_toss_hwarodam_maint_2026_07',[\s\S]*?390000,[\s\S]*?'annual-v2-2026-07',[\s\S]*?12/,
    );
  });
});
