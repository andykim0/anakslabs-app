import {
  buildZeroCostCandidates,
  buildZeroCostSiteConfig,
} from '@/lib/billing/prepublish-cost-policy';
import {
  pagePlanFromTemplate,
  planFromTemplate,
  resolveTemplate,
} from '@/lib/data/site-blueprints';
import type { SurveyInput } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';

/**
 * 외부 생성 호출 없이 실제 신규 생성기만 통과하는 인테리어 랜딩 예시다.
 * 모든 상호·설명은 가상 예시이며 고객 사실 슬롯이나 발행 경로로 이동하지 않는다.
 */
export async function interiorLandingExampleConfig(): Promise<SiteConfig> {
  const template = resolveTemplate('company_brand', '건설·인테리어 시공');
  const survey: SurveyInput = {
    businessName: '가온 스페이스',
    purposeId: 'company_brand',
    purpose: template.label,
    industry: '건설·인테리어 시공',
    tone: ['차분한', '신뢰감 있는'],
    colorPreference: '#766858',
    referenceImageUrls: [],
    sectionPlan: planFromTemplate(template),
    pagePlan: pagePlanFromTemplate(template),
    templateId: template.id,
    imageDirectionId: 'abstract_editorial',
    highlights: [
      '공간의 쓰임부터 듣습니다',
      '재료와 동선을 함께 살핍니다',
      '진행 과정을 분명하게 전합니다',
    ],
    contentItems: [
      { name: '주거 공간', description: '생활의 흐름을 담는 구성 예시' },
      { name: '상업 공간', description: '브랜드 경험을 잇는 구성 예시' },
      { name: '업무 공간', description: '일하는 방식을 고려한 구성 예시' },
    ],
    contentDepth: {
      version: 2,
      facts: [],
      faqAnswers: [],
      imports: [],
      mainStorytelling: {
        version: 1,
        brandStory: '공간의 목적을 먼저 듣고, 쓰임에 맞는 흐름을 차분하게 제안합니다.',
      },
      surveyBrief: {
        version: 1,
        targetCustomer: '새 공간을 준비하는 사람',
        visitorNeed: '사업 분야와 진행 방식을 확인',
        valueProposition: '공간의 쓰임을 중심에 두는 태도',
        conversionDestination: { kind: 'contact_form' },
      },
    },
  };
  const [candidate] = await buildZeroCostCandidates(survey, {
    templateGalleryEnabled: true,
  });
  if (!candidate) throw new Error('인테리어 예시 구성을 만들 수 없습니다.');
  return buildZeroCostSiteConfig(survey, candidate);
}
