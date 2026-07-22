import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import type { DesignCandidate, LivePurposeId, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig } from '@/lib/types/site';
import { pagePlanFromTemplate, planFromTemplate, resolveTemplate } from '@/lib/data/site-blueprints';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { buildSitePlan } from '@/lib/content/site-plan';
import { buildJsonLd } from '@/lib/seo/jsonld';

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
        { key: 'caseStudies', value: '고객이 입력한 주요 실적·사례', source: 'customer' },
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

function generatedText(survey: SurveyInput, copy?: { aboutTitle?: string; aboutBody?: string }): string {
  const config = buildSiteConfigFromSurvey(survey, candidate, {
    heroImageUrl: '/mock/hero.svg', imagePool: [], copy,
  });
  return config.pages.flatMap((page) => page.sections)
    .flatMap((section) => section.elements)
    .flatMap((element) => element.kind === 'text' ? [element.text] : element.kind === 'button' ? [element.label] : [])
    .join(' ');
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

  test('v2 생성은 레거시 샘플 BUILDERS 디스패치를 구조적으로 우회한다', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/data/site-templates.ts'), 'utf8');
    const v2Builder = source.slice(
      source.indexOf('function buildSitePlanSections'),
      source.indexOf('const BUILDERS:'),
    );
    const configBuilder = source.slice(source.indexOf('export function buildSiteConfigFromSurvey'));
    assert.doesNotMatch(v2Builder, /BUILDERS\[/u);
    assert.match(
      configBuilder,
      /const built:[\s\S]+approvedSitePlan\s*\? buildSitePlanSections\(ctx, approvedSitePlan\)\s*:\s*\(\(\) =>/u,
    );
    assert.ok(configBuilder.indexOf('? buildSitePlanSections(ctx, approvedSitePlan)') < configBuilder.indexOf('BUILDERS[item.type](ctx, item)'));
  });

  test('v2 특화 섹션은 고객 소스만 소비하고 레거시 카피 오버라이드를 무시한다', () => {
    const survey = surveyFor('company_brand', '법률 법인');
    const output = generatedText(survey, {
      aboutTitle: '입력하지 않은 20년 경력과 수상 실적',
      aboutBody: '누적 고객 1만 명과 성공률 99퍼센트',
    });
    assert.doesNotMatch(output, /입력하지 않은|20년 경력|수상 실적|누적 고객|성공률/u);
    assert.match(output, /고객이 직접 입력한 브랜드 이야기/u);
    assert.match(output, /고객이 입력한 업무·서비스/u);
    assert.match(output, /고객이 입력한 경력·자격/u);
  });

  test('전문서비스 특화 섹션은 홈 티저와 /team·/cases 풀 페이지를 함께 갖는다', () => {
    const survey = surveyFor('company_brand', '법률 법인');
    const plan = buildSitePlan(survey);
    assert.equal(plan.templateId, 'company_brand.professional_firm');
    assert.ok(plan.pages.some((page) => page.slug === 'team'));
    assert.ok(plan.pages.some((page) => page.slug === 'cases'));
    assert.ok(plan.sections.some((section) => section.id === 'sec-home-team-teaser'));
    assert.ok(plan.sections.some((section) => section.id === 'sec-home-cases-teaser'));
    const config = buildSiteConfigFromSurvey(survey, candidate, { heroImageUrl: '/mock/hero.svg', imagePool: [] });
    const homeButtons = config.pages.find((page) => page.slug === '')?.sections
      .flatMap((section) => section.elements)
      .flatMap((element) => element.kind === 'button' ? [element.href] : []) ?? [];
    assert.ok(homeButtons.includes('/team'));
    assert.ok(homeButtons.includes('/cases'));
  });

  test('오시는 길은 홈 티저와 /directions 풀 페이지, 문의 폼은 홈에 유지된다', () => {
    const survey = surveyFor('booking_service', '의원');
    const plan = buildSitePlan(survey);
    assert.equal(plan.templateId, 'booking_service.clinic');
    assert.ok(plan.sections.some((section) => section.id === 'sec-home-directions-teaser' && section.pageSlug === ''));
    assert.ok(plan.sections.some((section) => section.id === 'sec-directions' && section.pageSlug === 'directions'));
    assert.ok(plan.sections.some((section) => section.id === 'sec-contact' && section.pageSlug === ''));
  });

  test('resume와 one_page는 티저 복제 없이 모든 보유 콘텐츠를 홈 한 장에 둔다', () => {
    for (const survey of [surveyFor('portfolio', '이력서 CV'), surveyFor('one_page', '링크인바이오')]) {
      const plan = buildSitePlan(survey);
      assert.equal(plan.singlePage, true);
      assert.deepEqual(plan.pages.map((page) => page.slug), ['']);
      assert.equal(plan.sections.some((section) => section.mode === 'teaser'), false);
    }
  });

  test('FAQ 티저는 구조화 FAQ를 소유하지 않고 전체 /faq만 고객 답변 JSON-LD를 갖는다', () => {
    const survey = surveyFor('local_store', '카페');
    const config = buildSiteConfigFromSurvey(survey, candidate, { heroImageUrl: '/mock/hero.svg', imagePool: [] });
    assert.equal(buildJsonLd(config, 'https://plan.example.com', '').some((node) => node['@type'] === 'FAQPage'), false);
    const faq = buildJsonLd(config, 'https://plan.example.com', 'faq').find((node) => node['@type'] === 'FAQPage') as {
      mainEntity?: Array<{ acceptedAnswer?: { text?: string } }>;
    } | undefined;
    assert.equal(faq?.mainEntity?.[0]?.acceptedAnswer?.text, '평일 오전 10시부터 오후 6시까지 운영합니다.');
  });
});
