import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type {
  DesignCandidate,
  LivePurposeId,
  SurveyInput,
} from '@/lib/types/domain';
import { buildImagePrompt, NO_TEXT_DIRECTIVE } from '@/lib/design/quality-standards';
import {
  FAITHFUL_PHOTO_MOTION_DIRECTIVE,
  INDUSTRY_SUBJECT_SAFETY,
  MOOD_SUBJECTS,
  PRODUCT_AVOID,
  PRODUCT_SAFETY_DIRECTIVE,
  RELAXED_BRAND_SAFETY_DIRECTIVE,
  resolveIndustrySubjectSafety,
  resolveMoodSubjectId,
  type IndustrySubjectClassId,
  type MoodSubjectId,
} from '@/lib/design/image-subjects';
import { PURPOSES } from '@/lib/data/purpose-taxonomy';
import { buildCandidateBlueprints } from '@/lib/data/design-candidates';
import { buildImagePool } from '@/lib/data/image-pool';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import {
  pagePlanFromTemplate,
  planFromTemplate,
  resolveTemplate,
} from '@/lib/data/site-blueprints';
import { buildMotionPrompt, heroVideoContext } from '@/lib/ai/video-pipeline-core';

const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;
const INVENTED_PRODUCT =
  /steak|pasta|latte|croissant|plated dish|menu item|product closeup|hairstyle|nail art|treatment result/i;

interface IndustryClassSeed {
  id: Exclude<IndustrySubjectClassId, 'general'>;
  purposeId: LivePurposeId;
  purpose: string;
  industry: string;
  tone: string[];
  mood: MoodSubjectId;
  strict: boolean;
}

/** 특정 상호·데모 프로필이 아니라 실제 온보딩 taxonomy의 업종 클래스 대표값만 사용한다. */
const INDUSTRY_CLASS_SEEDS: IndustryClassSeed[] = [
  {
    id: 'restaurant',
    purposeId: 'local_store',
    purpose: '음식점·로컬 매장',
    industry: '파인다이닝·오마카세',
    tone: ['고급스러운'],
    mood: 'elegant',
    strict: true,
  },
  {
    id: 'cafe',
    purposeId: 'local_store',
    purpose: '음식점·로컬 매장',
    industry: '카페·디저트',
    tone: ['친근한'],
    mood: 'warm',
    strict: true,
  },
  {
    id: 'beauty',
    purposeId: 'booking_service',
    purpose: '예약·서비스업',
    industry: '미용실·바버샵',
    tone: ['차분한'],
    mood: 'calm',
    strict: true,
  },
  {
    id: 'medical',
    purposeId: 'booking_service',
    purpose: '예약·서비스업',
    industry: '병원·의원',
    tone: ['미니멀'],
    mood: 'modern',
    strict: true,
  },
  {
    id: 'education',
    purposeId: 'edu_membership',
    purpose: '학원·교육',
    industry: '입시·보습학원',
    tone: ['따뜻한'],
    mood: 'warm',
    strict: true,
  },
  {
    id: 'company',
    purposeId: 'company_brand',
    purpose: '회사·브랜드',
    industry: '스타트업·IT/SaaS',
    tone: ['모던'],
    mood: 'modern',
    strict: false,
  },
  {
    id: 'portfolio',
    purposeId: 'portfolio',
    purpose: '포트폴리오',
    industry: '그래픽·UXUI 디자이너',
    tone: ['대담한'],
    mood: 'energetic',
    strict: false,
  },
];

function survey(seed: IndustryClassSeed, over: Partial<SurveyInput> = {}): SurveyInput {
  const template = resolveTemplate(seed.purposeId, seed.industry);
  return {
    businessName: 'Generic Business',
    purposeId: seed.purposeId,
    purpose: seed.purpose,
    industry: seed.industry,
    tone: seed.tone,
    colorPreference: '#5b6472',
    referenceImageUrls: [],
    sectionPlan: planFromTemplate(template),
    pagePlan: pagePlanFromTemplate(template),
    templateId: template.id,
    ...over,
  };
}

function candidateFor(input: SurveyInput, heroImageUrl: string): DesignCandidate {
  const blueprint = buildCandidateBlueprints(input)[0];
  return {
    id: blueprint.id,
    label: blueprint.label,
    style: blueprint.style,
    heroImageUrl,
    theme: blueprint.theme,
    description: blueprint.description,
  };
}

describe('H5 — 일반 업종 클래스 buildImagePrompt 불변식', () => {
  for (const seed of INDUSTRY_CLASS_SEEDS) {
    test(`${seed.id}: taxonomy + ambient + 업종 안전 강도 + T2`, () => {
      const purpose = PURPOSES.find((item) => item.id === seed.purposeId);
      assert.ok(purpose?.industries.includes(seed.industry), `${seed.id}: 실제 taxonomy 대표값 아님`);
      assert.equal(INDUSTRY_SUBJECT_SAFETY[seed.id].strict, seed.strict);

      const safety = resolveIndustrySubjectSafety({
        purposeId: seed.purposeId,
        industry: seed.industry,
      });
      assert.deepEqual(safety, { id: seed.id, strict: seed.strict });

      const prompt = buildImagePrompt('editorial', seed.industry, 'hero', {
        candidateStyle: 'photo',
        palettePrimary: '#5b6472',
        background: '#f4f5f7',
        tone: seed.tone,
        purposeId: seed.purposeId,
      });
      const positive = prompt.split(PRODUCT_SAFETY_DIRECTIVE)[0];
      const moodId = resolveMoodSubjectId(seed.tone);

      assert.equal(moodId, seed.mood);
      assert.ok(MOOD_SUBJECTS[moodId].ambient.some((subject) => positive.includes(subject)), prompt);
      assert.doesNotMatch(positive, INVENTED_PRODUCT, `양의 제품 피사체가 남음: ${positive}`);
      assert.ok(prompt.includes(PRODUCT_SAFETY_DIRECTIVE));

      if (seed.strict) {
        for (const avoided of PRODUCT_AVOID) assert.ok(prompt.includes(avoided), avoided);
        assert.ok(!prompt.includes(RELAXED_BRAND_SAFETY_DIRECTIVE));
      } else {
        assert.ok(prompt.includes(RELAXED_BRAND_SAFETY_DIRECTIVE));
        for (const avoided of PRODUCT_AVOID) assert.ok(!prompt.includes(avoided), avoided);
      }

      assert.ok(prompt.includes(NO_TEXT_DIRECTIVE));
      assert.doesNotMatch(prompt, HANGUL);
      assert.doesNotMatch(prompt, /#/);

      // 실제 후보 생성 경로도 purposeId를 잃지 않고 동일한 strict/relaxed 지시를 쓴다.
      const candidatePrompt = buildCandidateBlueprints(survey(seed))[0].heroImagePrompt;
      assert.equal(candidatePrompt.includes(RELAXED_BRAND_SAFETY_DIRECTIVE), !seed.strict);
    });
  }

  test('미지 업종·미지 목적은 fail-closed strict:true', () => {
    assert.deepEqual(resolveIndustrySubjectSafety({ industry: 'unclassified activity' }), {
      id: 'general',
      strict: true,
    });
    assert.deepEqual(
      resolveIndustrySubjectSafety({ purposeId: 'unknown-purpose', industry: 'startup company' }),
      { id: 'general', strict: true },
    );
    const prompt = buildImagePrompt('editorial', 'unclassified activity', 'hero', {
      candidateStyle: 'photo',
      tone: ['calm'],
    });
    for (const avoided of PRODUCT_AVOID) assert.ok(prompt.includes(avoided), avoided);
  });
});

describe('H5 — 일반 업종 클래스 hero source → Veo 스모크', () => {
  test('대표 사진 없음: 업종 제품이 아닌 AI 무드 이미지가 시작 이미지', () => {
    const seed = INDUSTRY_CLASS_SEEDS.find((item) => item.id === 'restaurant')!;
    const input = survey(seed);
    const blueprint = buildCandidateBlueprints(input)[0];
    const generatedMoodImage = '/generated/industry-class-mood.webp';
    const imagePositive = blueprint.heroImagePrompt.split(PRODUCT_SAFETY_DIRECTIVE)[0];
    assert.ok(MOOD_SUBJECTS.elegant.ambient.some((subject) => imagePositive.includes(subject)));
    assert.doesNotMatch(imagePositive, INVENTED_PRODUCT);

    const { heroImageUrl, imagePool } = buildImagePool({
      storePhotos: ['/industry-class/real-interior.webp'],
      aiImages: ['/industry-class/ambient-detail.webp'],
      heroFallback: generatedMoodImage,
    });
    const config = buildSiteConfigFromSurvey(input, candidateFor(input, heroImageUrl), {
      heroImageUrl,
      imagePool,
    });
    const context = heroVideoContext(config, { tone: input.tone });
    assert.ok(context);
    assert.equal(context.source, 'ambient-ai');
    assert.equal(context.heroImageUrl, generatedMoodImage);

    const videoPrompt = buildMotionPrompt(context.povMood, context.source);
    const videoPositive = videoPrompt.split(PRODUCT_SAFETY_DIRECTIVE)[0];
    assert.ok(MOOD_SUBJECTS.elegant.ambient.some((subject) => videoPositive.includes(subject)));
    assert.doesNotMatch(videoPositive, INVENTED_PRODUCT);
    assert.ok(videoPrompt.includes(PRODUCT_SAFETY_DIRECTIVE));
  });

  test('대표 사진 있음: 정확한 URL이 시작 이미지이고 원본 충실 모션만 허용', () => {
    const seed = INDUSTRY_CLASS_SEEDS.find((item) => item.id === 'beauty')!;
    const heroPhotoUrl = 'https://assets.example.com/industry-class/representative.webp';
    const galleryPhoto = 'https://assets.example.com/industry-class/gallery.webp';
    const input = survey(seed, { heroPhotoUrl, storePhotoUrls: [galleryPhoto, heroPhotoUrl] });
    const blueprint = buildCandidateBlueprints(input)[0];
    const { heroImageUrl, imagePool } = buildImagePool({
      heroPhoto: input.heroPhotoUrl,
      storePhotos: input.storePhotoUrls,
      aiImages: ['/industry-class/ambient-detail.webp'],
      heroFallback: blueprint.mockHeroUrl,
    });

    assert.equal(heroImageUrl, heroPhotoUrl);
    assert.deepEqual(imagePool, [galleryPhoto, '/industry-class/ambient-detail.webp']);
    const config = buildSiteConfigFromSurvey(input, candidateFor(input, heroImageUrl), {
      heroImageUrl,
      imagePool,
    });
    const context = heroVideoContext(config, { tone: input.tone, heroPhotoUrl: input.heroPhotoUrl });
    assert.ok(context);
    assert.equal(context.heroImageUrl, heroPhotoUrl);
    assert.equal(context.source, 'uploaded-photo');

    const videoPrompt = buildMotionPrompt(context.povMood, context.source);
    assert.ok(videoPrompt.includes(FAITHFUL_PHOTO_MOTION_DIRECTIVE));
    assert.match(videoPrompt, /preserve the source photograph and every subject exactly/i);
    assert.match(videoPrompt, /do NOT add, remove, replace, restyle, or alter objects/);
    assert.doesNotMatch(videoPrompt, /Ambient focus:/);
  });
});
