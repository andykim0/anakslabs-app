import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { HERO_VIDEO_MOTION_IDS } from '@/lib/motion/hero-video-motions';
import { motionChoiceSchema, motionSchema, surveySchema } from '@/app/api/_lib/schemas';
import type { SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';

function survey(): SurveyInput {
  return {
    businessName: '테스트 브랜드',
    purposeId: 'local_store',
    purpose: '오프라인 매장',
    industry: '카페',
    tone: ['차분한'],
    colorPreference: '아이보리',
    referenceImageUrls: [],
    sectionPlan: [{ type: 'hero', name: '첫 화면', brief: '', source: 'user' }],
    templateId: 'local-store',
    heroImageChoice: 'ai-2',
    videoAddon: true,
    heroMotionId: 'slow-zoom',
  };
}

describe('W4 히어로 이미지·영상 additive 계약', () => {
  test('SurveyInput과 surveySchema가 선택값을 보존하고 레거시 입력도 허용한다', () => {
    const parsed = surveySchema.parse(survey());
    assert.equal(parsed.heroImageChoice, 'ai-2');
    assert.equal(parsed.videoAddon, true);
    assert.equal(parsed.heroMotionId, 'slow-zoom');

    const legacy = survey();
    delete legacy.heroImageChoice;
    delete legacy.videoAddon;
    delete legacy.heroMotionId;
    assert.doesNotThrow(() => surveySchema.parse(legacy));
  });

  test('survey·motion choice·SiteConfig motion은 등록된 정확한 enum만 통과시킨다', () => {
    for (const heroMotionId of HERO_VIDEO_MOTION_IDS) {
      assert.equal(surveySchema.parse({ ...survey(), heroMotionId }).heroMotionId, heroMotionId);
      assert.equal(motionChoiceSchema.parse({ heroMotionId }).heroMotionId, heroMotionId);
      assert.equal(
        motionSchema.parse({
          presetId: 'cinematic-hero',
          intensity: 'normal',
          heroImageChoice: 'upload',
          videoAddon: true,
          heroMotionId,
        }).heroMotionId,
        heroMotionId,
      );
    }

    assert.equal(surveySchema.safeParse({ ...survey(), heroImageChoice: 'ai-4' }).success, false);
    assert.equal(surveySchema.safeParse({ ...survey(), heroMotionId: 'webgl-shader' }).success, false);
    assert.equal(motionChoiceSchema.safeParse({ videoAddon: 'yes' }).success, false);
    assert.equal(
      motionSchema.safeParse({ presetId: 'cinematic-hero', intensity: 'normal', heroMotionId: 'unknown' }).success,
      false,
    );

    const config: SiteConfig = {
      ...emptySiteConfig('테스트'),
      motion: {
        presetId: 'cinematic-hero',
        intensity: 'normal',
        heroImageChoice: 'upload',
        videoAddon: true,
        heroMotionId: 'parallax-depth',
      },
    };
    assert.deepEqual(motionSchema.parse(config.motion), config.motion);
  });
});
