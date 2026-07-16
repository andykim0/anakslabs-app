import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig } from '@/lib/types/site';
import {
  HERO_AI_OPTION_COUNT,
  applyHeroImageToCandidate,
  buildHeroImageOptions,
  heroCandidateIntent,
  heroImageUrlIntent,
  mockHeroImageUrl,
  selectedHeroPhotoUrl,
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

  test('v2 real_photo는 verified upload 하나만 노출하고 가짜 AI mood fallback을 만들지 않는다', () => {
    const ref = {
      assetId: '11111111-1111-4111-8111-111111111111',
      url: '/uploads/hero.webp',
    };
    const options = buildHeroImageOptions(
      [
        { ...candidate(0), heroImageUrl: ref.url, heroAssetRef: ref },
        { ...candidate(1), heroImageUrl: ref.url, heroAssetRef: ref },
      ],
      ref.url,
      ref,
      'real_photo',
    );
    assert.deepEqual(options, [{ id: 'upload', url: ref.url, source: 'upload', assetRef: ref }]);
    assert.equal(options.some((option) => option.source === 'ai'), false);
    assert.deepEqual(
      buildHeroImageOptions([candidate(0)], ref.url, undefined, 'real_photo'),
      [],
      'ref 없는 URL만으로 real_photo option을 만들지 않는다',
    );
  });

  test('명시적 artistic 방향은 고객 실사를 AI 후보와 섞지 않고, legacy만 기존 선택을 보존한다', () => {
    const options = buildHeroImageOptions(
      [candidate(0), candidate(1), candidate(2)],
      '/uploads/hero.webp',
      undefined,
      'abstract_editorial',
    );
    assert.equal(options.length, 3);
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
  test('대표 사진·W 선택·섹션 검수 이력을 후보 생성 입력/intent에서 제외하고 원본을 보존한다', () => {
    type FutureSurvey = SurveyInput & {
      heroImageChoice?: HeroImageChoiceId;
      videoAddon?: boolean;
      heroMotionId?: string;
    };
    const input: FutureSurvey = {
      ...survey({
        heroPhotoUrl: '/uploads/hero.webp',
        heroPhotoAssetRef: {
          assetId: '11111111-1111-4111-8111-111111111111',
          url: '/uploads/hero.webp',
        },
      }),
      heroImageChoice: 'upload',
      videoAddon: true,
      heroMotionId: 'cinematic-hero',
      directions: [{ sectionId: 'hero', intent: 'adjust', guided: ['사진 더 크게'] }],
    };
    const normalized = surveyForHeroCandidates(input);

    assert.equal(normalized.heroPhotoUrl, undefined);
    assert.equal(normalized.heroPhotoAssetRef, undefined);
    assert.equal('heroImageChoice' in normalized, false);
    assert.equal('videoAddon' in normalized, false);
    assert.equal('heroMotionId' in normalized, false);
    assert.equal('directions' in normalized, false);
    assert.equal(input.heroPhotoUrl, '/uploads/hero.webp', '입력 설문을 변형하지 않아야 한다');

    const sameIntent = heroCandidateIntent({
      ...input,
      heroPhotoUrl: '/uploads/another.webp',
      heroImageChoice: 'ai-2',
      videoAddon: false,
      heroMotionId: 'ken-burns',
      directions: [{ sectionId: 'hero', intent: 'keep' }],
    } as FutureSurvey);
    assert.equal(heroCandidateIntent(input), sameIntent);
    assert.notEqual(heroCandidateIntent(input), heroCandidateIntent({ ...input, industry: '뷰티' }));

    const realPhoto = survey({
      imageDirectionId: 'real_photo',
      heroPhotoUrl: '/uploads/real.webp',
      heroPhotoAssetRef: {
        assetId: '22222222-2222-4222-8222-222222222222',
        url: '/uploads/real.webp',
      },
      generalAssetAttestationId: '33333333-3333-4333-8333-333333333333',
    });
    assert.equal(surveyForHeroCandidates(realPhoto).heroPhotoUrl, '/uploads/real.webp');
    assert.deepEqual(surveyForHeroCandidates(realPhoto).heroPhotoAssetRef, realPhoto.heroPhotoAssetRef);
    assert.equal(
      surveyForHeroCandidates(realPhoto).generalAssetAttestationId,
      realPhoto.generalAssetAttestationId,
    );
  });

  test('선택 URL 적용은 DesignCandidate를 변형하지 않는다', () => {
    const original = {
      ...candidate(0),
      heroAssetRef: {
        assetId: '11111111-1111-4111-8111-111111111111',
        url: '/generated/mood-1.webp',
      },
    };
    const originalSnapshot = structuredClone(original);
    const applied = applyHeroImageToCandidate(original, '/chosen/hero.webp');

    assert.notEqual(applied, original);
    assert.equal(applied.heroImageUrl, '/chosen/hero.webp');
    assert.equal(applied.heroAssetRef, undefined, 'URL이 바뀌면 이전 후보 ref를 보존하면 안 된다');
    assert.deepEqual(original, originalSnapshot);
    assert.equal(original.heroImageUrl, '/generated/mood-1.webp');

    const selectedRef = {
      assetId: '22222222-2222-4222-8222-222222222222',
      url: '/chosen/hero.webp',
    };
    assert.deepEqual(
      applyHeroImageToCandidate(original, selectedRef.url, selectedRef).heroAssetRef,
      selectedRef,
    );
    assert.equal(
      applyHeroImageToCandidate(original, '/another.webp', selectedRef).heroAssetRef,
      undefined,
      'ref URL과 선택 URL이 다르면 fail closed',
    );
  });

  test('W4 소스 선택: 레거시·upload만 대표 사진을 히어로로 쓰고 AI는 보존만 한다', () => {
    const base = survey({ heroPhotoUrl: '/uploads/hero.webp' });
    assert.equal(selectedHeroPhotoUrl(base), '/uploads/hero.webp');
    assert.equal(selectedHeroPhotoUrl({ ...base, heroImageChoice: 'upload' }), '/uploads/hero.webp');
    assert.equal(selectedHeroPhotoUrl({ ...base, heroImageChoice: 'ai-1' }), undefined);
    assert.equal(selectedHeroPhotoUrl({ ...base, heroImageChoice: 'ai-3' }), undefined);
    assert.equal(base.heroPhotoUrl, '/uploads/hero.webp', '원본 설문의 업로드 URL은 삭제하지 않는다');
  });

  test('히어로 URL intent는 결정적이고 다른 URL을 구분하며 원문을 노출하지 않는다', () => {
    const first = heroImageUrlIntent('data:image/png;base64,VERY-LONG-SECRET');
    assert.equal(first, heroImageUrlIntent('data:image/png;base64,VERY-LONG-SECRET'));
    assert.notEqual(first, heroImageUrlIntent('/uploads/other.webp'));
    assert.ok(!first.includes('VERY-LONG-SECRET'));
  });
});
