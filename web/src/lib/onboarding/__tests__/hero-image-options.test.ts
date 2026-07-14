import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig } from '@/lib/types/site';
import {
  HERO_AI_OPTION_COUNT,
  applyHeroImageToCandidate,
  buildHeroImageOptions,
  heroCandidateIntent,
  mockHeroImageUrl,
  surveyForHeroCandidates,
  type HeroImageChoiceId,
} from '@/lib/onboarding/hero-image-options';

function survey(overrides: Partial<SurveyInput> = {}): SurveyInput {
  return {
    businessName: '테스트 브랜드',
    purposeId: 'local_store',
    purpose: '오프라인 매장',
    industry: '카페',
    tone: ['따뜻한'],
    colorPreference: '아이보리',
    referenceImageUrls: [],
    sectionPlan: [],
    templateId: 'local_store',
    ...overrides,
  };
}

function candidate(index: number): DesignCandidate {
  return {
    id: `candidate-${index + 1}`,
    label: `후보 ${index + 1}`,
    style: 'photo',
    heroImageUrl: `/generated/mood-${index + 1}.webp`,
    theme: emptySiteConfig('test').theme,
    description: '제품이 아닌 무드 이미지',
  };
}

describe('buildHeroImageOptions', () => {
  test('대표 사진이 있으면 upload + AI 3안으로 만든다', () => {
    const candidates = [candidate(0), candidate(1), candidate(2), candidate(3)];
    const options = buildHeroImageOptions(candidates, '/uploads/hero.webp');

    assert.equal(options.length, HERO_AI_OPTION_COUNT + 1);
    assert.deepEqual(options.map((option) => option.id), ['upload', 'ai-1', 'ai-2', 'ai-3']);
    assert.deepEqual(options.map((option) => option.url), [
      '/uploads/hero.webp',
      '/generated/mood-1.webp',
      '/generated/mood-2.webp',
      '/generated/mood-3.webp',
    ]);
    assert.deepEqual(options.map((option) => option.source), ['upload', 'ai', 'ai', 'ai']);
    assert.deepEqual(options.slice(1).map((option) => option.candidateId), [
      'candidate-1',
      'candidate-2',
      'candidate-3',
    ]);
  });

  test('대표 사진이 없으면 정확히 AI 3안만 만든다', () => {
    const options = buildHeroImageOptions([candidate(0), candidate(1), candidate(2)]);
    assert.equal(options.length, HERO_AI_OPTION_COUNT);
    assert.deepEqual(options.map((option) => option.id), ['ai-1', 'ai-2', 'ai-3']);
    assert.ok(options.every((option) => option.source === 'ai'));
  });

  test('mock URL은 0..2에서 결정적·고유하며, 후보 누락/중복도 3개 고유 카드로 보충한다', () => {
    const fallbackUrls = [mockHeroImageUrl(0), mockHeroImageUrl(1), mockHeroImageUrl(2)];
    assert.equal(fallbackUrls.length, HERO_AI_OPTION_COUNT);
    assert.equal(new Set(fallbackUrls).size, HERO_AI_OPTION_COUNT);
    assert.throws(() => mockHeroImageUrl(3 as 0), RangeError);

    const repeated = candidate(0);
    const options = buildHeroImageOptions([repeated, { ...repeated, id: 'candidate-2' }]);
    assert.equal(options.length, HERO_AI_OPTION_COUNT);
    assert.equal(new Set(options.map((option) => option.url)).size, HERO_AI_OPTION_COUNT);
  });
});

describe('후보 생성 설문과 선택 적용', () => {
  test('대표 사진과 W 선택 상태를 후보 생성 입력/intent에서 제외하고 원본을 보존한다', () => {
    type FutureSurvey = SurveyInput & {
      heroImageChoice?: HeroImageChoiceId;
      videoAddon?: boolean;
      heroMotionId?: string;
    };
    const input: FutureSurvey = {
      ...survey({ heroPhotoUrl: '/uploads/hero.webp' }),
      heroImageChoice: 'upload',
      videoAddon: true,
      heroMotionId: 'cinematic-hero',
    };
    const normalized = surveyForHeroCandidates(input);

    assert.equal(normalized.heroPhotoUrl, undefined);
    assert.equal('heroImageChoice' in normalized, false);
    assert.equal('videoAddon' in normalized, false);
    assert.equal('heroMotionId' in normalized, false);
    assert.equal(input.heroPhotoUrl, '/uploads/hero.webp', '입력 설문을 변형하지 않아야 한다');

    const sameIntent = heroCandidateIntent({
      ...input,
      heroPhotoUrl: '/uploads/another.webp',
      heroImageChoice: 'ai-2',
      videoAddon: false,
      heroMotionId: 'ken-burns',
    } as FutureSurvey);
    assert.equal(heroCandidateIntent(input), sameIntent);
    assert.notEqual(heroCandidateIntent(input), heroCandidateIntent({ ...input, industry: '뷰티' }));
  });

  test('선택 URL 적용은 DesignCandidate를 변형하지 않는다', () => {
    const original = candidate(0);
    const originalSnapshot = structuredClone(original);
    const applied = applyHeroImageToCandidate(original, '/chosen/hero.webp');

    assert.notEqual(applied, original);
    assert.equal(applied.heroImageUrl, '/chosen/hero.webp');
    assert.deepEqual(original, originalSnapshot);
    assert.equal(original.heroImageUrl, '/generated/mood-1.webp');
  });
});
