import type {
  HeroLayoutAuthoredIndustry,
  HeroLayoutIndustryAffinity,
} from './types';
import type { SectionLayoutCompatibility } from './section-layout-types';

export function sectionCompatibility(
  recommended: readonly HeroLayoutAuthoredIndustry[],
  allowed: readonly HeroLayoutAuthoredIndustry[],
  preferredDna: SectionLayoutCompatibility['preferredDna'],
  avoidedDna: SectionLayoutCompatibility['avoidedDna'] = [],
): SectionLayoutCompatibility {
  const recommendedSet = new Set(recommended);
  const allowedSet = new Set(allowed);
  const industry = Object.fromEntries([
    'cafe',
    'fine_dining',
    'beauty',
    'medical',
    'legal',
    'consulting',
    'workshop',
    'retail',
    'portfolio',
    'academy',
  ].map((id) => [
    id,
    recommendedSet.has(id as HeroLayoutAuthoredIndustry)
      ? 'recommended'
      : allowedSet.has(id as HeroLayoutAuthoredIndustry)
        ? 'allowed'
        : 'discouraged',
  ])) as Record<HeroLayoutAuthoredIndustry, HeroLayoutIndustryAffinity>;
  return { industry, preferredDna, avoidedDna };
}
