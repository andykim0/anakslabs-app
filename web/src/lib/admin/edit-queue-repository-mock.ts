import type { MockStore } from '@/lib/data/mock/store';
import { getMockStore } from '@/lib/data/mock/store';
import { isDeepStrictEqual } from 'node:util';
import type { EditRequestEvent } from './edit-fulfillment-core';
import {
  AdminEditQueueError,
  deriveAdminEditQueueItem,
  isAdminEditCompletionStatus,
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
    private readonly beforeCommit: () => void = () => {},
  ) {}

  async countNonterminal(): Promise<number> {
    return [...this.store.editRequests.values()].filter((request) => isAdminEditQueueStatus(request.status)).length;
  }

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
    if (!isAdminEditQueueStatus(request.status) || !isAdminEditCompletionStatus(request.status)) {
      throw new AdminEditQueueError(
        'ADMIN_EDIT_REQUEST_STATE_CONFLICT',
        `The edit request cannot transition from ${request.status}.`,
      );
    }
    const site = this.store.sites.get(request.siteId);
    if (!site || site.clientId !== request.clientId) {
      throw new AdminEditQueueError('ADMIN_EDIT_REQUEST_STATE_CONFLICT', 'The owned site is missing.');
    }
    if (!isDeepStrictEqual(site.draftConfig, input.expectedDraftConfig)
      || !isDeepStrictEqual(site.siteConfig, input.expectedSiteConfig)) {
      throw new AdminEditQueueError(
        'ADMIN_EDIT_REQUEST_CONFIG_CONFLICT',
        'The site changed while the request was being applied.',
      );
    }
    this.beforeCommit();

    // Commit boundary: site application and terminal status change happen
    // together only after all validation above has succeeded.
    site.draftConfig = structuredClone(input.nextDraftConfig);
    site.siteConfig = structuredClone(input.nextSiteConfig);
    site.exportStatus = 'none';
    site.exportUrl = null;
    site.exportRequestedAt = null;
    request.status = 'applied';
    request.appliedAt = input.completedAt;
    request.reviewedAt = input.completedAt;
    request.qaNote = 'ADMIN_APPLIED_TO_PUBLISHED_SITE';
    const event: EditRequestEvent = {
      id: `edit-event-${request.id}`,
      editRequestId: request.id,
      fromStatus: 'qa_review',
      toStatus: 'applied',
      actorType: input.actorType,
      actorId: input.actorId,
      createdAt: input.completedAt,
    };
    (this.store.editRequestEvents ??= []).push(event);
    return { record: structuredClone(request), duplicated: false };
  }
}
