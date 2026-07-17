/**
 * Supabase CreditsService — 금전 쓰기는 전부 service role 클라이언트의 rpc 경유.
 * (credit_ledger/credit_balances는 service_role도 직접 INSERT/UPDATE가 차단되어 있음 —
 *  security definer SQL 함수만 쓰기 가능. supabase/migrations/0001_init.sql 참조)
 */
import { CREDIT_EXPIRY_DAYS } from '@/lib/credits/constants';
import type { CreditBalance, CreditLedgerEntry, CreditReason } from '@/lib/types/domain';
import type { ConsumeResult, CreditsService } from '../types';
import { getServiceRoleClient } from './client';
import { rowToBalance, rowToLedgerEntry, type BalanceRow, type LedgerRow } from './mappers';

export class SupabaseCreditsService implements CreditsService {
  async getBalance(clientId: string): Promise<CreditBalance> {
    const svc = getServiceRoleClient();
    const { data, error } = await svc
      .from('credit_balances')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle();
    if (error) throw new Error(`credit_balances 조회 실패: ${error.message}`);
    if (!data) {
      // 캐시 행이 아직 없는 신규 고객 — 원장도 비어 있으므로 0
      return { clientId, balance: 0, updatedAt: new Date().toISOString() };
    }
    return rowToBalance(data as BalanceRow);
  }

  async getLedger(clientId: string): Promise<CreditLedgerEntry[]> {
    const svc = getServiceRoleClient();
    const { data, error } = await svc
      .from('credit_ledger')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`credit_ledger 조회 실패: ${error.message}`);
    return ((data ?? []) as LedgerRow[]).map(rowToLedgerEntry);
  }

  async grant(input: {
    clientId: string;
    amount: number;
    reason: CreditReason;
    referenceId?: string;
    idempotencyKey?: string;
  }): Promise<void> {
    if (input.reason === 'admin_clawback') {
      throw new Error('grant_credits: admin_clawback은 서버 환불 정합 함수만 기록할 수 있습니다');
    }
    const svc = getServiceRoleClient();
    const { error } = await svc.rpc('grant_credits', {
      p_client_id: input.clientId,
      p_amount: input.amount,
      p_reason: input.reason,
      p_reference_id: input.referenceId ?? null,
      p_idempotency_key: input.idempotencyKey ?? null,
      // 만료일 계산은 서비스 책임 (계약) — 목록에 없는 사유는 365일
      p_expires_days: CREDIT_EXPIRY_DAYS[input.reason] ?? 365,
    });
    if (error) throw new Error(`grant_credits 실패: ${error.message}`);
  }

  async consume(input: {
    clientId: string;
    amount: number;
    reason: CreditReason;
    referenceId?: string;
  }): Promise<ConsumeResult> {
    if (input.reason === 'admin_clawback') {
      throw new Error('consume_credits: admin_clawback은 서버 환불 정합 함수만 기록할 수 있습니다');
    }
    const svc = getServiceRoleClient();
    const { data, error } = await svc.rpc('consume_credits', {
      p_client_id: input.clientId,
      p_amount: input.amount,
      p_reason: input.reason,
      p_reference_id: input.referenceId ?? null,
    });

    if (error) {
      // P0001 'insufficient_credits' — 부족 시 어떤 기록도 남지 않음 (SQL이 보장)
      if (error.message?.includes('insufficient_credits')) {
        const balance = await this.parseBalanceFromError(error.details) ?? (await this.getBalance(input.clientId)).balance;
        return { ok: false, error: 'insufficient_credits', balance };
      }
      throw new Error(`consume_credits 실패: ${error.message}`);
    }

    return { ok: true, newBalance: Number(data) };
  }

  /** P0001 예외 detail 'balance=X, requested=Y'에서 잔액 파싱 (없으면 null) */
  private async parseBalanceFromError(details: string | undefined): Promise<number | null> {
    if (!details) return null;
    const m = /balance=([0-9.]+)/.exec(details);
    return m ? Number(m[1]) : null;
  }

  async refund(input: { clientId: string; referenceId: string }): Promise<void> {
    const svc = getServiceRoleClient();
    // 멱등: 차감 이력 없거나 기환불이면 SQL이 0 반환 no-op
    const { error } = await svc.rpc('refund_credits', {
      p_client_id: input.clientId,
      p_reference_id: input.referenceId,
    });
    if (error) throw new Error(`refund_credits 실패: ${error.message}`);
  }

  async expireDue(now?: Date): Promise<number> {
    const svc = getServiceRoleClient();
    const { data, error } = await svc.rpc('expire_credits', {
      p_now: (now ?? new Date()).toISOString(),
    });
    if (error) throw new Error(`expire_credits 실패: ${error.message}`);
    return Number(data ?? 0);
  }
}
