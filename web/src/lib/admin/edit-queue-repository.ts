import 'server-only';
import { isMockMode } from '@/lib/env';
import { getServiceRoleClient } from '@/lib/data/supabase/client';
import { rowToEditRequest, rowToLedgerEntry, type EditRequestRow, type LedgerRow } from '@/lib/data/supabase/mappers';
import { MockAdminEditQueueRepository } from './edit-queue-repository-mock';
import {
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
  async countNonterminal(): Promise<number> {
    const { count, error } = await getServiceRoleClient()
      .from('edit_requests')
      .select('id', { count: 'exact', head: true })
      .in('status', ADMIN_EDIT_QUEUE_STATUSES);
    if (error) throw new Error(`admin edit queue count failed: ${error.message}`);
    return count ?? 0;
  }

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
    const { data, error } = await client.rpc('complete_edit_request_fulfillment', {
      p_edit_request_id: input.editRequestId,
      p_actor_type: input.actorType,
      p_actor_id: input.actorId,
      p_completed_at: input.completedAt,
      p_expected_draft_config: input.expectedDraftConfig,
      p_expected_site_config: input.expectedSiteConfig,
      p_next_draft_config: input.nextDraftConfig,
      p_next_site_config: input.nextSiteConfig,
    });
    if (error) {
      const detail = `${error.message} ${error.details ?? ''}`;
      if (/not found/i.test(detail)) {
        throw new AdminEditQueueError(
          'ADMIN_EDIT_REQUEST_NOT_FOUND',
          'The edit request does not exist.',
        );
      }
      if (/config changed|config columns/i.test(detail)) {
        throw new AdminEditQueueError(
          'ADMIN_EDIT_REQUEST_CONFIG_CONFLICT',
          'The site changed while the request was being applied.',
        );
      }
      if (/state conflict/i.test(detail)) {
        throw new AdminEditQueueError(
          'ADMIN_EDIT_REQUEST_STATE_CONFLICT',
          detail,
        );
      }
      throw new Error(`admin edit request completion failed: ${error.message}`);
    }
    const value = Array.isArray(data) ? data[0] : data;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new AdminEditQueueError(
        'ADMIN_EDIT_REQUEST_STATE_CONFLICT',
        'The completion result is invalid.',
      );
    }
    const result = value as { request?: EditRequestRow; duplicated?: boolean };
    if (!result.request) throw new Error('admin edit request completion result missing request');
    return { record: rowToEditRequest(result.request), duplicated: result.duplicated === true };
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
