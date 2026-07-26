import { resolveTemplate } from '@/lib/data/site-blueprints';
import type { SurveyInput } from '@/lib/types/domain';

export const INDUSTRY_PROFILE_IDS = ['interior', 'clinic'] as const;
export type IndustryProfileId = (typeof INDUSTRY_PROFILE_IDS)[number];

export const SITE_INDUSTRY_IDS = INDUSTRY_PROFILE_IDS;
export type SiteIndustryId = IndustryProfileId;

export const INTERIOR_INDUSTRY_LABEL = '건설·인테리어 시공' as const;

/**
 * 가격이나 계약 상태를 포함하지 않는 렌더용 업종 식별자다. 신규 생성 경계가
 * 서버 검증된 설문 원본에서만 기록하며, 고객 draft 값은 권위로 사용하지 않는다.
 */
export function siteIndustryIdForSurvey(
  survey: Pick<SurveyInput, 'purposeId' | 'industry'>,
): SiteIndustryId | null {
  if (
    survey.purposeId === 'company_brand'
    && survey.industry.trim() === INTERIOR_INDUSTRY_LABEL
  ) {
    return 'interior';
  }
  if (
    survey.purposeId === 'booking_service'
    && resolveTemplate(survey.purposeId, survey.industry).id === 'booking_service.clinic'
  ) {
    return 'clinic';
  }
  return null;
}

/** 계약 프로파일 선택도 같은 서버 택소노미 경계를 소비한다. */
export function industryProfileIdForSurvey(
  survey: Pick<SurveyInput, 'purposeId' | 'industry'>,
): IndustryProfileId | null {
  return siteIndustryIdForSurvey(survey);
}
