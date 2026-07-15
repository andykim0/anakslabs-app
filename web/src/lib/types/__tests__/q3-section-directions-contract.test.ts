import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sectionDirectionSchema,
  siteConfigSchema,
  surveySchema,
} from '@/app/api/_lib/schemas';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { applyGeneratedMotion } from '@/lib/motion/validate';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import {
  emptySiteConfig,
  SECTION_DIRECTION_GUIDES,
  type SectionDirection,
} from '@/lib/types/site';

const candidate: DesignCandidate = {
  id: 'cand-direction-contract',
  label: '디렉션 계약 테스트',
  style: 'photo',
  heroImageUrl: '/mock/hero.svg',
  theme: emptySiteConfig('테스트').theme,
  description: '',
};

function survey(overrides: Partial<SurveyInput> = {}): SurveyInput {
  return {
    businessName: '다보임 테스트',
    purposeId: 'company_brand',
    purpose: '회사 소개',
    industry: '컨설팅',
    tone: ['모던'],
    colorPreference: '블루',
    referenceImageUrls: [],
    sectionPlan: [{ type: 'hero', name: '첫 화면', brief: '', source: 'user' }],
    templateId: 'company-brand',
    ...overrides,
  };
}

const directions: SectionDirection[] = [
  { sectionId: 'sec-hero', intent: 'keep' },
  {
    sectionId: 'sec-contact',
    intent: 'adjust',
    note: '문의 버튼을 조금 더 눈에 띄게',
    guided: ['여백 늘리기', '신뢰 요소 강조'],
  },
];

describe('Q$3 섹션 디렉션 additive 계약', () => {
  test('등록 칩 8개가 단일 소스이고 zod가 미등록 값을 거부한다', () => {
    assert.deepEqual(SECTION_DIRECTION_GUIDES, [
      '더 미니멀',
      '사진 더 크게',
      '톤 더 따뜻하게',
      '여백 늘리기',
      '카피 강조',
      '신뢰 요소 강조',
      '더 역동적으로',
      '색상 차분하게',
    ]);
    for (const guided of SECTION_DIRECTION_GUIDES) {
      assert.equal(
        sectionDirectionSchema.safeParse({ sectionId: 'sec-hero', intent: 'adjust', guided: [guided] }).success,
        true,
      );
    }
    assert.equal(
      sectionDirectionSchema.safeParse({ sectionId: 'sec-hero', intent: 'adjust', guided: ['임의 칩'] }).success,
      false,
    );
  });

  test('surveySchema가 directions를 trim·round-trip하고 레거시 설문도 통과시킨다', () => {
    const parsed = surveySchema.parse(survey({
      directions: [{
        sectionId: '  sec-hero  ',
        intent: 'regenerate',
        note: '  비주얼을 더 강하게  ',
        guided: ['사진 더 크게'],
      }],
    }));
    assert.deepEqual(parsed.directions, [{
      sectionId: 'sec-hero',
      intent: 'regenerate',
      note: '비주얼을 더 강하게',
      guided: ['사진 더 크게'],
    }]);
    assert.equal(surveySchema.safeParse(survey()).success, true);
  });

  test('계약 상한(sectionId 100·note 500·directions 100)을 강제한다', () => {
    assert.equal(sectionDirectionSchema.safeParse({ sectionId: '', intent: 'keep' }).success, false);
    assert.equal(sectionDirectionSchema.safeParse({ sectionId: 'x'.repeat(101), intent: 'keep' }).success, false);
    assert.equal(sectionDirectionSchema.safeParse({ sectionId: 'sec-hero', intent: 'adjust', note: 'x'.repeat(501) }).success, false);
    assert.equal(
      surveySchema.safeParse(survey({ directions: Array.from({ length: 101 }, (_, index) => ({
        sectionId: `sec-${index}`,
        intent: 'keep' as const,
      })) })).success,
      false,
    );
  });

  test('설문 → builder → generate 모션 병합 → SiteConfig 저장 스키마에서 소실되지 않는다', () => {
    const parsedSurvey = surveySchema.parse(survey({ directions })) as SurveyInput;
    const built = buildSiteConfigFromSurvey(parsedSurvey, candidate, {
      heroImageUrl: '/mock/hero.svg',
      imagePool: ['/mock/body.svg'],
    });
    assert.deepEqual(built.directions, directions);
    assert.notEqual(built.directions, parsedSurvey.directions, '저장 config은 설문 배열을 별도로 보존');

    const generatedBoundary = applyGeneratedMotion(built, parsedSurvey.purposeId, 'basic');
    const storedBoundary = siteConfigSchema.parse(generatedBoundary);
    assert.deepEqual(storedBoundary.directions, directions);
  });

  test('siteConfigSchema는 directions를 round-trip하고 없는 레거시 config를 그대로 허용한다', () => {
    const withDirections = { ...emptySiteConfig('다보임'), directions };
    assert.deepEqual(siteConfigSchema.parse(withDirections).directions, directions);

    const legacy = emptySiteConfig('레거시');
    const parsedLegacy = siteConfigSchema.parse(legacy);
    assert.equal(parsedLegacy.directions, undefined);
  });
});
