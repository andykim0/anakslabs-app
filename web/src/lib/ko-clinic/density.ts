import type { Section, SiteConfig } from '@/lib/types/site';

/**
 * KO-SURVEY desktop home measurements (A=2, B=28, N=30).
 * Content characters use positive non-hero sections. Limits are the observed P10/P90;
 * section count uses P25/P90 to exclude one-section error pages without overfitting the A set.
 * Image-less run uses P90.
 */
export const KO_CLINIC_DENSITY_CONTRACT = Object.freeze({
  version: 1,
  source: '/private/tmp/ko-survey/raw-measurements.json',
  sampleSize: 30,
  sectionBodyCharacters: {
    lower: 42,
    upper: 899,
    lowerQuantile: 'P10',
    upperQuantile: 'P90',
    sampleCount: 111,
  },
  homeSectionCount: {
    lower: 4,
    upper: 8,
    lowerQuantile: 'P25',
    upperQuantile: 'P90',
  },
  maximumConsecutiveImageLessSections: {
    value: 3,
    quantile: 'P90',
  },
});

const STRUCTURED_LOW_DENSITY_VARIANTS = new Set([
  'features.stat-strip',
  'features.dark-value-band',
]);

function visibleSectionCharacters(section: Section): number {
  const sectionTitleId = section.elements.find((element) => (
    element.kind === 'text'
    && (
      element.id === `${section.id}-layout-title`
      || element.id.endsWith('-layout-title')
    )
    && element.text.trim() === section.name.trim()
  ))?.id;
  return section.elements.reduce((sum, element) => (
    element.kind === 'text'
    && element.id !== sectionTitleId
    && !element.id.includes('-source-breadcrumb-metadata')
      ? sum + [...element.text.replace(/\s/gu, '')].length
      : sum
  ), 0);
}

function hasImage(section: Section): boolean {
  return Boolean(
    section.background.image
    || section.elements.some((element) => element.kind === 'image' || element.kind === 'video'),
  );
}

export interface KoClinicDensityAudit {
  homeSectionCount: number;
  homeSectionRangePass: boolean;
  sectionCharacterCounts: {
    sectionId: string;
    variant: string;
    characters: number;
    lowerBoundApplies: boolean;
    pass: boolean;
  }[];
  maximumConsecutiveImageLessSections: number;
  imageLessRunPass: boolean;
  pass: boolean;
}

export function auditKoClinicDensity(config: SiteConfig): KoClinicDensityAudit {
  const home = config.pages.find((page) => page.slug === '') ?? config.pages[0];
  const sections = home?.sections.filter((section) => !section.hidden) ?? [];
  const sectionCharacterCounts = sections
    .filter((section) => section.type !== 'hero')
    .map((section) => {
      const variant = section.sectionLayout?.resolvedId ?? `${section.type}.source-flow`;
      const characters = visibleSectionCharacters(section);
      const lowerBoundApplies = !hasImage(section)
        && !STRUCTURED_LOW_DENSITY_VARIANTS.has(variant);
      const lowerPass = !lowerBoundApplies
        || characters >= KO_CLINIC_DENSITY_CONTRACT.sectionBodyCharacters.lower;
      return {
        sectionId: section.id,
        variant,
        characters,
        lowerBoundApplies,
        pass: lowerPass
          && characters <= KO_CLINIC_DENSITY_CONTRACT.sectionBodyCharacters.upper,
      };
    });
  let currentRun = 0;
  let maximumRun = 0;
  for (const section of sections) {
    if (hasImage(section)) currentRun = 0;
    else {
      currentRun += 1;
      maximumRun = Math.max(maximumRun, currentRun);
    }
  }
  const homeSectionRangePass = (
    sections.length >= KO_CLINIC_DENSITY_CONTRACT.homeSectionCount.lower
    && sections.length <= KO_CLINIC_DENSITY_CONTRACT.homeSectionCount.upper
  );
  const imageLessRunPass = (
    maximumRun
    <= KO_CLINIC_DENSITY_CONTRACT.maximumConsecutiveImageLessSections.value
  );
  return {
    homeSectionCount: sections.length,
    homeSectionRangePass,
    sectionCharacterCounts,
    maximumConsecutiveImageLessSections: maximumRun,
    imageLessRunPass,
    pass: homeSectionRangePass
      && imageLessRunPass
      && sectionCharacterCounts.every((entry) => entry.pass),
  };
}
