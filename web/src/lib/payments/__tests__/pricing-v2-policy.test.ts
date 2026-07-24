import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { PRICING, PRICING_MODEL_VERSION } from '@/lib/pricing';
import { acceptedPaymentAmounts, paymentAmountSubject } from '../amount-policy';

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');

describe('PRICE P1 annual publish-payment contract', () => {
  test('신규 가격은 제작비 0·연 39만원·12개월·자동 갱신·1사이트다', () => {
    assert.equal(PRICING.modelVersion, PRICING_MODEL_VERSION);
    assert.deepEqual(PRICING.build, { amountKrw: 0, paymentTiming: 'publish' });
    assert.equal(PRICING.subscription.annual, 390_000);
    assert.equal(PRICING.subscription.periodMonths, 12);
    assert.equal(PRICING.subscription.automaticRenewal, true);
    assert.equal(PRICING.siteCount, 1);
  });

  test('신규 제작비 주문은 fail-closed하고 연간 구독·애드온만 현재 가격을 갖는다', () => {
    assert.equal(paymentAmountSubject({ type: 'build_fee' }), null);
    assert.deepEqual(acceptedPaymentAmounts({ type: 'maintenance_subscription' }), [390_000]);
    assert.deepEqual(acceptedPaymentAmounts({ type: 'premium_addon' }), [200_000]);
  });

  test('0043은 연간 결제·프리미엄 타입·TTL·비용 이벤트를 한 스키마로 고정한다', () => {
    const sql = read('../supabase/migrations/0043_pricing_v2.sql');
    assert.match(sql, /'premium_addon'/);
    assert.match(sql, /p_amount is distinct from 390000::numeric/);
    assert.match(
      sql,
      /public\.renew_site_subscription\([\s\S]*?'payment_webhook',[\s\S]*?12,/,
    );
    assert.match(sql, /create or replace function public\.handle_premium_addon_payment/);
    assert.match(sql, /manual_payment_entries_reject_retired_receipt/);
    assert.match(sql, /new\.product_kind in \('launch_build', 'list_build'\)/);
    assert.match(sql, /add column draft_expires_at timestamptz/);
    assert.match(
      sql,
      /alter column draft_expires_at set default \(now\(\) \+ interval '30 days'\)/,
    );
    assert.match(sql, /now\(\) \+ interval '30 days'/);
    assert.match(sql, /create table public\.build_economics_events/);
    assert.match(sql, /cost_usd_micros\s+bigint/);
    assert.match(sql, /pricing_model_version text not null/);
    assert.match(sql, /idempotency_key\s+text not null unique/);

    for (const comment of sql.split('\n').filter((line) => line.trimStart().startsWith('--'))) {
      assert.doesNotMatch(comment, /\$/, `migration comment contains forbidden dollar sign: ${comment}`);
    }
    assert.doesNotMatch(sql, /\bif\b[^;\n]*\bcase\b/i, 'IF conditions must precompute CASE values');
  });

  test('개발 seed도 신규 연간 계약을 거쳐 전체 리플레이된다', () => {
    const seed = read('../supabase/seed.sql');
    assert.match(
      seed,
      /handle_maintenance_payment\([\s\S]*?'mock_toss_hwarodam_maint_2026_07', 390000\)/,
    );
  });
});
