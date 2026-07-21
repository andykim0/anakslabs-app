import { FONT_PAIRINGS } from '@/lib/ai/design-knowledge-data';
import {
  ACTIVE_MOTION_SIGNATURE_IDS,
} from '@/lib/motion/signatures';
import { DABOIM_TYPOGRAPHY } from '@/lib/design/typography-scale';
import { designDnaById, type DesignDnaId } from './catalog';
import {
  chromaAtLightness,
  ensureContrast,
  formatOklch,
  normalizeHue,
  parseOklch,
  type OklchColor,
} from './color';
import {
  DNA_FONT_PAIR_IDS,
  type DesignDNA,
  type DesignDnaOverrides,
  type DnaChroma,
  type DnaColorRamp,
  type DnaColorStrategy,
  type DnaContrastCorrection,
  type DnaDensity,
  type DnaFontPairId,
  type DnaRadius,
  type DnaSemanticColor,
  type DnaTypeRatio,
  type TokenSet,
} from './types';

export const DNA_TYPE_RATIO_VALUES = {
  'major-second': 1.125,
  'minor-third': 1.2,
  'major-third': 1.25,
  'perfect-fourth': 1.333,
} as const satisfies Record<DnaTypeRatio, number>;

const CHROMA_VALUES = {
  muted: 0.07,
  balanced: 0.12,
  vivid: 0.18,
} as const satisfies Record<DnaChroma, number>;

const SPACING_BASE_REM = {
  compact: 0.25,
  balanced: 0.375,
  airy: 0.5,
} as const satisfies Record<DnaDensity, number>;

const RADIUS_VALUES = {
  square: { small: 0, medium: 0.125, large: 0.25, pill: 999 },
  soft: { small: 0.25, medium: 0.5, large: 0.875, pill: 999 },
  rounded: { small: 0.5, medium: 0.875, large: 1.5, pill: 999 },
} as const satisfies Record<DnaRadius, Record<'small' | 'medium' | 'large' | 'pill', number>>;

const LIGHTNESS_STEPS = {
  '50': 0.97,
  '100': 0.93,
  '200': 0.86,
  '300': 0.76,
  '400': 0.66,
  '500': 0.56,
  '600': 0.46,
  '700': 0.36,
  '800': 0.25,
  '900': 0.15,
  '950': 0.09,
} as const;

const CHROMA_CURVE: Record<keyof typeof LIGHTNESS_STEPS, number> = {
  '50': 0.12,
  '100': 0.22,
  '200': 0.42,
  '300': 0.68,
  '400': 0.9,
  '500': 1,
  '600': 0.94,
  '700': 0.78,
  '800': 0.56,
  '900': 0.34,
  '950': 0.2,
};

export const DNA_REQUIRED_AA_PAIRS = [
  ['text', 'background'],
  ['text', 'surface'],
  ['textMuted', 'background'],
  ['textMuted', 'surface'],
  ['link', 'background'],
  ['onPrimary', 'primary'],
  ['onAccent', 'accent'],
] as const satisfies readonly (readonly [DnaSemanticColor, DnaSemanticColor])[];

const ALLOWED_OVERRIDE_KEYS = [
  'typePair',
  'typeRatio',
  'colorStrategy',
  'colorChroma',
  'density',
  'radius',
  'motionDefault',
] as const satisfies readonly (keyof DesignDnaOverrides)[];

const COLOR_STRATEGIES: readonly DnaColorStrategy[] = ['mono', 'neutral-accent', 'duotone'];
const CHROMA_NAMES: readonly DnaChroma[] = ['muted', 'balanced', 'vivid'];
const DENSITIES: readonly DnaDensity[] = ['compact', 'balanced', 'airy'];
const RADII: readonly DnaRadius[] = ['square', 'soft', 'rounded'];
const TYPE_RATIOS: readonly DnaTypeRatio[] = ['major-second', 'minor-third', 'major-third', 'perfect-fourth'];

function oneOf<T extends string>(value: unknown, choices: readonly T[], label: string): asserts value is T {
  if (typeof value !== 'string' || !choices.includes(value as T)) {
    throw new Error(`Invalid DNA ${label}.`);
  }
}

function validateOverrides(overrides: DesignDnaOverrides): void {
  for (const key of Object.keys(overrides)) {
    if (!ALLOWED_OVERRIDE_KEYS.includes(key as keyof DesignDnaOverrides)) {
      throw new Error(`Unknown DNA override: ${key}`);
    }
  }
  if (overrides.typePair !== undefined) oneOf(overrides.typePair, DNA_FONT_PAIR_IDS, 'font pair');
  if (overrides.typeRatio !== undefined) oneOf(overrides.typeRatio, TYPE_RATIOS, 'type ratio');
  if (overrides.colorStrategy !== undefined) oneOf(overrides.colorStrategy, COLOR_STRATEGIES, 'color strategy');
  if (overrides.colorChroma !== undefined) oneOf(overrides.colorChroma, CHROMA_NAMES, 'chroma');
  if (overrides.density !== undefined) oneOf(overrides.density, DENSITIES, 'density');
  if (overrides.radius !== undefined) oneOf(overrides.radius, RADII, 'radius');
  if (overrides.motionDefault !== undefined) {
    oneOf(overrides.motionDefault, ACTIVE_MOTION_SIGNATURE_IDS, 'motion signature');
  }
}

function resolvedDna(dna: DesignDNA, overrides: DesignDnaOverrides): DesignDNA {
  return {
    ...dna,
    type: {
      pair: overrides.typePair ?? dna.type.pair,
      ratio: overrides.typeRatio ?? dna.type.ratio,
    },
    color: {
      strategy: overrides.colorStrategy ?? dna.color.strategy,
      chroma: overrides.colorChroma ?? dna.color.chroma,
    },
    density: overrides.density ?? dna.density,
    radius: overrides.radius ?? dna.radius,
    motionDefault: overrides.motionDefault ?? dna.motionDefault,
  };
}

function ramp(hue: number, baseChroma: number): { raw: Record<keyof typeof LIGHTNESS_STEPS, OklchColor>; css: DnaColorRamp } {
  const raw = Object.fromEntries(Object.entries(LIGHTNESS_STEPS).map(([step, lightness]) => {
    const chroma = chromaAtLightness(baseChroma * CHROMA_CURVE[step as keyof typeof LIGHTNESS_STEPS], lightness);
    return [step, { l: lightness, c: chroma, h: normalizeHue(hue) }];
  })) as Record<keyof typeof LIGHTNESS_STEPS, OklchColor>;
  const css = Object.fromEntries(Object.entries(raw).map(([step, color]) => [step, formatOklch(color)])) as DnaColorRamp;
  return { raw, css };
}

function buildColors(strategy: DnaColorStrategy, chromaName: DnaChroma, hueSeed: number): TokenSet['color'] & {
  corrections: readonly DnaContrastCorrection[];
} {
  const baseChroma = CHROMA_VALUES[chromaName];
  const neutralChroma = strategy === 'mono' ? baseChroma * 0.2 : 0.012;
  const primaryHue = normalizeHue(hueSeed);
  const accentHue = strategy === 'duotone'
    ? normalizeHue(hueSeed + 120)
    : strategy === 'neutral-accent'
      ? normalizeHue(hueSeed + 32)
      : primaryHue;
  const accentChroma = strategy === 'mono' ? baseChroma * 0.55 : baseChroma;
  const neutral = ramp(primaryHue, neutralChroma);
  const primary = ramp(primaryHue, baseChroma);
  const accent = ramp(accentHue, accentChroma);
  const colors: Record<DnaSemanticColor, OklchColor> = {
    accent: accent.raw['500'],
    background: neutral.raw['50'],
    border: neutral.raw['300'],
    focus: primary.raw['600'],
    link: primary.raw['600'],
    onAccent: neutral.raw['50'],
    onPrimary: neutral.raw['50'],
    primary: primary.raw['500'],
    surface: neutral.raw['100'],
    surfaceStrong: neutral.raw['200'],
    text: neutral.raw['950'],
    textMuted: neutral.raw['700'],
  };
  const corrections: DnaContrastCorrection[] = [];

  for (const [foregroundKey, backgroundKey] of DNA_REQUIRED_AA_PAIRS) {
    const before = colors[foregroundKey];
    const result = ensureContrast(before, colors[backgroundKey]);
    if (result.corrected) {
      colors[foregroundKey] = result.color;
      corrections.push({
        token: foregroundKey,
        against: backgroundKey,
        before: formatOklch(before),
        after: formatOklch(result.color),
        beforeRatio: result.beforeRatio,
        afterRatio: result.afterRatio,
      });
    }
  }

  return {
    ramps: { accent: accent.css, neutral: neutral.css, primary: primary.css },
    semantic: Object.fromEntries(
      Object.entries(colors).map(([key, color]) => [key, formatOklch(color)]),
    ) as Record<DnaSemanticColor, string>,
    corrections,
  };
}

const rem = (value: number): string => `${Number(value.toFixed(4))}rem`;

function typography(pairId: DnaFontPairId, ratioId: DnaTypeRatio): TokenSet['typography'] {
  const pair = FONT_PAIRINGS.find((candidate) => candidate.id === pairId);
  if (!pair) throw new Error(`DNA font pair is not registered: ${pairId}`);
  const ratio = DNA_TYPE_RATIO_VALUES[ratioId];
  const base = DABOIM_TYPOGRAPHY.generatedSite.body.fontSize / 16;
  return {
    pair: pairId,
    heading: pair.heading,
    body: pair.body,
    googleFonts: [...pair.googleFonts],
    ratio,
    size: {
      caption: rem(base / ratio),
      body: rem(base),
      lead: rem(base * ratio),
      title: rem(base * ratio ** 2),
      display: rem(base * ratio ** 4),
    },
    lineHeight: {
      body: DABOIM_TYPOGRAPHY.generatedSite.body.lineHeight,
      heading: DABOIM_TYPOGRAPHY.generatedSite.sectionTitle.lineHeight,
    },
  };
}

function spacing(density: DnaDensity): TokenSet['spacing'] {
  const base = SPACING_BASE_REM[density];
  const scale = [1, 1.5, 2.25, 3.375, 5.0625, 7.59375];
  const values = scale.map((factor) => rem(base * factor));
  return {
    xsmall: values[0],
    small: values[1],
    medium: values[2],
    large: values[3],
    xlarge: values[4],
    xxlarge: values[5],
  };
}

function radius(profile: DnaRadius): TokenSet['radius'] {
  const values = RADIUS_VALUES[profile];
  return {
    small: rem(values.small),
    medium: rem(values.medium),
    large: rem(values.large),
    pill: rem(values.pill),
  };
}

function assertHueSeed(hueSeed: number): number {
  if (!Number.isFinite(hueSeed) || hueSeed < 0 || hueSeed > 360) {
    throw new Error('DNA hue seed must be a finite number from 0 through 360.');
  }
  return normalizeHue(hueSeed);
}

/** Deterministically expands one catalog id and enum-only overrides into renderer tokens. */
export function expandTokens(
  dnaId: DesignDnaId,
  hueSeed: number,
  overrides: DesignDnaOverrides = {},
): TokenSet {
  const catalogDna = designDnaById(dnaId);
  if (!catalogDna) throw new Error(`Unknown DesignDNA id: ${dnaId}`);
  validateOverrides(overrides);
  const normalizedHue = assertHueSeed(hueSeed);
  const dna = resolvedDna(catalogDna, overrides);
  const colors = buildColors(dna.color.strategy, dna.color.chroma, normalizedHue);

  return {
    accessibility: {
      minimumTextContrast: 4.5,
      corrections: colors.corrections,
    },
    color: {
      ramps: colors.ramps,
      semantic: colors.semantic,
    },
    identity: {
      dnaId: dna.id,
      hueSeed: normalizedHue,
    },
    motion: {
      signature: dna.motionDefault,
      duration: { fast: '160ms', normal: '320ms', slow: '560ms' },
      easing: {
        enter: 'cubic-bezier(0.16, 1, 0.3, 1)',
        exit: 'cubic-bezier(0.7, 0, 0.84, 0)',
        standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
    radius: radius(dna.radius),
    shadow: {
      low: '0 0.125rem 0.75rem oklch(0.1500 0.0100 260.00 / 0.08)',
      medium: '0 0.5rem 1.75rem oklch(0.1500 0.0100 260.00 / 0.12)',
      high: '0 1rem 3rem oklch(0.1500 0.0100 260.00 / 0.16)',
    },
    spacing: spacing(dna.density),
    typography: typography(dna.type.pair, dna.type.ratio),
  };
}

function sortForJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortForJson(child)]),
    );
  }
  return value;
}

/** Stable key ordering for golden files, caches, and byte-level determinism checks. */
export function stableTokenJson(tokens: TokenSet): string {
  return JSON.stringify(sortForJson(tokens));
}

export function tokenContrastRatio(
  tokens: TokenSet,
  foreground: DnaSemanticColor,
  background: DnaSemanticColor,
): number {
  return ensureContrast(
    parseOklch(tokens.color.semantic[foreground]),
    parseOklch(tokens.color.semantic[background]),
  ).beforeRatio;
}
