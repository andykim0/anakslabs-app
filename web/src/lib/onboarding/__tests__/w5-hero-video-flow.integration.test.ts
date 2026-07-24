import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { applyHeroVideoToConfig } from '@/lib/ai/video-pipeline-core';
import { resolveMotionPlan } from '@/lib/motion/apply';
import { applyGeneratedMotion } from '@/lib/motion/validate';
import { selectedHeroPhotoUrl } from '@/lib/onboarding/hero-image-options';
import {
  heroVideoResumePlan,
  processApprovedHeroVideo,
  type ProcessHeroVideoDraft,
} from '@/lib/onboarding/hero-video-process';
import {
  authoritativeHeroVideoChoice,
  surveyWithHeroVideoSelection,
} from '@/lib/onboarding/hero-video-selection';
import type { SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const survey = (): SurveyInput => ({
  businessName: '일반 업종 테스트',
  purposeId: 'local_store',
  purpose: '오프라인 매장',
  industry: '일반 매장',
  tone: ['차분한'],
  colorPreference: '아이보리',
  referenceImageUrls: [],
  sectionPlan: [{ type: 'hero', name: '첫 화면', brief: '', source: 'user' }],
  templateId: 'local-store',
  heroPhotoUrl: '/uploads/representative.webp',
});

function configWithHero(imageUrl: string): SiteConfig {
  const config = emptySiteConfig('일반 업종 테스트');
  config.pages[0].sections.push({
    id: 'hero',
    type: 'hero',
    name: '히어로',
    height: 800,
    background: { image: { src: imageUrl } },
    elements: [],
  });
  return config;
}

const draft: ProcessHeroVideoDraft = {
  videoUrl: '/generated/hero.mp4',
  posterUrl: '/generated/hero-poster.webp',
  prompt: 'registered safe motion',
  model: 'veo-fast',
};

describe('W5 — 히어로 사진→영상 애드온 통합 상태 전이', () => {
  test('basic 정적 폴백은 비용 0, 관리자 승인 뒤 1회 process로 cinematic 렌더까지 이어진다', async () => {
    const selectedSurvey = surveyWithHeroVideoSelection(
      survey(),
      { id: 'upload', source: 'upload', url: '/uploads/representative.webp' },
      { heroTechnique: 'video-hero', heroMotionId: 'parallax-depth' },
    );
    const choice = authoritativeHeroVideoChoice(selectedSurvey, {
      heroTechnique: 'video-hero',
      intensity: 'normal',
      videoConceptId: 'space-mood',
    });
    assert.ok(choice);

    const staticFallback = applyGeneratedMotion(
      configWithHero('/uploads/representative.webp'),
      selectedSurvey.purposeId,
      'basic',
      choice,
    );
    assert.equal(selectedHeroPhotoUrl(selectedSurvey), '/uploads/representative.webp');
    assert.equal(staticFallback.motion?.videoRequested, true);
    assert.notEqual(staticFallback.motion?.presetId, 'cinematic-hero');
    assert.equal(heroVideoResumePlan(staticFallback).canResume, true);

    let calls = 0;
    let applied = staticFallback;
    const basicResult = await processApprovedHeroVideo(
      {
        siteId: 'site-1',
        tier: 'basic',
        videoAddon: true,
        heroImageChoice: selectedSurvey.heroImageChoice,
        heroPhotoUrl: selectedSurvey.heroPhotoUrl,
        tone: selectedSurvey.tone,
      },
      {
        async generateDrafts() {
          calls += 1;
          return [draft];
        },
        async applyDraft() {
          calls += 1;
        },
      },
    );
    assert.deepEqual(basicResult, { status: 'skipped', reason: 'not-approved' });
    assert.equal(calls, 0);

    const approvedResult = await processApprovedHeroVideo(
      {
        siteId: 'site-1',
        tier: 'premium',
        videoAddon: true,
        heroImageChoice: selectedSurvey.heroImageChoice,
        heroPhotoUrl: selectedSurvey.heroPhotoUrl,
        tone: selectedSurvey.tone,
      },
      {
        async generateDrafts(_siteId, input) {
          calls += 1;
          assert.deepEqual(input, {
            count: 1,
            tone: ['차분한'],
            heroPhotoUrl: '/uploads/representative.webp',
          });
          return [draft];
        },
        async applyDraft(_siteId, selected) {
          calls += 1;
          applied = applyHeroVideoToConfig(applied, selected.videoUrl, selected.posterUrl);
        },
      },
    );
    assert.deepEqual(approvedResult, { status: 'applied' });
    assert.equal(calls, 2, 'Veo 1회 + 선택안 적용 1회');
    assert.equal(applied.pages[0].sections[0].background.video?.src, draft.videoUrl);
    assert.equal(applied.motion?.heroMotionId, 'parallax-depth');
    assert.ok(resolveMotionPlan(applied, { tier: 'premium' }).cinematicHeroSections.has('hero'));
  });

  test('아니오 경로는 AI 선택을 히어로로 유지하고 Veo POST·PATCH를 모두 생략한다', async () => {
    const selectedSurvey = surveyWithHeroVideoSelection(
      survey(),
      { id: 'ai-2', source: 'ai', url: '/generated/mood-2.webp' },
      { heroTechnique: 'ken-burns', heroMotionId: 'boomerang-loop' },
    );
    const choice = authoritativeHeroVideoChoice(selectedSurvey, {
      heroTechnique: 'ken-burns',
      intensity: 'subtle',
    });
    const config = applyGeneratedMotion(
      configWithHero('/generated/mood-2.webp'),
      selectedSurvey.purposeId,
      'premium',
      choice,
    );
    assert.equal(selectedHeroPhotoUrl(selectedSurvey), undefined);
    assert.equal(config.motion?.videoAddon, false);
    assert.equal(config.motion?.heroTechnique, 'ken-burns');
    assert.equal(config.motion?.heroMotionId, undefined);

    let calls = 0;
    const result = await processApprovedHeroVideo(
      {
        siteId: 'site-2',
        tier: 'premium',
        videoAddon: false,
        heroImageChoice: selectedSurvey.heroImageChoice,
        heroPhotoUrl: selectedSurvey.heroPhotoUrl,
        tone: selectedSurvey.tone,
      },
      {
        async generateDrafts() {
          calls += 1;
          return [draft];
        },
        async applyDraft() {
          calls += 1;
        },
      },
    );
    assert.deepEqual(result, { status: 'skipped', reason: 'not-requested' });
    assert.equal(calls, 0);
    assert.equal(config.pages[0].sections[0].background.video, undefined);
  });

  test('AI 3안 비용 방벽·대표 예시 정직성·U3 서버 순서가 소스 불변식으로 남는다', () => {
    const candidates = source('src/app/api/onboarding/candidates/route.ts');
    const preview = source('src/components/dashboard/onboarding/motion-choice-step.tsx');
    const videoRoute = source('src/app/api/sites/[siteId]/hero-video/route.ts');
    const post = videoRoute.slice(videoRoute.indexOf('export const POST'), videoRoute.indexOf('/** PATCH'));

    assert.match(candidates, /const HERO_CANDIDATE_LIMIT = 3/);
    assert.match(candidates, /buildZeroCostCandidates\(survey\)/);
    assert.match(candidates, /rateLimited\(client\.id, 12\)/);
    assert.doesNotMatch(candidates, /ai\.generateCandidates\(/);
    assert.match(candidates, /items\.slice\(0, HERO_CANDIDATE_LIMIT\)/);
    assert.match(candidates, /console\.info\([\s\S]*\[hero-image-candidates\]/);

    assert.match(preview, /실제 렌더러 티저/);
    assert.match(preview, /동일한 scene 계약·런타임/);
    assert.match(preview, /고객 최종 자산 아님/);

    const addon = post.indexOf('!hasVideoAddon(client.tier)');
    const owned = post.indexOf('await getOwnedSite');
    const generate = post.indexOf('await generateHeroVideo');
    assert.ok(addon >= 0 && addon < owned && owned < generate, '애드온 승인 뒤에만 Veo를 실행해야 한다');
  });
});
