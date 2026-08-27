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
  'clinic-marquee': {
    headingFamily: CLINIC_LATIN_FONT_PRESETS['clinic-marquee'].heading,
    headingWeight: CLINIC_LATIN_FONT_PRESETS['clinic-marquee'].headingWeight,
    displayWeight: CLINIC_LATIN_FONT_PRESETS['clinic-marquee'].displayWeight,
    bodyFamily: CLINIC_LATIN_FONT_PRESETS['clinic-marquee'].body,
    bodyWeight: CLINIC_LATIN_FONT_PRESETS['clinic-marquee'].bodyWeight,
    controlFamily: CLINIC_LATIN_FONT_PRESETS['clinic-marquee'].control,
    controlWeight: CLINIC_LATIN_FONT_PRESETS['clinic-marquee'].controlWeight,
    familyCount: 2,
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

/**
 * MARQUEE's geometry, as a PARALLEL table rather than conditional keys on `CLINIC_RADIUS_TOKENS`.
 *
 * `CLINIC_RADIUS_TOKENS` is documented as not being a pin axis and `clinicMasterRenderTokens`
 * returns `as const`; a language-conditional key on either would make the default path's shape
 * depend on a field the default path does not have. MARQUEE's radii are not a scaling of the
 * default 0/2/4/6 either — they are a different vocabulary (full pills, 22px cards, deliberately
 * asymmetric gallery tiles) with 2px borders where the default has hairlines. So: its own table.
 */
export const CLINIC_MARQUEE_RADIUS_TOKENS = Object.freeze({
  /** Buttons, chips, location pills, kickers. */
  pill: 999,
  card: 22,
  panel: 30,
  plate: 30,
  bookingBar: 20,
  mark: 10,
  /** The gallery's hand-placed corners — one 8px notch per tile so the grid is not templated. */
  tileFeature: '30px',
  tileA: '30px 30px 8px 30px',
  tileB: '30px 30px 30px 8px',
  tileC: '8px 30px 30px 30px',
  tileD: '30px 8px 30px 30px',
  /** Every MARQUEE border is 2px. The language has no hairlines. */
  borderWidth: 2,
  /** The header's stuck-state bottom rule. */
  ruleWidth: 4,
} as const);

export function clinicMarqueeRenderTokens() {
  const radius = CLINIC_MARQUEE_RADIUS_TOKENS;
  return {
    radiusPill: `${radius.pill}px`,
    radiusCard: `${radius.card}px`,
    radiusPanel: `${radius.panel}px`,
    radiusPlate: `${radius.plate}px`,
    radiusBookingBar: `${radius.bookingBar}px`,
    radiusMark: `${radius.mark}px`,
    tileFeature: radius.tileFeature,
    tileA: radius.tileA,
    tileB: radius.tileB,
    tileC: radius.tileC,
    tileD: radius.tileD,
    borderWidth: `${radius.borderWidth}px`,
    ruleWidth: `${radius.ruleWidth}px`,
  } as const;
}

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
/**
 * TEMPLATE-SYSTEM §2's seven slots onto SiteTheme's six channels. Pinned, because the renderer
 * fills its CSS variables from these names and a slot that lands in the wrong channel is a bug
 * nobody can see in a diff — only on the page.
 */
export function clinicPaletteToThemePalette(
  resolved: NonNullable<ClinicMasterPin['resolvedPalette']>,
): SiteTheme['palette'] {
  return {
    background: resolved.slots['--surface'],
    surface: resolved.slots['--surface-2'],
    text: resolved.slots['--ink'],
    muted: resolved.slots['--ink-muted'],
    primary: resolved.slots['--accent'],
    accent: resolved.slots['--brand'],
  };
}

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
    // A pin without a resolved palette is every existing issuance, KR included: it keeps the
    // catalogue neutrals and the four-value accent preset, pixel for pixel.
    palette: pin.resolvedPalette
      ? clinicPaletteToThemePalette(pin.resolvedPalette)
      : {
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
    // The sticky booking bar reads these and used to paint itself from the accent preset, which
    // is how a demo could carry the practice's brand everywhere except its one call to action.
    accent: pin.resolvedPalette?.slots['--brand'] ?? CLINIC_ACCENT_TOKENS[pin.accentPreset],
    accentContrast: pin.resolvedPalette?.slots['--brand-ink']
      ?? CLINIC_NEUTRAL_TOKENS.accentContrast,
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
