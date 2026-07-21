import type { CreditReason, EditRequest, EditStatus, EditType } from '@/lib/types/domain';
import type { FulfillmentActorType } from '@/lib/admin/edit-fulfillment-core';

export interface SubmitEditRequestInput {
  clientId: string;
  siteId: string;
  type: EditType;
  creditCost: number;
  reason: CreditReason;
  requestedContent: string;
  isInitialRevision: boolean;
  autoApproved: boolean;
}

export interface SubmitEditRequestResult {
  request: EditRequest;
  balance: number;
}

export interface TransitionEditRequestInput {
  editRequestId: string;
  expectedStatuses: EditStatus[];
  nextStatus: EditStatus;
  actorType: FulfillmentActorType;
  actorId: string;
  aiOutput?: unknown;
  qaNote?: string | null;
  appliedAt?: string | null;
  reviewedAt?: string | null;
}

export interface EditRequestWorkflowRepository {
  submit(input: SubmitEditRequestInput): Promise<SubmitEditRequestResult>;
  transition(input: TransitionEditRequestInput): Promise<EditRequest>;
}

export type EditRequestWorkflowErrorCode =
  | 'INSUFFICIENT_CREDITS'
  | 'REQUEST_NOT_FOUND'
  | 'STATE_CONFLICT'
  | 'DATABASE_FAILURE';

export class EditRequestWorkflowError extends Error {
  constructor(
    readonly code: EditRequestWorkflowErrorCode,
    message: string,
    readonly balance?: number,
  ) {
    super(message);
    this.name = 'EditRequestWorkflowError';
  }
}
