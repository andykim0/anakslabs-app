/**
 * [motion 4단계 — V2] 이미지 생성 프롬프트 빌더 (순수 — server-only 없음, 단위 테스트 가능).
 *
 * 표준#1(generation-data) 이행: 색·렌더방식·무드는 DESIGN_POVS/팔레트가 결정하고 LLM은 색을
 * 만들지 않는다(자유 서술 금지). buildImagePrompt(POV 골격) + 매장 장면 한 줄 블렌드.
 * 히어로 이미지 산출물은 video-hero의 poster(Veo 시작 프레임)로 보존된다.
 */
import type { SurveyInput } from '@/lib/types/domain';
import type { CandidateBlueprint } from '@/lib/data/design-candidates';
import { buildImagePrompt, povForStyle } from '@/lib/design/quality-standards';

/**
 * POV 골격 + 매장 장면. 매장 장면은 Claude 다듬기 결과(있고 충분히 길면) 우선, 아니면 설문 결정적.
 * buildImagePrompt가 no-text·negative-space·비율을 강제하므로 자유 서술이 끼어들 여지가 없다.
 */
export function povImagePrompt(
  bp: CandidateBlueprint,
  survey: SurveyInput,
  section: string,
  refinedScene?: string,
): string {
  const povBase = buildImagePrompt(povForStyle(bp.brief.style.id), survey.industry, section, {
    candidateStyle: bp.brief.style.candidateStyle,
    palettePrimary: bp.theme.palette.primary,
    background: bp.theme.palette.background,
  });
  const scene =
    refinedScene && refinedScene.trim().length >= 40
      ? refinedScene.trim()
      : [survey.businessName, survey.tagline].filter(Boolean).join(' — ').trim();
  return scene ? `Scene: ${scene} (${survey.tone}).\n${povBase}` : povBase;
}
