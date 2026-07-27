import { randomUUID } from 'node:crypto';
import {
  ContentQueueError,
  type AdminContentQueueItem,
  type ContentGenerationClaim,
  type ContentPublishResult,
  type ContentQueueRepository,
} from './content-queue-core';

export class MockContentQueueRepository implements ContentQueueRepository {
  private readonly items = new Map<string, AdminContentQueueItem>();
  private readonly rejectionReasons = new Map<string, string[]>();
  private readonly versionHistory = new Map<string, AdminContentQueueItem['currentVersion'][]>();

  constructor(seed: readonly AdminContentQueueItem[] = []) {
    for (const item of seed) {
      this.items.set(item.id, structuredClone(item));
      this.versionHistory.set(
        item.id,
        item.currentVersion ? [structuredClone(item.currentVersion)] : [],
      );
    }
  }

  private required(id: string): AdminContentQueueItem {
    const item = this.items.get(id);
    if (!item) throw new ContentQueueError('CONTENT_POST_NOT_FOUND', 'Content post not found.');
    return item;
  }

  async listNonterminal(limit = 200): Promise<AdminContentQueueItem[]> {
    return [...this.items.values()]
      .filter((item) => item.status !== 'published')
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
      .slice(0, limit)
      .map((item) => structuredClone(item));
  }

  async countNonterminal(): Promise<number> {
    return (await this.listNonterminal(500)).length;
  }

  async getById(id: string): Promise<AdminContentQueueItem | null> {
    const item = this.items.get(id);
    return item ? structuredClone(item) : null;
  }

  async claimGeneration(input: {
    id: string;
    actorId: string;
    regeneration: boolean;
  }): Promise<ContentGenerationClaim> {
    const item = this.required(input.id);
    const expected = input.regeneration ? 'rejected' : 'draft';
    if (item.status !== expected) {
      throw new ContentQueueError('CONTENT_POST_STATE_CONFLICT', 'Generation state conflict.');
    }
    item.status = 'generating';
    item.updatedAt = new Date().toISOString();
    return { item: structuredClone(item), previousStatus: expected };
  }

  async failGeneration(input: {
    id: string;
    actorId: string;
    restoreStatus: 'draft' | 'rejected';
    reason: string;
  }): Promise<void> {
    const item = this.required(input.id);
    if (item.status === 'generating') {
      item.status = input.restoreStatus;
      item.updatedAt = new Date().toISOString();
    }
  }

  async storeGenerated(input: Parameters<ContentQueueRepository['storeGenerated']>[0]) {
    const item = this.required(input.id);
    if (item.status !== 'generating') {
      throw new ContentQueueError('CONTENT_POST_STATE_CONFLICT', 'Generation state conflict.');
    }
    const versionId = randomUUID();
    const versionNumber = (item.currentVersion?.versionNumber ?? 0) + 1;
    item.currentVersionId = versionId;
    item.currentVersion = {
      id: versionId,
      versionNumber,
      title: input.generated.post.title,
      summary: input.generated.post.summary,
      tags: [...input.generated.post.tags],
      document: structuredClone(input.generated.post.document),
      sourceSnapshot: structuredClone(input.generated.sourceSnapshot),
      sourceSnapshotSha256: input.generated.sourceSnapshotSha256,
      sourceRefs: [...input.generated.sourceRefs],
      policyVersions: structuredClone(input.generated.policyVersions),
      validationEvidence: structuredClone(input.generated.validationEvidence) as unknown as Record<string, unknown>,
      generationMetadata: structuredClone(input.generated.generationMetadata) as unknown as Record<string, unknown>,
      createdAt: new Date().toISOString(),
    };
    const history = this.versionHistory.get(item.id) ?? [];
    history.push(structuredClone(item.currentVersion));
    this.versionHistory.set(item.id, history);
    item.status = 'pending_approval';
    item.updatedAt = new Date().toISOString();
    return structuredClone(item);
  }

  async reject(input: Parameters<ContentQueueRepository['reject']>[0]) {
    const item = this.required(input.id);
    if (item.status === 'rejected' && item.currentVersionId === input.expectedVersionId) {
      return { item: structuredClone(item), duplicated: true };
    }
    if (item.status !== 'pending_approval' || item.currentVersionId !== input.expectedVersionId) {
      throw new ContentQueueError('CONTENT_POST_STATE_CONFLICT', 'Rejection state conflict.');
    }
    item.status = 'rejected';
    item.updatedAt = new Date().toISOString();
    const reasons = this.rejectionReasons.get(item.id) ?? [];
    reasons.push(input.reason);
    this.rejectionReasons.set(item.id, reasons);
    return { item: structuredClone(item), duplicated: false };
  }

  async approveAndPublish(
    input: Parameters<ContentQueueRepository['approveAndPublish']>[0],
  ): Promise<ContentPublishResult> {
    const item = this.required(input.id);
    if (item.status === 'published' && item.currentVersionId === input.expectedVersionId) {
      return { item: structuredClone(item), siteDomain: null, duplicated: true };
    }
    if (
      item.status !== 'pending_approval'
      || item.currentVersionId !== input.expectedVersionId
      || item.currentVersion?.sourceSnapshotSha256 !== input.sourceSnapshotSha256
    ) {
      throw new ContentQueueError('CONTENT_POST_STATE_CONFLICT', 'Approval state conflict.');
    }
    item.status = 'published';
    item.updatedAt = new Date().toISOString();
    return { item: structuredClone(item), siteDomain: null, duplicated: false };
  }

  versionCount(id: string): number {
    return this.versionHistory.get(id)?.length ?? 0;
  }

  versions(id: string): readonly AdminContentQueueItem['currentVersion'][] {
    return structuredClone(this.versionHistory.get(id) ?? []);
  }

  rejectionHistory(id: string): readonly string[] {
    return [...(this.rejectionReasons.get(id) ?? [])];
  }
}
