import type {
  ActiveMotionSignatureId,
  MotionIndustryClass,
} from '@/lib/types/site';

/** Existing FONT_PAIRINGS ids that have Korean heading/body fallbacks in the renderer. */
export const DNA_FONT_PAIR_IDS = [
  'hahmlet-editorial',
  'playfair-classic',
  'lora-wellness',
  'ibm-plex-trust',
  'garamond-counsel',
  'song-myung-heritage',
  'outfit-geometric',
  'space-grotesk-tech',
] as const;

export type DnaFontPairId = (typeof DNA_FONT_PAIR_IDS)[number];

/** Named scale choices keep arbitrary numeric values outside the model-facing contract. */
export type DnaTypeRatio =
  | 'major-second'
  | 'minor-third'
  | 'major-third'
  | 'perfect-fourth';

export type DnaColorStrategy = 'mono' | 'neutral-accent' | 'duotone';
export type DnaChroma = 'muted' | 'balanced' | 'vivid';
export type DnaDensity = 'compact' | 'balanced' | 'airy';
export type DnaRadius = 'square' | 'soft' | 'rounded';

/** GEN/STK batches extend this placeholder; DNA1 does not select or generate assets. */
export interface DesignDnaAssetRecipe {
  status: 'deferred';
}

export interface DesignDNA {
  id: string;
  type: {
    pair: DnaFontPairId;
    ratio: DnaTypeRatio;
  };
  color: {
    strategy: DnaColorStrategy;
    chroma: DnaChroma;
  };
  density: DnaDensity;
  radius: DnaRadius;
  motionDefault: ActiveMotionSignatureId;
  industryPrior: readonly MotionIndustryClass[];
  assetRecipe: DesignDnaAssetRecipe;
}
