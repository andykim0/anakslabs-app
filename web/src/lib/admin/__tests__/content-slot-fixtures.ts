/**
 * Shared content-slot fixtures. Not a test file — the runner globs `*.test.ts`.
 *
 * Driving a slot to published through the repository's own state machine (claim → store →
 * approve) rather than hand-writing a published row keeps these fixtures honest: a shape the
 * repository would reject can never sneak into an assertion.
 */
import type { MockContentQueueRepository } from '@/lib/admin/content-queue-repository-mock';
import type { GeneratedContentPostVersion } from '@/lib/content-fulfillment/generation';

const SOURCE_SHA = 'a'.repeat(64);
const DOCUMENT_SHA = 'b'.repeat(64);

export function slotGeneration(
  attempt: 1 | 2 | 'safe-catalog',
): GeneratedContentPostVersion {
  return {
    post: {
      slug: 'what-to-expect',
      title: attempt === 'safe-catalog'
        ? 'What to verify before you decide'
        : 'What to expect at your first visit',
      titleSourceRefs: [],
      summary: 'A source-backed walkthrough of the first appointment.',
      summarySourceRefs: [],
      tags: ['first visit'],
      document: {
        version: 1,
        blocks: [{ type: 'paragraph', text: 'Bring your insurance card.' }],
      },
    },
    sourceSnapshot: {
      version: 1,
      siteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      clientId: '11111111-1111-4111-8111-111111111111',
      capturedAt: '2026-08-05T00:00:00.000Z',
      surveyVersion: 2,
      industryId: 'clinic',
      industryClass: 'medical',
      sources: [],
    },
    sourceSnapshotSha256: SOURCE_SHA,
    sourceRefs: [],
    policyVersions: { honesty: 'content-honesty-2026-07-v1', medical: 'medical-ad-2026-07-v1' },
    validationEvidence: { honesty: { ok: true }, medical: { ok: true } },
    generationMetadata: {
      pipelineVersion: 'content-post-generator-2026-07-v1',
      attempt,
      externalImageCostKrw: 0,
      rawHtml: false,
    },
  } as unknown as GeneratedContentPostVersion;
}

export async function publishSlot(
  repository: MockContentQueueRepository,
  id: string,
  attempt: 1 | 2 | 'safe-catalog' = 1,
  actorId = 'admin-user-7f3a2c9d',
): Promise<void> {
  await repository.claimGeneration({ id, actorId, regeneration: false });
  const stored = await repository.storeGenerated({
    id,
    actorId,
    generated: slotGeneration(attempt),
  });
  await repository.approveAndPublish({
    id,
    expectedVersionId: stored.currentVersionId!,
    actorId,
    sourceSnapshotSha256: SOURCE_SHA,
    honestyPolicyVersion: 'content-honesty-2026-07-v1',
    medicalPolicyVersion: 'medical-ad-2026-07-v1',
    validatedDocumentSha256: DOCUMENT_SHA,
  });
}
