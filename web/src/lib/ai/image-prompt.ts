/**
 * [motion 4단계 — V2] 이미지 생성 프롬프트 빌더 (순수 — server-only 없음, 단위 테스트 가능).
 *
 * 표준#1(generation-data) 이행: 색·렌더방식·무드는 DESIGN_POVS/팔레트가 결정하고 LLM은 색을
 * 만들지 않는다(자유 서술 금지). buildImagePrompt가 안전한 업종 공간을 사진 촬영 정보로 확장한다.
 * 히어로 이미지 산출물은 video-hero의 poster(Veo 시작 프레임)로 보존된다.
 *
 * [T2] 이미지 모델은 (특히 한글) 타이포를 그리지 못한다 — 상호·태그라인·톤 등 한글 주입을 전면
 * 제거하고 업종은 영어 디스크립터(industryDescriptor)로만. 최종 문자열은 stripHangul 안전망 통과
 * (Claude가 다듬은 refinedScene에 한글이 섞여도 각인 위험 차단). 글자가 필요한 디자인은 이미지에
 * 굽지 않고 HTML 오버레이로 얹는다(시스템 원칙).
 */
import type { SurveyInput } from '@/lib/types/domain';
import type { CandidateBlueprint } from '@/lib/data/design-candidates';
import type { ImageDirectionId } from '@/lib/assets/image-directions';
import {
  buildImagePrompt,
  buildV2ImagePrompt,
  povForStyle,
} from '@/lib/design/quality-standards';

/**
 * POV 골격 + tone 기반 ambient 장면. refinedScene은 레거시 호출 호환을 위해 인자로 유지하지만,
 * 제품·시술 결과를 양의 피사체로 되살릴 수 있는 자유 텍스트이므로 생성 프롬프트에는 사용하지 않는다.
 * buildImagePrompt가 안전 피사체·사진 확장·NO_TEXT_DIRECTIVE·히어로 copy-space를 강제한다.
 */
export function povImagePrompt(
  bp: CandidateBlueprint,
  survey: SurveyInput,
  section: string,
  refinedScene?: string,
): string {
  // API 호환용 인자. 의도적으로 읽거나 출력하지 않는다(Claude 자유 피사체 우회 차단).
  void refinedScene;
  return buildImagePrompt(povForStyle(bp.brief.style.id), survey.industry, section, {
    candidateStyle: bp.brief.style.candidateStyle,
    palettePrimary: bp.theme.palette.primary,
    background: bp.theme.palette.background,
    tone: survey.tone,
    purposeId: survey.purposeId,
  });
}

/** v2 callers must pass a resolved non-real direction from the server policy. */
export function v2ImagePrompt(
  bp: CandidateBlueprint,
  survey: SurveyInput,
  section: string,
  imageDirectionId: Exclude<ImageDirectionId, 'real_photo' | 'realistic'>,
): string {
  return buildV2ImagePrompt(povForStyle(bp.brief.style.id), section, {
    imageDirectionId,
    palettePrimary: bp.theme.palette.primary,
    background: bp.theme.palette.background,
    tone: survey.tone,
  });
}
