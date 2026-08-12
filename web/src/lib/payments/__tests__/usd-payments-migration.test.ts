import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

const MIGRATIONS = join(process.cwd(), '..', 'supabase', 'migrations');

function migrationSource(prefix: string): string {
  const matches = readdirSync(MIGRATIONS).filter((name) => name.startsWith(prefix));
  assert.equal(matches.length, 1, `${prefix} must identify exactly one migration`);
  return readFileSync(join(MIGRATIONS, matches[0]), 'utf8');
}

function sqlFunction(source: string, name: string): string {
  const match = source.match(new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
    'iu',
  ));
  assert.ok(match, `${name} must be defined in its additive migration`);
  return match[0];
}

describe('USD payment storage and no-credit SQL contracts', () => {
  test('0055 adds a non-null KRW-default currency before accepting USD build receipts', () => {
    const sql = migrationSource('0055_');
    assert.match(
      sql,
      /alter\s+table\s+public\.payments[\s\S]*add\s+column\s+currency\s+text\s+not\s+null\s+default\s+'KRW'/iu,
    );
    assert.doesNotMatch(sql, /update\s+public\.payments\s+set\s+currency/iu);

    const usdBuild = sqlFunction(sql, 'handle_usd_build_fee_payment');
    assert.match(usdBuild, /insert\s+into\s+(?:public\.)?payments\s*\([\s\S]*?currency/iu);
    assert.match(usdBuild, /'USD'/u);
    assert.match(usdBuild, /p_amount\s*<>\s*990::numeric/iu);
    assert.match(usdBuild, /credits_granted[\s\S]*?0/iu);
    assert.match(usdBuild, /security\s+definer/iu);
    assert.match(usdBuild, /on\s+conflict\s*\(provider_payment_key\)\s+do\s+nothing/iu);
    assert.doesNotMatch(usdBuild, /grant_credits|credit_ledger/iu);

    // The existing KRW RPCs are immutable historical contracts. USD gets a new path.
    assert.doesNotMatch(sql, /create\s+or\s+replace\s+function\s+public\.handle_build_fee_payment\s*\(/iu);
    assert.doesNotMatch(sql, /create\s+or\s+replace\s+function\s+public\.handle_maintenance_payment\s*\(/iu);
  });

  test('0056 resolves renewal authority by Stripe subscription without granting credits', () => {
    const sql = migrationSource('0056_');
    assert.match(
      sql,
      /alter\s+table\s+public\.site_subscriptions[\s\S]*add\s+column\s+stripe_subscription_id\s+text/iu,
    );
    assert.match(
      sql,
      /create\s+unique\s+index[\s\S]*site_subscriptions[\s\S]*stripe_subscription_id[\s\S]*where\s+stripe_subscription_id\s+is\s+not\s+null/iu,
    );

    const renewal = sqlFunction(sql, 'handle_usd_industry_maintenance_payment');
    assert.match(renewal, /p_stripe_subscription_id\s+text/iu);
    assert.match(renewal, /insert\s+into\s+(?:public\.)?payments\s*\([\s\S]*?currency/iu);
    assert.match(renewal, /'USD'/u);
    assert.match(renewal, /p_amount\s*<>\s*990::numeric/iu);
    assert.match(renewal, /credits_granted[\s\S]*?0/iu);
    assert.match(renewal, /security\s+definer/iu);
    assert.match(renewal, /renew_site_subscription\s*\(/iu);
    assert.match(renewal, /stripe_subscription_id/iu);
    assert.match(renewal, /on\s+conflict\s*\(provider_payment_key\)\s+do\s+nothing/iu);
    assert.doesNotMatch(renewal, /grant_subscription_month_credits|grant_credits/iu);

    assert.doesNotMatch(sql, /create\s+or\s+replace\s+function\s+public\.handle_industry_maintenance_payment\s*\(/iu);
    assert.doesNotMatch(sql, /create\s+or\s+replace\s+function\s+public\.handle_maintenance_payment\s*\(/iu);
  });

  test('0057 keeps provider subscriptions out of the dormant monthly credit batch', () => {
    const sql = migrationSource('0057_');
    assert.match(sql, /create or replace function public\.grant_monthly_subscription_credits/u);
    assert.match(sql, /s\.stripe_subscription_id is null/u);
    assert.match(sql, /grant_subscription_month_credits/u);
    assert.match(sql, /to service_role/u);
  });

  test('0063 corrects the recurring USD contract to $1,490 without rewriting payment history', () => {
    const sql = migrationSource('0063_');
    const renewal = sqlFunction(sql, 'handle_usd_industry_maintenance_payment');
    assert.match(renewal, /p_amount\s*<>\s*1490::numeric/iu);
    assert.match(renewal, /amount must equal 1490 whole USD/iu);
    assert.doesNotMatch(renewal, /p_amount\s*<>\s*990::numeric/iu);
    assert.match(renewal, /renew_site_subscription\s*\(/iu);
    assert.match(renewal, /on\s+conflict\s*\(provider_payment_key\)\s+do\s+nothing/iu);
    assert.doesNotMatch(renewal, /grant_subscription_month_credits|grant_credits/iu);
  });
});
