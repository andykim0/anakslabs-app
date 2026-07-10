/**
 * mock CreditsService — SQL 함수(supabase/migrations/0001_init.sql)의 의미를 인메모리로 재현.
 *
 * 불변식:
 *  - 원장(ledger) append가 잔액의 source of truth. 잔액은 항상 원장 합산으로 계산.
 *  - 차감은 원자적: 잔액 부족 시 어떤 기록도 남기지 않고 실패.
 *  - grant는 idempotencyKey 멱등 (중복 시 조용히 no-op).
 *  - 소진은 만료 임박 lot부터 (FIFO by expiresAt, null은 마지막).
 *  - 차감 전 만료 지난 lot 선상쇄 (만료 크레딧 소진 방지) — SQL consume_credits와 동일.
 *  - refund는 referenceId의 차감분 기준 1회만 (idempotencyKey 'refund:{referenceId}').
 *  - expireDue는 멱등 (lot remaining이 0이 되므로 재실행 no-op).
 */
import { CREDIT_EXPIRY_DAYS } from '@/lib/credits/constants';
import type { CreditBalance, CreditLedgerEntry, CreditReason } from '@/lib/types/domain';
import type { ConsumeResult, CreditsService } from '../types';
import { getMockStore, newId, nowIso, type MockLot, type MockStore } from './store';

function ledgerBalance(store: MockStore, clientId: string): number {
  return store.ledger
    .filter((entry) => entry.clientId === clientId)
    .reduce((sum, entry) => sum + entry.amount, 0);
}

/** 만료 임박 순 정렬 (expiresAt asc, null은 마지막 — 무만료 lot은 최후 소진) */
function fifoLots(store: MockStore, clientId: string): MockLot[] {
  return store.lots
    .filter((lot) => lot.clientId === clientId && lot.remaining > 0)
    .sort((a, b) => {
      if (a.expiresAt === null && b.expiresAt === null) return 0;
      if (a.expiresAt === null) return 1;
      if (b.expiresAt === null) return -1;
      return a.expiresAt < b.expiresAt ? -1 : a.expiresAt > b.expiresAt ? 1 : 0;
    });
}

/** 단일 고객의 만료 지난 lot 잔여분을 'expired'로 상쇄. 상쇄한 lot 수 반환 (멱등) */
export function expireClientLots(store: MockStore, clientId: string, now: Date): number {
  const nowMs = now.getTime();
  let count = 0;
  for (const lot of store.lots) {
    if (lot.clientId !== clientId || lot.remaining <= 0 || lot.expiresAt === null) continue;
    if (new Date(lot.expiresAt).getTime() > nowMs) continue;

    store.ledger.push({
      id: newId(store, 'led'),
      clientId,
      amount: -lot.remaining,
      reason: 'expired',
      referenceId: lot.entryId, // 상쇄 대상 지급 lot의 원장 id — SQL과 동일 규약
      expiresAt: null,
      createdAt: now.toISOString(),
    });
    lot.remaining = 0;
    count += 1;
  }
  return count;
}

export class MockCreditsService implements CreditsService {
  async getBalance(clientId: string): Promise<CreditBalance> {
    const store = getMockStore();
    const entries = store.ledger.filter((entry) => entry.clientId === clientId);
    const updatedAt =
      entries.length > 0
        ? entries.reduce((max, e) => (e.createdAt > max ? e.createdAt : max), entries[0].createdAt)
        : nowIso();
    return { clientId, balance: ledgerBalance(store, clientId), updatedAt };
  }

  async getLedger(clientId: string): Promise<CreditLedgerEntry[]> {
    const store = getMockStore();
    return store.ledger
      .filter((entry) => entry.clientId === clientId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((entry) => ({ ...entry }));
  }

  async grant(input: {
    clientId: string;
    amount: number;
    reason: CreditReason;
    referenceId?: string;
    idempotencyKey?: string;
  }): Promise<void> {
    const store = getMockStore();
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error(`grant: amount는 양수여야 합니다 (입력: ${input.amount})`);
    }
    if (input.idempotencyKey && store.grantKeys.has(input.idempotencyKey)) {
      return; // 멱등 — 이미 지급됨
    }

    const createdAt = nowIso();
    const expiresDays = CREDIT_EXPIRY_DAYS[input.reason] ?? 365;
    const expiresAt = new Date(Date.now() + expiresDays * 86_400_000).toISOString();
    const entryId = newId(store, 'led');

    store.ledger.push({
      id: entryId,
      clientId: input.clientId,
      amount: input.amount,
      reason: input.reason,
      referenceId: input.referenceId ?? null,
      expiresAt,
      createdAt,
    });
    store.lots.push({
      entryId,
      clientId: input.clientId,
      remaining: input.amount,
      expiresAt,
    });
    if (input.idempotencyKey) {
      store.grantKeys.add(input.idempotencyKey);
    }
  }

  async consume(input: {
    clientId: string;
    amount: number;
    reason: CreditReason;
    referenceId?: string;
  }): Promise<ConsumeResult> {
    const store = getMockStore();
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error(`consume: amount는 양수여야 합니다 (입력: ${input.amount})`);
    }

    // 만료 시각이 지났지만 배치가 아직 안 돈 lot을 먼저 상쇄 (만료 크레딧 소진 방지)
    expireClientLots(store, input.clientId, new Date());

    const balance = ledgerBalance(store, input.clientId);
    if (balance < input.amount) {
      // 원자성: 어떤 기록도 남기지 않고 실패
      return { ok: false, error: 'insufficient_credits', balance };
    }

    // 만료 임박 lot부터 FIFO 소진
    let toDeduct = input.amount;
    for (const lot of fifoLots(store, input.clientId)) {
      if (toDeduct <= 0) break;
      const take = Math.min(lot.remaining, toDeduct);
      lot.remaining -= take;
      toDeduct -= take;
    }

    store.ledger.push({
      id: newId(store, 'led'),
      clientId: input.clientId,
      amount: -input.amount,
      reason: input.reason,
      referenceId: input.referenceId ?? null,
      expiresAt: null,
      createdAt: nowIso(),
    });

    return { ok: true, newBalance: balance - input.amount };
  }

  async refund(input: { clientId: string; referenceId: string }): Promise<void> {
    const store = getMockStore();

    // referenceId로 차감분 합산 (만료 상쇄 제외) — SQL refund_credits와 동일
    const consumed = store.ledger
      .filter(
        (entry) =>
          entry.clientId === input.clientId &&
          entry.referenceId === input.referenceId &&
          entry.amount < 0 &&
          entry.reason !== 'expired',
      )
      .reduce((sum, entry) => sum - entry.amount, 0);

    if (consumed <= 0) return; // 차감 이력 없음 — no-op

    await this.grant({
      clientId: input.clientId,
      amount: consumed,
      reason: 'refund',
      referenceId: input.referenceId,
      idempotencyKey: `refund:${input.referenceId}`, // 기환불 시 grant가 멱등 처리
    });
  }

  /**
   * [§3] 환불 시 특정 지급(referenceId)으로 생성된 lot의 미사용 잔여를
   * admin_adjust 음수 원장으로 회수. 회수액 반환 (SQL admin_refund_payment와 동일 의미).
   */
  async clawbackGrant(input: {
    clientId: string;
    referenceId: string;
    grantReason: CreditReason;
  }): Promise<number> {
    const store = getMockStore();
    const grantEntries = store.ledger.filter(
      (e) =>
        e.clientId === input.clientId &&
        e.referenceId === input.referenceId &&
        e.amount > 0 &&
        e.reason === input.grantReason,
    );
    let clawed = 0;
    for (const g of grantEntries) {
      const lot = store.lots.find((l) => l.entryId === g.id);
      if (lot && lot.remaining > 0) {
        clawed += lot.remaining;
        lot.remaining = 0;
      }
    }
    if (clawed > 0) {
      store.ledger.push({
        id: newId(store, 'led'),
        clientId: input.clientId,
        amount: -clawed,
        reason: 'admin_adjust',
        referenceId: input.referenceId,
        expiresAt: null,
        createdAt: nowIso(),
      });
    }
    return clawed;
  }

  async expireDue(now?: Date): Promise<number> {
    const store = getMockStore();
    const at = now ?? new Date();
    const clientIds = new Set(store.lots.map((lot) => lot.clientId));
    let total = 0;
    for (const clientId of clientIds) {
      total += expireClientLots(store, clientId, at);
    }
    return total;
  }
}
