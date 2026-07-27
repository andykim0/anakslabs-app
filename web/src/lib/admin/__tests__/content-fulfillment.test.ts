import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  validateContentQueueItemForPublish,
} from '@/lib/admin/content-approval-core';
import {
  ContentQueueError,
  type AdminContentQueueItem,
} from '@/lib/admin/content-queue-core';
import { MockContentQueueRepository } from '@/lib/admin/content-queue-repository-mock';
import type { ContentSourceSnapshot } from '@/lib/content-fulfillment/contracts';
import {
  validateContentPostForPending,
} from '@/lib/content-fulfillment/generation';
import type { GeneratedContentPost } from '@/lib/content-fulfillment/honesty';
import { HWARODAM_SITE_CONFIG } from '@/lib/data/mock/hwarodam';
import { ensureMotion } from '@/lib/motion/validate';
import { normalizeSiteConfig } from '@/lib/types/site';

const POST_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const CONFIG = ensureMotion(normalizeSiteConfig(structuredClone(HWARODAM_SITE_CONFIG)));

function sourceSnapshot(text = '평일 오전 9시부터 오후 6시까지'): ContentSourceSnapshot {
  return {
    version: 1,
    siteId: SITE_ID,
    clientId: CLIENT_ID,
    capturedAt: '2026-07-27T00:00:00.000Z',
    surveyVersion: 2,
    industryId: 'interior',
    industryClass: 'workshop',
    sources: [{
      id: 'fact:openingHours',
      kind: 'business-fact',
      path: 'survey.contentDepth.facts.openingHours',
      text,
    }],
  };
}

function post(title = '상담 전에 확인할 순서'): GeneratedContentPost {
  return {
    slug: 'consultation-check',
    title,
    titleSourceRefs: [],
    summary: '필요한 질문과 확인 순서를 차분히 정리합니다.',
    summarySourceRefs: [],
    tags: ['확인 기준'],
    document: {
      version: 1,
      blocks: [
        { type: 'heading', level: 2, text: '확인할 내용을 나눠보세요' },
        {
          type: 'table',
          columns: [
            { key: 'item', header: '항목', sourceRef: 'fact:openingHours' },
            { key: 'answer', header: '확인한 내용', sourceRef: 'fact:openingHours' },
          ],
          rows: [{
            cells: [
              { text: '운영 시간', sourceRef: 'fact:openingHours' },
              { text: '평일 오전 9시부터 오후 6시까지', sourceRef: 'fact:openingHours' },
            ],
          }],
        },
      ],
    },
  };
}

function draftItem(): AdminContentQueueItem {
  return {
    id: POST_ID,
    clientId: CLIENT_ID,
    siteId: SITE_ID,
    pricingModelVersion: 'industry-single-2026-07',
    periodMonth: '2026-07-01',
    ordinal: 1,
    slug: 'consultation-check',
    status: 'draft',
    currentVersionId: null,
    currentVersion: null,
    createdAt: '2026-07-27T00:00:00.000Z',
    updatedAt: '2026-07-27T00:00:00.000Z',
  };
}

function generatedVersion() {
  return validateContentPostForPending({
    post: post(),
    snapshot: sourceSnapshot(),
    config: CONFIG,
  });
}

describe('CONTENT P3 immutable admin state machine', () => {
  test('generate → reject → regenerate adds a new immutable version and keeps the reason', async () => {
    const repository = new MockContentQueueRepository([draftItem()]);
    const firstClaim = await repository.claimGeneration({
      id: POST_ID,
      actorId: 'admin',
      regeneration: false,
    });
    assert.equal(firstClaim.previousStatus, 'draft');
    const first = await repository.storeGenerated({
      id: POST_ID,
      actorId: 'admin',
      generated: generatedVersion(),
    });
    assert.equal(first.status, 'pending_approval');
    const firstVersionId = first.currentVersionId;

    await repository.reject({
      id: POST_ID,
      expectedVersionId: firstVersionId!,
      actorId: 'admin',
      reason: '표의 설명을 더 쉽게 고쳐 주세요.',
    });
    const regeneration = await repository.claimGeneration({
      id: POST_ID,
      actorId: 'admin',
      regeneration: true,
    });
    assert.equal(regeneration.previousStatus, 'rejected');
    const second = await repository.storeGenerated({
      id: POST_ID,
      actorId: 'admin',
      generated: generatedVersion(),
    });
    assert.equal(second.status, 'pending_approval');
    assert.notEqual(second.currentVersionId, firstVersionId);
    assert.equal(repository.versionCount(POST_ID), 2);
    assert.deepEqual(
      repository.versions(POST_ID).map((version) => version?.id),
      [firstVersionId, second.currentVersionId],
    );
    assert.deepEqual(repository.rejectionHistory(POST_ID), ['표의 설명을 더 쉽게 고쳐 주세요.']);
  });

  test('generation failure restores the exact prior state and creates no partial version', async () => {
    const repository = new MockContentQueueRepository([draftItem()]);
    const claim = await repository.claimGeneration({
      id: POST_ID,
      actorId: 'admin',
      regeneration: false,
    });
    await repository.failGeneration({
      id: POST_ID,
      actorId: 'admin',
      restoreStatus: claim.previousStatus,
      reason: 'generator unavailable',
    });
    assert.equal((await repository.getById(POST_ID))?.status, 'draft');
    assert.equal(repository.versionCount(POST_ID), 0);
  });

  test('approval revalidates current sources and double approval is idempotent', async () => {
    const repository = new MockContentQueueRepository([draftItem()]);
    await repository.claimGeneration({
      id: POST_ID,
      actorId: 'admin',
      regeneration: false,
    });
    const item = await repository.storeGenerated({
      id: POST_ID,
      actorId: 'admin',
      generated: generatedVersion(),
    });
    const validated = validateContentQueueItemForPublish({
      item,
      currentSnapshot: sourceSnapshot(),
      currentConfig: CONFIG,
    });
    const approvalInput = {
      id: POST_ID,
      expectedVersionId: item.currentVersionId!,
      actorId: 'admin',
      sourceSnapshotSha256: validated.sourceSnapshotSha256,
      honestyPolicyVersion: validated.policyVersions.honesty,
      medicalPolicyVersion: validated.policyVersions.medical,
      validatedDocumentSha256: validated.validationEvidence.validatedDocumentSha256,
    };
    assert.equal((await repository.approveAndPublish(approvalInput)).duplicated, false);
    assert.equal((await repository.approveAndPublish(approvalInput)).duplicated, true);
    assert.equal(await repository.countNonterminal(), 0);

    const changed = structuredClone(item);
    assert.throws(
      () => validateContentQueueItemForPublish({
        item: changed,
        currentSnapshot: sourceSnapshot('토요일 오전 10시부터 오후 2시까지'),
        currentConfig: CONFIG,
      }),
      (error) => error instanceof ContentQueueError
        && error.code === 'CONTENT_POST_SOURCE_CONFLICT',
    );
  });

  test('current medical policy blocks a contaminated immutable version before RPC', () => {
    const generated = generatedVersion();
    const item = draftItem();
    item.status = 'pending_approval';
    item.currentVersionId = '33333333-3333-4333-8333-333333333333';
    item.currentVersion = {
      id: item.currentVersionId,
      versionNumber: 1,
      title: '100% 완치를 보장합니다',
      summary: generated.post.summary,
      tags: [...generated.post.tags],
      document: generated.post.document,
      sourceSnapshot: generated.sourceSnapshot,
      sourceSnapshotSha256: generated.sourceSnapshotSha256,
      sourceRefs: generated.sourceRefs,
      policyVersions: generated.policyVersions,
      validationEvidence: {
        ...generated.validationEvidence,
        honesty: {
          ...generated.validationEvidence.honesty,
          titleSourceRefs: ['fact:openingHours'],
        },
      },
      generationMetadata: generated.generationMetadata,
      createdAt: '2026-07-27T00:00:00.000Z',
    };
    const medical = structuredClone(CONFIG);
    medical.meta.industryId = 'clinic';
    medical.meta.industryClass = 'medical';
    assert.throws(
      () => validateContentQueueItemForPublish({
        item,
        currentSnapshot: sourceSnapshot(),
        currentConfig: medical,
        clinicFlagValue: '1',
      }),
      (error) => error instanceof ContentQueueError
        && error.code === 'CONTENT_POST_POLICY_BLOCKED',
    );
  });
});

describe('CONTENT P3 database and admin boundaries', () => {
  const migration = readFileSync(
    join(process.cwd(), '../supabase/migrations/0049_content_fulfillment.sql'),
    'utf8',
  );

  test('approval/publish is one locked RPC with idempotency, two events and export stale', () => {
    const start = migration.indexOf('create or replace function public.approve_and_publish_content_post');
    const end = migration.indexOf('alter table public.content_posts enable row level security');
    const rpc = migration.slice(start, end);
    assert.match(rpc, /from public\.content_posts[\s\S]*for update/u);
    assert.match(rpc, /from public\.content_post_versions[\s\S]*for update/u);
    assert.match(rpc, /status = 'published'[\s\S]*'duplicated', true/u);
    assert.match(rpc, /'approved'[\s\S]*update public\.content_posts[\s\S]*'published'/u);
    assert.match(rpc, /update public\.sites[\s\S]*export_status = 'none'[\s\S]*export_url = null/u);
    assert.match(rpc, /content table header source reference missing/u);
    assert.match(rpc, /content table cell source reference missing/u);
  });

  test('regeneration inserts a new immutable version and rejection reason stays append-only', () => {
    assert.match(migration, /select coalesce\(max\(version_number\), 0\) \+ 1/u);
    assert.match(migration, /insert into public\.content_post_versions/u);
    assert.doesNotMatch(migration, /update public\.content_post_versions/u);
    assert.match(migration, /'rejected'[\s\S]*left\(btrim\(p_reason\), 2000\)/u);
    assert.match(migration, /content_post_versions_append_only/u);
    assert.match(migration, /content_post_events_append_only/u);
  });

  test('content queue does not touch credits or payments and RPCs are service-role only', () => {
    const p3Start = migration.indexOf('create or replace function public.claim_content_post_generation');
    const p3 = migration.slice(p3Start);
    assert.doesNotMatch(p3, /credit_ledger|payments|consume_credit|refund_credit/iu);
    assert.match(p3, /revoke execute on function public\.approve_and_publish_content_post\([\s\S]*from public, anon, authenticated/u);
    assert.match(p3, /grant execute on function public\.approve_and_publish_content_post\([\s\S]*to service_role/u);
  });

  test('all content queue APIs are admin guarded and the console exposes the queue', () => {
    const routes = [
      'src/app/api/admin/content-queue/route.ts',
      'src/app/api/admin/content-queue/[id]/generate/route.ts',
      'src/app/api/admin/content-queue/[id]/regenerate/route.ts',
      'src/app/api/admin/content-queue/[id]/reject/route.ts',
      'src/app/api/admin/content-queue/[id]/approve/route.ts',
    ];
    for (const route of routes) {
      const source = readFileSync(join(process.cwd(), route), 'utf8');
      assert.match(source, /await requireAdminOr403\(\)/u, route);
    }
    const shell = readFileSync(
      join(process.cwd(), 'src/components/admin/admin-shell.tsx'),
      'utf8',
    );
    assert.match(shell, /\/admin\/content-queue/u);
    const apiBoundary = readFileSync(
      join(process.cwd(), 'src/app/api/admin/content-queue/_lib.ts'),
      'utf8',
    );
    const dtoStart = apiBoundary.indexOf('export function contentQueueItemDto');
    const dtoEnd = apiBoundary.indexOf('export function contentQueueErrorResponse');
    const dto = apiBoundary.slice(dtoStart, dtoEnd);
    assert.doesNotMatch(dto, /sourceSnapshot|validationEvidence|\bdocument\b/u);
  });
});
