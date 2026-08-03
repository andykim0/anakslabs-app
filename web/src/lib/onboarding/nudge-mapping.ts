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
    badge: 'Phone and address strengthen AEO and GEO signals',
    incompleteMessage: 'Add a real phone number and address to complete this item.',
    completeMessage: 'The same phone number and address now appear in the page and structured data.',
  },
  {
    id: 'metric-source',
    fieldPaths: ['proofItems.metric.sourceUrl', 'proofItems.metric.publisher', 'proofItems.metric.asOfDate'],
    ruleCodes: ['geo_unsourced_claims'],
    badge: 'Sources protect the credibility of numbers',
    incompleteMessage: 'A number without a source weakens trust. Add its source or remove the number.',
    completeMessage: 'The original source appears beside the number it supports.',
  },
] as const;

export function assertNudgeMappingUsesScanRegistry(): void {
  for (const mapping of ONBOARDING_NUDGE_MAPPING) {
    for (const code of mapping.ruleCodes) {
      const rule = scanRuleFor(code);
      if (!rule) throw new Error(`Diagnostic rule not registered for an onboarding nudge: ${code}`);
      if (rule.ownership !== 'customer') {
        throw new Error(`Customer input nudges can only use customer-owned rules: ${code}`);
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
