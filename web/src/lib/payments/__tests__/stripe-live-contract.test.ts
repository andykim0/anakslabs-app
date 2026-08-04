import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import Stripe from 'stripe';
import { publishPaymentQuote } from '@/lib/billing/publish-payment';
import { publishPaymentQuoteFromExtra } from '@/lib/billing/publish-payment-contract';
import {
  stripeCheckoutTotalCents,
  stripeMockEventSchema,
  stripePaymentKeys,
  stripeRenewalPaymentKey,
} from '../stripe';

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');

async function loadStripeLive() {
  // The Node test runner does not expose Next's `server-only` export condition.
  // Neutralize only that marker while importing the real adapter.
  const loader = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const original = loader._load;
  loader._load = function loadForServerModule(request, parent, isMain) {
    if (request === 'server-only') return {};
    return original.call(this, request, parent, isMain);
  };
  try {
    return await import('../stripe-live');
  } finally {
    loader._load = original;
  }
}

describe('USD Stripe live boundary', () => {
  test('signature verification accepts Stripe-signed raw bytes and rejects an invalid signature', async () => {
    const previous = process.env.STRIPE_WEBHOOK_SECRET;
    const secret = 'whsec_contract_test_only';
    process.env.STRIPE_WEBHOOK_SECRET = secret;
    try {
      const live = await loadStripeLive();
      const payload = JSON.stringify({
        id: 'evt_signature_contract',
        object: 'event',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_signature_contract' } },
      });
      const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
      assert.equal(live.constructStripeWebhookEvent(payload, signature).id, 'evt_signature_contract');
      assert.throws(
        () => live.constructStripeWebhookEvent(payload, 't=1,v1=invalid'),
        (error: unknown) => error instanceof live.StripeWebhookSignatureError,
      );
    } finally {
      if (previous === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
      else process.env.STRIPE_WEBHOOK_SECRET = previous;
    }
  });

  test('automatic tax never changes the pre-tax Enterprise contract validation', () => {
    const event = {
      id: 'evt_taxed_checkout',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_taxed_checkout',
          client_reference_id: 'client-usd',
          currency: 'usd',
          amount_subtotal: stripeCheckoutTotalCents(),
          amount_total: stripeCheckoutTotalCents() + 17_325,
          payment_status: 'paid',
          subscription: 'sub_taxed_checkout',
          metadata: {
            siteId: 'site-usd',
            clientId: 'client-usd',
            pricingModelVersion: 'enterprise-us-v6-2026-08',
          },
        },
      },
    } as const;
    assert.equal(stripeMockEventSchema.safeParse(event).success, true);
    assert.equal(stripeMockEventSchema.safeParse({
      ...event,
      data: { object: { ...event.data.object, amount_subtotal: undefined } },
    }).success, false);

    const checkoutKeys = stripePaymentKeys(event);
    assert.notEqual(checkoutKeys.setup, checkoutKeys.monthly);
    assert.equal(stripeRenewalPaymentKey('in_cycle'), 'stripe:invoice:in_cycle:monthly');
    assert.equal(
      stripeRenewalPaymentKey('in_cycle'),
      stripeRenewalPaymentKey('in_cycle'),
    );
  });

  test('the adapter owns secrets and Checkout pins automatic tax plus subscription metadata', () => {
    const adapter = read('src/lib/payments/stripe-live.ts');
    const webhook = read('src/app/api/payments/webhook/route.ts');

    assert.match(adapter, /process\.env\.STRIPE_SECRET_KEY/u);
    assert.match(adapter, /process\.env\.STRIPE_WEBHOOK_SECRET/u);
    assert.match(adapter, /automatic_tax:\s*\{\s*enabled:\s*true\s*\}/u);
    assert.match(adapter, /subscription_data:\s*\{\s*metadata\s*\}/u);
    assert.match(adapter, /siteId:\s*input\.siteId/u);
    assert.match(adapter, /clientId:\s*input\.clientId/u);

    assert.doesNotMatch(webhook, /STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/u);
    assert.match(webhook, /export const runtime = ['"]nodejs['"]/u);
    assert.match(webhook, /request\.text\(\)/u);
    assert.match(webhook, /constructStripeWebhookEvent/u);
    assert.match(webhook, /StripeWebhookSignatureError[\s\S]*apiError\(\s*400,/u);
  });

  test('hosted Checkout stays closed until both the API and signed-webhook keys exist', async () => {
    const oldSecret = process.env.STRIPE_SECRET_KEY;
    const oldWebhook = process.env.STRIPE_WEBHOOK_SECRET;
    try {
      process.env.STRIPE_SECRET_KEY = 'sk_test_half_configured';
      delete process.env.STRIPE_WEBHOOK_SECRET;
      const live = await loadStripeLive();
      assert.equal(live.stripeSecretKeyConfigured(), true);
      assert.equal(live.stripeLiveCheckoutConfigured(), false);
      await assert.rejects(
        live.createStripeCheckoutSession({
          siteId: 'site-half-configured',
          clientId: 'client-half-configured',
          successUrl: 'https://app.anakslabs.com/success',
          cancelUrl: 'https://app.anakslabs.com/cancel',
        }),
        (error: unknown) => error instanceof live.StripeConfigurationError,
      );
    } finally {
      if (oldSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = oldSecret;
      if (oldWebhook === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
      else process.env.STRIPE_WEBHOOK_SECRET = oldWebhook;
    }
  });

  test('webhook authority uses subtotal, renews cycles only, and closes unsigned mock when a live key exists', () => {
    const webhook = read('src/app/api/payments/webhook/route.ts');
    assert.match(webhook, /session\.amount_subtotal/u);
    assert.doesNotMatch(webhook, /session\.amount_total\s*!==\s*stripeCheckoutTotalCents/u);
    assert.match(webhook, /invoice\.billing_reason\s*!==\s*['"]subscription_cycle['"]/u);
    assert.match(webhook, /stripeRenewalPaymentKey\(invoice\.id\)/u);
    assert.match(webhook, /stripeInvoiceSubscriptionId\(invoice\)/u);
    assert.match(webhook, /liveStripeEvent\s*\?\s*getSupabaseDataServices\(\)\s*:\s*getDataServices\(\)/u);
    assert.match(webhook, /forceSupabase:\s*liveStripeEvent|processRenewal\([\s\S]*liveStripeEvent/u);

    const liveKeyGuard = webhook.indexOf('stripeSecretKeyConfigured()');
    const mockParse = webhook.indexOf('stripeMockEventSchema.safeParse');
    assert.ok(liveKeyGuard >= 0 && mockParse > liveKeyGuard);
    assert.match(
      webhook.slice(liveKeyGuard, mockParse),
      /apiError\(\s*503,[\s\S]*STRIPE/u,
    );
  });

  test('live publish quotes expose hosted Checkout and legacy payment is blocked only after no-payment republish exits', () => {
    const contract = read('src/lib/billing/publish-payment-contract.ts');
    const quote = read('src/lib/billing/publish-payment.ts');
    const paymentRoute = read('src/app/api/sites/[siteId]/publish-payment/route.ts');
    const dialog = read('src/components/publish/PublishPaymentDialog.tsx');
    const dashboardApi = read('src/components/dashboard/api.ts');
    const editorApi = read('src/components/editor/api.ts');
    const dashboardSite = read('src/components/dashboard/site-detail.tsx');
    const editorShell = read('src/components/editor/EditorShell.tsx');

    const stripeQuote = publishPaymentQuote({
      clientId: 'client-stripe',
      siteId: 'site-stripe',
      mock: false,
      stripe: true,
    });
    assert.equal(stripeQuote.checkoutMode, 'stripe');
    assert.deepEqual(publishPaymentQuoteFromExtra({ quote: stripeQuote }), stripeQuote);

    assert.match(contract, /checkoutMode:\s*['"]mock['"]\s*\|\s*['"]stripe['"]\s*\|\s*['"]unavailable['"]/u);
    assert.match(quote, /checkoutMode/u);
    assert.match(paymentRoute, /createStripeCheckoutSession/u);
    assert.match(paymentRoute, /checkoutUrl/u);
    assert.match(dialog, /checkoutMode\s*===\s*['"]stripe['"]/u);
    assert.match(contract, /checkoutUrl:\s*string/u);
    assert.match(dashboardApi, /Promise<PublishPaymentConfirmation>/u);
    assert.match(editorApi, /Promise<PublishPaymentConfirmation>/u);
    assert.match(dashboardSite, /if\s*\(!payment\.paid\)[\s\S]*window\.location\.assign\(payment\.checkoutUrl\)/u);
    assert.match(editorShell, /if\s*\(!payment\.paid\)[\s\S]*window\.location\.assign\(payment\.checkoutUrl\)/u);

    const noPaymentExit = paymentRoute.indexOf('if (!needsPublishPayment');
    const legacyGuard = paymentRoute.indexOf("industryPolicy.status === 'legacy'", noPaymentExit);
    const firstMutation = paymentRoute.indexOf('services.payments.handleWebhook', noPaymentExit);
    const liveCheckout = paymentRoute.indexOf('createStripeCheckoutSession', noPaymentExit);
    assert.ok(noPaymentExit >= 0, 'needsPublishPayment must remain the first payment boundary');
    assert.ok(legacyGuard > noPaymentExit, 'legacy first-payment rejection belongs after republish exit');
    assert.ok(
      (firstMutation < 0 || legacyGuard < firstMutation)
        && (liveCheckout < 0 || legacyGuard < liveCheckout),
      'legacy rejection must precede every payment effect',
    );
  });
});
