import type {
  ActiveMotionSignatureId,
  MotionIndustryClass,
} from '@/lib/types/site';

export const DESIGN_DNA_IDS = [
  'cafe-warm-editorial',
  'dining-refined-contrast',
  'beauty-soft-wellness',
  'medical-clinical-clarity',
  'legal-authoritative-editorial',
  'workshop-tactile-heritage',
  'academy-structured-friendly',
  'retail-bold-geometric',
] as const;

export type DesignDnaId = (typeof DESIGN_DNA_IDS)[number];

export type DnaMoodFamily =
  | 'warm-tactile'
  | 'refined-editorial'
  | 'soft-organic'
  | 'structured-clarity'
  | 'bold-geometric';

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
export const DNA_TYPE_RATIOS = [
  'major-second',
  'minor-third',
  'major-third',
  'perfect-fourth',
] as const;
export const DNA_COLOR_STRATEGIES = ['mono', 'neutral-accent', 'duotone'] as const;
export const DNA_CHROMA_NAMES = ['muted', 'balanced', 'vivid'] as const;
export const DNA_DENSITIES = ['compact', 'balanced', 'airy'] as const;
export const DNA_RADII = ['square', 'soft', 'rounded'] as const;

export type DnaTypeRatio = (typeof DNA_TYPE_RATIOS)[number];
export type DnaColorStrategy = (typeof DNA_COLOR_STRATEGIES)[number];
export type DnaChroma = (typeof DNA_CHROMA_NAMES)[number];
export type DnaDensity = (typeof DNA_DENSITIES)[number];
export type DnaRadius = (typeof DNA_RADII)[number];

/** GEN/STK batches extend this placeholder; DNA1 does not select or generate assets. */
export interface DesignDnaAssetRecipe {
  status: 'deferred';
}

export interface DesignDNA {
  id: DesignDnaId;
  /** 후보 선택 프롬프트에 공개하는 한 줄 설명. 토큰 구현 세부는 포함하지 않는다. */
  description: string;
  /** 코드가 후보 3안의 인접 무드 중복을 거르는 내부 분류. */
  moodFamily: DnaMoodFamily;
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

/** 후보 선택부터 SiteConfig까지 그대로 고정되는 모델 출력의 정규형. */
export interface DesignDnaSelection {
  catalogVersion: 1;
  dnaId: DesignDnaId;
  hueSeed: number;
  overrides: DesignDnaOverrides;
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
