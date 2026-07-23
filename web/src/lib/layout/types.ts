import type { DesignDnaId } from '@/lib/design/dna';
import type {
  SignatureBreakpointBand,
  SignatureTextSafeZoneId,
} from '@/lib/motion/signature-contract';

export const HERO_LAYOUT_VARIANT_IDS = [
  'hero.fullbleed-centered',
  'hero.split-left',
  'hero.split-right',
  'hero.overlay-bottom-left',
  'hero.video-scrim',
  'hero.text-only-bold',
  'hero.image-below',
  'hero.asymmetric-offset',
] as const;

export type HeroLayoutVariantId = (typeof HERO_LAYOUT_VARIANT_IDS)[number];
export type HeroLayoutBreakpointBand = SignatureBreakpointBand;

export const HERO_LAYOUT_SLOT_IDS = [
  'logo',
  'eyebrow',
  'headline',
  'lead',
  'chips',
  'primary-cta',
  'secondary-cta',
  'media-control',
] as const;

export type HeroLayoutSlotId = (typeof HERO_LAYOUT_SLOT_IDS)[number];
export type HeroLayoutSlotRequirement = 'required' | 'optional';

export interface HeroLayoutSlotContract {
  id: HeroLayoutSlotId;
  requirement: HeroLayoutSlotRequirement;
  maxItems: number;
}

export interface NormalizedLayoutFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type HeroLayoutGridSpan = readonly [start: number, end: number];
export type HeroLayoutAlignment = 'start' | 'center';
export type HeroLayoutFlow =
  | 'center-overlay'
  | 'split'
  | 'lower-overlay'
  | 'video-overlay'
  | 'editorial-flow'
  | 'media-after'
  | 'offset-surface';
export type HeroLayoutMediaPlacement = 'none' | 'fullbleed' | 'fixed' | 'after-flow';
export type HeroLayoutAspect = '16:10' | '16:9' | '4:5' | '4:3' | '3:1';
export type HeroLayoutScrim = 'none' | 'subtle-scrim';
export type HeroLayoutPanel = 'none' | 'surface-offset';

export interface HeroLayoutBandRecipe {
  gridColumns: 12 | 8 | 4;
  textZone: SignatureTextSafeZoneId;
  contentColumns: HeroLayoutGridSpan;
  slotColumns?: Partial<Record<HeroLayoutSlotId, HeroLayoutGridSpan>>;
  align: HeroLayoutAlignment;
  flow: HeroLayoutFlow;
  media: {
    placement: HeroLayoutMediaPlacement;
    frame?: NormalizedLayoutFrame;
    columns?: HeroLayoutGridSpan;
    aspect?: HeroLayoutAspect;
  };
  chipItemsPerRow: 1 | 2 | 3;
  ctaLayout: 'wrap' | 'stack';
  panel: HeroLayoutPanel;
}

export type HeroLayoutMediaRequirement =
  | 'none'
  | 'optional-image'
  | 'required-image'
  | 'required-video-poster';

export type HeroLayoutFallback =
  | 'self-without-media'
  | 'hero.text-only-bold'
  | 'hero.fullbleed-centered';

export interface HeroLayoutMediaContract {
  requirement: HeroLayoutMediaRequirement;
  noMediaFallback: HeroLayoutFallback;
  posterOnlyFallback?: HeroLayoutFallback;
  preferredAspect: Readonly<Partial<Record<HeroLayoutBreakpointBand, HeroLayoutAspect>>>;
  focusPolicy: 'none' | 'clamped-safe-zone-aware';
}

export const HERO_LAYOUT_AUTHORED_INDUSTRIES = [
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
] as const;

export type HeroLayoutAuthoredIndustry =
  (typeof HERO_LAYOUT_AUTHORED_INDUSTRIES)[number];
export type HeroLayoutIndustryAffinity = 'recommended' | 'allowed' | 'discouraged';

export interface HeroLayoutCompatibility {
  industry: Readonly<Record<HeroLayoutAuthoredIndustry, HeroLayoutIndustryAffinity>>;
  preferredDna: readonly DesignDnaId[];
  avoidedDna: readonly DesignDnaId[];
}

export interface HeroLayoutVariant {
  id: HeroLayoutVariantId;
  label: string;
  description: string;
  slots: readonly HeroLayoutSlotContract[];
  bands: Readonly<Record<HeroLayoutBreakpointBand, HeroLayoutBandRecipe>>;
  mediaContract: HeroLayoutMediaContract;
  scrim: HeroLayoutScrim;
  compatibility: HeroLayoutCompatibility;
}

