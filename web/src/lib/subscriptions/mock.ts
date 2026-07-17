import type { MockStore } from '@/lib/data/mock/store';
import { getMockStore } from '@/lib/data/mock/store';
import {
  addUtcCalendarMonthsClamped,
  isSiteSubscriptionActiveAt,
  type ResolvedSubscription,
  type SiteSubscriptionState,
  type SiteSubscriptionStatus,
} from './core';

export type MockSubscriptionRenewalSource = 'payment_webhook' | 'admin_manual';

interface MockSubscriptionData {
  states: Map<string, SiteSubscriptionState>;
  renewalKeys: Set<string>;
}

// resetMockStore() swaps the MockStore object, so a WeakMap gives test/HMR reset
// parity without adding another mutable field to the shared data-store contract.
const subscriptionsByStore = new WeakMap<MockStore, MockSubscriptionData>();

function data(): MockSubscriptionData {
  const store = getMockStore();
  let value = subscriptionsByStore.get(store);
  if (!value) {
    value = { states: new Map(), renewalKeys: new Set() };
    // One-time compatibility bootstrap mirrors migration 0013. Payment rows
    // are never consulted again after this authoritative state is projected.
    const latestByClient = new Map<string, { clientId: string; createdAt: string }>();
    for (const payment of store.payments.values()) {
      if (payment.type !== 'maintenance_subscription' || payment.refundedAt) continue;
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

export function resolveMockSiteSubscription(clientId: string, at = new Date()): ResolvedSubscription {
  const state = getMockSiteSubscription(clientId);
  return { state, active: isSiteSubscriptionActiveAt(state, at) };
}

export function listMockActiveSiteSubscriptions(at = new Date()): SiteSubscriptionState[] {
  return [...data().states.values()]
    .filter((state) => isSiteSubscriptionActiveAt(state, at))
    .map((state) => structuredClone(state));
}

export function renewMockSiteSubscription(input: {
  clientId: string;
  idempotencyKey: string;
  source: MockSubscriptionRenewalSource;
  periodMonths?: number;
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

  const stateData = data();
  const existing = stateData.states.get(input.clientId);
  if (stateData.renewalKeys.has(key)) {
    if (!existing) throw new Error('renewSiteSubscription: renewal key exists without state');
    return { duplicated: true, state: structuredClone(existing) };
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
    status: 'active',
    currentPeriodEnd: nextEnd.toISOString(),
    updatedAt: nowIso,
  };
  stateData.states.set(input.clientId, state);
  stateData.renewalKeys.add(key);
  return { duplicated: false, state: structuredClone(state) };
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
