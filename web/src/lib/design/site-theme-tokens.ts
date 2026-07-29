import type { SiteTheme, SiteThemeTokens } from '@/lib/types/site';
import type { SectionSurfaceTone } from '@/lib/layout/section-layout-types';

export type ThemeRadiusRole = 'sharp' | 'soft' | 'pill';
export type ThemeColorRole = Exclude<keyof SiteThemeTokens['color'], 'ramps'>;

export interface SectionSurfacePaint {
  requestedTone: SectionSurfaceTone;
  resolvedTone: SectionSurfaceTone;
  enhanced: boolean;
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  dark: boolean;
}

const ROOT_FONT_SIZE = 16;

export function tokenRemToPx(value: string): number {
  const match = /^(\d+(?:\.\d+)?)rem$/u.exec(value);
  if (!match) throw new Error(`Invalid renderer rem token: ${value}`);
  return Number((Number(match[1]) * ROOT_FONT_SIZE).toFixed(4));
}

export function themeRadius(
  theme: SiteTheme,
  role: ThemeRadiusRole,
  legacy: number,
): string | number {
  return theme.tokens?.radius[role] ?? legacy;
}

export function themeColor(theme: SiteTheme, role: ThemeColorRole): string {
  const token = theme.tokens?.color[role];
  if (token) return token;
  switch (role) {
    case 'backgroundSubtle':
      return theme.palette.background;
    case 'surfaceSubtle':
    case 'surfaceStrong':
      return theme.palette.surface;
    case 'border':
    case 'muted':
      return theme.palette.muted;
  }
}

/** Replace only builder-owned palette values; explicit customer/editor colors remain authoritative. */
export function resolveThemePaint(
  theme: SiteTheme,
  value: string | undefined,
  fallback: 'backgroundSubtle' | 'surfaceSubtle' | 'surfaceStrong' | 'muted',
): string {
  const legacyFallback = fallback === 'backgroundSubtle'
    ? theme.palette.background
    : fallback === 'muted'
      ? theme.palette.muted
      : theme.palette.surface;
  const actual = value ?? legacyFallback;
  if (!theme.tokens) return actual;
  if (actual === theme.palette.background) return themeColor(theme, 'backgroundSubtle');
  if (actual === theme.palette.surface) return themeColor(theme, fallback === 'surfaceStrong' ? 'surfaceStrong' : 'surfaceSubtle');
  if (actual === theme.palette.muted) return themeColor(theme, 'muted');
  return actual;
}

interface OklchChannels {
  l: number;
  c: number;
  h: number;
}

function parseHexColor(value: string): [number, number, number] | null {
  const match = /^#([a-f0-9]{6})$/iu.exec(value);
  if (!match) return null;
  return [
    Number.parseInt(match[1].slice(0, 2), 16) / 255,
    Number.parseInt(match[1].slice(2, 4), 16) / 255,
    Number.parseInt(match[1].slice(4, 6), 16) / 255,
  ];
}

function linearSrgb(value: number): number {
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

function hexToOklch(value: string): OklchChannels | null {
  const rgb = parseHexColor(value);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(linearSrgb);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const yellowBlue = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const hue = (Math.atan2(yellowBlue, a) * 180 / Math.PI + 360) % 360;
  return {
    l: lightness,
    c: Math.sqrt(a * a + yellowBlue * yellowBlue),
    h: hue,
  };
}

function parseOklchChannels(value: string): OklchChannels | null {
  const match = /^oklch\((\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\)$/u
    .exec(value);
  return match
    ? { l: Number(match[1]), c: Number(match[2]), h: Number(match[3]) }
    : null;
}

function formatSurfaceOklch(value: OklchChannels): string {
  return `oklch(${value.l.toFixed(4)} ${value.c.toFixed(4)} ${value.h.toFixed(2)})`;
}

function semanticBaseSurface(theme: SiteTheme, requestedTone: SectionSurfaceTone): SectionSurfacePaint {
  return {
    requestedTone,
    resolvedTone: 'base',
    enhanced: false,
    background: resolveThemePaint(theme, theme.palette.background, 'backgroundSubtle'),
    surface: resolveThemePaint(theme, theme.palette.surface, 'surfaceStrong'),
    text: theme.palette.text,
    muted: theme.palette.muted,
    border: theme.tokens?.color.border ?? theme.palette.muted,
    accent: theme.palette.accent,
    dark: false,
  };
}

/**
 * Common surface-tone resolver. Stored configs carry only the enum; concrete colors are derived
 * from theme ramps. Missing ramps are deliberately a semantic single-tone fail-closed path.
 */
export function resolveSectionSurfaceTone(
  theme: SiteTheme,
  requestedTone: SectionSurfaceTone,
): SectionSurfacePaint {
  const ramps = theme.tokens?.color.ramps;
  if (!ramps) return semanticBaseSurface(theme, requestedTone);
  const primary = hexToOklch(theme.palette.primary)
    ?? parseOklchChannels(ramps.primary['500']);
  if (!primary) return semanticBaseSurface(theme, requestedTone);

  // Near-neutral brands receive a deterministic warm-neutral hue, never a stored/free hex.
  const hue = primary.c < 0.02 ? 75 : primary.h;
  const tint = formatSurfaceOklch({ l: 0.92, c: 0.015, h: hue });
  const brand = formatSurfaceOklch({
    l: 0.95,
    c: Math.min(0.04, Math.max(0.025, primary.c * 0.42)),
    h: hue,
  });
  if (requestedTone === 'dark') {
    const darkChroma = primary.c < 0.02
      ? 0.018
      : Math.min(0.04, Math.max(0.024, primary.c * 0.3));
    return {
      requestedTone,
      resolvedTone: 'dark',
      enhanced: true,
      background: formatSurfaceOklch({ l: 0.16, c: darkChroma, h: hue }),
      surface: formatSurfaceOklch({
        l: 0.2,
        c: Math.min(0.04, darkChroma * 0.86),
        h: hue,
      }),
      text: ramps.neutral['50'],
      muted: ramps.neutral['200'],
      border: ramps.neutral['700'],
      accent: ramps.primary['200'],
      dark: true,
    };
  }
  return {
    requestedTone,
    resolvedTone: requestedTone,
    enhanced: true,
    background: requestedTone === 'tint'
      ? tint
      : requestedTone === 'brand'
        ? brand
        : theme.palette.background,
    surface: theme.palette.surface,
    text: theme.palette.text,
    muted: theme.palette.muted,
    border: theme.tokens?.color.border ?? theme.palette.muted,
    accent: theme.palette.accent,
    dark: false,
  };
}

/** Driver/test helper: reports the OKLCH lightness separation from semantic base. */
export function sectionSurfaceLightnessDelta(
  theme: SiteTheme,
  tone: SectionSurfaceTone,
): number {
  const base = hexToOklch(theme.palette.background)
    ?? parseOklchChannels(theme.tokens?.color.backgroundSubtle ?? '');
  const paint = resolveSectionSurfaceTone(theme, tone);
  const target = hexToOklch(paint.background) ?? parseOklchChannels(paint.background);
  if (!base || !target) return 0;
  return Number(Math.abs(base.l - target.l).toFixed(4));
}

export function themeSectionBlockDelta(theme: SiteTheme): number {
  if (!theme.tokens) return 0;
  return tokenRemToPx(theme.tokens.spacing.sectionBlock) - 64;
}
