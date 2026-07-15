import assert from 'node:assert/strict';
import { MockAiService } from '@/lib/data/mock/ai';
import { getDataServices } from '@/lib/data';
import { getMockStore } from '@/lib/data/mock/store';
import {
  getAssetRegistry,
  resolveOwnedAssetRecords,
} from '@/lib/assets/registry';
import {
  validateCandidateAssetRef,
  validateConfigAssetRefsForSave,
} from '@/lib/assets/owned-refs';
import type { SurveyInput } from '@/lib/types/domain';

// mock 체감 지연만 제거한다. registry/서비스/manifest의 실제 production 코드는 그대로 실행한다.
const originalSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (((handler: TimerHandler, _timeout?: number, ...args: unknown[]) => {
  queueMicrotask(() => {
    if (typeof handler === 'function') handler(...args);
  });
  return 0 as unknown as ReturnType<typeof setTimeout>;
}) as unknown) as typeof setTimeout;

const FLAG_KEYS = [
  'ASSET_PROVENANCE_V2_WRITE',
  'ASSET_PROVENANCE_V2_ASSIGN',
  'ASSET_PROVENANCE_V2_ENFORCE_NEW_SITES',
  'ASSET_PROVENANCE_V2_ENFORCE_LEGACY',
] as const;

function setFlags(write: boolean): void {
  for (const key of FLAG_KEYS) delete process.env[key];
  if (write) process.env.ASSET_PROVENANCE_V2_WRITE = '1';
}

const survey: SurveyInput = {
  businessName: '모의 자산 출처 검증',
  purposeId: 'local_store',
  purpose: '카페 소개',
  industry: '카페·디저트',
  tone: ['따뜻한'],
  colorPreference: '아이보리',
  referenceImageUrls: [],
  sectionPlan: [
    { type: 'hero', name: '첫 화면', brief: '', required: true, source: 'template' },
    { type: 'gallery', name: '공간', brief: '분위기', source: 'template' },
  ],
  templateId: 'local_store.default',
};

async function main(): Promise<void> {
try {
  const ai = new MockAiService();
  const clientId = 'mock-ai-origin-owner';

  setFlags(false);
  const legacyCandidates = await ai.generateCandidates(survey, { clientId });
  assert.equal(legacyCandidates.some((candidate) => 'heroAssetRef' in candidate), false);
  const legacyConfig = await ai.generateSiteConfig(survey, legacyCandidates[0], { clientId });
  assert.equal(Object.hasOwn(legacyConfig, 'assetRefs'), false);
  assert.deepEqual(Object.keys(await ai.generateImage({ prompt: '무드' }, { clientId })).sort(), ['url']);
  assert.deepEqual(
    Object.keys(await ai.generateVideo({ prompt: '무드' }, { clientId })).sort(),
    ['poster', 'url'],
  );

  setFlags(true);
  const candidates = await ai.generateCandidates(survey, { clientId });
  assert.equal(candidates.every((candidate) => Boolean(candidate.heroAssetRef)), true);
  const secondCandidates = await ai.generateCandidates(survey, { clientId });
  assert.notEqual(
    candidates[0].heroAssetRef?.assetId,
    secondCandidates[0].heroAssetRef?.assetId,
    '별도 pre-site 생성은 같은 mock URL이어도 storage identity를 재사용하면 안 된다',
  );

  const config = await ai.generateSiteConfig(survey, candidates[0], { clientId });
  assert.ok((config.assetRefs?.length ?? 0) >= 2, '후보 hero와 section AI refs가 manifest에 남아야 한다');
  const configAssetRefs = config.assetRefs;
  assert.ok(configAssetRefs);
  const preSiteRecords = await resolveOwnedAssetRecords({
    assetIds: configAssetRefs.map((ref) => ref.assetId),
    clientId,
  });
  assert.equal(preSiteRecords.every((record) => record.origin === 'ai_generated'), true);
  assert.equal(preSiteRecords.every((record) => record.ownerId === clientId && record.siteId === null), true);

  const { sites } = getDataServices();
  await assert.rejects(
    sites.create({ clientId, name: '사후 binding 금지', draftConfig: config }),
    /atomic binding 요청 없이 저장할 수 없습니다/,
  );
  const invalidRefs = configAssetRefs.map((ref, index) => (
    index === 0 ? { ...ref, url: `${ref.url}?forged=1` } : ref
  ));
  const invalidConfig = { ...config, assetRefs: invalidRefs };
  const beforeRejectedCreate = (await sites.listByClient(clientId)).length;
  await assert.rejects(
    sites.create({
      clientId,
      name: '거부되어야 하는 draft',
      draftConfig: invalidConfig,
      assetRefsToBind: invalidRefs,
    }),
    /ownership 또는 URL이 일치하지 않습니다/,
  );
  assert.equal(
    (await sites.listByClient(clientId)).length,
    beforeRejectedCreate,
    'asset validation 실패 시 provisional manifest가 든 site row를 남기면 안 된다',
  );

  const site = await sites.create({
    clientId,
    name: survey.businessName,
    draftConfig: config,
    assetRefsToBind: configAssetRefs,
  });
  const persisted = await sites.getById(site.id);
  assert.ok(persisted?.draftConfig, 'atomic create가 완전한 manifest draft를 저장해야 한다');
  const bound = persisted.draftConfig;
  assert.equal(bound.assetRefs?.length, config.assetRefs?.length);
  const boundAssetRefs = bound.assetRefs;
  assert.ok(boundAssetRefs);
  const boundRecords = await resolveOwnedAssetRecords({
    assetIds: boundAssetRefs.map((ref) => ref.assetId),
    clientId,
    siteId: site.id,
  });
  assert.equal(boundRecords.every((record) => record.siteId === site.id), true);
  await assert.rejects(
    validateCandidateAssetRef({ candidate: candidates[0], clientId }),
    /Candidate hero URL does not match its server asset record/,
  );
  await assert.doesNotReject(
    validateCandidateAssetRef({ candidate: candidates[0], clientId, targetSiteId: site.id }),
  );

  const clientDroppedManifest = { ...bound };
  delete clientDroppedManifest.assetRefs;
  const preserved = await validateConfigAssetRefsForSave({
    config: clientDroppedManifest,
    persistedConfig: bound,
    clientId,
    siteId: site.id,
  });
  assert.deepEqual(preserved.assetRefs, bound.assetRefs, 'legacy editor가 field를 생략해도 URL-only로 강등하면 안 된다');
  await assert.rejects(
    validateConfigAssetRefsForSave({
      config: { ...bound, assetRefs: [] },
      persistedConfig: bound,
      clientId,
      siteId: site.id,
    }),
    /cannot add, change, or remove persisted asset references/,
  );

  // Rollback compatibility: disabling WRITE after a dual-write must not strand the
  // existing site. Omitted or unchanged refs preserve the server manifest; mutation
  // remains fail-closed.
  setFlags(false);
  const rollbackInput = { ...bound };
  delete rollbackInput.assetRefs;
  const rollbackPreserved = await validateConfigAssetRefsForSave({
    config: rollbackInput,
    persistedConfig: bound,
    clientId,
    siteId: site.id,
  });
  assert.deepEqual(rollbackPreserved.assetRefs, bound.assetRefs);
  await assert.doesNotReject(validateConfigAssetRefsForSave({
    config: bound,
    persistedConfig: bound,
    clientId,
    siteId: site.id,
  }));
  await assert.rejects(
    validateConfigAssetRefsForSave({
      config: { ...bound, assetRefs: [] },
      persistedConfig: bound,
      clientId,
      siteId: site.id,
    }),
    /cannot add, change, or remove persisted asset references/,
  );
  setFlags(true);

  const edited = await ai.generateImage({ prompt: '추상 무드' }, { clientId, siteId: site.id });
  assert.ok(edited.assetId);
  const video = await ai.generateVideo(
    {
      prompt: '올린 사진을 은은하게 움직이기',
      image: { base64: Buffer.from('customer-photo').toString('base64'), mimeType: 'image/png' },
    },
    { clientId, siteId: site.id },
  );
  assert.ok(video.assetId, 'uploaded-photo 입력이어도 생성 영상은 새 AI output이다');
  const outputRecords = await resolveOwnedAssetRecords({
    assetIds: [edited.assetId, video.assetId],
    clientId,
    siteId: site.id,
  });
  assert.deepEqual(outputRecords.map((record) => record.mediaType), ['image', 'video']);
  assert.equal(outputRecords.every((record) => record.origin === 'ai_generated'), true);

  const registry = getAssetRegistry();
  const originalRegister = registry.register;
  registry.register = async () => {
    throw new Error('forced registry failure');
  };
  await assert.rejects(
    ai.generateImage({ prompt: '실패해야 함' }, { clientId, siteId: site.id }),
    /AI_ASSET_REGISTRATION_FAILED: 레지스트리 기록 실패: forced registry failure/,
  );
  registry.register = originalRegister;

  const beforeInvalid = getMockStore().counters.image;
  delete process.env.ASSET_PROVENANCE_V2_WRITE;
  process.env.ASSET_PROVENANCE_V2_ASSIGN = '1';
  await assert.rejects(
    ai.generateImage({ prompt: 'provider 전에 차단' }, { clientId, siteId: site.id }),
    /ASSET_PROVENANCE_FLAG_DEPENDENCY_INVALID|provenance flag 설정 오류/,
  );
  assert.equal(getMockStore().counters.image, beforeInvalid, 'flag 오류 뒤 provider/mock counter가 움직이면 안 된다');
} finally {
  setFlags(false);
  globalThis.setTimeout = originalSetTimeout;
}
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
