import type { DesignDnaId } from '@/lib/design/dna/types';
import type { MotionIndustryClass } from '@/lib/types/site';

export const KOREAN_FONT_PAIRING_CATALOG_VERSION = 1 as const;
export const LATIN_FONT_PAIRING_CATALOG_VERSION = 1 as const;

export const PRODUCTION_KOREAN_FONT_PAIR_IDS = [
  'kr-pretendard-neutral',
  'kr-nanum-myeongjo-readable',
  'kr-gmarket-noto-structured',
  'kr-nanum-square-round-friendly',
] as const;

export type ProductionKoreanFontPairId = (typeof PRODUCTION_KOREAN_FONT_PAIR_IDS)[number];

export const MODERN_KOREAN_FONT_SELECTION_POLICY = 'modern-sans-v1' as const;
export type KoreanFontSelectionPolicy = typeof MODERN_KOREAN_FONT_SELECTION_POLICY;

export const LATIN_FONT_PAIRING_SLOT_IDS = ['us-clinical-neutral'] as const;
export type LatinFontPairingSlotId = (typeof LATIN_FONT_PAIRING_SLOT_IDS)[number];
export const US_LATIN_FONT_SELECTION_POLICY = 'us-latin-v1' as const;
export type LatinFontSelectionPolicy = typeof US_LATIN_FONT_SELECTION_POLICY;

export interface SiteKoreanFontPairingPin {
  catalogVersion: typeof KOREAN_FONT_PAIRING_CATALOG_VERSION;
  id: ProductionKoreanFontPairId;
  /**
   * 신규 생성 시 어떤 서버 선택표가 이 pin을 발급했는지 기록한다.
   * 기존 FNT pin에는 필드가 없으며 렌더러는 저장된 family 의미를 다시 선택하지 않는다.
   */
  selectionPolicy?: KoreanFontSelectionPolicy;
}

export interface SiteLatinFontPairingPin {
  catalogVersion: typeof LATIN_FONT_PAIRING_CATALOG_VERSION;
  locale: 'en-US';
  id: LatinFontPairingSlotId;
  /**
   * Version 0 is the immutable system-font fallback. Checked-in designer assets start at version 1,
   * so a later catalog promotion cannot silently change an already stored fallback pin.
   */
  assetVersion: number;
  selectionPolicy: LatinFontSelectionPolicy;
}

export type SiteFontPairingPin = SiteKoreanFontPairingPin | SiteLatinFontPairingPin;

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

export interface LatinFontPairingSlotManifest {
  catalogVersion: typeof LATIN_FONT_PAIRING_CATALOG_VERSION;
  locale: 'en-US';
  status: 'asset-pending' | 'production-ready';
  selectionPolicy: LatinFontSelectionPolicy;
  assetVersion: number;
  description: string;
  heading: { family: string; fallbackChain: readonly string[] };
  body: { family: string; fallbackChain: readonly string[] };
  control: { family: string; fallbackChain: readonly string[] };
  /**
   * Only the medical slot is active for the August MVP. The remaining DNA values deliberately
   * stay deferred until designer curation.
   */
  dnaAffinity: Readonly<Record<DesignDnaId, 'recommended' | 'deferred'>>;
  performanceBudget: {
    firstScreenTargetBytes: 122880;
    firstScreenMaxBytes: 204800;
    exportTargetBytes: 307200;
    exportMaxBytes: 614400;
    familyMax: 2;
    faceMax: 4;
  };
}
