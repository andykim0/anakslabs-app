import type {
  SignatureBreakpointBand,
  SignatureScrim,
  SignatureTextSafeZoneId,
} from '@/lib/motion/signature-contract';

export const ABS_FAMILY_IDS = [
  'abs.soft-gradient-field',
  'abs.paper-grain-wash',
  'abs.geometric-linework',
  'abs.duotone-depth-planes',
  'abs.micro-pattern-tile',
] as const;

export type AbsFamilyId = (typeof ABS_FAMILY_IDS)[number];

export const ABS_ATMOSPHERIC_SLOT_IDS = [
  'hero.fullbleed-centered',
  'hero.overlay-bottom-left',
  'hero.video-scrim',
  'about.fullbleed-overlay',
] as const;

export type AbsAtmosphericSlotId = (typeof ABS_ATMOSPHERIC_SLOT_IDS)[number];

export const ABS_INDUSTRY_IDS = [
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

export type AbsIndustryId = (typeof ABS_INDUSTRY_IDS)[number];
export type AbsAffinity = 'recommended' | 'allowed' | 'discouraged';

export const ABS_WEIGHT_ZONE_IDS = [
  'start',
  'end',
  'upper',
  'lower',
  'balanced',
] as const;

export type AbsWeightZone = (typeof ABS_WEIGHT_ZONE_IDS)[number];

export const ABS_OPACITY_LEVELS = ['trace', 'subtle', 'field'] as const;
export type AbsOpacityLevel = (typeof ABS_OPACITY_LEVELS)[number];

export interface ProceduralBackgroundBand {
  textSafeZoneId: SignatureTextSafeZoneId;
  weightZone: AbsWeightZone;
  scrim: SignatureScrim;
}

/**
 * New-generation-only pin. It stores authored choices, never colors or free coordinates.
 * Geometry is compiled from the signature safe-zone registry at render time.
 */
export interface ProceduralBackgroundSpec {
  version: 1;
  familyId: AbsFamilyId;
  /** Server-authored lowercase FNV seed. It contains no customer text. */
  seed: string;
  slotId: AbsAtmosphericSlotId;
  bands: Readonly<Record<SignatureBreakpointBand, ProceduralBackgroundBand>>;
}

export interface AbsNormalizedZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AbsSvgPath {
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeLinecap?: 'butt' | 'round' | 'square';
  strokeLinejoin?: 'miter' | 'round' | 'bevel';
  dashArray?: string;
  opacity: number;
}

export interface AbsNoiseLayer {
  seed: number;
  baseFrequency: string;
  octaves: 2 | 3;
  opacity: number;
}

export interface AbsPatternLayer {
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  paths: readonly AbsSvgPath[];
  opacity: number;
}

export interface AbsBackgroundProjection {
  familyId: AbsFamilyId;
  band: SignatureBreakpointBand;
  mode: 'solid' | 'authored';
  baseColor: string;
  backgroundImage?: string;
  quietZone: AbsNormalizedZone;
  guardedQuietZone: AbsNormalizedZone;
  quietWashColor: string;
  quietWashOpacity: number;
  lowFrequencyPaths: readonly AbsSvgPath[];
  highFrequencyPaths: readonly AbsSvgPath[];
  noise?: AbsNoiseLayer;
  pattern?: AbsPatternLayer;
  scrim: SignatureScrim;
  /** Stable SVG definition namespace; derived from stored seed and band only. */
  definitionId: string;
}
