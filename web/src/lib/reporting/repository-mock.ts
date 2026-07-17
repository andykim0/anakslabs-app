import type { MockStore } from '@/lib/data/mock/store';
import { getMockStore, newId } from '@/lib/data/mock/store';
import {
  assertReportInsertInput,
  cutoffMonthFromIso,
  normalizeClaimedAt,
  normalizeDeliveryResult,
  normalizeReportListLimit,
  normalizeStaleReconciliation,
  type MonthlyReportRecord,
  type MonthlyReportsRepository,
} from './repository-core';

interface MockMonthlyReportState {
  records: Map<string, MonthlyReportRecord>;
  identity: Map<string, string>;
}

const stateByStore = new WeakMap<MockStore, MockMonthlyReportState>();

function stateFor(store: MockStore): MockMonthlyReportState {
  let state = stateByStore.get(store);
  if (!state) {
    state = { records: new Map(), identity: new Map() };
    stateByStore.set(store, state);
  }
  return state;
}

function copyRecord(record: MonthlyReportRecord): MonthlyReportRecord {
  return structuredClone(record);
}

export class MockMonthlyReportsRepository implements MonthlyReportsRepository {
  constructor(
    private readonly store: MockStore = getMockStore(),
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async insertIfAbsent(input: Parameters<MonthlyReportsRepository['insertIfAbsent']>[0]) {
    assertReportInsertInput(input);
    const site = this.store.sites.get(input.siteId);
    if (!site || site.clientId !== input.clientId) {
      throw new Error('MONTHLY_REPORT_SITE_OWNERSHIP_MISMATCH');
    }
    const state = stateFor(this.store);
    const key = `${input.siteId}:${input.periodMonth}`;
    const existingId = state.identity.get(key);
    if (existingId) {
      const existing = state.records.get(existingId);
      if (!existing) throw new Error('MONTHLY_REPORT_MOCK_STATE_CORRUPT');
      return { record: copyRecord(existing), created: false };
    }
    const at = this.now();
    const record: MonthlyReportRecord = {
      id: newId(this.store, 'report'),
      siteId: input.siteId,
      clientId: input.clientId,
      periodMonth: input.periodMonth,
      report: structuredClone(input.report),
      deliveryStatus: 'pending',
      deliveryAttempts: 0,
      lastErrorCode: null,
      providerMessageId: null,
      sentAt: null,
      createdAt: at,
      updatedAt: at,
    };
    state.records.set(record.id, record);
    state.identity.set(key, record.id);
    return { record: copyRecord(record), created: true };
  }

  async listByClient(input: Parameters<MonthlyReportsRepository['listByClient']>[0]) {
    const limit = normalizeReportListLimit(input.limit);
    return [...stateFor(this.store).records.values()]
      .filter((record) => record.clientId === input.clientId)
      .sort(
        (left, right) =>
          right.periodMonth.localeCompare(left.periodMonth) ||
          right.createdAt.localeCompare(left.createdAt),
      )
      .slice(0, limit)
      .map(copyRecord);
  }

  async get(input: Parameters<MonthlyReportsRepository['get']>[0]) {
    const record = stateFor(this.store).records.get(input.reportId);
    return record?.clientId === input.clientId ? copyRecord(record) : null;
  }

  async getByIdForService(reportId: string) {
    const record = stateFor(this.store).records.get(reportId);
    return record ? copyRecord(record) : null;
  }

  async claimDelivery(input: Parameters<MonthlyReportsRepository['claimDelivery']>[0]) {
    const record = stateFor(this.store).records.get(input.reportId);
    if (!record || (record.deliveryStatus !== 'pending' && record.deliveryStatus !== 'failed')) {
      return null;
    }
    const at = normalizeClaimedAt(input.claimedAt ?? this.now());
    const next: MonthlyReportRecord = {
      ...record,
      deliveryStatus: 'sending',
      deliveryAttempts: record.deliveryAttempts + 1,
      lastErrorCode: null,
      providerMessageId: null,
      sentAt: null,
      updatedAt: at,
    };
    stateFor(this.store).records.set(next.id, next);
    return copyRecord(next);
  }

  async markDeliveryResult(input: Parameters<MonthlyReportsRepository['markDeliveryResult']>[0]) {
    const normalized = normalizeDeliveryResult(input);
    const state = stateFor(this.store);
    const record = state.records.get(input.reportId);
    if (!record) throw new Error('MONTHLY_REPORT_NOT_FOUND');
    if (record.deliveryStatus !== 'sending') {
      throw new Error('MONTHLY_REPORT_DELIVERY_NOT_CLAIMED');
    }
    const next: MonthlyReportRecord = {
      ...record,
      deliveryStatus: input.status,
      lastErrorCode: normalized.errorCode,
      providerMessageId: normalized.providerMessageId,
      sentAt: input.status === 'sent' ? normalized.completedAt : null,
      updatedAt: normalized.completedAt,
    };
    state.records.set(next.id, next);
    return copyRecord(next);
  }

  async reconcileStaleDeliveries(
    input: Parameters<MonthlyReportsRepository['reconcileStaleDeliveries']>[0],
  ): Promise<number> {
    const normalized = normalizeStaleReconciliation(input);
    const state = stateFor(this.store);
    let reconciled = 0;
    for (const [id, record] of state.records) {
      if (record.deliveryStatus !== 'sending' || record.updatedAt >= normalized.beforeIso) continue;
      state.records.set(id, {
        ...record,
        deliveryStatus: 'delivery_unknown',
        lastErrorCode: 'DELIVERY_STALE_REQUIRES_REVIEW',
        providerMessageId: null,
        sentAt: null,
        updatedAt: normalized.reconciledAt,
      });
      reconciled += 1;
    }
    return reconciled;
  }

  async purgeOlderThan(cutoffIso: string): Promise<number> {
    const cutoffMonth = cutoffMonthFromIso(cutoffIso);
    const state = stateFor(this.store);
    let deleted = 0;
    for (const [id, record] of state.records) {
      if (record.periodMonth >= cutoffMonth) continue;
      state.records.delete(id);
      state.identity.delete(`${record.siteId}:${record.periodMonth}`);
      deleted += 1;
    }
    return deleted;
  }
}
