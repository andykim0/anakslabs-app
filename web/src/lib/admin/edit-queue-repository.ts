import 'server-only';
import { isMockMode } from '@/lib/env';
import { getServiceRoleClient } from '@/lib/data/supabase/client';
import { rowToEditRequest, rowToLedgerEntry, type EditRequestRow, type LedgerRow } from '@/lib/data/supabase/mappers';
import { MockAdminEditQueueRepository } from './edit-queue-repository-mock';
import {
  ADMIN_EDIT_COMPLETION_STATUSES,
  ADMIN_EDIT_QUEUE_STATUSES,
  AdminEditQueueError,
  deriveAdminEditQueueItem,
  normalizeAdminEditQueueLimit,
  normalizeCompleteAdminEditInput,
  type AdminEditQueueItem,
  type AdminEditQueueRepository,
  type CompleteAdminEditRequestInput,
  type CompleteAdminEditRequestResult,
} from './edit-queue-core';

export class SupabaseAdminEditQueueRepository implements AdminEditQueueRepository {
  async listNonterminal(limit?: number): Promise<AdminEditQueueItem[]> {
    const { data, error } = await getServiceRoleClient()
      .from('edit_requests')
      .select('*')
      .in('status', ADMIN_EDIT_QUEUE_STATUSES)
      .order('created_at', { ascending: true })
      .limit(normalizeAdminEditQueueLimit(limit));
    if (error) throw new Error(`admin edit queue list failed: ${error.message}`);
    const requests = ((data ?? []) as EditRequestRow[]).map(rowToEditRequest);
    if (requests.length === 0) return [];

    const { data: ledgerRows, error: ledgerError } = await getServiceRoleClient()
      .from('credit_ledger')
      .select('*')
      .in('reference_id', requests.map((request) => request.id));
    if (ledgerError) throw new Error(`admin edit queue credit audit failed: ${ledgerError.message}`);
    const ledger = ((ledgerRows ?? []) as LedgerRow[]).map(rowToLedgerEntry);
    return requests.flatMap((request) => {
      const item = deriveAdminEditQueueItem(request, ledger);
      return item ? [item] : [];
    });
  }

  async complete(
    rawInput: CompleteAdminEditRequestInput,
  ): Promise<CompleteAdminEditRequestResult> {
    const input = normalizeCompleteAdminEditInput(rawInput);
    const client = getServiceRoleClient();
    const { data, error } = await client
      .from('edit_requests')
      .update({
        status: 'applied',
        applied_at: input.completedAt,
        reviewed_at: input.completedAt,
        qa_note: 'ADMIN_CONFIRMED_SITE_APPLIED',
      })
      .eq('id', input.editRequestId)
      .in('status', ADMIN_EDIT_COMPLETION_STATUSES)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`admin edit request completion failed: ${error.message}`);
    if (data) {
      return { record: rowToEditRequest(data as EditRequestRow), duplicated: false };
    }

    // A concurrent completion makes the conditional UPDATE affect zero rows.
    // Re-read the authoritative state to distinguish an idempotent retry from
    // rejected/not-found conflicts without overwriting either state.
    const { data: currentRow, error: currentError } = await client
      .from('edit_requests')
      .select('*')
      .eq('id', input.editRequestId)
      .maybeSingle();
    if (currentError) throw new Error(`admin edit request state lookup failed: ${currentError.message}`);
    if (!currentRow) {
      throw new AdminEditQueueError(
        'ADMIN_EDIT_REQUEST_NOT_FOUND',
        'The edit request does not exist.',
      );
    }
    const current = rowToEditRequest(currentRow as EditRequestRow);
    if (current.status === 'applied') return { record: current, duplicated: true };
    if (current.status === 'rejected') {
      throw new AdminEditQueueError(
        'ADMIN_EDIT_REQUEST_REJECTED',
        'A rejected edit request cannot be completed.',
      );
    }
    throw new AdminEditQueueError(
      'ADMIN_EDIT_REQUEST_STATE_CONFLICT',
      `The edit request stayed in an unexpected state: ${current.status}.`,
    );
  }
}

export function getAdminEditQueueRepository(): AdminEditQueueRepository {
  return isMockMode()
    ? new MockAdminEditQueueRepository()
    : new SupabaseAdminEditQueueRepository();
}

export type {
  AdminEditQueueItem,
  AdminEditQueueRepository,
  CompleteAdminEditRequestInput,
  CompleteAdminEditRequestResult,
} from './edit-queue-core';
