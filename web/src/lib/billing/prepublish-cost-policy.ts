import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';
import { buildCandidateBlueprintsForPipeline } from '@/lib/data/design-candidates';
import { buildImagePool } from '@/lib/data/image-pool';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { heroVariantForSurvey } from '@/lib/design/reference-gallery';
import { selectedHeroPhotoUrl } from '@/lib/onboarding/hero-image-options';
import { systemHeroPreviewForCandidate } from '@/lib/assets/hero-photo-promotion';

export const PREPUBLISH_GENERATION_POLICY = {
  id: 'standard-zero-variable-cost',
  externalGenerationAllowed: false,
  premiumAssetsAllowed: false,
} as const;

/**
 * The standard pre-publish build is server-authored from catalog data only.
 * No environment flag can reopen a provider call from this path.
 */
export async function buildZeroCostCandidates(survey: SurveyInput): Promise<DesignCandidate[]> {
  const blueprints = await buildCandidateBlueprintsForPipeline(survey);
  const selectedPhoto = selectedHeroPhotoUrl(survey);
  return blueprints.map((blueprint) => {
    const base: DesignCandidate = {
      id: blueprint.id,
      label: blueprint.label,
      style: blueprint.style,
      ...(blueprint.imageDirectionId ? { imageDirectionId: blueprint.imageDirectionId } : {}),
      heroImageUrl: selectedPhoto ?? blueprint.mockHeroUrl,
      theme: blueprint.theme,
      description: blueprint.description,
      ...(blueprint.designDna ? { designDna: blueprint.designDna } : {}),
      ...(blueprint.heroLayoutVariantId
        ? { heroLayoutVariantId: blueprint.heroLayoutVariantId }
        : {}),
      ...(blueprint.sectionLayoutVariantIds
        ? { sectionLayoutVariantIds: blueprint.sectionLayoutVariantIds }
        : {}),
    };
    if (survey.imageDirectionId === 'real_photo' && selectedPhoto) return base;
    return {
      ...base,
      heroImageUrl: systemHeroPreviewForCandidate(base),
      heroPresentation: 'system',
    };
  });
}

/** Deterministic SiteConfig compiler used by initial build and free regeneration. */
export function buildZeroCostSiteConfig(
  survey: SurveyInput,
  candidate: DesignCandidate,
): SiteConfig {
  const selectedPhoto = candidate.heroPresentation === 'promoted_customer_photo'
    ? candidate.heroImageUrl
    : survey.imageDirectionId === 'real_photo'
      ? selectedHeroPhotoUrl(survey)
      : undefined;
  const { heroImageUrl, imagePool } = buildImagePool({
    heroPhoto: selectedPhoto,
    storePhotos: survey.storePhotoUrls,
    aiImages: [],
    heroFallback: candidate.heroImageUrl,
  });
  const heroVariant = heroVariantForSurvey(
    survey.referenceDesignId,
    survey.purposeId,
    candidate.id,
  );
  return buildSiteConfigFromSurvey(survey, candidate, {
    heroImageUrl,
    imagePool,
    heroVariant,
    ...(candidate.heroLayoutVariantId
      ? { heroLayoutVariantId: candidate.heroLayoutVariantId }
      : {}),
    ...(candidate.sectionLayoutVariantIds
      ? { sectionLayoutVariantIds: candidate.sectionLayoutVariantIds }
      : {}),
    ...(candidate.heroAssetRef ? { assetRefs: [candidate.heroAssetRef] } : {}),
  });
}
