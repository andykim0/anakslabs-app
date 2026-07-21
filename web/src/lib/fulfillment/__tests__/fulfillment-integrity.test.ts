import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { applyEditRequestToConfig } from '@/lib/admin/edit-fulfillment-core';
import { MockAdminEditQueueRepository } from '@/lib/admin/edit-queue-repository-mock';
import { deriveVideoQueueItem } from '@/lib/admin/video-fulfillment-core';
import {
  FULFILLMENT_SLA_BUSINESS_DAYS,
  fulfillmentSlaState,
  waitingBusinessDays,
} from '@/lib/fulfillment-sla';
import { MockCreditsService } from '@/lib/data/mock/credits';
import {
  DEMO_BASIC_ID,
  DEMO_PREMIUM_ID,
  HWARODAM_SITE_ID,
  MINTWASH_SITE_ID,
} from '@/lib/data/mock/seed';
import { getMockStore, resetMockStore } from '@/lib/data/mock/store';
import type { EditRequest } from '@/lib/types/domain';
import { EditRequestWorkflowError } from '../edit-request-workflow-core';
import { MockEditRequestWorkflowRepository } from '../edit-request-workflow-mock';

function editTarget() {
  const site = getMockStore().sites.get(HWARODAM_SITE_ID)!;
  const config = site.draftConfig!;
  for (const page of config.pages) {
    for (const section of page.sections) {
      const element = section.elements.find((candidate) => candidate.kind === 'text');
      if (element) return { pageId: page.id, sectionId: section.id, elementId: element.id };
    }
  }
  throw new Error('seed text target missing');
}

function workflowInput(type: EditRequest['type'] = 'text') {
  return {
    clientId: DEMO_PREMIUM_ID,
    siteId: HWARODAM_SITE_ID,
    type,
    creditCost: type === 'structure' ? 2 : 1,
    reason: type === 'structure' ? 'edit_structure' as const : 'edit_text' as const,
    requestedContent: '검수된 문구로 바꿔 주세요',
    isInitialRevision: false,
    autoApproved: false,
  };
}

describe('FUL F1 edit request transaction', () => {
  test('normal round trip reaches queue, atomically applies draft/live, charges once, and audits every actor', async () => {
    resetMockStore();
    const store = getMockStore();
    const workflow = new MockEditRequestWorkflowRepository(store, {
      now: () => '2026-07-21T00:00:00.000Z',
    });
    const beforeBalance = (await new MockCreditsService().getBalance(DEMO_PREMIUM_ID)).balance;
    const submitted = await workflow.submit(workflowInput());
    assert.equal(submitted.balance, beforeBalance - 1);
    assert.equal(store.editRequests.get(submitted.request.id)?.status, 'pending');

    await workflow.transition({
      editRequestId: submitted.request.id,
      expectedStatuses: ['pending'],
      nextStatus: 'ai_processing',
      actorType: 'system',
      actorId: 'system:ai-generator',
    });
    const reviewed = await workflow.transition({
      editRequestId: submitted.request.id,
      expectedStatuses: ['ai_processing'],
      nextStatus: 'qa_review',
      actorType: 'system',
      actorId: 'system:ai-generator',
      aiOutput: { text: '발행본에 반영된 검수 문구', fulfillmentTarget: editTarget() },
    });
    const queue = new MockAdminEditQueueRepository(store, () => '2026-07-21T01:00:00.000Z');
    assert.equal((await queue.listNonterminal()).some((item) => item.id === reviewed.id), true);

    const site = store.sites.get(HWARODAM_SITE_ID)!;
    const nextDraft = applyEditRequestToConfig(site.draftConfig!, reviewed);
    const nextLive = applyEditRequestToConfig(site.siteConfig!, reviewed);
    const completion = await queue.complete({
      editRequestId: reviewed.id,
      actorType: 'admin',
      actorId: 'admin-user-1',
      expectedDraftConfig: structuredClone(site.draftConfig),
      expectedSiteConfig: structuredClone(site.siteConfig),
      nextDraftConfig: nextDraft,
      nextSiteConfig: nextLive,
    });
    assert.equal(completion.record.status, 'applied');
    const target = editTarget();
    const liveText = store.sites.get(HWARODAM_SITE_ID)!.siteConfig!.pages
      .find((page) => page.id === target.pageId)!.sections
      .find((section) => section.id === target.sectionId)!.elements
      .find((element) => element.id === target.elementId);
    assert.equal(liveText?.kind, 'text');
    if (liveText?.kind === 'text') assert.equal(liveText.text, '발행본에 반영된 검수 문구');
    assert.equal(
      store.ledger.filter((entry) => entry.referenceId === reviewed.id && entry.amount < 0).length,
      1,
    );
    assert.deepEqual(
      store.editRequestEvents?.filter((event) => event.editRequestId === reviewed.id)
        .map((event) => [event.fromStatus, event.toStatus, event.actorType, event.actorId]),
      [
        [null, 'pending', 'client', DEMO_PREMIUM_ID],
        ['pending', 'ai_processing', 'system', 'system:ai-generator'],
        ['ai_processing', 'qa_review', 'system', 'system:ai-generator'],
        ['qa_review', 'applied', 'admin', 'admin-user-1'],
      ],
    );
  });

  test('request save failure is visible and rolls back request, event, ledger, and balance', async () => {
    resetMockStore();
    const store = getMockStore();
    const requestsBefore = store.editRequests.size;
    const ledgerBefore = structuredClone(store.ledger);
    const repository = new MockEditRequestWorkflowRepository(store, {
      beforeSubmitCommit: () => { throw new Error('injected storage failure'); },
    });
    await assert.rejects(
      repository.submit(workflowInput()),
      (error) => error instanceof EditRequestWorkflowError && error.code === 'DATABASE_FAILURE',
    );
    assert.equal(store.editRequests.size, requestsBefore);
    assert.deepEqual(store.ledger, ledgerBefore);
    assert.deepEqual(store.editRequestEvents ?? [], []);
  });

  test('insufficient credits creates neither charge nor queue request', async () => {
    resetMockStore();
    const store = getMockStore();
    const repository = new MockEditRequestWorkflowRepository(store);
    const requestCount = store.editRequests.size;
    const ledgerBefore = structuredClone(store.ledger);
    await assert.rejects(repository.submit({
      clientId: DEMO_BASIC_ID,
      siteId: MINTWASH_SITE_ID,
      type: 'structure',
      creditCost: 2,
      reason: 'edit_structure',
      requestedContent: '구조 변경',
      isInitialRevision: false,
      autoApproved: false,
    }), (error) => (
      error instanceof EditRequestWorkflowError
      && error.code === 'INSUFFICIENT_CREDITS'
      && error.balance === 1
    ));
    assert.equal(store.editRequests.size, requestCount);
    assert.deepEqual(store.ledger, ledgerBefore);
  });

  test('completion storage failure leaves both site snapshots and request state untouched', async () => {
    resetMockStore();
    const store = getMockStore();
    const request = [...store.editRequests.values()].find((item) => item.status === 'qa_review')!;
    request.type = 'text';
    request.aiOutput = { text: '저장되면 안 되는 문구', fulfillmentTarget: editTarget() };
    const site = store.sites.get(request.siteId)!;
    const beforeSite = structuredClone(site);
    const repository = new MockAdminEditQueueRepository(
      store,
      () => '2026-07-21T01:00:00.000Z',
      () => { throw new Error('injected site save failure'); },
    );
    await assert.rejects(repository.complete({
      editRequestId: request.id,
      actorType: 'admin',
      actorId: 'admin-user-1',
      expectedDraftConfig: structuredClone(site.draftConfig),
      expectedSiteConfig: structuredClone(site.siteConfig),
      nextDraftConfig: applyEditRequestToConfig(site.draftConfig!, request),
      nextSiteConfig: applyEditRequestToConfig(site.siteConfig!, request),
    }), /injected site save failure/);
    assert.equal(store.editRequests.get(request.id)?.status, 'qa_review');
    assert.deepEqual(store.sites.get(site.id), beforeSite);
  });

  test('double completion is idempotent and cannot double-apply or double-charge', async () => {
    resetMockStore();
    const store = getMockStore();
    const request = [...store.editRequests.values()].find((item) => item.status === 'qa_review')!;
    request.type = 'text';
    request.aiOutput = { text: '한 번만 반영', fulfillmentTarget: editTarget() };
    const site = store.sites.get(request.siteId)!;
    const repository = new MockAdminEditQueueRepository(store);
    const input = {
      editRequestId: request.id,
      actorType: 'admin' as const,
      actorId: 'admin-user-1',
      expectedDraftConfig: structuredClone(site.draftConfig),
      expectedSiteConfig: structuredClone(site.siteConfig),
      nextDraftConfig: applyEditRequestToConfig(site.draftConfig!, request),
      nextSiteConfig: applyEditRequestToConfig(site.siteConfig!, request),
    };
    assert.equal((await repository.complete(input)).duplicated, false);
    assert.equal((await repository.complete(input)).duplicated, true);
    assert.equal(store.editRequestEvents?.filter((event) => event.editRequestId === request.id && event.toStatus === 'applied').length, 1);
    assert.equal(store.ledger.filter((entry) => entry.referenceId === request.id && entry.amount < 0).length, 1);
  });

  test('production SQL keeps request+charge and site+completion inside two service-only transactions', () => {
    const migration = readFileSync(
      join(process.cwd(), '../supabase/migrations/0038_fulfillment_integrity.sql'),
      'utf8',
    );
    const submit = migration.slice(
      migration.indexOf('create or replace function public.submit_edit_request_atomic'),
      migration.indexOf('create or replace function public.transition_edit_request_atomic'),
    );
    assert.match(submit, /insert into public\.edit_requests/);
    assert.match(submit, /public\.consume_credits\(/);
    assert.match(submit, /insert into public\.edit_request_events/);
    assert.match(submit, /for update/);

    const complete = migration.slice(
      migration.indexOf('create or replace function public.complete_edit_request_fulfillment'),
      migration.indexOf('revoke execute on function public.submit_edit_request_atomic'),
    );
    assert.match(complete, /from public\.edit_requests[\s\S]*for update/);
    assert.match(complete, /update public\.sites[\s\S]*update public\.edit_requests[\s\S]*insert into public\.edit_request_events/);
    assert.match(migration, /revoke all on table public\.edit_request_events from public, anon, authenticated, service_role/);
    assert.match(migration, /revoke insert, update, delete on table public\.edit_requests from authenticated, service_role/);
    assert.match(migration, /grant execute on function public\.complete_edit_request_fulfillment\([\s\S]*to service_role/);

    const route = readFileSync(join(process.cwd(), 'src/app/api/edit-requests/route.ts'), 'utf8');
    assert.match(route, /EDIT_REQUEST_SAVE_FAILED/);
    assert.match(route, /크레딧은 차감되지 않았습니다/);
  });
});

describe('FUL F2 video order-to-queue integrity', () => {
  test('premium add-on order immediately makes the saved explicit request derivable in the queue with chosen direction', async () => {
    resetMockStore();
    const store = getMockStore();
    const site = store.sites.get(MINTWASH_SITE_ID)!;
    const client = store.clients.get(DEMO_BASIC_ID)!;
    site.assetPolicyVersion = 2;
    site.draftConfig!.motion = {
      presetId: 'brand-editorial',
      intensity: 'normal',
      videoAddon: true,
      videoRequested: true,
      heroMotionId: 'cinematic-scrub',
      videoConceptId: 'space-mood',
    };
    const hero = site.draftConfig!.pages.flatMap((page) => page.sections)
      .find((section) => section.type === 'hero')!;
    hero.background.image = { src: '/mock/mint/hero.webp' };
    assert.equal(deriveVideoQueueItem({ site, client }), null, 'order entitlement is still missing');

    // The build-fee webhook transaction makes this server-owned entitlement
    // change. Queue membership is derived from the same stored client+site
    // records, so there is no second queue insert that can be lost.
    client.tier = 'premium';
    const queued = deriveVideoQueueItem({ site, client: store.clients.get(client.id)! });
    assert.ok(queued);
    assert.equal(queued.heroMotionId, 'cinematic-scrub');
    assert.equal(queued.videoConceptId, 'space-mood');
  });

  test('registration CLI and completion route retain UUID-only, ownership-bound application guards', () => {
    const script = readFileSync(join(process.cwd(), 'scripts/register-fulfillment-video.ts'), 'utf8');
    const route = readFileSync(
      join(process.cwd(), 'src/app/api/admin/video-queue/[siteId]/complete/route.ts'),
      'utf8',
    );
    assert.match(script, /assertRegisteredFulfillmentVideo/);
    assert.match(script, /formatFulfillmentVideoAssetId/);
    assert.match(route, /videoAssetId: z\.string\(\)\.uuid\(\)/);
    assert.match(route, /resolveOwnedAssetRecords\(\{/);
    assert.match(route, /clientId: client\.id,[\s\S]*siteId/);
    assert.match(route, /existing\.videoAssetId !== body\.data\.videoAssetId/);
  });
});

describe('FUL F3 shared operations safety net', () => {
  test('two-business-day SLA excludes weekends and warns only after the threshold', () => {
    assert.equal(FULFILLMENT_SLA_BUSINESS_DAYS, 2);
    assert.equal(waitingBusinessDays('2026-07-17T01:00:00.000Z', new Date('2026-07-21T01:00:00.000Z')), 2);
    assert.equal(fulfillmentSlaState(
      '2026-07-17T01:00:00.000Z',
      new Date('2026-07-21T01:00:00.000Z'),
    ).overdue, true);
    assert.deepEqual(fulfillmentSlaState(
      '2026-07-17T01:00:00.000Z',
      new Date('2026-07-22T01:00:00.000Z'),
    ), { waitingBusinessDays: 3, overdue: true });
  });

  test('both queue APIs publish source-vs-queue integrity counts and the admin overview exposes common alerts', () => {
    for (const path of [
      'src/app/api/admin/edit-queue/route.ts',
      'src/app/api/admin/video-queue/route.ts',
    ]) {
      const source = readFileSync(join(process.cwd(), path), 'utf8');
      assert.match(source, /sourceCount/);
      assert.match(source, /queueCount/);
      assert.match(source, /missingCount/);
      assert.match(source, /fulfillmentSlaState/);
    }
    const videoQueue = readFileSync(
      join(process.cwd(), 'src/app/api/admin/video-queue/route.ts'),
      'utf8',
    );
    assert.match(videoQueue, /siteVideoFulfillmentState\(source\)\.pending/);
    assert.doesNotMatch(videoQueue, /sourceCount:\s*items\.length/);
    const overview = readFileSync(join(process.cwd(), 'src/app/api/admin/overview/route.ts'), 'utf8');
    assert.match(overview, /editOverdue/);
    assert.match(overview, /videoOverdue/);
  });
});
