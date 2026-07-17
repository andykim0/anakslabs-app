import type { CreditLedgerEntry, EditRequest, EditStatus } from '@/lib/types/domain';

export const ADMIN_EDIT_QUEUE_STATUSES = [
  'pending',
  'ai_processing',
  'qa_review',
] as const satisfies readonly EditStatus[];

export type AdminEditQueueStatus = (typeof ADMIN_EDIT_QUEUE_STATUSES)[number];

/** Only QA-ready work can be closed; pending/in-flight AI work fails closed. */
export const ADMIN_EDIT_COMPLETION_STATUSES = ['qa_review'] as const satisfies readonly EditStatus[];

export interface EditCreditAudit {
  /** Append-only ledger entries tied to this request, including a refund if present. */
  ledgerEntryCount: number;
  /** Actual remaining charge after entries with the request referenceId are netted. */
  netCreditCharge: number;
  creditCharged: boolean;
}

export interface AdminEditQueueItem extends EditRequest, EditCreditAudit {
  status: AdminEditQueueStatus;
}

export interface CompleteAdminEditRequestInput {
  editRequestId: string;
  completedAt?: string;
}

export interface CompleteAdminEditRequestResult {
  record: EditRequest;
  duplicated: boolean;
}

export interface AdminEditQueueRepository {
  listNonterminal(limit?: number): Promise<AdminEditQueueItem[]>;
  complete(input: CompleteAdminEditRequestInput): Promise<CompleteAdminEditRequestResult>;
}

export const ADMIN_EDIT_QUEUE_ERROR_CODES = [
  'ADMIN_EDIT_REQUEST_NOT_FOUND',
  'ADMIN_EDIT_REQUEST_REJECTED',
  'ADMIN_EDIT_REQUEST_STATE_CONFLICT',
  'ADMIN_EDIT_REQUEST_INPUT_INVALID',
] as const;

export type AdminEditQueueErrorCode = (typeof ADMIN_EDIT_QUEUE_ERROR_CODES)[number];

export class AdminEditQueueError extends Error {
  constructor(readonly code: AdminEditQueueErrorCode, message: string) {
    super(message);
    this.name = 'AdminEditQueueError';
  }
}

export function isAdminEditQueueStatus(status: EditStatus): status is AdminEditQueueStatus {
  return (ADMIN_EDIT_QUEUE_STATUSES as readonly EditStatus[]).includes(status);
}

export function isAdminEditCompletionStatus(status: EditStatus): status is 'qa_review' {
  return (ADMIN_EDIT_COMPLETION_STATUSES as readonly EditStatus[]).includes(status);
}

/**
 * `creditCost` is the requested contract amount, not proof of a charge. Only
 * append-only ledger rows with this request's owner + referenceId establish the
 * actual net charge. A refund row therefore returns the net amount to zero.
 */
export function deriveEditCreditAudit(
  request: Pick<EditRequest, 'id' | 'clientId'>,
  ledger: readonly CreditLedgerEntry[],
): EditCreditAudit {
  const matching = ledger.filter((entry) =>
    entry.clientId === request.clientId && entry.referenceId === request.id);
  const netDelta = matching.reduce((sum, entry) => {
    if (!Number.isFinite(entry.amount)) {
      throw new AdminEditQueueError(
        'ADMIN_EDIT_REQUEST_STATE_CONFLICT',
        'The credit ledger contains a non-finite amount.',
      );
    }
    return sum + entry.amount;
  }, 0);
  const netCreditCharge = Math.max(0, -netDelta);
  return {
    ledgerEntryCount: matching.length,
    netCreditCharge,
    creditCharged: netCreditCharge > 0,
  };
}

export function deriveAdminEditQueueItem(
  request: EditRequest,
  ledger: readonly CreditLedgerEntry[],
): AdminEditQueueItem | null {
  if (!isAdminEditQueueStatus(request.status)) return null;
  return {
    ...structuredClone(request),
    status: request.status,
    ...deriveEditCreditAudit(request, ledger),
  };
}

export function normalizeAdminEditQueueLimit(limit = 200): number {
  return Number.isSafeInteger(limit) && limit > 0 && limit <= 500 ? limit : 200;
}

export function normalizeCompleteAdminEditInput(
  input: CompleteAdminEditRequestInput,
  now: () => string = () => new Date().toISOString(),
): Required<CompleteAdminEditRequestInput> {
  const editRequestId = input.editRequestId.trim();
  const completedAt = input.completedAt?.trim() || now();
  if (!editRequestId || !Number.isFinite(Date.parse(completedAt))) {
    throw new AdminEditQueueError(
      'ADMIN_EDIT_REQUEST_INPUT_INVALID',
      'A request id and valid completion timestamp are required.',
    );
  }
  return { editRequestId, completedAt };
}
