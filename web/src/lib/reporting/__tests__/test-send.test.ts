/**
 * [RPT$] Operator test send.
 *
 * The property that matters most is negative: sending an operator a copy of a report must
 * leave the CUSTOMER's delivery row exactly as it was. A test send that marked the row
 * `sent` would both invent a delivery that never happened and make the row ineligible for
 * the retry the customer is still owed.
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { describe, test } from 'node:test';
import { DEMO_CLINIC_ID } from '@/lib/data/mock/seed';
import { getMockStore } from '@/lib/data/mock/store';
import { MockMonthlyReportsRepository } from '../repository-mock';
import type { MonthlyReportRecord } from '../repository-core';
import {
  INTERNAL_REPORT_TEST_DOMAIN,
  MOCK_REPORT_TEST_PROVIDER_ID,
  normalizeInternalTestRecipient,
  reportTestSendIdempotencyKey,
} from '../test-send-core';

describe('RPT-TEST internal recipient rule', () => {
  test('only an exact internal domain is accepted', () => {
    assert.equal(normalizeInternalTestRecipient('ops@anakslabs.com'), 'ops@anakslabs.com');
    assert.equal(normalizeInternalTestRecipient('  ops@AnaksLabs.COM '), 'ops@anakslabs.com');
    assert.equal(normalizeInternalTestRecipient('a.b+report@anakslabs.com'), 'a.b+report@anakslabs.com');

    // A customer address is the whole point of the guard.
    assert.equal(normalizeInternalTestRecipient('front-desk@summitdentalstudio.example'), null);
    // Lookalikes that a substring or suffix check would wave through.
    assert.equal(normalizeInternalTestRecipient('ops@anakslabs.com.evil.test'), null);
    assert.equal(normalizeInternalTestRecipient('ops@evil-anakslabs.com'), null);
    assert.equal(normalizeInternalTestRecipient('ops@mail.anakslabs.com'), null);
    // Header injection and malformed locals.
    assert.equal(normalizeInternalTestRecipient('ops@anakslabs.com\nbcc: x@y.z'), null);
    assert.equal(normalizeInternalTestRecipient('@anakslabs.com'), null);
    assert.equal(normalizeInternalTestRecipient('ops@'), null);
    assert.equal(normalizeInternalTestRecipient(`${'a'.repeat(120)}@anakslabs.com`), null);
  });

  test('the test key is distinct from the delivery key and fits the provider limit', () => {
    const key = reportTestSendIdempotencyKey('report-demo-2026-08', 'ops@anakslabs.com');
    assert.equal(key, 'monthly-report-test:report-demo-2026-08:ops@anakslabs.com');
    // Sharing `monthly-report:<id>` would let a test consume the real send's 24h dedup window.
    assert.ok(!key.startsWith('monthly-report:'));
    assert.ok(key.length <= 256);
    assert.throws(() => reportTestSendIdempotencyKey('  ', 'ops@anakslabs.com'), /report id/u);
  });
});

// ---------- route ----------

type ModuleLoader = {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

/** The route module is cached after its first import, so the session must stay mutable. */
let mockSession: string | null = 'admin';

/**
 * Runs the real route handler under the standalone test runner: only the `server-only`
 * marker and the cookie store are supplied, and no application module is replaced — the
 * admin guard, the mock repositories and the Resend stub are all the shipping ones.
 */
async function withRouteEnvironment<T>(session: string | null, run: () => Promise<T>): Promise<T> {
  mockSession = session;
  const loader = Module as unknown as ModuleLoader;
  const originalLoad = loader._load;
  loader._load = function loadForRouteTest(request, parent, isMain) {
    if (request === 'server-only') return {};
    if (request === 'next/headers') {
      return {
        cookies: async () => ({
          get: (name: string) => (
            name === 'anaks_mock_session' && mockSession ? { value: mockSession } : undefined
          ),
          getAll: () => [],
          set: () => undefined,
        }),
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return await run();
  } finally {
    loader._load = originalLoad;
  }
}

async function postSendTest(input: {
  session: string | null;
  reportId: string;
  body: unknown;
}): Promise<Response> {
  return withRouteEnvironment(input.session, async () => {
    const route = await import('@/app/api/admin/reports/[reportId]/send-test/route');
    const { NextRequest } = await import('next/server');
    return route.POST(
      new NextRequest(
        `http://app.anakslabs.com/api/admin/reports/${encodeURIComponent(input.reportId)}/send-test`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input.body),
        },
      ),
      { params: Promise.resolve({ reportId: input.reportId }) },
    );
  });
}

function reportsRepository(): MockMonthlyReportsRepository {
  return new MockMonthlyReportsRepository(getMockStore());
}

async function seededReport(): Promise<MonthlyReportRecord> {
  const rows = await reportsRepository().listByClient({ clientId: DEMO_CLINIC_ID });
  assert.ok(rows.length > 0, 'the mock seed must ship a delivered demo report');
  return rows[0];
}

async function errorPayload(response: Response): Promise<{ code?: string; message?: string }> {
  const payload = (await response.json()) as { error?: { code?: string; message?: string } };
  return payload.error ?? {};
}

describe('RPT-TEST admin test-send route', () => {
  test('a non-admin session is rejected before anything is sent', async () => {
    const record = await seededReport();
    const response = await postSendTest({
      session: null,
      reportId: record.id,
      body: { recipient: `ops@${INTERNAL_REPORT_TEST_DOMAIN}` },
    });

    // The shared admin guard answers 403 FORBIDDEN, not 401; every /api/admin route does.
    assert.equal(response.status, 403);
    assert.equal((await errorPayload(response)).code, 'FORBIDDEN');
    assert.deepEqual(await reportsRepository().getByIdForService(record.id), record);
  });

  test('a recipient outside the internal domain is refused', async () => {
    const record = await seededReport();
    const response = await postSendTest({
      session: 'admin',
      reportId: record.id,
      body: { recipient: 'front-desk@summitdentalstudio.example' },
    });

    assert.equal(response.status, 400);
    const error = await errorPayload(response);
    assert.equal(error.code, 'REPORT_TEST_RECIPIENT_NOT_INTERNAL');
    assert.match(error.message ?? '', /@anakslabs\.com/u);
    assert.deepEqual(await reportsRepository().getByIdForService(record.id), record);
  });

  test('an internal recipient sends through the stub and leaves the delivery untouched', async () => {
    const before = await seededReport();
    const response = await postSendTest({
      session: 'admin',
      reportId: before.id,
      body: { recipient: 'Reports@AnaksLabs.com' },
    });

    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      ok: boolean;
      recipient: string;
      providerMessageId: string;
    };
    assert.equal(payload.ok, true);
    assert.equal(payload.recipient, 'Reports@anakslabs.com');
    assert.equal(payload.providerMessageId, MOCK_REPORT_TEST_PROVIDER_ID);

    // The whole point: nothing about the customer's delivery moved.
    const after = await reportsRepository().getByIdForService(before.id);
    assert.deepEqual(after, before);
    assert.equal(after?.deliveryAttempts, before.deliveryAttempts);
    assert.equal(after?.providerMessageId, before.providerMessageId);
    assert.notEqual(after?.providerMessageId, MOCK_REPORT_TEST_PROVIDER_ID);
  });

  test('an unknown report is a 404, not a send', async () => {
    const response = await postSendTest({
      session: 'admin',
      reportId: 'report-does-not-exist',
      body: { recipient: `ops@${INTERNAL_REPORT_TEST_DOMAIN}` },
    });
    assert.equal(response.status, 404);
    assert.equal((await errorPayload(response)).code, 'REPORT_NOT_FOUND');
  });

  test('a malformed body is rejected by the schema', async () => {
    const record = await seededReport();
    const response = await postSendTest({
      session: 'admin',
      reportId: record.id,
      body: { recipient: 'ops@anakslabs.com', bcc: 'someone@example.com' },
    });
    assert.equal(response.status, 400);
    assert.equal((await errorPayload(response)).code, 'VALIDATION_ERROR');
  });
});
