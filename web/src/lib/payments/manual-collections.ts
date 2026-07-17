import 'server-only';

import { getServiceRoleClient } from '@/lib/data/supabase/client';
import { rowToPayment, type PaymentRow } from '@/lib/data/supabase/mappers';
import { isMockMode } from '@/lib/env';
import type { Payment } from '@/lib/types/domain';
import {
  normalizeRecordManualCollectionInput,
  normalizeReverseManualCollectionInput,
  type ManualCollectionMutationResult,
  type ManualCollectionsRepository,
  type ManualCollectionChannel,
  type ManualCollectionDirection,
  type ManualCollectionProductKind,
  type ManualPaymentEntry,
  type ManualPaymentRecord,
  type RecordManualCollectionInput,
  type ReverseManualCollectionInput,
} from './manual-collection-core';
import { MockManualCollectionsRepository } from './manual-collections-mock';

interface ManualPaymentEntryRow {
  id: string;
  payment_id: string | null;
  client_id: string;
  site_id: string | null;
  product_kind: ManualCollectionProductKind;
  direction: ManualCollectionDirection;
  amount: number | string;
  collection_channel: ManualCollectionChannel;
  collection_reference: string;
  memo: string | null;
  reverses_entry_id: string | null;
  created_at: string;
}

function rowToEntry(row: ManualPaymentEntryRow): ManualPaymentEntry {
  return {
    id: row.id,
    paymentId: row.payment_id,
    clientId: row.client_id,
    siteId: row.site_id,
    productKind: row.product_kind,
    direction: row.direction,
    amountKrw: Number(row.amount),
    channel: row.collection_channel,
    collectionReference: row.collection_reference,
    memo: row.memo,
    reversesEntryId: row.reverses_entry_id,
    createdAt: row.created_at,
  };
}

class SupabaseManualCollectionsRepository implements ManualCollectionsRepository {
  private async getRecord(entryId: string): Promise<ManualPaymentRecord> {
    const service = getServiceRoleClient();
    const { data: entryData, error: entryError } = await service
      .from('manual_payment_entries')
      .select('*')
      .eq('id', entryId)
      .single();
    if (entryError) throw new Error(`manual payment entry lookup failed: ${entryError.message}`);
    const entry = rowToEntry(entryData as ManualPaymentEntryRow);
    if (!entry.paymentId) return { entry, payment: null };
    const { data: paymentData, error: paymentError } = await service
      .from('payments')
      .select('*')
      .eq('id', entry.paymentId)
      .single();
    if (paymentError) throw new Error(`manual payment lookup failed: ${paymentError.message}`);
    return { entry, payment: rowToPayment(paymentData as PaymentRow) };
  }

  async listAll(): Promise<ManualPaymentRecord[]> {
    const service = getServiceRoleClient();
    const { data, error } = await service
      .from('manual_payment_entries')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(`manual payment entries list failed: ${error.message}`);
    const entries = ((data ?? []) as ManualPaymentEntryRow[]).map(rowToEntry);
    const paymentIds = entries.flatMap((entry) => entry.paymentId ? [entry.paymentId] : []);
    const paymentById = new Map<string, Payment>();
    if (paymentIds.length) {
      const result = await service.from('payments').select('*').in('id', paymentIds);
      if (result.error) throw new Error(`manual payments list failed: ${result.error.message}`);
      for (const row of (result.data ?? []) as PaymentRow[]) {
        const payment = rowToPayment(row);
        paymentById.set(payment.id, payment);
      }
    }
    return entries.map((entry) => ({
      entry,
      payment: entry.paymentId ? paymentById.get(entry.paymentId) ?? null : null,
    }));
  }

  async record(rawInput: RecordManualCollectionInput): Promise<ManualCollectionMutationResult> {
    const input = normalizeRecordManualCollectionInput(rawInput);
    const { data, error } = await getServiceRoleClient().rpc('record_manual_collection', {
      p_client_id: input.clientId,
      p_site_id: input.siteId,
      p_product_kind: input.productKind,
      p_amount: input.amountKrw,
      p_collection_channel: input.channel,
      p_collection_reference: input.collectionReference,
      p_memo: input.memo,
      p_credit_pack_credits: input.creditPackCredits,
    });
    if (error) throw new Error(`record manual collection failed: ${error.message}`);
    const result = data as { duplicated?: boolean; entry_id?: string } | null;
    if (!result?.entry_id) throw new Error('record manual collection returned invalid evidence');
    return { duplicated: result.duplicated === true, record: await this.getRecord(result.entry_id) };
  }

  async reverse(rawInput: ReverseManualCollectionInput): Promise<ManualCollectionMutationResult> {
    const input = normalizeReverseManualCollectionInput(rawInput);
    const { data, error } = await getServiceRoleClient().rpc('reverse_manual_collection', {
      p_entry_id: input.entryId,
      p_collection_reference: input.collectionReference,
      p_memo: input.memo,
    });
    if (error) throw new Error(`reverse manual collection failed: ${error.message}`);
    const result = data as { duplicated?: boolean; entry_id?: string } | null;
    if (!result?.entry_id) throw new Error('reverse manual collection returned invalid evidence');
    return { duplicated: result.duplicated === true, record: await this.getRecord(result.entry_id) };
  }
}

export function getManualCollectionsRepository(): ManualCollectionsRepository {
  return isMockMode()
    ? new MockManualCollectionsRepository()
    : new SupabaseManualCollectionsRepository();
}
