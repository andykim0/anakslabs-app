import { aboutLayoutById } from '@/lib/layout/about-catalog';
import { heroLayoutById } from '@/lib/layout/catalog';
import type { DesignDnaId } from '@/lib/design/dna/types';
import type {
  SignatureBreakpointBand,
  SignatureTextSafeZoneId,
} from '@/lib/motion/signature-contract';
import type { MotionIndustryClass, Section, SiteConfig } from '@/lib/types/site';
import { resolveAbsFamily } from './resolver';
import { stableIndex, stableSeedHex } from './seed';
import type {
  AbsAtmosphericSlotId,
  AbsIndustryId,
  AbsWeightZone,
  ProceduralBackgroundSpec,
} from './types';
import { isCategoricalStockUrl } from '@/lib/stock/application';

const DNA_INDUSTRY_ADAPTER = Object.freeze({
  'cafe-warm-editorial': 'cafe',
  'dining-refined-contrast': 'fine_dining',
  'beauty-soft-wellness': 'beauty',
  'medical-clinical-clarity': 'medical',
  'legal-authoritative-editorial': 'legal',
  'workshop-tactile-heritage': 'workshop',
  'academy-structured-friendly': 'academy',
  'retail-bold-geometric': 'retail',
} satisfies Record<DesignDnaId, AbsIndustryId>);

const MOTION_INDUSTRY_ADAPTER = Object.freeze({
  cafe: 'cafe',
  retail: 'retail',
  fine_dining: 'fine_dining',
  beauty: 'beauty',
  medical: 'medical',
  remodeling: 'workshop',
  legal: 'legal',
  consulting: 'consulting',
  workshop: 'workshop',
  photography: 'portfolio',
  brand: 'portfolio',
  portfolio: 'portfolio',
  other: null,
} satisfies Record<MotionIndustryClass, AbsIndustryId | null>);

interface SlotProjection {
  slotId: AbsAtmosphericSlotId;
  zones: Readonly<Record<SignatureBreakpointBand, SignatureTextSafeZoneId>>;
  scrim: 'none' | 'subtle-scrim';
}

function industryFor(config: SiteConfig): AbsIndustryId {
  if (config.meta.purposeId === 'edu_membership') return 'academy';
  const canonical = config.meta.industryClass
    ? MOTION_INDUSTRY_ADAPTER[config.meta.industryClass]
    : null;
  return canonical ?? DNA_INDUSTRY_ADAPTER[config.designDna!.dnaId];
}

function slotFor(section: Section): SlotProjection | undefined {
  if (isCategoricalStockUrl(section.background.image?.src)) return undefined;
  if (section.type === 'hero') {
    if (section.heroLayout?.mediaSlotRole === 'referential-figure'
      || section.heroLayout?.mediaSlotRole === 'none') {
      return undefined;
    }
    const resolvedId = section.heroLayout?.resolvedId;
    const slotId = resolvedId === 'hero.overlay-bottom-left'
      ? 'hero.overlay-bottom-left'
      : resolvedId === 'hero.video-scrim'
        ? section.background.video?.src && section.background.video.poster
          ? 'hero.video-scrim'
          : undefined
        : resolvedId === 'hero.fullbleed-centered' || !resolvedId
          ? 'hero.fullbleed-centered'
          : undefined;
    if (!slotId) return undefined;
    if (!resolvedId) {
      return {
        slotId,
        zones: {
          wide: 'center-middle',
          compact: 'center-middle',
          mobile: 'center-middle',
        },
        scrim: 'subtle-scrim',
      };
    }
    const layout = heroLayoutById(resolvedId);
    return {
      slotId,
      zones: {
        wide: layout.bands.wide.textZone,
        compact: layout.bands.compact.textZone,
        mobile: layout.bands.mobile.textZone,
      },
      scrim: layout.scrim,
    };
  }

  if (
    section.sectionLayout?.resolvedId === 'about.fullbleed-overlay'
    && section.sectionLayout.mediaRole === 'atmospheric-background'
  ) {
    const layout = aboutLayoutById('about.fullbleed-overlay');
    return {
      slotId: 'about.fullbleed-overlay',
      zones: {
        wide: layout.bands.wide.textZone,
        compact: layout.bands.compact.textZone,
        mobile: layout.bands.mobile.textZone,
      },
      scrim: 'subtle-scrim',
    };
  }
  return undefined;
}

function weightFor(
  zone: SignatureTextSafeZoneId,
  seed: string,
): AbsWeightZone {
  if (zone.startsWith('start') || zone === 'flow-start') return 'end';
  if (zone.startsWith('end')) return 'start';
  if (zone === 'center-middle' || zone === 'flow-full') return 'balanced';
  return stableIndex(`${seed}|weight`, 2) === 0 ? 'upper' : 'lower';
}

function specFor(
  config: SiteConfig,
  section: Section,
  slot: SlotProjection,
  siteSeed: string,
): ProceduralBackgroundSpec {
  const familyId = resolveAbsFamily({
    dnaId: config.designDna!.dnaId,
    industry: industryFor(config),
    siteSeed,
    sectionId: section.id,
    slotId: slot.slotId,
  });
  const seed = stableSeedHex(`${siteSeed}|${section.id}|${slot.slotId}`);
  const band = (breakpoint: SignatureBreakpointBand) => ({
    textSafeZoneId: slot.zones[breakpoint],
    weightZone: weightFor(slot.zones[breakpoint], `${seed}|${breakpoint}`),
    scrim: slot.scrim,
  });
  return {
    version: 1,
    familyId,
    seed,
    slotId: slot.slotId,
    bands: {
      wide: band('wide'),
      compact: band('compact'),
      mobile: band('mobile'),
    },
  };
}

/**
 * Final generation and every production preview call this same pure application seam.
 * It must run after the real-photo promotion decision so each failed viewport band keeps
 * an authored atmospheric fallback. Existing pins are immutable and are never reselected.
 */
export function applyProceduralBackgroundDefaults(config: SiteConfig): SiteConfig {
  if (!config.designDna) return config;
  const siteSeed = stableSeedHex(JSON.stringify({
    title: config.meta.title,
    purposeId: config.meta.purposeId,
    templateId: config.meta.templateId,
    designDna: config.designDna,
  }));
  let changed = false;
  const pages = config.pages.map((page) => {
    let pageChanged = false;
    const sections = page.sections.map((section) => {
      if (section.proceduralBackground) return section;
      const slot = slotFor(section);
      if (!slot) return section;
      pageChanged = true;
      changed = true;
      return {
        ...section,
        proceduralBackground: specFor(config, section, slot, siteSeed),
      };
    });
    return pageChanged ? { ...page, sections } : page;
  });
  return changed ? { ...config, pages } : config;
}
