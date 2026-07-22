import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { DesignCandidate, LivePurposeId, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig } from '@/lib/types/site';
import { pagePlanFromTemplate, planFromTemplate, resolveTemplate } from '@/lib/data/site-blueprints';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { buildSitePlan } from '@/lib/content/site-plan';

const candidate: DesignCandidate = {
  id: 'plan-contract', label: '계획 계약', style: 'photo', heroImageUrl: '/mock/hero.svg',
  theme: emptySiteConfig('계획 계약').theme, description: '',
};

const CASES: readonly [LivePurposeId, string][] = [
  ['local_store', '카페'],
  ['booking_service', '미용실'],
  ['edu_membership', '학원'],
  ['company_brand', '컨설팅'],
  ['portfolio', '디자이너 포트폴리오'],
  ['one_page', '링크인바이오'],
];

function surveyFor(purposeId: LivePurposeId, industry: string): SurveyInput {
  const template = resolveTemplate(purposeId, industry);
  return {
    businessName: `${industry} 계획`, purposeId, purpose: template.label, industry,
    tone: ['차분한'], colorPreference: '#425466', referenceImageUrls: [],
    sectionPlan: planFromTemplate(template), pagePlan: pagePlanFromTemplate(template), templateId: template.id,
    tagline: '고객이 직접 확인한 소개 문장',
    highlights: ['고객이 입력한 대표 강점'],
    contentItems: [
      { name: '고객 입력 항목 A', price: '10,000', description: '고객이 입력한 설명 A' },
      { name: '고객 입력 항목 B', description: '고객이 입력한 설명 B' },
    ],
    existingPresence: [{ kind: 'instagram', url: 'https://www.instagram.com/customer' }],
    contentDepth: {
      version: 2,
      imports: [],
      facts: [
        { key: 'phone', value: '02-123-4567', source: 'customer' },
        { key: 'openingHours', value: '평일 10:00–18:00', source: 'customer' },
        { key: 'address', value: '서울시 고객 입력 주소', source: 'customer' },
        { key: 'directions', value: '고객이 입력한 오시는 길', source: 'customer' },
        { key: 'services', value: '고객이 입력한 업무·서비스', source: 'customer' },
        { key: 'specialties', value: '고객이 입력한 전문 분야', source: 'customer' },
        { key: 'credentials', value: '고객이 입력한 경력·자격', source: 'customer' },
        { key: 'classes', value: '고객이 입력한 과정 구성', source: 'customer' },
      ],
      faqAnswers: [{ questionId: 'hours', answer: '평일 오전 10시부터 오후 6시까지 운영합니다.' }],
      mainStorytelling: {
        version: 1,
        brandStory: '고객이 직접 입력한 브랜드 이야기입니다.',
        philosophy: '고객이 직접 입력한 운영 철학입니다.',
      },
    },
  };
}

function generatedSectionIds(survey: SurveyInput): string[] {
  const config = buildSiteConfigFromSurvey(survey, candidate, {
    heroImageUrl: '/mock/hero.svg', imagePool: [],
  });
  return config.pages.flatMap((page) => page.sections.map((section) => section.id)).sort();
}

describe('PLAN P1 단일 생성 계획 계약', () => {
  for (const [purposeId, industry] of CASES) {
    test(`${purposeId} 승인 SitePlan section id 집합은 생성 결과와 같다`, () => {
      const survey = surveyFor(purposeId, industry);
      const plan = buildSitePlan(survey);
      assert.deepEqual(generatedSectionIds(survey), plan.sections.map((section) => section.id).sort());
      assert.equal(plan.templateId, survey.templateId);
      assert.equal(new Set(plan.sections.map((section) => section.id)).size, plan.sections.length);
    });
  }

  test('데이터 없는 블루프린트 항목은 생성하지 않고 입력 안내로 남긴다', () => {
    const survey = surveyFor('local_store', '카페');
    survey.contentItems = [];
    survey.contentDepth!.faqAnswers = [];
    survey.contentDepth!.facts = survey.contentDepth!.facts.filter(
      (fact) => !['services', 'specialties', 'classes'].includes(fact.key),
    );
    const plan = buildSitePlan(survey);
    assert.ok(plan.absentSections.some((section) => section.type === 'menu' && section.inputHint.includes('입력하면 추가돼요')));
    assert.ok(plan.absentSections.some((section) => section.type === 'gallery'));
    assert.ok(plan.absentSections.some((section) => section.type === 'faq'));
    assert.deepEqual(generatedSectionIds(survey), plan.sections.map((section) => section.id).sort());
  });

  test('승인 단계에서 제외한 선택 항목은 SitePlan과 생성 결과 양쪽에서 함께 사라진다', () => {
    const survey = surveyFor('local_store', '카페');
    survey.sectionPlan = survey.sectionPlan.filter((section) => section.type !== 'menu');
    const plan = buildSitePlan(survey);
    assert.ok(!plan.sections.some((section) => section.id.includes('menu')));
    assert.ok(!generatedSectionIds(survey).some((id) => id.includes('menu')));
  });
});
