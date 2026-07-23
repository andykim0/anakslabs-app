import type { DesignDnaId } from '@/lib/design/dna/types';
import type {
  SignatureBreakpointBand,
  SignatureTextSafeZoneId,
} from '@/lib/motion/signature-contract';
import type {
  HeroLayoutAuthoredIndustry,
  HeroLayoutIndustryAffinity,
} from './types';

export const FEATURE_LAYOUT_VARIANT_IDS = [
  'features.three-column-cards',
  'features.zigzag-media',
  'features.icon-grid',
  'features.numbered-list',
  'features.sticky-heading-two-column',
  'features.featured-first',
] as const;

export const ABOUT_LAYOUT_VARIANT_IDS = [
  'about.split-left',
  'about.centered-statement',
  'about.fullbleed-overlay',
  'about.heading-body-columns',
] as const;

export const GALLERY_LAYOUT_VARIANT_IDS = [
  'gallery.masonry',
  'gallery.uniform-grid',
  'gallery.carousel',
  'gallery.asymmetric-two-one',
] as const;

export type FeatureLayoutVariantId = (typeof FEATURE_LAYOUT_VARIANT_IDS)[number];
export type AboutLayoutVariantId = (typeof ABOUT_LAYOUT_VARIANT_IDS)[number];
export type GalleryLayoutVariantId = (typeof GALLERY_LAYOUT_VARIANT_IDS)[number];
export type SectionLayoutVariantId =
  | FeatureLayoutVariantId
  | AboutLayoutVariantId
  | GalleryLayoutVariantId;
export type SectionLayoutKind = 'features' | 'about' | 'gallery';
export type SectionLayoutBreakpointBand = SignatureBreakpointBand;

export interface SectionLayoutSelection {
  features?: FeatureLayoutVariantId;
  about?: AboutLayoutVariantId;
  gallery?: GalleryLayoutVariantId;
}

/**
 * Ordered media source policy. A provider may only be inserted at a declared position;
 * the resolver never invents an unregistered source.
 */
export type MediaFallbackStep =
  | 'customer-referential'
  | 'customer-video-poster'
  | 'categorical-stock'
  | 'system-atmospheric'
  | 'collapse-slot';

export type LayoutMediaRole =
  | 'atmospheric-background'
  | 'referential-figure'
  | 'none';

export interface LayoutMediaContract {
  role: LayoutMediaRole;
  /**
   * Figure-only semantic permission. It is deliberately independent from industry affinity.
   * Atmospheric slots may gain a categorical step in STK without consulting this figure axis.
   */
  categoricalEligible: boolean;
  fallbackLadder: readonly MediaFallbackStep[];
}

export type SectionLayoutFlow =
  | 'equal-grid'
  | 'alternating-media'
  | 'icon-grid'
  | 'numbered-rows'
  | 'sticky-heading'
  | 'featured-first'
  | 'split'
  | 'centered-statement'
  | 'fullbleed-overlay'
  | 'heading-body-columns'
  | 'masonry'
  | 'uniform-grid'
  | 'carousel'
  | 'asymmetric-two-one';

export interface SectionLayoutBandRecipe {
  gridColumns: 12 | 8 | 4;
  textZone: SignatureTextSafeZoneId;
  flow: SectionLayoutFlow;
  columns: 1 | 2 | 3 | 4;
  mediaAspect?: '16:9' | '4:3' | '4:5' | '3:2' | '3:4' | '1:1' | '2:1';
  stickyHeading?: boolean;
  mobileLongTextColumns?: 1 | 2;
}

export interface SectionLayoutCompatibility {
  industry: Readonly<Record<HeroLayoutAuthoredIndustry, HeroLayoutIndustryAffinity>>;
  preferredDna: readonly DesignDnaId[];
  avoidedDna: readonly DesignDnaId[];
}

export interface SectionLayoutContentContract {
  minimumItems: number;
  maximumItems: number;
  requiredFields: readonly string[];
  optionalFields: readonly string[];
}

export interface SectionLayoutVariant<
  Id extends SectionLayoutVariantId = SectionLayoutVariantId,
> {
  id: Id;
  kind: SectionLayoutKind;
  label: string;
  description: string;
  bands: Readonly<Record<SectionLayoutBreakpointBand, SectionLayoutBandRecipe>>;
  content: SectionLayoutContentContract;
  mediaContract: LayoutMediaContract;
  compatibility: SectionLayoutCompatibility;
  staticFallbackId?: GalleryLayoutVariantId;
}

export interface SectionLayoutCompiledFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SectionLayoutItemProjection {
  id: string;
  elementIds: readonly string[];
  mediaElementId?: string;
  orientation?: GalleryOrientation;
  focalPoint?: { x: number; y: number };
}

export interface SectionLayoutBandProjection {
  width: 1440 | 768 | 390;
  sectionHeight: number;
  frames: Readonly<Record<string, SectionLayoutCompiledFrame>>;
  fontSizes: Readonly<Record<string, number>>;
  itemOrder: readonly string[];
  mediaFrame?: SectionLayoutCompiledFrame;
}

export interface SectionLayoutProjection {
  catalogVersion: 1;
  kind: SectionLayoutKind;
  requestedId: SectionLayoutVariantId;
  resolvedId: SectionLayoutVariantId;
  mediaRole: LayoutMediaRole;
  enhancement: 'none' | 'carousel';
  staticFallbackId?: GalleryLayoutVariantId;
  items: readonly SectionLayoutItemProjection[];
  bands: Readonly<Record<SectionLayoutBreakpointBand, SectionLayoutBandProjection>>;
  fallbackBands?: Readonly<Record<SectionLayoutBreakpointBand, SectionLayoutBandProjection>>;
}

export interface SectionLayoutIntroBinding {
  eyebrowId?: string;
  titleId: string;
  leadId?: string;
  ctaId?: string;
}

export interface FeatureLayoutItemBinding {
  id: string;
  titleId: string;
  bodyId?: string;
  markerId?: string;
  mediaId?: string;
  ctaId?: string;
}

export interface AboutLayoutBinding {
  id: string;
  statementId?: string;
  bodyIds: readonly string[];
  factIds: readonly string[];
  mediaId?: string;
  ctaId?: string;
}

export type GalleryOrientation = 'portrait' | 'square' | 'landscape';

export interface GalleryLayoutItemBinding {
  id: string;
  mediaId: string;
  captionId?: string;
  sourceWidth?: number;
  sourceHeight?: number;
  focalPoint?: { x: number; y: number };
}

export interface FeatureLayoutContent {
  intro: SectionLayoutIntroBinding;
  items: readonly FeatureLayoutItemBinding[];
}

export interface AboutLayoutContent {
  intro: SectionLayoutIntroBinding;
  about: AboutLayoutBinding;
}

export interface GalleryLayoutContent {
  intro: SectionLayoutIntroBinding;
  items: readonly GalleryLayoutItemBinding[];
}
