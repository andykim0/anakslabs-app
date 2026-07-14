import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildMotionPrompt, heroVideoContext } from '@/lib/ai/video-pipeline-core';
import { HERO_VIDEO_MOTIONS } from '@/lib/motion/hero-video-motions';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';

function config(input: { choice: 'upload' | 'ai-1'; motionId: 'boomerang-loop' | 'slow-zoom' }): SiteConfig {
  const base = emptySiteConfig('테스트');
  return {
    ...base,
    motion: {
      presetId: 'cinematic-hero',
      intensity: 'normal',
      heroTechnique: 'video-hero',
      heroImageChoice: input.choice,
      videoAddon: true,
      heroMotionId: input.motionId,
    },
    pages: [{
      id: 'home',
      title: '홈',
      slug: '',
      sections: [{
        id: 'hero',
        type: 'hero',
        name: '히어로',
        height: 800,
        background: { image: { src: '/chosen/hero.webp' } },
        elements: [],
      }],
    }],
  };
}

describe('W4 — 선택한 영상 연출·소스를 Veo 맥락으로 소비', () => {
  test('등록 heroMotionId의 영문 seed가 최종 안전 프롬프트의 camera direction으로 흐른다', () => {
    const context = heroVideoContext(config({ choice: 'ai-1', motionId: 'boomerang-loop' }));
    assert.ok(context);
    assert.match(context.povMood, /gentle returning camera arc/i);
    const prompt = buildMotionPrompt(context.povMood, context.source);
    assert.ok(prompt.includes(HERO_VIDEO_MOTIONS['boomerang-loop'].promptSeed.replace(/[.\s]+$/, '')));
  });

  test('AI 선택은 업로드 힌트가 같아도 ambient, upload 선택+정확 일치만 faithful이다', () => {
    const ai = heroVideoContext(
      config({ choice: 'ai-1', motionId: 'slow-zoom' }),
      { heroPhotoUrl: '/chosen/hero.webp' },
    );
    const upload = heroVideoContext(
      config({ choice: 'upload', motionId: 'slow-zoom' }),
      { heroPhotoUrl: '/chosen/hero.webp' },
    );
    assert.equal(ai?.source, 'ambient-ai');
    assert.equal(upload?.source, 'uploaded-photo');
  });
});
