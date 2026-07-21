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

export interface DesignDnaOverrides {
  typePair?: DnaFontPairId;
  typeRatio?: DnaTypeRatio;
  colorStrategy?: DnaColorStrategy;
  colorChroma?: DnaChroma;
  density?: DnaDensity;
  radius?: DnaRadius;
  motionDefault?: ActiveMotionSignatureId;
}

export type DnaRampStep = '50' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900' | '950';
export type DnaColorRamp = Record<DnaRampStep, string>;

export type DnaSemanticColor =
  | 'accent'
  | 'background'
  | 'border'
  | 'focus'
  | 'link'
  | 'onAccent'
  | 'onPrimary'
  | 'primary'
  | 'surface'
  | 'surfaceStrong'
  | 'text'
  | 'textMuted';

export interface DnaContrastCorrection {
  token: DnaSemanticColor;
  against: DnaSemanticColor;
  before: string;
  after: string;
  beforeRatio: number;
  afterRatio: number;
}

export interface TokenSet {
  accessibility: {
    minimumTextContrast: 4.5;
    corrections: readonly DnaContrastCorrection[];
  };
  color: {
    ramps: {
      accent: DnaColorRamp;
      neutral: DnaColorRamp;
      primary: DnaColorRamp;
    };
    semantic: Record<DnaSemanticColor, string>;
  };
  identity: {
    dnaId: string;
    hueSeed: number;
  };
  motion: {
    signature: ActiveMotionSignatureId;
    duration: {
      fast: string;
      normal: string;
      slow: string;
    };
    easing: {
      enter: string;
      exit: string;
      standard: string;
    };
  };
  radius: {
    small: string;
    medium: string;
    large: string;
    pill: string;
  };
  shadow: {
    low: string;
    medium: string;
    high: string;
  };
  spacing: {
    xsmall: string;
    small: string;
    medium: string;
    large: string;
    xlarge: string;
    xxlarge: string;
  };
  typography: {
    pair: DnaFontPairId;
    heading: string;
    body: string;
    googleFonts: readonly string[];
    ratio: number;
    size: {
      caption: string;
      body: string;
      lead: string;
      title: string;
      display: string;
    };
    lineHeight: {
      body: number;
      heading: number;
    };
  };
}
