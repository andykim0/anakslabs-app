import 'server-only';

import { getServiceRoleClient } from '@/lib/data/supabase/client';
import { rowToPayment, type PaymentRow } from '@/lib/data/supabase/mappers';
import { isMockMode } from '@/lib/env';
import type { Payment } from '@/lib/types/domain';
import {
  normalizeRecordManualCollectionInput,
  normalizeReverseManualCollectionInput,
  normalizeLinkManualCollectionClientInput,
  normalizeLinkManualCollectionSiteInput,
  type LinkManualCollectionClientInput,
  type LinkManualCollectionSiteInput,
  type ManualCollectionLink,
  type ManualCollectionLinkKind,
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
  client_id: string | null;
  site_id: string | null;
  customer_name: string | null;
  customer_contact: string | null;
  credit_pack_credits: number | null;
  product_kind: ManualCollectionProductKind;
  direction: ManualCollectionDirection;
  amount: number | string;
  collection_channel: ManualCollectionChannel;
  collection_reference: string;
  memo: string | null;
  reverses_entry_id: string | null;
  created_at: string;
}

interface ManualCollectionLinkRow {
  id: string;
  entry_id: string;
  link_kind: ManualCollectionLinkKind;
  client_id: string;
  site_id: string | null;
  payment_id: string | null;
  memo: string | null;
  created_at: string;
}

function rowToLink(row: ManualCollectionLinkRow): ManualCollectionLink {
  return {
    id: row.id,
    entryId: row.entry_id,
    kind: row.link_kind,
    clientId: row.client_id,
    siteId: row.site_id,
    paymentId: row.payment_id,
    memo: row.memo,
    createdAt: row.created_at,
  };
}

function rowToEntry(
  row: ManualPaymentEntryRow,
  links: readonly ManualCollectionLink[] = [],
): ManualPaymentEntry {
  const clientLink = links.find((link) => link.kind === 'client');
  const siteLink = links.find((link) => link.kind === 'site');
  return {
    id: row.id,
    paymentId: row.direction === 'receipt' ? row.payment_id ?? clientLink?.paymentId ?? null : null,
    clientId: row.client_id ?? clientLink?.clientId ?? null,
    siteId: row.site_id ?? siteLink?.siteId ?? null,
    customerName: row.customer_name,
    customerContact: row.customer_contact,
    creditPackCredits: row.credit_pack_credits,
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
    const record = (await this.listAll()).find(({ entry }) => entry.id === entryId);
    if (!record) throw new Error('manual payment entry lookup failed: not found');
    return record;
  }

  async listAll(): Promise<ManualPaymentRecord[]> {
    const service = getServiceRoleClient();
    const { data, error } = await service
      .from('manual_payment_entries')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(`manual payment entries list failed: ${error.message}`);
    const rawEntries = (data ?? []) as ManualPaymentEntryRow[];
    const receiptIds = rawEntries
      .filter((entry) => entry.direction === 'receipt')
      .map((entry) => entry.id);
    const linksResult = receiptIds.length
      ? await service.from('manual_payment_entry_links').select('*').in('entry_id', receiptIds)
      : { data: [], error: null };
    if (linksResult.error) {
      throw new Error(`manual payment links list failed: ${linksResult.error.message}`);
    }
    const links = ((linksResult.data ?? []) as ManualCollectionLinkRow[])
      .map(rowToLink)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const rawById = new Map(rawEntries.map((entry) => [entry.id, entry]));
    const entryLinks = (row: ManualPaymentEntryRow) => {
      const sourceId = row.direction === 'reversal' && row.reverses_entry_id
        ? row.reverses_entry_id
        : row.id;
      return links.filter((link) => link.entryId === sourceId);
    };
    const entries = rawEntries.map((row) => {
      const source = row.direction === 'reversal' && row.reverses_entry_id
        ? rawById.get(row.reverses_entry_id) ?? row
        : row;
      const projected = rowToEntry(row, entryLinks(row));
      if (source !== row) {
        projected.clientId = rowToEntry(source, entryLinks(row)).clientId;
        projected.siteId = rowToEntry(source, entryLinks(row)).siteId;
      }
      return projected;
    });
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
    return entries.map((entry, index) => ({
      entry,
      payment: entry.paymentId ? paymentById.get(entry.paymentId) ?? null : null,
      links: entryLinks(rawEntries[index]),
    }));
  }

  async record(rawInput: RecordManualCollectionInput): Promise<ManualCollectionMutationResult> {
    const input = normalizeRecordManualCollectionInput(rawInput);
    const { data, error } = await getServiceRoleClient().rpc('record_manual_collection_v2', {
      p_client_id: input.clientId,
      p_customer_name: input.customerName,
      p_customer_contact: input.customerContact,
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
    const { data, error } = await getServiceRoleClient().rpc('reverse_manual_collection_v2', {
      p_entry_id: input.entryId,
      p_collection_reference: input.collectionReference,
      p_memo: input.memo,
    });
    if (error) throw new Error(`reverse manual collection failed: ${error.message}`);
    const result = data as { duplicated?: boolean; entry_id?: string } | null;
    if (!result?.entry_id) throw new Error('reverse manual collection returned invalid evidence');
    return { duplicated: result.duplicated === true, record: await this.getRecord(result.entry_id) };
  }

  async linkClient(
    rawInput: LinkManualCollectionClientInput,
  ): Promise<ManualCollectionMutationResult> {
    const input = normalizeLinkManualCollectionClientInput(rawInput);
    const { data, error } = await getServiceRoleClient().rpc('link_manual_collection_client', {
      p_entry_id: input.entryId,
      p_client_id: input.clientId,
      p_memo: input.memo,
    });
    if (error) throw new Error(`link manual collection client failed: ${error.message}`);
    const result = data as { duplicated?: boolean; entry_id?: string } | null;
    if (!result?.entry_id) throw new Error('link manual collection client returned invalid evidence');
    return { duplicated: result.duplicated === true, record: await this.getRecord(result.entry_id) };
  }

  async linkSite(
    rawInput: LinkManualCollectionSiteInput,
  ): Promise<ManualCollectionMutationResult> {
    const input = normalizeLinkManualCollectionSiteInput(rawInput);
    const { data, error } = await getServiceRoleClient().rpc('link_manual_collection_site', {
      p_entry_id: input.entryId,
      p_site_id: input.siteId,
      p_memo: input.memo,
    });
    if (error) throw new Error(`link manual collection site failed: ${error.message}`);
    const result = data as { duplicated?: boolean; entry_id?: string } | null;
    if (!result?.entry_id) throw new Error('link manual collection site returned invalid evidence');
    return { duplicated: result.duplicated === true, record: await this.getRecord(result.entry_id) };
  }
}

export function getManualCollectionsRepository(): ManualCollectionsRepository {
  return isMockMode()
    ? new MockManualCollectionsRepository()
    : new SupabaseManualCollectionsRepository();
}
