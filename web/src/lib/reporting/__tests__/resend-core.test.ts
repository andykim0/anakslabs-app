import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { sendReportEmailViaResend } from '../resend-core';
import type { MonthlyReportEmailMessage } from '../types';

const message: MonthlyReportEmailMessage = {
  subject: '월간 리포트',
  html: '<p>리포트</p>',
  text: '리포트',
};

const validInput = {
  apiKey: 're_test',
  from: '다보임 <report@daboim.com>',
  to: 'owner@example.com',
  message,
  idempotencyKey: 'monthly-report/report-1',
};

describe('RPT2 Resend fail-soft transport', () => {
  test('sends through the official endpoint with bearer auth and idempotency', async () => {
    let observedUrl = '';
    let observedInit: RequestInit | undefined;
    const result = await sendReportEmailViaResend(validInput, {
      fetchImpl: async (url, init) => {
        observedUrl = String(url);
        observedInit = init;
        return new Response(JSON.stringify({ id: 'email-123' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    assert.deepEqual(result, { ok: true, providerId: 'email-123' });
    assert.equal(observedUrl, 'https://api.resend.com/emails');
    assert.equal(new Headers(observedInit?.headers).get('authorization'), 'Bearer re_test');
    assert.equal(
      new Headers(observedInit?.headers).get('idempotency-key'),
      'monthly-report/report-1',
    );
    const payload = JSON.parse(String(observedInit?.body)) as Record<string, unknown>;
    assert.deepEqual(payload.to, ['owner@example.com']);
  });

  test('configuration and network failures return records instead of throwing', async () => {
    const missing = await sendReportEmailViaResend({ ...validInput, apiKey: '' });
    assert.deepEqual(missing, {
      ok: false,
      code: 'not_configured',
      retryable: true,
      message: 'RESEND_API_KEY is not configured',
    });

    const failed = await sendReportEmailViaResend(validInput, {
      fetchImpl: async () => { throw new Error('contains secret or recipient'); },
    });
    assert.deepEqual(failed, {
      ok: false,
      code: 'request_failed',
      retryable: true,
      message: 'Resend request failed',
    });
  });

  test('provider failures preserve retryability without leaking request data', async () => {
    const concurrent = await sendReportEmailViaResend(validInput, {
      fetchImpl: async () => new Response(JSON.stringify({
        name: 'concurrent_idempotent_requests',
        message: 'Try later',
      }), { status: 409 }),
    });
    assert.deepEqual(concurrent, {
      ok: false,
      code: 'provider_rejected',
      retryable: true,
      status: 409,
      message: 'Resend rejected the request with HTTP 409',
    });

    const conflict = await sendReportEmailViaResend(validInput, {
      fetchImpl: async () => new Response(JSON.stringify({
        name: 'invalid_idempotent_request',
        message: 'Payload differs',
      }), { status: 409 }),
    });
    assert.equal(conflict.ok, false);
    if (!conflict.ok) assert.equal(conflict.retryable, false);
  });

  test('rejects malformed recipients and keys before making a request', async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return new Response('{}');
    };
    const badRecipient = await sendReportEmailViaResend(
      { ...validInput, to: 'owner@example.com\nBcc: attacker@example.com' },
      { fetchImpl },
    );
    const badKey = await sendReportEmailViaResend(
      { ...validInput, idempotencyKey: 'x'.repeat(257) },
      { fetchImpl },
    );
    assert.equal(badRecipient.ok, false);
    assert.equal(badKey.ok, false);
    assert.equal(calls, 0);
  });
});
