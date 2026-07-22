import { heroVariantForSurvey } from '@/lib/design/reference-gallery';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { isTechniqueId } from '@/lib/motion/registry';
import { resolvePresetForIndustry } from '@/lib/motion/presets';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';
import { withSiteCinematicDefault } from '@/lib/motion/site-cinematic';

/**
 * 후보 카드도 최종 생성과 같은 builder 계약을 사용한다. 390px 축소는 SitePreview가 담당한다.
 * 한 후보 묶음에는 호출자가 고른 동일 사진을 전달해 테마만 비교되도록 한다.
 */
export function buildCandidatePreviewConfig(
  survey: SurveyInput,
  candidate: DesignCandidate,
  heroImageUrl: string,
  heroTechnique?: string,
): SiteConfig {
  const config = withSiteCinematicDefault(buildSiteConfigFromSurvey(survey, candidate, {
    heroImageUrl,
    imagePool: [heroImageUrl],
    heroVariant: heroVariantForSurvey(survey.referenceDesignId, survey.purposeId, candidate.id),
  }));

  if (!heroTechnique || !isTechniqueId(heroTechnique)) return config;
  return {
    ...config,
    motion: {
      presetId: resolvePresetForIndustry(survey.purposeId, 'basic'),
      intensity: 'subtle',
      heroTechnique,
    },
  };
}
