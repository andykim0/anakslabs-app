import 'server-only';
import { isMockMode } from '@/lib/env';
import { getServiceRoleClient } from '@/lib/data/supabase/client';
import { rowToEditRequest, type EditRequestRow } from '@/lib/data/supabase/mappers';
import { MockEditRequestWorkflowRepository } from './edit-request-workflow-mock';
import {
  EditRequestWorkflowError,
  type EditRequestWorkflowRepository,
  type SubmitEditRequestInput,
  type SubmitEditRequestResult,
  type TransitionEditRequestInput,
} from './edit-request-workflow-core';

function resultObject(data: unknown): Record<string, unknown> {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new EditRequestWorkflowError('DATABASE_FAILURE', 'workflow result is invalid');
  }
  return value as Record<string, unknown>;
}

export class SupabaseEditRequestWorkflowRepository implements EditRequestWorkflowRepository {
  async submit(input: SubmitEditRequestInput): Promise<SubmitEditRequestResult> {
    const { data, error } = await getServiceRoleClient().rpc('submit_edit_request_atomic', {
      p_client_id: input.clientId,
      p_site_id: input.siteId,
      p_type: input.type,
      p_credit_cost: input.creditCost,
      p_reason: input.reason,
      p_requested_content: input.requestedContent,
      p_is_initial_revision: input.isInitialRevision,
      p_auto_approved: input.autoApproved,
    });
    if (error) {
      if (/insufficient_credits/i.test(`${error.message} ${error.details ?? ''}`)) {
        const balance = Number(/balance=([\d.]+)/i.exec(error.details ?? '')?.[1] ?? 0);
        throw new EditRequestWorkflowError('INSUFFICIENT_CREDITS', error.message, balance);
      }
      throw new EditRequestWorkflowError('DATABASE_FAILURE', error.message);
    }
    const result = resultObject(data);
    return {
      request: rowToEditRequest(result.request as unknown as EditRequestRow),
      balance: Number(result.balance),
    };
  }

  async transition(input: TransitionEditRequestInput) {
    const { data, error } = await getServiceRoleClient().rpc('transition_edit_request_atomic', {
      p_edit_request_id: input.editRequestId,
      p_expected_statuses: input.expectedStatuses,
      p_next_status: input.nextStatus,
      p_actor_type: input.actorType,
      p_actor_id: input.actorId,
      p_has_ai_output: Object.prototype.hasOwnProperty.call(input, 'aiOutput'),
      p_ai_output: input.aiOutput ?? null,
      p_has_qa_note: Object.prototype.hasOwnProperty.call(input, 'qaNote'),
      p_qa_note: input.qaNote ?? null,
      p_applied_at: input.appliedAt ?? null,
      p_reviewed_at: input.reviewedAt ?? null,
    });
    if (error) {
      if (/not found/i.test(error.message)) {
        throw new EditRequestWorkflowError('REQUEST_NOT_FOUND', error.message);
      }
      if (/state conflict/i.test(error.message)) {
        throw new EditRequestWorkflowError('STATE_CONFLICT', error.message);
      }
      throw new EditRequestWorkflowError('DATABASE_FAILURE', error.message);
    }
    return rowToEditRequest(resultObject(data) as unknown as EditRequestRow);
  }
}

export function getEditRequestWorkflowRepository(): EditRequestWorkflowRepository {
  return isMockMode()
    ? new MockEditRequestWorkflowRepository()
    : new SupabaseEditRequestWorkflowRepository();
}

export type {
  EditRequestWorkflowRepository,
  SubmitEditRequestInput,
  SubmitEditRequestResult,
  TransitionEditRequestInput,
} from './edit-request-workflow-core';
export { EditRequestWorkflowError } from './edit-request-workflow-core';
