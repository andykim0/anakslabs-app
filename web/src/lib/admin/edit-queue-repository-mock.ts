import type { MockStore } from '@/lib/data/mock/store';
import { getMockStore } from '@/lib/data/mock/store';
import {
  AdminEditQueueError,
  deriveAdminEditQueueItem,
  isAdminEditQueueStatus,
  normalizeAdminEditQueueLimit,
  normalizeCompleteAdminEditInput,
  type AdminEditQueueItem,
  type AdminEditQueueRepository,
  type CompleteAdminEditRequestInput,
  type CompleteAdminEditRequestResult,
} from './edit-queue-core';

export class MockAdminEditQueueRepository implements AdminEditQueueRepository {
  constructor(
    private readonly store: MockStore = getMockStore(),
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async listNonterminal(limit?: number): Promise<AdminEditQueueItem[]> {
    return [...this.store.editRequests.values()]
      .flatMap((request) => {
        const item = deriveAdminEditQueueItem(request, this.store.ledger);
        return item ? [item] : [];
      })
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, normalizeAdminEditQueueLimit(limit));
  }

  async complete(
    rawInput: CompleteAdminEditRequestInput,
  ): Promise<CompleteAdminEditRequestResult> {
    const input = normalizeCompleteAdminEditInput(rawInput, this.now);
    const request = this.store.editRequests.get(input.editRequestId);
    if (!request) {
      throw new AdminEditQueueError(
        'ADMIN_EDIT_REQUEST_NOT_FOUND',
        'The edit request does not exist.',
      );
    }
    if (request.status === 'applied') {
      return { record: structuredClone(request), duplicated: true };
    }
    if (request.status === 'rejected') {
      throw new AdminEditQueueError(
        'ADMIN_EDIT_REQUEST_REJECTED',
        'A rejected edit request cannot be completed.',
      );
    }
    if (!isAdminEditQueueStatus(request.status)) {
      throw new AdminEditQueueError(
        'ADMIN_EDIT_REQUEST_STATE_CONFLICT',
        `The edit request cannot transition from ${request.status}.`,
      );
    }

    request.status = 'applied';
    request.appliedAt = input.completedAt;
    return { record: structuredClone(request), duplicated: false };
  }
}
