/**
 * 서버가 소유하는 사이트 분류 경계.
 *
 * purposeId + industry에서 결정되는 templateId는 스크롤리텔링 절제 게이트의 입력이므로
 * 클라이언트가 보낸 templateId를 그대로 신뢰하지 않는다. 생성 경계에서는 결정적으로 다시
 * 계산하고, 에디터 저장 경계에서는 이미 저장된 분류를 불변 메타로 보존한다.
 */
import { resolveTemplate } from '@/lib/data/site-blueprints';
import type { SurveyInput } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';

/** 정상 설문은 같은 객체를 유지하고, 불일치한 templateId만 서버 계산값으로 교정한다. */
export function canonicalizeSurveyTemplate(survey: SurveyInput): SurveyInput {
  const templateId = resolveTemplate(survey.purposeId, survey.industry).id;
  return survey.templateId === templateId ? survey : { ...survey, templateId };
}

/**
 * 에디터 PATCH는 콘텐츠·SEO 설명을 수정할 수 있지만 생성 시 확정된 purpose/template 분류는
 * 바꿀 수 없다. 저장값에 분류가 없던 레거시는 요청값을 채택하지 않아 fail-closed한다.
 */
export function preserveSiteClassification(
  submitted: SiteConfig,
  persisted: SiteConfig | null | undefined,
): SiteConfig {
  const {
    purposeId: _submittedPurposeId,
    templateId: _submittedTemplateId,
    ...mutableMeta
  } = submitted.meta;
  const purposeId = persisted?.meta.purposeId;
  const templateId = persisted?.meta.templateId;

  return {
    ...submitted,
    meta: {
      ...mutableMeta,
      ...(purposeId !== undefined ? { purposeId } : {}),
      ...(templateId !== undefined ? { templateId } : {}),
    },
  };
}
