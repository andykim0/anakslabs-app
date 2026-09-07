import { randomUUID } from 'node:crypto';
import {
  isSamePeriodMonth,
  monthlySlotSlug,
  periodMonthKey,
} from '@/lib/content-fulfillment/delivery';
import {
  ContentQueueError,
  normalizeContentQueueLimit,
  type AdminContentQueueItem,
  type AdminContentQueueVersion,
  type ContentGenerationClaim,
  type ContentPublishResult,
  type ContentQueueRepository,
  type ContentQueueSiteQuery,
  type ContentSlotProvisionInput,
  type ContentSlotProvisionResult,
} from './content-queue-core';
import {
  CONTENT_REWORK_REFUSAL_MESSAGES,
  contentReworkSwapRefusal,
} from './content-rework-policy';

/**
 * Mirrors the append-only content_post_events rows 0059 and 0060 write. The rework verbs record
 * from_status = to_status = 'published' for the same reason the migration does: nothing moved.
 */
export interface MockContentSlotEvent {
  contentPostId: string;
  clientId: string;
  siteId: string;
  eventType: 'slot_created' | 'rework_claimed' | 'rework_published';
  fromStatus?: 'published';
  toStatus: 'draft' | 'published';
  actorType: 'admin';
  actorId: string;
  createdAt: string;
}

export class MockContentQueueRepository implements ContentQueueRepository {
  private readonly items = new Map<string, AdminContentQueueItem>();
  private readonly rejectionReasons = new Map<string, string[]>();
  private readonly versionHistory = new Map<string, AdminContentQueueItem['currentVersion'][]>();
  private readonly slotEvents: MockContentSlotEvent[] = [];

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
      // Additive, like the SQL filter: published rows enter the queue only while one is staged.
      .filter((item) => item.status !== 'published' || item.pendingVersionId !== null)
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
      .slice(0, limit)
      .map((item) => structuredClone(item));
  }

  async countNonterminal(): Promise<number> {
    return (await this.listNonterminal(500)).length;
  }

  async listBySites(query: ContentQueueSiteQuery): Promise<AdminContentQueueItem[]> {
    const siteIds = new Set(query.siteIds);
    if (siteIds.size === 0) return [];
    const statuses = query.statuses ? new Set<string>(query.statuses) : null;
    const descending = query.order === 'desc';
    return [...this.items.values()]
      .filter((item) => siteIds.has(item.siteId))
      .filter((item) => !query.periodMonths
        || query.periodMonths.some((month) => isSamePeriodMonth(item.periodMonth, month)))
      .filter((item) => !query.beforePeriodMonth
        || periodMonthKey(item.periodMonth) < periodMonthKey(query.beforePeriodMonth))
      .filter((item) => !statuses || statuses.has(item.status))
      .sort((left, right) => {
        const byPeriod = left.periodMonth.localeCompare(right.periodMonth);
        return (descending ? -byPeriod : byPeriod) || left.ordinal - right.ordinal;
      })
      .slice(0, normalizeContentQueueLimit(query.limit))
      .map((item) => structuredClone(item));
  }

  async provisionMonthlySlots(
    input: ContentSlotProvisionInput,
  ): Promise<ContentSlotProvisionResult> {
    const existing = [...this.items.values()].filter((item) =>
      item.siteId === input.siteId
      && item.pricingModelVersion === input.pricingModelVersion
      && isSamePeriodMonth(item.periodMonth, input.periodMonth));
    const takenOrdinals = new Set(existing.map((item) => item.ordinal));
    /**
     * 0049 makes (site_id, slug) unique on top of the schedule identity, and 0059 inserts under
     * `on conflict do nothing`. So a colliding slug in production is not an error — the row is
     * skipped and `created` silently comes up short of what the month owes. The mock reproduces
     * that under-provision rather than throwing: a mock stricter than production would advertise
     * a fail-safe that does not exist, and this is exactly the signature that appears if 0047's
     * pricing_model_version immutability is ever relaxed.
     */
    const takenSlugs = new Set(
      [...this.items.values()]
        .filter((item) => item.siteId === input.siteId)
        .map((item) => item.slug),
    );
    let created = 0;
    for (let ordinal = 1; ordinal <= input.count; ordinal += 1) {
      if (takenOrdinals.has(ordinal)) continue;
      const slug = monthlySlotSlug(input.periodMonth, ordinal);
      if (takenSlugs.has(slug)) continue;
      takenSlugs.add(slug);
      const now = new Date().toISOString();
      const id = randomUUID();
      this.items.set(id, {
        id,
        clientId: input.clientId,
        siteId: input.siteId,
        pricingModelVersion: input.pricingModelVersion,
        periodMonth: input.periodMonth,
        ordinal,
        slug,
        status: 'draft',
        currentVersionId: null,
        currentVersion: null,
        publishedVersionId: null,
        publishedAt: null,
        pendingVersionId: null,
        pendingVersion: null,
        createdAt: now,
        updatedAt: now,
      });
      this.versionHistory.set(id, []);
      this.slotEvents.push({
        contentPostId: id,
        clientId: input.clientId,
        siteId: input.siteId,
        eventType: 'slot_created',
        toStatus: 'draft',
        actorType: 'admin',
        actorId: input.actorId,
        createdAt: now,
      });
      created += 1;
    }
    return {
      periodMonth: input.periodMonth,
      created,
      existing: existing.length,
      items: await this.listBySites({
        siteIds: [input.siteId],
        periodMonths: [input.periodMonth],
      }),
    };
  }

  /**
   * Mirrors the SQL count: version rows, not slots. A slot regenerated after a rejection holds
   * two versions and cost two paid calls, and the budget has to see both.
   */
  async countGeneratedVersionsForMonth(periodMonth: string): Promise<number> {
    let total = 0;
    for (const item of this.items.values()) {
      if (!isSamePeriodMonth(item.periodMonth, periodMonth)) continue;
      total += this.versionHistory.get(item.id)?.length ?? 0;
    }
    return total;
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

  /**
   * Appends an immutable version to the post's ledger and hands it back. Numbering follows the
   * SQL — `max(version_number) + 1` over everything this post has ever produced — so a rework
   * staged beside a live version cannot reuse a number the published one already holds.
   */
  private appendVersion(
    item: AdminContentQueueItem,
    generated: Parameters<ContentQueueRepository['storeGenerated']>[0]['generated'],
  ): AdminContentQueueVersion {
    const history = this.versionHistory.get(item.id) ?? [];
    const versionNumber = history.reduce(
      (highest, version) => Math.max(highest, version?.versionNumber ?? 0),
      0,
    ) + 1;
    const version: AdminContentQueueVersion = {
      id: randomUUID(),
      versionNumber,
      title: generated.post.title,
      summary: generated.post.summary,
      tags: [...generated.post.tags],
      document: structuredClone(generated.post.document),
      sourceSnapshot: structuredClone(generated.sourceSnapshot),
      sourceSnapshotSha256: generated.sourceSnapshotSha256,
      sourceRefs: [...generated.sourceRefs],
      policyVersions: structuredClone(generated.policyVersions),
      validationEvidence: structuredClone(generated.validationEvidence) as unknown as Record<string, unknown>,
      generationMetadata: structuredClone(generated.generationMetadata) as unknown as Record<string, unknown>,
      createdAt: new Date().toISOString(),
    };
    history.push(structuredClone(version));
    this.versionHistory.set(item.id, history);
    return version;
  }

  async storeGenerated(input: Parameters<ContentQueueRepository['storeGenerated']>[0]) {
    const item = this.required(input.id);
    if (item.status !== 'generating') {
      throw new ContentQueueError('CONTENT_POST_STATE_CONFLICT', 'Generation state conflict.');
    }
    const version = this.appendVersion(item, input.generated);
    item.currentVersionId = version.id;
    item.currentVersion = version;
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
    const now = new Date().toISOString();
    item.status = 'published';
    // 0049 requires the published pointer and timestamp to move with the status; leaving them
    // null made every mock-published post fail the public projection's exact-pointer gate.
    item.publishedVersionId = item.currentVersionId;
    item.publishedAt = now;
    item.updatedAt = now;
    return { item: structuredClone(item), siteDomain: null, duplicated: false };
  }

  async claimRework(input: { id: string; actorId: string }): Promise<AdminContentQueueItem> {
    const item = this.required(input.id);
    // Same two conditions 0060 checks, in the same order: a rework opens on a live post, and only
    // when nothing is staged against it yet.
    if (item.status !== 'published' || item.pendingVersionId !== null) {
      throw new ContentQueueError('CONTENT_POST_STATE_CONFLICT', 'Rework state conflict.');
    }
    // The row is untouched, `updatedAt` included — it is published as the article's dateModified.
    const now = new Date().toISOString();
    this.slotEvents.push({
      contentPostId: item.id,
      clientId: item.clientId,
      siteId: item.siteId,
      eventType: 'rework_claimed',
      fromStatus: 'published',
      toStatus: 'published',
      actorType: 'admin',
      actorId: input.actorId,
      createdAt: now,
    });
    return structuredClone(item);
  }

  async storeReworkVersion(input: Parameters<ContentQueueRepository['storeReworkVersion']>[0]) {
    const item = this.required(input.id);
    if (item.status !== 'published') {
      throw new ContentQueueError('CONTENT_POST_STATE_CONFLICT', 'Rework state conflict.');
    }
    // Overwriting an existing staged version is how a refused swap is recovered from: the
    // operator generates again and stages the result. Nothing about what is being served moves.
    const version = this.appendVersion(item, input.generated);
    item.pendingVersionId = version.id;
    item.pendingVersion = version;
    // `updatedAt` is deliberately not bumped: the public projection carries it as the article's
    // dateModified, and staging a draft has not modified the article.
    return structuredClone(item);
  }

  async approveAndSwap(
    input: Parameters<ContentQueueRepository['approveAndSwap']>[0],
  ): Promise<ContentPublishResult> {
    const item = this.required(input.id);
    if (
      item.status === 'published'
      && item.pendingVersionId === null
      && item.publishedVersionId === input.expectedVersionId
      && item.currentVersionId === input.expectedVersionId
    ) {
      return { item: structuredClone(item), siteDomain: null, duplicated: true };
    }
    if (
      item.status !== 'published'
      || item.pendingVersionId !== input.expectedVersionId
      || !item.pendingVersion
      || item.pendingVersion.sourceSnapshotSha256 !== input.sourceSnapshotSha256
    ) {
      throw new ContentQueueError('CONTENT_POST_STATE_CONFLICT', 'Rework swap state conflict.');
    }
    const refusal = contentReworkSwapRefusal(item.pendingVersion);
    if (refusal === 'safe_catalog') {
      throw new ContentQueueError(
        'CONTENT_POST_SAFE_CATALOG_REFUSED',
        CONTENT_REWORK_REFUSAL_MESSAGES.safe_catalog,
      );
    }
    if (refusal === 'public_projection') {
      throw new ContentQueueError(
        'CONTENT_POST_POLICY_BLOCKED',
        CONTENT_REWORK_REFUSAL_MESSAGES.public_projection,
      );
    }
    // Both pointers and the staging slot move together with no await between them, which is this
    // store's version of the migration's single update statement: no reader can observe a row
    // that is half swapped.
    const now = new Date().toISOString();
    item.currentVersionId = item.pendingVersionId;
    item.currentVersion = item.pendingVersion;
    item.publishedVersionId = item.pendingVersionId;
    item.publishedAt = now;
    item.pendingVersionId = null;
    item.pendingVersion = null;
    item.updatedAt = now;
    this.slotEvents.push({
      contentPostId: item.id,
      clientId: item.clientId,
      siteId: item.siteId,
      eventType: 'rework_published',
      fromStatus: 'published',
      toStatus: 'published',
      actorType: 'admin',
      actorId: input.actorId,
      createdAt: now,
    });
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

  /** Append-only, like the table it mirrors: read for audit assertions, never mutated. */
  slotCreatedEvents(): readonly MockContentSlotEvent[] {
    return this.slotEvents
      .filter((event) => event.eventType === 'slot_created')
      .map((event) => ({ ...event }));
  }

  /** The whole ledger, including the rework verbs 0060 adds. */
  events(): readonly MockContentSlotEvent[] {
    return this.slotEvents.map((event) => ({ ...event }));
  }
}
