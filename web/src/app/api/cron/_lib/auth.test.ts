import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { cronAuthorizationMatches } from './auth';

describe('RPT4 cron authorization', () => {
  test('real deployments require the exact CRON_SECRET bearer value', () => {
    assert.equal(cronAuthorizationMatches({
      cronSecret: 'secret-value',
      authorization: 'Bearer secret-value',
      mockMode: false,
    }), true);
    assert.equal(cronAuthorizationMatches({
      cronSecret: 'secret-value',
      authorization: 'Bearer wrong',
      mockMode: false,
    }), false);
  });

  test('a Vercel metadata header cannot replace a missing production secret', () => {
    assert.equal(cronAuthorizationMatches({
      cronSecret: '',
      authorization: null,
      mockMode: false,
    }), false);
    assert.equal(cronAuthorizationMatches({
      cronSecret: '',
      authorization: null,
      mockMode: true,
    }), true);
  });

  test('monthly report cron has a bounded 60-second route budget', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/app/api/cron/monthly-reports/route.ts'),
      'utf8',
    );
    assert.match(source, /export const dynamic = 'force-dynamic'/);
    assert.match(source, /export const maxDuration = 60/);
  });
});
