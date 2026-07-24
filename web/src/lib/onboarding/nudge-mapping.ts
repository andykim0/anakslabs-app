import type { SurveyInput } from '@/lib/types/domain';
import { scanRuleFor } from '@/lib/scan/rule-registry';
import type { OnboardingNudgeId } from './nudge-contract';

export type { OnboardingNudgeId } from './nudge-contract';

export interface OnboardingNudgeDefinition {
  id: OnboardingNudgeId;
  fieldPaths: readonly string[];
  ruleCodes: readonly string[];
  badge: string;
  incompleteMessage: string;
  completeMessage: string;
}

/**
 * 입력과 진단 규칙의 연결만 소유한다. 점수·weight·판정식은 scan/*가 계속 단독 소유하며,
 * 이 데이터는 프롬프트나 클라이언트에 산식을 노출하지 않는다.
 */
export const ONBOARDING_NUDGE_MAPPING: readonly OnboardingNudgeDefinition[] = [
  {
    id: 'public-contact',
    fieldPaths: ['factualAnswers.phone', 'factualAnswers.address'],
    ruleCodes: ['aeo_local_business_details', 'geo_business_info'],
    badge: '전화·주소가 AEO·GEO 점수를 올려요',
    incompleteMessage: '실제 전화번호와 주소를 모두 입력하면 이 항목이 만점이 돼요.',
    completeMessage: '전화번호와 주소가 홈페이지 화면과 구조화 정보에 같은 값으로 반영돼요.',
  },
  {
    id: 'metric-source',
    fieldPaths: ['proofItems.metric.sourceUrl', 'proofItems.metric.publisher', 'proofItems.metric.asOfDate'],
    ruleCodes: ['geo_unsourced_claims'],
    badge: '수치의 출처가 GEO 점수를 지켜줘요',
    incompleteMessage: '출처 없는 수치는 검색 신뢰 감점 대상이에요. 출처를 추가하거나 수치를 빼주세요.',
    completeMessage: '수치와 같은 구역에 원문 출처가 함께 표시돼요.',
  },
] as const;

export function assertNudgeMappingUsesScanRegistry(): void {
  for (const mapping of ONBOARDING_NUDGE_MAPPING) {
    for (const code of mapping.ruleCodes) {
      const rule = scanRuleFor(code);
      if (!rule) throw new Error(`온보딩 넛지에 등록되지 않은 진단 규칙이 연결됐습니다: ${code}`);
      if (rule.ownership !== 'customer') {
        throw new Error(`고객 입력 넛지는 customer 소유 규칙만 연결할 수 있습니다: ${code}`);
      }
    }
  }
}

export function nudgeInputComplete(survey: SurveyInput, id: OnboardingNudgeId): boolean {
  if (id === 'public-contact') {
    const facts = new Map(
      (survey.contentDepth?.facts ?? []).map((fact) => [fact.key, fact.value.trim()]),
    );
    return Boolean(facts.get('phone') && facts.get('address'));
  }
  const metrics = (survey.contentDepth?.surveyBrief?.proofs ?? [])
    .filter((proof) => proof.kind === 'metric' && proof.content.trim());
  return metrics.length > 0 && metrics.every((proof) => Boolean(proof.sourceUrl?.trim()));
}
