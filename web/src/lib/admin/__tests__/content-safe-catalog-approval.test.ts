import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { NextRequest } from 'next/server';
import type {
  AdminContentQueueItem,
  ContentQueueRepository,
} from '@/lib/admin/content-queue-core';
import { MockContentQueueRepository } from '@/lib/admin/content-queue-repository-mock';
import { safeCatalogApprovalOverrideRequired } from '@/lib/admin/content-safe-catalog-policy';

const VERSION_ID = '33333333-3333-4333-8333-333333333333';

function queueItem(attempt: 1 | 2 | 'safe-catalog'): AdminContentQueueItem {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    clientId: '11111111-1111-4111-8111-111111111111',
    siteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    pricingModelVersion: 'enterprise-us-v6-2026-08',
    periodMonth: '2026-08-01',
    ordinal: 1,
    slug: 'what-to-expect',
    status: 'pending_approval',
    currentVersionId: VERSION_ID,
    currentVersion: {
      id: VERSION_ID,
      versionNumber: 1,
      title: 'What to expect',
      summary: 'A concise source-backed summary.',
      tags: [],
      document: { version: 1, blocks: [] },
      sourceSnapshot: {},
      sourceSnapshotSha256: 'a'.repeat(64),
      sourceRefs: [],
      policyVersions: {},
      validationEvidence: {},
      generationMetadata: {
        pipelineVersion: 'content-post-v1',
        attempt,
        externalImageCostKrw: 0,
        rawHtml: false,
      },
      createdAt: '2026-08-05T00:00:00.000Z',
    },
    publishedVersionId: null,
    publishedAt: null,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  };
}

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('safe-catalog approval billing guard', () => {
  test('safe-catalog is blocked by default and only an explicit override releases it', () => {
    const item = queueItem('safe-catalog');
    assert.equal(safeCatalogApprovalOverrideRequired({
      item,
      expectedVersionId: VERSION_ID,
      overrideConfirmed: false,
    }), true);
    assert.equal(safeCatalogApprovalOverrideRequired({
      item,
      expectedVersionId: VERSION_ID,
      overrideConfirmed: true,
    }), false);
  });

  test('provider generations are not put behind the fallback override', () => {
    for (const attempt of [1, 2] as const) {
      assert.equal(safeCatalogApprovalOverrideRequired({
        item: queueItem(attempt),
        expectedVersionId: VERSION_ID,
        overrideConfirmed: false,
      }), false);
    }
  });

  test('approve route wires the strict override gate before publication', () => {
    const route = source('src/app/api/admin/content-queue/[id]/approve/route.ts');
    const gate = route.indexOf('safeCatalogApprovalOverrideRequired({');
    const publish = route.indexOf('approveAdminContentPost({');
    assert.ok(gate >= 0 && publish > gate);
    assert.match(route, /safeCatalogOverrideConfirmed: z\.literal\(true\)\.optional\(\)/u);
    assert.match(route, /409,[\s\S]*CONTENT_POST_SAFE_CATALOG_OVERRIDE_REQUIRED/u);
    const service = source('src/lib/admin/content-fulfillment-service.ts');
    assert.match(service, /safeCatalogApprovalOverrideRequired\(\{/u);
    assert.match(service, /safeCatalogOverrideConfirmed === true/u);
  });

  test('actual approve handler returns 409 before publishing a safe-catalog version', async () => {
    const globalQueue = globalThis as typeof globalThis & {
      __daboimContentQueueRepository__?: ContentQueueRepository;
    };
    const previousRepository = globalQueue.__daboimContentQueueRepository__;
    globalQueue.__daboimContentQueueRepository__ = new MockContentQueueRepository([
      queueItem('safe-catalog'),
    ]);

    const moduleLoader = Module as unknown as {
      _load: (request: string, parent: unknown, isMain: boolean) => unknown;
    };
    const originalLoad = moduleLoader._load;
    moduleLoader._load = function loadForRouteTest(request, parent, isMain) {
      if (request === 'server-only') return {};
      if (request === 'next/headers') {
        return {
          cookies: async () => ({
            get: (name: string) => name === 'anaks_mock_session'
              ? { value: 'admin' }
              : undefined,
            getAll: () => [],
            set: () => undefined,
          }),
        };
      }
      return originalLoad.call(this, request, parent, isMain);
    };

    try {
      const { POST } = await import('@/app/api/admin/content-queue/[id]/approve/route');
      const response = await POST(new NextRequest(
        'http://app.anakslabs.com/api/admin/content-queue/test/approve',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            expectedVersionId: VERSION_ID,
            approvalConfirmed: true,
          }),
        },
      ), { params: Promise.resolve({ id: queueItem('safe-catalog').id }) });
      assert.equal(response.status, 409);
      const payload = await response.json() as { error?: { code?: string } };
      assert.equal(payload.error?.code, 'CONTENT_POST_SAFE_CATALOG_OVERRIDE_REQUIRED');
      assert.equal(
        (await globalQueue.__daboimContentQueueRepository__?.getById(queueItem('safe-catalog').id))
          ?.status,
        'pending_approval',
      );
    } finally {
      moduleLoader._load = originalLoad;
      if (previousRepository) {
        globalQueue.__daboimContentQueueRepository__ = previousRepository;
      } else {
        Reflect.deleteProperty(globalQueue, '__daboimContentQueueRepository__');
      }
    }
  });

  test('admin queue exposes the fallback badge and requires a separate override confirmation', () => {
    const queue = source('src/components/admin/content-queue.tsx');
    const api = source('src/components/admin/api.ts');
    assert.match(queue, /Safe-catalog fallback/u);
    assert.match(queue, /safeCatalogOverrideConfirmed/u);
    assert.match(queue, /isSafeCatalog && !safeCatalogOverrideConfirmed/u);
    assert.doesNotMatch(queue, /Dog\/external/u);
    assert.match(api, /safeCatalogOverrideConfirmed \? \{ safeCatalogOverrideConfirmed: true \}/u);
  });

  test('generate and regenerate routes reserve enough time to restore failed queue claims', () => {
    for (const routePath of [
      'src/app/api/admin/content-queue/[id]/generate/route.ts',
      'src/app/api/admin/content-queue/[id]/regenerate/route.ts',
    ]) {
      assert.match(source(routePath), /export const maxDuration = 300;/u, routePath);
    }
  });
});
