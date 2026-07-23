import {
  pagePlanFromTemplate,
  planFromTemplate,
  resolveTemplate,
} from '@/lib/data/site-blueprints';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { expandTokens, tokenSetToSiteTheme } from '@/lib/design/dna';
import type { DesignCandidate, LivePurposeId, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';

export interface Seo100DogfoodSeed {
  id: string;
  purposeId: LivePurposeId;
  industry: string;
  dark?: boolean;
}

/** 목적 기본 6종 + 업종 오버라이드 4종 + 다크 DNA 1종. */
export const SEO100_DOGFOOD_SEEDS: readonly Seo100DogfoodSeed[] = [
  { id: 'local-store', purposeId: 'local_store', industry: '카페' },
  { id: 'booking-service', purposeId: 'booking_service', industry: '미용실' },
  { id: 'edu-membership', purposeId: 'edu_membership', industry: '학원' },
  { id: 'company-brand', purposeId: 'company_brand', industry: '컨설팅' },
  { id: 'portfolio', purposeId: 'portfolio', industry: '디자이너 포트폴리오' },
  { id: 'one-page', purposeId: 'one_page', industry: '링크인바이오' },
  { id: 'professional-firm', purposeId: 'company_brand', industry: '법률 법인' },
  { id: 'clinic', purposeId: 'booking_service', industry: '의원' },
  { id: 'fine-dining', purposeId: 'local_store', industry: '파인다이닝' },
  { id: 'resume', purposeId: 'portfolio', industry: '이력서 CV' },
  { id: 'dark-dna', purposeId: 'local_store', industry: '카페', dark: true },
];

export function seo100SurveyFor(seed: Seo100DogfoodSeed): SurveyInput {
  const template = resolveTemplate(seed.purposeId, seed.industry);
  return {
    businessName: `${seed.industry} 계획`,
    purposeId: seed.purposeId,
    purpose: template.label,
    industry: seed.industry,
    region: '서울',
    tone: ['차분한'],
    colorPreference: '고객 선택색',
    referenceImageUrls: [],
    sectionPlan: planFromTemplate(template),
    pagePlan: pagePlanFromTemplate(template),
    templateId: template.id,
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
        { key: 'address', value: '서울특별시 성동구 고객로 12', source: 'customer' },
        { key: 'directions', value: '고객이 입력한 오시는 길', source: 'customer' },
        { key: 'services', value: '고객이 입력한 업무·서비스', source: 'customer' },
        { key: 'specialties', value: '고객이 입력한 전문 분야', source: 'customer' },
        { key: 'credentials', value: '고객이 입력한 경력·자격', source: 'customer' },
        { key: 'caseStudies', value: '고객이 입력한 주요 실적·사례', source: 'customer' },
        { key: 'classes', value: '고객이 입력한 과정 구성', source: 'customer' },
      ],
      faqAnswers: [
        { questionId: 'hours', answer: '평일 오전 10시부터 오후 6시까지 운영합니다.' },
      ],
      mainStorytelling: {
        version: 1,
        brandStory: '고객이 직접 입력한 브랜드 이야기입니다.',
        philosophy: '고객이 직접 입력한 운영 철학입니다.',
      },
    },
  };
}

export function seo100ConfigFor(
  seed: Seo100DogfoodSeed,
  heroImageUrl = '/mock/mintwash-hero.svg',
): SiteConfig {
  const survey = seo100SurveyFor(seed);
  const theme = seed.dark
    ? tokenSetToSiteTheme(expandTokens('dining-refined-contrast', 28))
    : emptySiteConfig('SEO100').theme;
  const candidate: DesignCandidate = {
    id: `seo100-${seed.id}`,
    label: seed.id,
    style: 'photo',
    heroImageUrl,
    theme,
    description: '',
  };
  const config = buildSiteConfigFromSurvey(survey, candidate, {
    heroImageUrl,
    imagePool: [],
  });
  config.businessInfo = {
    businessName: survey.businessName,
    ownerName: '고객 입력 대표자',
    businessNumber: '123-45-67890',
    address: '서울특별시 성동구 고객로 12',
    phone: '02-123-4567',
  };
  return config;
}
