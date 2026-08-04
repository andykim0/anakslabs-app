import assert from 'node:assert/strict';
import Module from 'node:module';
import { afterEach, describe, test } from 'node:test';
import { getMockStore, resetMockStore } from '@/lib/data/mock/store';
import { DEMO_BASIC_ID, MINTWASH_SITE_ID } from '@/lib/data/mock/seed';
import { PRICING } from '@/lib/pricing';
import { getMockSiteSubscription } from '@/lib/subscriptions/mock';
import { addUtcCalendarMonthsClamped } from '@/lib/subscriptions/core';
import { stripeCheckoutTotalCents } from '../stripe';

const USD_CLIENT_ID = 'client-usd-payment-fixture';
const USD_SITE_ID = 'site-usd-payment-fixture';

async function loadWebhookRoute() {
  const loader = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const original = loader._load;
  loader._load = function loadForServerModule(request, parent, isMain) {
    if (request === 'server-only') return {};
    return original.call(this, request, parent, isMain);
  };
  try {
    return await import('@/app/api/payments/webhook/route');
  } finally {
    loader._load = original;
  }
}

async function loadSubscriptionService() {
  const loader = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const original = loader._load;
  loader._load = function loadForServerModule(request, parent, isMain) {
    if (request === 'server-only') return {};
    return original.call(this, request, parent, isMain);
  };
  try {
    return await import('@/lib/subscriptions/service');
  } finally {
    loader._load = original;
  }
}

async function send(event: unknown, headers?: Record<string, string>): Promise<Response> {
  const route = await loadWebhookRoute();
  return route.POST(new Request('http://app.test/api/payments/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(event),
  }) as never, undefined as never);
}

function invoice(
  eventId: string,
  reason: 'subscription_create' | 'subscription_cycle',
  invoiceId = `in_${eventId}`,
) {
  return {
    id: eventId,
    type: 'invoice.paid',
    data: {
      object: {
        id: invoiceId,
        currency: 'usd',
        subtotal: 99_000,
        status: 'paid',
        billing_reason: reason,
        subscription: `sub_${USD_SITE_ID}`,
      },
    },
  };
}

describe('USD mock webhook effects', () => {
  afterEach(() => resetMockStore());

  test('checkout plus a cycle records whole USD, renews twice, and grants zero credits', async () => {
    const oldMock = process.env.NEXT_PUBLIC_MOCK_MODE;
    const oldSecret = process.env.STRIPE_SECRET_KEY;
    const oldWebhook = process.env.STRIPE_WEBHOOK_SECRET;
    const oldCredits = process.env.CREDITS_ENABLED;
    process.env.NEXT_PUBLIC_MOCK_MODE = '1';
    process.env.CREDITS_ENABLED = '1';
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    resetMockStore();
    try {
      const store = getMockStore();
      const seedClient = store.clients.get(DEMO_BASIC_ID)!;
      const seedSite = store.sites.get(MINTWASH_SITE_ID)!;
      store.clients.set(USD_CLIENT_ID, {
        ...structuredClone(seedClient),
        id: USD_CLIENT_ID,
        email: 'usd-payment-fixture@anakslabs.test',
      });
      store.sites.set(USD_SITE_ID, {
        ...structuredClone(seedSite),
        id: USD_SITE_ID,
        clientId: USD_CLIENT_ID,
        domain: 'usd-payment-fixture',
        industryProfileId: 'clinic',
        pricingModelVersion: PRICING.modelVersion,
      });
      const ledgerBefore = store.ledger.length;
      const tierBefore = store.clients.get(USD_CLIENT_ID)!.tier;

      const checkout = {
        id: 'evt_usd_checkout_fixture',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_usd_fixture',
            client_reference_id: USD_CLIENT_ID,
            currency: 'usd',
            amount_subtotal: stripeCheckoutTotalCents(),
            amount_total: stripeCheckoutTotalCents() + 17_325,
            payment_status: 'paid',
            subscription: `sub_${USD_SITE_ID}`,
            metadata: {
              siteId: USD_SITE_ID,
              clientId: USD_CLIENT_ID,
              pricingModelVersion: PRICING.modelVersion,
            },
          },
        },
      };
      assert.equal((await send(checkout)).status, 200);
      const firstState = getMockSiteSubscription(USD_CLIENT_ID);
      assert.ok(firstState);
      assert.equal(firstState.stripeSubscriptionId, `sub_${USD_SITE_ID}`);

      assert.equal((await send(checkout)).status, 200);
      assert.equal(getMockSiteSubscription(USD_CLIENT_ID)?.currentPeriodEnd, firstState.currentPeriodEnd);

      assert.equal((await send(invoice('evt_usd_initial', 'subscription_create'))).status, 200);
      assert.equal(getMockSiteSubscription(USD_CLIENT_ID)?.currentPeriodEnd, firstState.currentPeriodEnd);

      assert.equal((await send(invoice('evt_usd_cycle_2', 'subscription_cycle'))).status, 200);
      const secondState = getMockSiteSubscription(USD_CLIENT_ID);
      assert.ok(secondState);
      assert.equal(
        secondState.currentPeriodEnd,
        addUtcCalendarMonthsClamped(new Date(firstState.currentPeriodEnd), 1).toISOString(),
      );

      // A distinct Event object for the same invoice is the same business effect.
      assert.equal((await send(invoice(
        'evt_usd_cycle_2_duplicate_object',
        'subscription_cycle',
        'in_evt_usd_cycle_2',
      ))).status, 200);
      assert.equal(
        getMockSiteSubscription(USD_CLIENT_ID)?.currentPeriodEnd,
        secondState.currentPeriodEnd,
      );

      const usdLedgerBeforeBatch = store.ledger.filter(
        (entry) => entry.clientId === USD_CLIENT_ID,
      ).length;
      const { grantMonthlySubscriptionCredits } = await loadSubscriptionService();
      // The historical KR seed renewal expires before this point, while the
      // two-cycle USD fixture remains active. This isolates the USD batch guard.
      await grantMonthlySubscriptionCredits(new Date(Date.now() + 32 * 24 * 60 * 60 * 1_000));
      assert.equal(
        store.ledger.filter((entry) => entry.clientId === USD_CLIENT_ID).length,
        usdLedgerBeforeBatch,
      );

      const usdPayments = [...store.payments.values()].filter((payment) => payment.currency === 'USD');
      assert.deepEqual(
        usdPayments.map((payment) => [payment.type, payment.amount, payment.creditsGranted]),
        [
          ['build_fee', 990, 0],
          ['maintenance_subscription', 990, 0],
          ['maintenance_subscription', 990, 0],
        ],
      );
      assert.equal(store.ledger.length, ledgerBefore);
      assert.equal(store.clients.get(USD_CLIENT_ID)!.tier, tierBefore);
    } finally {
      if (oldMock === undefined) delete process.env.NEXT_PUBLIC_MOCK_MODE;
      else process.env.NEXT_PUBLIC_MOCK_MODE = oldMock;
      if (oldSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = oldSecret;
      if (oldWebhook === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
      else process.env.STRIPE_WEBHOOK_SECRET = oldWebhook;
      if (oldCredits === undefined) delete process.env.CREDITS_ENABLED;
      else process.env.CREDITS_ENABLED = oldCredits;
    }
  });

  test('missing live configuration fails closed and a configured account rejects unsigned mock input', async () => {
    const oldMock = process.env.NEXT_PUBLIC_MOCK_MODE;
    const oldSecret = process.env.STRIPE_SECRET_KEY;
    const oldWebhook = process.env.STRIPE_WEBHOOK_SECRET;
    const inertEvent = { id: 'evt_inert', type: 'unhandled.test', data: { object: {} } };
    try {
      process.env.NEXT_PUBLIC_MOCK_MODE = '0';
      delete process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_WEBHOOK_SECRET;
      const unavailable = await send(inertEvent);
      assert.equal(unavailable.status, 503);
      assert.equal((await unavailable.json()).error.code, 'STRIPE_LIVE_DISABLED');

      process.env.NEXT_PUBLIC_MOCK_MODE = '1';
      process.env.STRIPE_SECRET_KEY = 'sk_test_configured_boundary';
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_configured_boundary';
      const unsigned = await send(inertEvent);
      assert.equal(unsigned.status, 503);
      assert.equal((await unsigned.json()).error.code, 'STRIPE_SIGNED_WEBHOOK_REQUIRED');

      const invalid = await send(inertEvent, { 'stripe-signature': 't=1,v1=invalid' });
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).error.code, 'INVALID_STRIPE_SIGNATURE');
    } finally {
      if (oldMock === undefined) delete process.env.NEXT_PUBLIC_MOCK_MODE;
      else process.env.NEXT_PUBLIC_MOCK_MODE = oldMock;
      if (oldSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = oldSecret;
      if (oldWebhook === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
      else process.env.STRIPE_WEBHOOK_SECRET = oldWebhook;
    }
  });
});
