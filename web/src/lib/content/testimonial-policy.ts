import type { SurveyInput, SurveyProofInput } from '@/lib/types/domain';
import type { MotionIndustryClass, Section, SiteConfig } from '@/lib/types/site';
import { surveyIndustryClass } from '@/lib/onboarding/site-classification';

export type TestimonialBlockReason =
  | 'medical-advertising-policy'
  | 'legal-review-state-unavailable';

export interface TestimonialExposurePolicy {
  allowed: boolean;
  reason?: TestimonialBlockReason;
}

/**
 * 후기 노출 업종 정책의 유일한 분기.
 *
 * 의료는 보건의료 광고 리스크에 따라 fail-closed한다. 법률은 스펙의 보수 평가보다 더
 * 엄격하게, 서버 검토 상태가 아직 없으므로 자동 노출을 전부 막는다. 추후 검토 상태가
 * 생기면 이 단일 정책에서 single-quote만 여는 방식을 다시 검토한다.
 */
export function testimonialExposurePolicy(
  industryClass: MotionIndustryClass | undefined,
): TestimonialExposurePolicy {
  if (industryClass === 'medical') {
    return { allowed: false, reason: 'medical-advertising-policy' };
  }
  if (industryClass === 'legal') {
    return { allowed: false, reason: 'legal-review-state-unavailable' };
  }
  return { allowed: true };
}

export function testimonialExposurePolicyForSurvey(
  survey: SurveyInput,
): TestimonialExposurePolicy {
  return testimonialExposurePolicy(surveyIndustryClass(survey));
}

export function testimonialExposurePolicyForConfig(
  config: Pick<SiteConfig, 'meta'>,
): TestimonialExposurePolicy {
  return testimonialExposurePolicy(config.meta.industryClass);
}

/**
 * 게시 가능한 후기의 유일한 소스. presence·빌더·선택은 proofs를 직접 필터하지 않고
 * 반드시 이 projection을 소비한다.
 */
export function permittedTestimonials(survey: SurveyInput): readonly SurveyProofInput[] {
  if (!testimonialExposurePolicyForSurvey(survey).allowed) return [];
  return (survey.contentDepth?.surveyBrief?.proofs ?? []).filter(
    (proof) => proof.kind === 'testimonial'
      && proof.sourceStatus === 'publication_permission'
      && Boolean(proof.content.trim()),
  );
}

export function sectionIsTestimonial(section: Pick<Section, 'type' | 'id'>): boolean {
  return section.type === 'testimonials' || section.id.includes('testimonial');
}

/** 렌더 경계의 이중 방어. 정책이 막은 업종은 저장된 오염 섹션도 방문자에게 내보내지 않는다. */
export function testimonialSectionIsPublic(
  config: Pick<SiteConfig, 'meta'>,
  section: Pick<Section, 'type' | 'id'>,
): boolean {
  return !sectionIsTestimonial(section)
    || testimonialExposurePolicyForConfig(config).allowed;
}
