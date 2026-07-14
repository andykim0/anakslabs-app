import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { SurveyInput } from '@/lib/types/domain';
import {
  authoritativeHeroVideoChoice,
  surveyWithHeroVideoSelection,
} from '@/lib/onboarding/hero-video-selection';

const survey = (overrides: Partial<SurveyInput> = {}): SurveyInput => ({
  businessName: '테스트',
  purposeId: 'local_store',
  purpose: '매장',
  industry: '카페',
  tone: ['차분한'],
  colorPreference: '아이보리',
  referenceImageUrls: [],
  sectionPlan: [{ type: 'hero', name: '히어로', brief: '', source: 'user' }],
  templateId: 'local-store',
  ...overrides,
});

describe('W4 — SurveyInput 권위 영상 선택', () => {
  test('UI 선택은 업로드 URL을 보존하면서 소스·애드온·등록 모션만 기록한다', () => {
    const original = survey({ heroPhotoUrl: '/uploads/hero.webp' });
    const video = surveyWithHeroVideoSelection(
      original,
      { id: 'ai-2', source: 'ai', url: '/generated/mood.webp' },
      { heroTechnique: 'video-hero', heroMotionId: 'slow-zoom' },
    );
    assert.equal(video.heroPhotoUrl, '/uploads/hero.webp');
    assert.equal(video.heroImageChoice, 'ai-2');
    assert.equal(video.videoAddon, true);
    assert.equal(video.heroMotionId, 'slow-zoom');

    const still = surveyWithHeroVideoSelection(
      original,
      { id: 'upload', source: 'upload', url: '/uploads/hero.webp' },
      { heroTechnique: 'ken-burns', heroMotionId: 'webgl-shader' },
    );
    assert.equal(still.heroImageChoice, 'upload');
    assert.equal(still.videoAddon, false);
    assert.equal(still.heroMotionId, undefined);
    assert.equal(original.heroImageChoice, undefined, '원본 설문은 변형하지 않는다');
  });

  test('설문의 W 필드가 조작된 motionChoice를 덮어쓴다', () => {
    assert.deepEqual(
      authoritativeHeroVideoChoice(
        survey({ heroImageChoice: 'ai-2', videoAddon: false, heroMotionId: 'slow-zoom' }),
        {
          heroTechnique: 'video-hero',
          heroImageChoice: 'upload',
          videoAddon: true,
          heroMotionId: 'parallax-depth',
        },
      ),
      {
        heroTechnique: 'video-hero',
        heroImageChoice: 'ai-2',
        videoAddon: false,
        heroMotionId: 'slow-zoom',
      },
    );
  });

  test('레거시 설문은 기존 motionChoice를 보존하고 둘 다 없으면 undefined다', () => {
    const legacyChoice = { heroTechnique: 'ken-burns', intensity: 'subtle' as const };
    assert.deepEqual(authoritativeHeroVideoChoice(survey(), legacyChoice), legacyChoice);
    assert.equal(authoritativeHeroVideoChoice(survey(), undefined), undefined);
  });
});
