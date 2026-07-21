import type { EditRequest } from '@/lib/types/domain';
import { MockCreditsService } from '@/lib/data/mock/credits';
import { getMockStore, newId, type MockStore } from '@/lib/data/mock/store';
import type { EditRequestEvent } from '@/lib/admin/edit-fulfillment-core';
import {
  EditRequestWorkflowError,
  type EditRequestWorkflowRepository,
  type SubmitEditRequestInput,
  type SubmitEditRequestResult,
  type TransitionEditRequestInput,
} from './edit-request-workflow-core';

interface MockWorkflowOptions {
  now?: () => string;
  beforeSubmitCommit?: () => void;
  beforeTransitionCommit?: () => void;
}

function events(store: MockStore): EditRequestEvent[] {
  return (store.editRequestEvents ??= []);
}

function cloneRequest(request: EditRequest): EditRequest {
  return structuredClone(request);
}

export class MockEditRequestWorkflowRepository implements EditRequestWorkflowRepository {
  private readonly credits = new MockCreditsService();
  private readonly now: () => string;

  constructor(
    private readonly store: MockStore = getMockStore(),
    private readonly options: MockWorkflowOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async submit(input: SubmitEditRequestInput): Promise<SubmitEditRequestResult> {
    const balanceBefore = await this.credits.getBalance(input.clientId);
    if (!input.isInitialRevision && balanceBefore.balance < input.creditCost) {
      throw new EditRequestWorkflowError(
        'INSUFFICIENT_CREDITS',
        'insufficient credits',
        balanceBefore.balance,
      );
    }

    // Memory parity with the SQL transaction: every mutable collection is
    // restored if an injected save/ledger failure occurs before commit.
    const ledgerSnapshot = structuredClone(this.store.ledger);
    const lotsSnapshot = structuredClone(this.store.lots);
    const counterSnapshot = structuredClone(this.store.counters);
    const eventSnapshot = structuredClone(events(this.store));
    const id = crypto.randomUUID();
    try {
      const createdAt = this.now();
      const request: EditRequest = {
        id,
        clientId: input.clientId,
        siteId: input.siteId,
        type: input.type,
        creditCost: input.isInitialRevision ? 0 : input.creditCost,
        status: 'pending',
        requestedContent: input.requestedContent,
        aiOutput: null,
        createdAt,
        appliedAt: null,
        isInitialRevision: input.isInitialRevision,
        autoApproved: input.autoApproved,
        reviewedAt: null,
        qaNote: null,
      };
      this.store.editRequests.set(id, request);
      let balance = balanceBefore.balance;
      if (!input.isInitialRevision) {
        const consumed = await this.credits.consume({
          clientId: input.clientId,
          amount: input.creditCost,
          reason: input.reason,
          referenceId: id,
        });
        if (!consumed.ok) {
          throw new EditRequestWorkflowError(
            'INSUFFICIENT_CREDITS',
            'insufficient credits',
            consumed.balance,
          );
        }
        balance = consumed.newBalance;
      }
      events(this.store).push({
        id: newId(this.store, 'edit-event'),
        editRequestId: id,
        fromStatus: null,
        toStatus: 'pending',
        actorType: 'client',
        actorId: input.clientId,
        createdAt,
      });
      this.options.beforeSubmitCommit?.();
      return { request: cloneRequest(request), balance };
    } catch (error) {
      this.store.editRequests.delete(id);
      this.store.ledger.splice(0, this.store.ledger.length, ...ledgerSnapshot);
      this.store.lots.splice(0, this.store.lots.length, ...lotsSnapshot);
      this.store.counters = counterSnapshot;
      this.store.editRequestEvents = eventSnapshot;
      if (error instanceof EditRequestWorkflowError) throw error;
      throw new EditRequestWorkflowError('DATABASE_FAILURE', 'edit request transaction failed');
    }
  }

  async transition(input: TransitionEditRequestInput): Promise<EditRequest> {
    const request = this.store.editRequests.get(input.editRequestId);
    if (!request) throw new EditRequestWorkflowError('REQUEST_NOT_FOUND', 'request not found');
    if (!input.expectedStatuses.includes(request.status)) {
      throw new EditRequestWorkflowError('STATE_CONFLICT', `unexpected status: ${request.status}`);
    }
    this.options.beforeTransitionCommit?.();
    const fromStatus = request.status;
    request.status = input.nextStatus;
    if ('aiOutput' in input) request.aiOutput = structuredClone(input.aiOutput) ?? null;
    if ('qaNote' in input) request.qaNote = input.qaNote ?? null;
    if ('appliedAt' in input) request.appliedAt = input.appliedAt ?? null;
    if ('reviewedAt' in input) request.reviewedAt = input.reviewedAt ?? null;
    events(this.store).push({
      id: newId(this.store, 'edit-event'),
      editRequestId: request.id,
      fromStatus,
      toStatus: input.nextStatus,
      actorType: input.actorType,
      actorId: input.actorId,
      createdAt: this.now(),
    });
    return cloneRequest(request);
  }
}
