import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  heroVideoResumePlan,
  processApprovedHeroVideo,
  type HeroVideoProcessDependencies,
  type ProcessHeroVideoDraft,
} from '@/lib/onboarding/hero-video-process';
import { emptySiteConfig } from '@/lib/types/site';

const draft: ProcessHeroVideoDraft = {
  videoUrl: '/video/hero.mp4',
  posterUrl: '/poster/hero.webp',
  prompt: 'registered prompt',
  model: 'veo-fast',
};

function deps(options: { generateError?: Error; applyError?: Error } = {}) {
  const calls = { generate: 0, apply: 0, input: undefined as unknown };
  const dependencies: HeroVideoProcessDependencies = {
    async generateDrafts(_siteId, input) {
      calls.generate += 1;
      calls.input = input;
      if (options.generateError) throw options.generateError;
      return [draft];
    },
    async applyDraft() {
      calls.apply += 1;
      if (options.applyError) throw options.applyError;
    },
  };
  return { calls, dependencies };
}

describe('W4 — process 히어로 영상 게이트', () => {
  test('승인 후 재개 판정은 요청+정지 hero만 허용하고 upload 출처만 힌트로 복원한다', () => {
    const config = emptySiteConfig('재개');
    config.motion = {
      presetId: 'cafe-basic',
      intensity: 'normal',
      videoRequested: true,
      videoAddon: true,
      heroImageChoice: 'upload',
      heroMotionId: 'slow-zoom',
    };
    config.pages[0].sections.push({
      id: 'hero',
      type: 'hero',
      name: '히어로',
      height: 800,
      background: { image: { src: '/uploads/hero.webp' } },
      elements: [],
    });
    assert.deepEqual(heroVideoResumePlan(config), {
      requested: true,
      applied: false,
      canResume: true,
      heroImageChoice: 'upload',
      heroPhotoUrl: '/uploads/hero.webp',
    });

    config.motion.heroImageChoice = 'ai-1';
    assert.equal(heroVideoResumePlan(config).heroPhotoUrl, undefined, 'AI 선택은 업로드 힌트를 복원하지 않는다');
    config.motion.heroImageChoice = 'upload';

    config.pages[0].sections[0].background.video = { src: '/video.mp4', poster: '/poster.webp' };
    assert.equal(heroVideoResumePlan(config).canResume, false);
    config.motion.videoAddon = false;
    config.motion.videoRequested = true;
    assert.equal(heroVideoResumePlan(config).requested, false);

    config.pages[0].sections[0].hidden = true;
    assert.equal(heroVideoResumePlan(config).canResume, false);
  });

  test('스킵과 미승인은 POST·PATCH를 한 번도 호출하지 않는다', async () => {
    for (const input of [
      { tier: 'premium' as const, videoAddon: false, reason: 'not-requested' as const },
      { tier: 'basic' as const, videoAddon: true, reason: 'not-approved' as const },
    ]) {
      const { calls, dependencies } = deps();
      const result = await processApprovedHeroVideo(
        { siteId: 'site-1', tone: ['차분한'], ...input },
        dependencies,
      );
      assert.deepEqual(result, { status: 'skipped', reason: input.reason });
      assert.deepEqual({ generate: calls.generate, apply: calls.apply }, { generate: 0, apply: 0 });
    }
  });

  test('승인+선택일 때만 시안 1개를 생성하고 즉시 적용한다', async () => {
    const { calls, dependencies } = deps();
    const result = await processApprovedHeroVideo(
      {
        siteId: 'site-1',
        tier: 'premium',
        videoAddon: true,
        heroImageChoice: 'upload',
        heroPhotoUrl: '/uploads/hero.webp',
        tone: ['차분한'],
      },
      dependencies,
    );
    assert.deepEqual(result, { status: 'applied' });
    assert.deepEqual({ generate: calls.generate, apply: calls.apply }, { generate: 1, apply: 1 });
    assert.deepEqual(calls.input, { count: 1, tone: ['차분한'], heroPhotoUrl: '/uploads/hero.webp' });
  });

  test('AI 선택은 설문에 업로드 URL이 남아도 영상 출처 힌트로 보내지 않는다', async () => {
    const { calls, dependencies } = deps();
    await processApprovedHeroVideo(
      {
        siteId: 'site-1',
        tier: 'premium',
        videoAddon: true,
        heroImageChoice: 'ai-2',
        heroPhotoUrl: '/uploads/not-selected.webp',
        tone: ['모던'],
      },
      dependencies,
    );
    assert.deepEqual(calls.input, { count: 1, tone: ['모던'] });
  });

  test('mock data URL·blob·긴 주소는 업로드 선택이어도 출처 힌트 body에서 제외한다', async () => {
    for (const heroPhotoUrl of [
      `data:image/png;base64,${'A'.repeat(5000)}`,
      'blob:https://daboim.kr/mock-id',
      `https://assets.example.com/${'x'.repeat(2050)}`,
    ]) {
      const { calls, dependencies } = deps();
      await processApprovedHeroVideo(
        {
          siteId: 'site-1',
          tier: 'premium',
          videoAddon: true,
          heroImageChoice: 'upload',
          heroPhotoUrl,
          tone: ['차분한'],
        },
        dependencies,
      );
      assert.deepEqual(calls.input, { count: 1, tone: ['차분한'] });
    }
  });

  test('POST·PATCH 실패는 사이트 성공을 깨지 않고 정지 폴백 결과로 접는다', async () => {
    for (const options of [
      { generateError: new Error('생성 실패') },
      { applyError: new Error('적용 실패') },
    ]) {
      const { dependencies } = deps(options);
      const result = await processApprovedHeroVideo(
        { siteId: 'site-1', tier: 'premium', videoAddon: true, tone: ['따뜻한'] },
        dependencies,
      );
      assert.equal(result.status, 'fallback');
      assert.equal(result.reason, 'generation-failed');
    }
  });
});
