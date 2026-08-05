/**
 * 서버가 소유하는 사이트 분류 경계.
 *
 * purposeId + industry에서 결정되는 templateId는 스크롤리텔링 절제 게이트의 입력이므로
 * 클라이언트가 보낸 templateId를 그대로 신뢰하지 않는다. 생성 경계에서는 결정적으로 다시
 * 계산하고, 에디터 저장 경계에서는 이미 저장된 분류를 불변 메타로 보존한다.
 */
import { resolveTemplate } from '@/lib/data/site-blueprints';
import { canonicalIndustryClass } from '@/lib/motion/signatures';
import type { SurveyInput } from '@/lib/types/domain';
import type { MotionIndustryClass, SiteConfig } from '@/lib/types/site';
import { siteIndustryIdForSurvey } from '@/lib/industry/profiles';

/** 자유문장 업종을 직접 소비하지 않는 서버 권위 설문 분류 단일 소스. */
export function surveyIndustryClass(survey: SurveyInput): MotionIndustryClass {
  const templateId = resolveTemplate(survey.purposeId, survey.industry).id;
  return canonicalIndustryClass(survey.purposeId, templateId, survey.industry);
}

/** templateId와 industryClass는 모두 서버 계산값으로 덮어써 민감 기능의 자유문장 우회를 막는다. */
export function canonicalizeSurveyTemplate(survey: SurveyInput): SurveyInput {
  const templateId = resolveTemplate(survey.purposeId, survey.industry).id;
  const industryClass = surveyIndustryClass(survey);
  return survey.templateId === templateId && survey.industryClass === industryClass
    ? survey
    : { ...survey, templateId, industryClass };
}

export { siteIndustryIdForSurvey };

/**
 * 에디터 PATCH는 콘텐츠·SEO 설명을 수정할 수 있지만 생성 시 확정된 purpose/template 및
 * locale/jurisdiction/timezone 분류는 바꿀 수 없다. 저장값에 분류가 없던 레거시는 요청값을 채택하지
 * 않아 fail-closed한다.
 */
export function preserveSiteClassification(
  submitted: SiteConfig,
  persisted: SiteConfig | null | undefined,
): SiteConfig {
  const mutableMeta = { ...submitted.meta };
  Reflect.deleteProperty(mutableMeta, 'purposeId');
  Reflect.deleteProperty(mutableMeta, 'templateId');
  Reflect.deleteProperty(mutableMeta, 'industryClass');
  Reflect.deleteProperty(mutableMeta, 'industryId');
  Reflect.deleteProperty(mutableMeta, 'locale');
  Reflect.deleteProperty(mutableMeta, 'jurisdiction');
  Reflect.deleteProperty(mutableMeta, 'timezone');
  const purposeId = persisted?.meta.purposeId;
  const templateId = persisted?.meta.templateId;
  const industryClass = persisted?.meta.industryClass;
  const industryId = persisted?.meta.industryId;
  const locale = persisted?.meta.locale;
  const jurisdiction = persisted?.meta.jurisdiction;
  const timezone = persisted?.meta.timezone;

  return {
    ...submitted,
    meta: {
      ...mutableMeta,
      ...(purposeId !== undefined ? { purposeId } : {}),
      ...(templateId !== undefined ? { templateId } : {}),
      ...(industryClass !== undefined ? { industryClass } : {}),
      ...(industryId !== undefined ? { industryId } : {}),
      ...(locale !== undefined ? { locale } : {}),
      ...(jurisdiction !== undefined ? { jurisdiction } : {}),
      ...(timezone !== undefined ? { timezone } : {}),
    },
  };
}
