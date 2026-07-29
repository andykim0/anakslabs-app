import type {
  ClinicAccentPreset,
  ClinicMasterPin,
  ClinicTypographyPreset,
  SiteTheme,
} from '@/lib/types/site';
import { CLINIC_LATIN_FONT_PRESETS } from '@/lib/fonts/latin-presets';

export const CLINIC_ACCENT_TOKENS = Object.freeze({
  'clean-blue': '#1466A5',
  'clean-teal': '#0E7A80',
  'clean-green': '#2F7A54',
  'clean-warm-neutral': '#8F5F3C',
} as const satisfies Record<ClinicAccentPreset, string>);

export const CLINIC_NEUTRAL_TOKENS = Object.freeze({
  background: '#FFFFFF',
  surface: '#F4F7FA',
  text: '#16202B',
  muted: '#59636E',
  border: '#E3E8EE',
  accentContrast: '#FFFFFF',
} as const);

export const CLINIC_TYPOGRAPHY_TOKENS = Object.freeze({
  'clinic-editorial': {
    headingFamily: CLINIC_LATIN_FONT_PRESETS['clinic-editorial'].heading,
    headingWeight: CLINIC_LATIN_FONT_PRESETS['clinic-editorial'].headingWeight,
    displayWeight: CLINIC_LATIN_FONT_PRESETS['clinic-editorial'].displayWeight,
    bodyFamily: CLINIC_LATIN_FONT_PRESETS['clinic-editorial'].body,
    bodyWeight: CLINIC_LATIN_FONT_PRESETS['clinic-editorial'].bodyWeight,
    controlFamily: CLINIC_LATIN_FONT_PRESETS['clinic-editorial'].control,
    controlWeight: CLINIC_LATIN_FONT_PRESETS['clinic-editorial'].controlWeight,
    familyCount: 2,
    faceCount: 4,
  },
  'clinic-geometric': {
    headingFamily: CLINIC_LATIN_FONT_PRESETS['clinic-geometric'].heading,
    headingWeight: CLINIC_LATIN_FONT_PRESETS['clinic-geometric'].headingWeight,
    displayWeight: CLINIC_LATIN_FONT_PRESETS['clinic-geometric'].displayWeight,
    bodyFamily: CLINIC_LATIN_FONT_PRESETS['clinic-geometric'].body,
    bodyWeight: CLINIC_LATIN_FONT_PRESETS['clinic-geometric'].bodyWeight,
    controlFamily: CLINIC_LATIN_FONT_PRESETS['clinic-geometric'].control,
    controlWeight: CLINIC_LATIN_FONT_PRESETS['clinic-geometric'].controlWeight,
    familyCount: 2,
    faceCount: 3,
  },
  'clinic-neutral': {
    headingFamily: CLINIC_LATIN_FONT_PRESETS['clinic-neutral'].heading,
    headingWeight: CLINIC_LATIN_FONT_PRESETS['clinic-neutral'].headingWeight,
    displayWeight: CLINIC_LATIN_FONT_PRESETS['clinic-neutral'].displayWeight,
    bodyFamily: CLINIC_LATIN_FONT_PRESETS['clinic-neutral'].body,
    bodyWeight: CLINIC_LATIN_FONT_PRESETS['clinic-neutral'].bodyWeight,
    controlFamily: CLINIC_LATIN_FONT_PRESETS['clinic-neutral'].control,
    controlWeight: CLINIC_LATIN_FONT_PRESETS['clinic-neutral'].controlWeight,
    familyCount: 1,
    faceCount: 3,
  },
} as const satisfies Record<ClinicTypographyPreset, {
  headingFamily: string;
  headingWeight: number;
  displayWeight: number;
  bodyFamily: string;
  bodyWeight: number;
  controlFamily: string;
  controlWeight: number;
  familyCount: 1 | 2;
  faceCount: 3 | 4;
}>);

export const CLINIC_DENSITY_TOKENS = Object.freeze({
  airy: {
    sectionPaddingBlockDesktop: 136,
    sectionPaddingBlockMobile: 64,
    containerMaxWidth: 1140,
    stackRhythm: 32,
    stackHeadingGap: 24,
    gridGutter: 56,
  },
  balanced: {
    sectionPaddingBlockDesktop: 88,
    sectionPaddingBlockMobile: 56,
    containerMaxWidth: 1200,
    stackRhythm: 24,
    stackHeadingGap: 20,
    gridGutter: 40,
  },
} as const satisfies Record<ClinicMasterPin['density'], {
  sectionPaddingBlockDesktop: number;
  sectionPaddingBlockMobile: number;
  containerMaxWidth: number;
  stackRhythm: number;
  stackHeadingGap: number;
  gridGutter: number;
}>);

/** premium-dental-v1 공통 고정 반경. 이 값은 ClinicMasterPin의 변주 축이 아니다. */
export const CLINIC_RADIUS_TOKENS = Object.freeze({
  none: 0,
  sm: 2,
  md: 4,
  lg: 6,
} as const);

/**
 * 정규화된 clinicMaster pin을 완성된 렌더 테마로 확장한다.
 * 저장 pin에는 색·px·font-family 자유값이 없고 이 서버 카탈로그만 실제 값을 소유한다.
 */
export function resolveClinicMasterTheme(
  baseTheme: SiteTheme,
  pin: ClinicMasterPin,
): SiteTheme {
  const accent = CLINIC_ACCENT_TOKENS[pin.accentPreset];
  const typography = CLINIC_TYPOGRAPHY_TOKENS[pin.typographyPreset];
  return {
    ...baseTheme,
    fonts: {
      heading: typography.headingFamily,
      body: typography.bodyFamily,
      googleFonts: [],
    },
    palette: {
      background: CLINIC_NEUTRAL_TOKENS.background,
      surface: CLINIC_NEUTRAL_TOKENS.surface,
      text: CLINIC_NEUTRAL_TOKENS.text,
      muted: CLINIC_NEUTRAL_TOKENS.muted,
      primary: accent,
      accent,
    },
    radius: CLINIC_RADIUS_TOKENS.md,
  };
}

export function clinicMasterRenderTokens(pin: ClinicMasterPin) {
  const density = CLINIC_DENSITY_TOKENS[pin.density];
  const typography = CLINIC_TYPOGRAPHY_TOKENS[pin.typographyPreset];
  return {
    accent: CLINIC_ACCENT_TOKENS[pin.accentPreset],
    accentContrast: CLINIC_NEUTRAL_TOKENS.accentContrast,
    border: CLINIC_NEUTRAL_TOKENS.border,
    sectionPaddingBlockDesktop: `${density.sectionPaddingBlockDesktop}px`,
    sectionPaddingBlockMobile: `${density.sectionPaddingBlockMobile}px`,
    containerMaxWidth: `${density.containerMaxWidth}px`,
    stackRhythm: `${density.stackRhythm}px`,
    stackHeadingGap: `${density.stackHeadingGap}px`,
    gridGutter: `${density.gridGutter}px`,
    controlFamily: typography.controlFamily,
    controlWeight: typography.controlWeight,
    displayWeight: typography.displayWeight,
    headingWeight: typography.headingWeight,
    radiusSm: `${CLINIC_RADIUS_TOKENS.sm}px`,
    radiusMd: `${CLINIC_RADIUS_TOKENS.md}px`,
    radiusLg: `${CLINIC_RADIUS_TOKENS.lg}px`,
  } as const;
}
