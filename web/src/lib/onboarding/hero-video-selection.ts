import type { SurveyInput } from '@/lib/types/domain';
import type { MotionChoice } from '@/lib/motion/validate';
import { isHeroVideoMotionId } from '@/lib/motion/hero-video-motions';
import type { HeroImageSelection } from '@/lib/onboarding/hero-image-options';

/** W4 클라이언트 선택을 SurveyInput의 additive 저장 계약으로 접는다. */
export function surveyWithHeroVideoSelection(
  survey: SurveyInput,
  heroImage: HeroImageSelection,
  choice: Pick<MotionChoice, 'heroTechnique' | 'heroMotionId'> | undefined,
): SurveyInput {
  const videoAddon = choice?.heroTechnique === 'video-hero';
  return {
    ...survey,
    heroImageChoice: heroImage.id,
    videoAddon,
    heroMotionId:
      videoAddon && isHeroVideoMotionId(choice?.heroMotionId)
        ? choice.heroMotionId
        : undefined,
  };
}

/** W4 서버 저장 경계: SurveyInput에 기록된 선택을 클라이언트 motionChoice보다 우선한다. */

export function authoritativeHeroVideoChoice(
  survey: SurveyInput,
  choice: MotionChoice | undefined,
): MotionChoice | undefined {
  const hasWSelection =
    survey.heroImageChoice !== undefined ||
    survey.videoAddon !== undefined ||
    survey.heroMotionId !== undefined;
  if (!choice && !hasWSelection) return undefined;

  return {
    ...(choice ?? {}),
    ...(survey.heroImageChoice !== undefined ? { heroImageChoice: survey.heroImageChoice } : {}),
    ...(survey.videoAddon !== undefined ? { videoAddon: survey.videoAddon } : {}),
    ...(survey.heroMotionId !== undefined ? { heroMotionId: survey.heroMotionId } : {}),
  };
}
