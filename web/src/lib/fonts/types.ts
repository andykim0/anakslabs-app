import type { DesignDnaId } from '@/lib/design/dna/types';
import type { MotionIndustryClass } from '@/lib/types/site';

export const KOREAN_FONT_PAIRING_CATALOG_VERSION = 1 as const;

export const PRODUCTION_KOREAN_FONT_PAIR_IDS = [
  'kr-pretendard-neutral',
  'kr-nanum-myeongjo-readable',
  'kr-gmarket-noto-structured',
  'kr-nanum-square-round-friendly',
] as const;

export type ProductionKoreanFontPairId = (typeof PRODUCTION_KOREAN_FONT_PAIR_IDS)[number];

export interface SiteFontPairingPin {
  catalogVersion: typeof KOREAN_FONT_PAIRING_CATALOG_VERSION;
  id: ProductionKoreanFontPairId;
}

export const KOREAN_TRACKING_TOKEN_VALUES = {
  'tracking.kr-tight-2': '-0.025em',
  'tracking.kr-tight-1': '-0.015em',
  'tracking.kr-neutral': '0',
  'tracking.kr-body-snug': '-0.005em',
  'tracking.control-snug': '-0.01em',
} as const;

export type KoreanTrackingToken = keyof typeof KOREAN_TRACKING_TOKEN_VALUES;

export const KOREAN_LEADING_TOKEN_VALUES = {
  'leading.display-compact': 1.14,
  'leading.heading-compact': 1.22,
  'leading.heading-comfort': 1.28,
  'leading.lead-readable': 1.56,
  'leading.body-readable': 1.7,
  'leading.body-editorial': 1.74,
  'leading.control-single': 1,
} as const;

export type KoreanLeadingToken = keyof typeof KOREAN_LEADING_TOKEN_VALUES;

export type FontAssetSourceId =
  | 'pretendard-v1.3.9-official'
  | 'nanum-myeongjo-official'
  | 'noto-sans-kr-official'
  | 'gmarket-sans-official'
  | 'nanum-square-round-official';

export type FontLicenseAssetId =
  | 'license-pretendard-ofl-1.1'
  | 'license-noto-cjk-ofl-1.1'
  | 'license-naver-nanum'
  | 'license-gmarket-sans-ofl-1.1';

export interface KoreanFontRoleManifest {
  family: string;
  weights: readonly number[];
  source: FontAssetSourceId;
  fallbackChain: readonly string[];
}

export interface KoreanFontTypographyTokens {
  display: {
    tracking: KoreanTrackingToken;
    leading: KoreanLeadingToken;
  };
  heading: {
    tracking: KoreanTrackingToken;
    leading: KoreanLeadingToken;
  };
  lead: {
    tracking: KoreanTrackingToken;
    leading: KoreanLeadingToken;
  };
  body: {
    tracking: KoreanTrackingToken;
    leading: KoreanLeadingToken;
  };
  control: {
    tracking: KoreanTrackingToken;
    leading: KoreanLeadingToken;
  };
}

export type FontDnaAffinity = 'recommended' | 'allowed' | 'blocked';

/**
 * `academy` does not yet exist in MotionIndustryClass. It is catalog metadata only and must not
 * be inferred from free-form `other`; selection stays on `other -> kr-pretendard-neutral`.
 */
export type FontRoutingIndustry = MotionIndustryClass | 'academy';

export interface ProductionKoreanFontManifest {
  catalogVersion: typeof KOREAN_FONT_PAIRING_CATALOG_VERSION;
  status: 'production-ready';
  description: string;
  heading: KoreanFontRoleManifest;
  body: KoreanFontRoleManifest;
  control: KoreanFontRoleManifest;
  typography: KoreanFontTypographyTokens;
  dnaAffinity: Readonly<Record<DesignDnaId, FontDnaAffinity>>;
  industryRouting: {
    primary: readonly FontRoutingIndustry[];
    secondary: readonly FontRoutingIndustry[];
    blocked: readonly FontRoutingIndustry[];
  };
  licenseAssetIds: readonly FontLicenseAssetId[];
}
