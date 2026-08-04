import type { MockStore } from '@/lib/data/mock/store';
import { getMockStore } from '@/lib/data/mock/store';
import {
  addUtcCalendarMonthsClamped,
  buildAdminSiteSubscriptionListing,
  isSiteSubscriptionActiveAt,
  type AdminSiteSubscriptionListing,
  type ResolvedSubscription,
  type SiteSubscriptionState,
  type SiteSubscriptionStatus,
} from './core';

export type MockSubscriptionRenewalSource = 'payment_webhook' | 'admin_manual';

interface MockSubscriptionData {
  states: Map<string, SiteSubscriptionState>;
  renewals: Map<string, MockSubscriptionRenewal>;
}

interface MockSubscriptionRenewal {
  clientId: string;
  idempotencyKey: string;
  source: MockSubscriptionRenewalSource;
  paymentId: string | null;
  periodStart: string;
  periodEnd: string;
  reversedAt: string | null;
}

// resetMockStore() swaps the MockStore object, so a WeakMap gives test/HMR reset
// parity without adding another mutable field to the shared data-store contract.
const subscriptionsByStore = new WeakMap<MockStore, MockSubscriptionData>();

function data(): MockSubscriptionData {
  const store = getMockStore();
  let value = subscriptionsByStore.get(store);
  if (!value) {
    value = { states: new Map(), renewals: new Map() };
    // One-time compatibility bootstrap mirrors migration 0013. Payment rows
    // are never consulted again after this authoritative state is projected.
    const latestByClient = new Map<string, { clientId: string; createdAt: string }>();
    for (const payment of store.payments.values()) {
      if (payment.type !== 'maintenance_subscription' || payment.refundedAt) continue;
      const periodEnd = addUtcCalendarMonthsClamped(new Date(payment.createdAt), 1);
      const idempotencyKey = `bootstrap-payment:${payment.id}`;
      value.renewals.set(idempotencyKey, {
        clientId: payment.clientId,
        idempotencyKey,
        source: 'payment_webhook',
        paymentId: payment.id,
        periodStart: payment.createdAt,
        periodEnd: periodEnd.toISOString(),
        reversedAt: null,
      });
      const current = latestByClient.get(payment.clientId);
      if (!current || payment.createdAt > current.createdAt) {
        latestByClient.set(payment.clientId, payment);
      }
    }
    const now = new Date();
    for (const payment of latestByClient.values()) {
      const paidAt = new Date(payment.createdAt);
      const periodEnd = addUtcCalendarMonthsClamped(paidAt, 1);
      if (periodEnd.getTime() <= now.getTime()) continue;
      value.states.set(payment.clientId, {
        clientId: payment.clientId,
        status: 'active',
        currentPeriodEnd: periodEnd.toISOString(),
        updatedAt: now.toISOString(),
      });
    }
    subscriptionsByStore.set(store, value);
  }
  return value;
}

export function getMockSiteSubscription(clientId: string): SiteSubscriptionState | null {
  const state = data().states.get(clientId);
  return state ? structuredClone(state) : null;
}

export function getMockSiteSubscriptionByStripeId(
  stripeSubscriptionId: string,
): SiteSubscriptionState | null {
  const id = stripeSubscriptionId.trim();
  if (!id) return null;
  const state = [...data().states.values()].find(
    (candidate) => candidate.stripeSubscriptionId === id,
  );
  return state ? structuredClone(state) : null;
}

export function resolveMockSiteSubscription(clientId: string, at = new Date()): ResolvedSubscription {
  const state = getMockSiteSubscription(clientId);
  return { state, active: isSiteSubscriptionActiveAt(state, at) };
}

export function listMockActiveSiteSubscriptions(at = new Date()): SiteSubscriptionState[] {
  return [...data().states.values()]
    .filter((state) => isSiteSubscriptionActiveAt(state, at))
    .map((state) => structuredClone(state));
}

export function listMockSiteSubscriptionsForAdmin(
  at = new Date(),
): AdminSiteSubscriptionListing {
  const stateData = data();
  return buildAdminSiteSubscriptionListing({
    states: [...stateData.states.values()].map((state) => structuredClone(state)),
    renewals: [...stateData.renewals.values()].map((renewal) => ({
      clientId: renewal.clientId,
      periodStart: renewal.periodStart,
      reversedAt: renewal.reversedAt,
    })),
    at,
  });
}

export function renewMockSiteSubscription(input: {
  clientId: string;
  idempotencyKey: string;
  source: MockSubscriptionRenewalSource;
  paymentId?: string;
  periodMonths?: number;
  siteId?: string;
  industryProfileId?: 'interior' | 'clinic';
  pricingModelVersion?: string;
  stripeSubscriptionId?: string;
  at?: Date;
}): { duplicated: boolean; state: SiteSubscriptionState } {
  const store = getMockStore();
  if (!store.clients.has(input.clientId)) {
    throw new Error(`renewSiteSubscription: unknown client (${input.clientId})`);
  }
  const key = input.idempotencyKey.trim();
  if (!key) throw new Error('renewSiteSubscription: idempotencyKey is required');
  const months = input.periodMonths ?? 1;
  if (!Number.isInteger(months) || months < 1 || months > 12) {
    throw new Error('renewSiteSubscription: periodMonths must be an integer from 1 to 12');
  }
  const paymentId = input.paymentId ?? null;
  if ((input.source === 'payment_webhook') !== (paymentId !== null)) {
    throw new Error('renewSiteSubscription: payment source/reference mismatch');
  }
  if (paymentId) {
    const payment = store.payments.get(paymentId);
    if (
      !payment ||
      payment.clientId !== input.clientId ||
      payment.type !== 'maintenance_subscription' ||
      payment.refundedAt
    ) {
      throw new Error('renewSiteSubscription: verified maintenance payment is required');
    }
  }

  const stateData = data();
  const existing = stateData.states.get(input.clientId);
  const existingRenewal = stateData.renewals.get(key);
  if (existingRenewal) {
    if (existingRenewal.clientId !== input.clientId) {
      throw new Error('renewSiteSubscription: idempotency key belongs to another owner');
    }
    if (!existing) throw new Error('renewSiteSubscription: renewal key exists without state');
    return { duplicated: true, state: structuredClone(existing) };
  }
  if (
    paymentId &&
    [...stateData.renewals.values()].some(
      (renewal) => renewal.paymentId === paymentId && renewal.reversedAt === null,
    )
  ) {
    throw new Error('renewSiteSubscription: payment already belongs to a renewal');
  }

  const at = input.at ?? new Date();
  const atMs = at.getTime();
  if (!Number.isFinite(atMs)) throw new Error('renewSiteSubscription: invalid date');
  const previousEndMs = existing ? Date.parse(existing.currentPeriodEnd) : Number.NaN;
  const periodStart = Math.max(atMs, Number.isFinite(previousEndMs) ? previousEndMs : atMs);
  const nextEnd = addUtcCalendarMonthsClamped(new Date(periodStart), months);
  const nowIso = at.toISOString();
  const state: SiteSubscriptionState = {
    clientId: input.clientId,
    ...(input.siteId ? { siteId: input.siteId } : {}),
    ...(input.industryProfileId ? { industryProfileId: input.industryProfileId } : {}),
    ...(input.pricingModelVersion ? { pricingModelVersion: input.pricingModelVersion } : {}),
    ...(input.stripeSubscriptionId ? { stripeSubscriptionId: input.stripeSubscriptionId } : {}),
    status: 'active',
    currentPeriodEnd: nextEnd.toISOString(),
    updatedAt: nowIso,
  };
  stateData.states.set(input.clientId, state);
  stateData.renewals.set(key, {
    clientId: input.clientId,
    idempotencyKey: key,
    source: input.source,
    paymentId,
    periodStart: new Date(periodStart).toISOString(),
    periodEnd: nextEnd.toISOString(),
    reversedAt: null,
  });
  return { duplicated: false, state: structuredClone(state) };
}

export function assertMockSiteSubscriptionRefundEvidence(input: {
  clientId: string;
  paymentId: string;
}): void {
  const renewal = [...data().renewals.values()].find(
    (candidate) =>
      candidate.clientId === input.clientId &&
      candidate.paymentId === input.paymentId &&
      candidate.reversedAt === null,
  );
  if (!renewal) {
    throw new Error('reconcileSiteSubscriptionRefund: verified renewal evidence is required');
  }
}

/**
 * A full maintenance-payment refund reverses only that paid period. The
 * authoritative state is then rebuilt from non-reversed renewal evidence so a
 * later payment/manual collection remains active. Partial refunds never call
 * this function.
 */
export function reconcileMockSiteSubscriptionFullRefund(input: {
  clientId: string;
  paymentId: string;
  at?: Date;
}): { state: SiteSubscriptionState; replacementPaymentId: string | null } {
  const at = input.at ?? new Date();
  if (!Number.isFinite(at.getTime())) {
    throw new Error('reconcileSiteSubscriptionRefund: invalid date');
  }
  const stateData = data();
  const renewal = [...stateData.renewals.values()].find(
    (candidate) =>
      candidate.clientId === input.clientId &&
      candidate.paymentId === input.paymentId &&
      candidate.reversedAt === null,
  );
  if (!renewal) {
    throw new Error('reconcileSiteSubscriptionRefund: verified renewal evidence is required');
  }
  renewal.reversedAt = at.toISOString();

  const replacementRenewal = [...stateData.renewals.values()]
    .filter((candidate) => candidate.clientId === input.clientId && candidate.reversedAt === null)
    .reduce<MockSubscriptionRenewal | null>(
      (latest, candidate) =>
        latest === null || candidate.periodEnd > latest.periodEnd ? candidate : latest,
      null,
    );
  const remainingPeriodEnd = replacementRenewal?.periodEnd ?? null;
  const currentPeriodEnd = remainingPeriodEnd ?? at.toISOString();
  const existingStatus = stateData.states.get(input.clientId)?.status;
  const next: SiteSubscriptionState = {
    clientId: input.clientId,
    status:
      Date.parse(currentPeriodEnd) <= at.getTime()
        ? 'cancelled'
        : existingStatus && existingStatus !== 'active'
          ? existingStatus
          : 'active',
    currentPeriodEnd,
    updatedAt: at.toISOString(),
  };
  stateData.states.set(input.clientId, next);
  return {
    state: structuredClone(next),
    replacementPaymentId: replacementRenewal?.paymentId ?? null,
  };
}

/** Manual collection reversal uses the stable renewal key rather than PG evidence. */
export function reconcileMockSiteSubscriptionManualReversal(input: {
  clientId: string;
  idempotencyKey: string;
  resolveManualPaymentId: (idempotencyKey: string) => string | null;
  at?: Date;
}): { state: SiteSubscriptionState; replacementPaymentId: string | null } {
  const at = input.at ?? new Date();
  if (!Number.isFinite(at.getTime())) {
    throw new Error('reconcileManualSubscription: invalid date');
  }
  const stateData = data();
  const renewal = stateData.renewals.get(input.idempotencyKey);
  if (
    !renewal
    || renewal.clientId !== input.clientId
    || renewal.source !== 'admin_manual'
    || renewal.reversedAt !== null
  ) {
    throw new Error('reconcileManualSubscription: verified renewal evidence is required');
  }
  const replacementRenewal = [...stateData.renewals.values()]
    .filter((candidate) =>
      candidate !== renewal
      && candidate.clientId === input.clientId
      && candidate.reversedAt === null)
    .reduce<MockSubscriptionRenewal | null>(
      (latest, candidate) =>
        latest === null || candidate.periodEnd > latest.periodEnd ? candidate : latest,
      null,
    );
  const replacementPaymentId = replacementRenewal?.paymentId
    ?? (replacementRenewal?.source === 'admin_manual'
      ? input.resolveManualPaymentId(replacementRenewal.idempotencyKey)
      : null);
  if (replacementRenewal && !replacementPaymentId) {
    throw new Error('reconcileManualSubscription: replacement payment evidence is required');
  }

  // Evidence resolution happens before this first mutation so mock failures
  // preserve the all-or-nothing behavior of the real SQL transaction.
  renewal.reversedAt = at.toISOString();

  const currentPeriodEnd = replacementRenewal?.periodEnd ?? at.toISOString();
  const existingStatus = stateData.states.get(input.clientId)?.status;
  const next: SiteSubscriptionState = {
    clientId: input.clientId,
    status:
      Date.parse(currentPeriodEnd) <= at.getTime()
        ? 'cancelled'
        : existingStatus && existingStatus !== 'active'
          ? existingStatus
          : 'active',
    currentPeriodEnd,
    updatedAt: at.toISOString(),
  };
  stateData.states.set(input.clientId, next);
  return {
    state: structuredClone(next),
    replacementPaymentId,
  };
}

export function setMockSiteSubscriptionStatus(
  clientId: string,
  status: Exclude<SiteSubscriptionStatus, 'active'>,
  at = new Date(),
): SiteSubscriptionState {
  const stateData = data();
  const existing = stateData.states.get(clientId);
  if (!existing) throw new Error(`setSiteSubscriptionStatus: no subscription (${clientId})`);
  const next = { ...existing, status, updatedAt: at.toISOString() };
  stateData.states.set(clientId, next);
  return structuredClone(next);
}
