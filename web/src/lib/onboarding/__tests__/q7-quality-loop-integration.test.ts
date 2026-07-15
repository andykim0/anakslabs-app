import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, test } from 'node:test';
import { surveySchema } from '@/app/api/_lib/schemas';
import { saveSiteDraft } from '@/components/dashboard/onboarding/section-review-api';
import {
  synchronousVideoTransportError,
  videoGuardError,
  type VideoGuardConfig,
} from '@/lib/ai/video-pipeline-core';
import { configForAddonPreview } from '@/lib/motion/preview-addon';
import { resolveMotionPlan } from '@/lib/motion/apply';
import {
  applySectionDirection,
  configForSectionReview,
  sectionContentFingerprint,
} from '@/lib/onboarding/section-directions';
import {
  allPublishHumanChecksConfirmed,
  missingPublishHumanChecks,
} from '@/lib/publish/human-checks';
import { checkPublish } from '@/lib/publish/preflight';
import { emptySiteConfig, type Section, type SiteConfig } from '@/lib/types/site';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function heroSection(): Section {
  return {
    id: 'hero',
    type: 'hero',
    name: '첫 화면',
    height: 760,
    background: { image: { src: '/customer-hero.webp', overlayOpacity: 0.1 } },
    elements: [
      {
        id: 'headline',
        kind: 'text',
        text: '고객이 제공한 실제 경력 12년',
        frame: { x: 120, y: 140, w: 660, h: 140 },
        z: 2,
        style: { fontSize: 58, fontWeight: 700 },
      },
      {
        id: 'photo',
        kind: 'image',
        src: '/customer-photo.webp',
        alt: '고객이 올린 대표 사진',
        frame: { x: 860, y: 100, w: 420, h: 500 },
        z: 1,
        style: { objectFit: 'cover' },
      },
    ],
  };
}

function qualityDraft(): SiteConfig {
  const config = emptySiteConfig('다보임 품질 루프');
  config.pages[0].sections = [heroSection()];
  config.motion = {
    presetId: 'cafe-basic',
    intensity: 'normal',
    videoRequested: true,
    videoAddon: true,
  };
  return config;
}

describe('Q$7 — 다보임 품질 루프 통합 경계', () => {
  test('애드온 preview 기본값은 강등·원본을 보존하고 serving/export 권한으로 새지 않는다', () => {
    const draft = qualityDraft();
    const before = structuredClone(draft);

    const regular = configForAddonPreview(draft, false);
    assert.equal(regular, draft, '기본 off projection은 객체 identity도 바꾸면 안 된다');
    assert.equal(resolveMotionPlan(regular, { tier: 'basic' }).cinematicHeroSections.size, 0);

    const demo = configForAddonPreview(draft, true);
    assert.equal(resolveMotionPlan(demo, { tier: 'premium' }).cinematicHeroSections.has('hero'), true);
    assert.deepEqual(draft, before, '데모가 저장 원본에 영상·권한을 기록하면 안 된다');
    assert.equal(draft.pages[0].sections[0].background.video, undefined);
    assert.equal('tier' in demo, false, '화면 projection이 entitlement를 생성하면 안 된다');

    const serving = source('src/app/s/[domain]/_shared.tsx');
    const exporter = source('src/lib/export/render-static.ts');
    const preview = source('src/components/dashboard/site-preview.tsx');
    assert.doesNotMatch(serving, /previewAsAddon|configForAddonPreview|preview-addon/);
    assert.doesNotMatch(exporter, /previewAsAddon|configForAddonPreview|preview-addon/);
    assert.match(preview, /previewAsAddon\s*=\s*false/);
    assert.match(preview, /예시 · AI 영상 홈페이지\(\+₩/);
  });

  test('Veo는 비용·권한·상한 순서 뒤에서 실제 동기 전송만 fail-closed한다', () => {
    const enabled: VideoGuardConfig = { enabled: true, maxPerSite: 2, dailyCap: 5 };
    assert.match(videoGuardError({ ...enabled, enabled: false }, 'basic', 99, 99) ?? '', /^VIDEO_GEN_DISABLED:/);
    assert.match(videoGuardError(enabled, 'basic', 99, 99) ?? '', /^VIDEO_GEN_ADDON:/);
    assert.match(videoGuardError(enabled, 'premium', 2, 99) ?? '', /^VIDEO_GEN_SITE_CAP:/);
    assert.match(videoGuardError(enabled, 'premium', 1, 5) ?? '', /^VIDEO_GEN_DAILY_CAP:/);
    assert.equal(videoGuardError(enabled, 'premium', 1, 4), null);
    assert.equal(synchronousVideoTransportError(true), null);
    assert.match(synchronousVideoTransportError(false) ?? '', /^VIDEO_GEN_SYNC_UNSAFE:/);

    const pipeline = source('src/lib/ai/video-pipeline.ts');
    const assertStart = pipeline.indexOf('export async function assertVideoGenAllowed');
    const assertEnd = pipeline.indexOf('export interface HeroVideoResult', assertStart);
    const guardBlock = pipeline.slice(assertStart, assertEnd);
    const costGuard = guardBlock.indexOf('videoGuardError(');
    const costThrow = guardBlock.indexOf('if (err) throw new Error(err)', costGuard);
    const syncGuard = guardBlock.indexOf('synchronousVideoTransportError(', costThrow);
    assert.ok(costGuard >= 0 && costGuard < costThrow && costThrow < syncGuard);

    const guardedCall = pipeline.indexOf('await assertVideoGenAllowed(input.siteId, input.tier)');
    const costLog = pipeline.indexOf('await videoGen.record({', guardedCall);
    const generation = pipeline.indexOf('return ai.generateVideo({', costLog);
    assert.ok(guardedCall >= 0 && guardedCall < costLog && costLog < generation);
  });

  test('구조적 direction이 review 한 섹션만 바꾸며 keep·사실·무료 PATCH 경계를 보존한다', async () => {
    const parsed = surveySchema.parse({
      businessName: '다보임 검수',
      purposeId: 'company_brand',
      purpose: '회사 소개',
      industry: '컨설팅',
      tone: ['모던'],
      colorPreference: '블루',
      referenceImageUrls: [],
      sectionPlan: [{ type: 'hero', name: '첫 화면', brief: '', source: 'user' }],
      templateId: 'company-brand',
      directions: [{
        sectionId: '  hero  ',
        intent: 'adjust',
        note: '  대표 사진은 크게, 문구와 숫자는 그대로  ',
        guided: ['사진 더 크게', '여백 늘리기'],
      }],
    });
    assert.deepEqual(parsed.directions, [{
      sectionId: 'hero',
      intent: 'adjust',
      note: '대표 사진은 크게, 문구와 숫자는 그대로',
      guided: ['사진 더 크게', '여백 늘리기'],
    }]);

    const draft = qualityDraft();
    const heroBefore = draft.pages[0].sections[0];
    const review = configForSectionReview(draft, '', 'hero');
    assert.deepEqual(review.pages[0].sections.map((section) => section.id), ['hero']);
    assert.deepEqual(draft.pages[0].sections[0], heroBefore, 'review projection은 원본을 바꾸면 안 된다');

    const kept = applySectionDirection(draft, { sectionId: 'hero', intent: 'keep' });
    assert.equal(kept.pages[0].sections[0], heroBefore, 'keep 섹션은 reference까지 동결한다');
    const adjusted = applySectionDirection(kept, parsed.directions![0]);
    const heroAfter = adjusted.pages[0].sections[0];
    assert.equal(sectionContentFingerprint(heroAfter), sectionContentFingerprint(heroBefore));
    assert.ok(heroAfter.height > heroBefore.height);
    assert.ok(heroAfter.elements.find((element) => element.id === 'photo')!.frame.w > 420);
    assert.deepEqual(adjusted.directions, [
      { sectionId: 'hero', intent: 'keep' },
      parsed.directions![0],
    ]);

    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (async (url, init) => {
      requestUrl = String(url);
      requestInit = init;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    await saveSiteDraft('quality/site', adjusted);
    assert.equal(requestUrl, '/api/sites/quality%2Fsite');
    assert.equal(requestInit?.method, 'PATCH');
    assert.deepEqual(JSON.parse(String(requestInit?.body)), { draftConfig: adjusted });

    const reviewApi = source('src/components/dashboard/onboarding/section-review-api.ts');
    const editorApi = source('src/components/editor/api.ts');
    const saveStart = editorApi.indexOf('export async function saveDraftRequest');
    const saveEnd = editorApi.indexOf('export async function publishSiteRequest', saveStart);
    assert.doesNotMatch(reviewApi, /credits|credit|edit-requests|consume|ledger/i);
    assert.doesNotMatch(editorApi.slice(saveStart, saveEnd), /credits|credit|edit-requests|consume|ledger/i);
  });

  test('발행은 exact 휴먼 3체크와 정적 산출물 감사를 모두 fail-closed한다', () => {
    const confirmed = {
      heroPhotoAuthentic: true,
      copyIsFactual: true,
      worthThePrice: true,
    };
    assert.equal(allPublishHumanChecksConfirmed(confirmed), true);
    assert.equal(allPublishHumanChecksConfirmed({
      heroPhotoAuthentic: true,
      copyIsFactual: 'true',
      worthThePrice: 1,
    }), false);
    assert.deepEqual(missingPublishHumanChecks({ heroPhotoAuthentic: true }), [
      'copyIsFactual',
      'worthThePrice',
    ]);

    const artifactMessage = '정적 HTML에 대표 본문이 없습니다.';
    const preflight = checkPublish(qualityDraft(), 'basic', {
      artifact: {
        blockers: [{ code: 'static_text', message: artifactMessage, pageSlug: '' }],
      },
    });
    assert.equal(preflight.ok, false);
    assert.ok(preflight.blockers.includes(artifactMessage));

    const route = source('src/app/api/sites/[siteId]/publish/route.ts');
    const humanGate = route.indexOf('missingPublishHumanChecks(body.humanChecks)');
    const humanFailure = route.indexOf("'PUBLISH_HUMAN_CHECKS_REQUIRED'", humanGate);
    const artifactAudit = route.indexOf('scan = preflightScan(', humanFailure);
    const auditFailure = route.indexOf("'PUBLISH_AUDIT_UNAVAILABLE'", artifactAudit);
    const qualityGate = route.indexOf('const preflight = checkPublish(', auditFailure);
    const persistence = route.indexOf('publishAuditedSnapshot(', qualityGate);
    assert.ok(
      humanGate >= 0 &&
        humanGate < humanFailure &&
        humanFailure < artifactAudit &&
        artifactAudit < auditFailure &&
        auditFailure < qualityGate &&
        qualityGate < persistence,
      'human → artifact audit/catch → quality gate → publish 순서가 깨짐',
    );
    assert.match(route.slice(artifactAudit, qualityGate), /catch \(error\)[\s\S]*apiError\([\s\S]*503/);
    assert.match(route.slice(qualityGate, persistence), /if \(!preflight\.ok\)[\s\S]*PUBLISH_QUALITY_BLOCKED/);
    assert.match(route.slice(persistence), /site\.draftConfig/);
  });
});
