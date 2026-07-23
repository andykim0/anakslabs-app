import type { SiteTheme } from '@/lib/types/site';
import { oklchToSrgb, parseOklch } from './color';
import type { TokenSet } from './types';

const LEGACY_ROOT_FONT_SIZE = 16;

function toLegacyColor(value: string): string {
  const color = oklchToSrgb(parseOklch(value));
  const channel = (value: number) => Math.round(value * 255).toString(16).padStart(2, '0');
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

function toLegacyRadius(value: string): number {
  const match = /^(\d+(?:\.\d+)?)rem$/u.exec(value);
  if (!match) throw new Error(`Invalid DNA radius token: ${value}`);
  return Number((Number(match[1]) * LEGACY_ROOT_FONT_SIZE).toFixed(4));
}

function scaleRem(value: string, factor: number): string {
  const match = /^(\d+(?:\.\d+)?)rem$/u.exec(value);
  if (!match) throw new Error(`Invalid DNA spacing token: ${value}`);
  return `${Number((Number(match[1]) * factor).toFixed(4))}rem`;
}

/**
 * SiteTheme keeps its legacy slots for OFF compatibility and carries an optional renderer-token
 * projection for DNA configs. Motion signature selection itself remains outside the theme.
 */
export const DNA_SITE_THEME_PROJECTION_REPORT = Object.freeze({
  represented: Object.freeze([
    'typography.heading/body/googleFonts',
    'color.semantic.background/surface/text/textMuted/primary/accent',
    'radius.medium',
    'tokens.radius sharp/soft/pill',
    'tokens.spacing sectionBlock/sectionInline/elementGap',
    'tokens.typography ratio/sizes/line-heights',
    'tokens.color ramp-derived surface/border/muted',
    'tokens.color full 11-step neutral/primary/accent ramps',
    'tokens.shadow low/medium/high',
    'tokens.motion duration/easing',
  ]),
  losses: Object.freeze([
    'color focus/link/on-colors: no component role consumes them yet',
    'motion signature id: motion selection remains the separate SiteConfig.motion contract',
    'OKLCH gamut precision: the existing renderer contract consumes 8-bit sRGB colors',
  ]),
});

/** The only TokenSet → legacy renderer contract boundary. */
export function tokenSetToSiteTheme(tokens: TokenSet): SiteTheme {
  const semantic = tokens.color.semantic;
  return {
    fonts: {
      heading: tokens.typography.heading,
      body: tokens.typography.body,
      googleFonts: [...tokens.typography.googleFonts],
    },
    palette: {
      background: toLegacyColor(semantic.background),
      surface: toLegacyColor(semantic.surface),
      text: toLegacyColor(semantic.text),
      muted: toLegacyColor(semantic.textMuted),
      primary: toLegacyColor(semantic.primary),
      accent: toLegacyColor(semantic.accent),
    },
    radius: toLegacyRadius(tokens.radius.medium),
    tokens: {
      version: 1,
      radius: {
        sharp: tokens.radius.small,
        soft: tokens.radius.large,
        pill: tokens.radius.pill,
      },
      spacing: {
        // Existing 64/24/20 flow rhythm is the balanced midpoint; density changes are visible
        // without teaching renderers the catalog's compact/balanced/airy enum.
        sectionBlock: scaleRem(tokens.spacing.large, 3.2),
        sectionInline: scaleRem(tokens.spacing.medium, 1.7778),
        elementGap: scaleRem(tokens.spacing.medium, 1.4815),
      },
      typography: {
        ratio: tokens.typography.ratio,
        size: { ...tokens.typography.size },
        lineHeight: { ...tokens.typography.lineHeight },
      },
      color: {
        backgroundSubtle: tokens.color.ramps.neutral['50'],
        surfaceSubtle: tokens.color.ramps.neutral['100'],
        surfaceStrong: tokens.color.ramps.neutral['200'],
        border: tokens.color.semantic.border,
        muted: tokens.color.semantic.textMuted,
        ramps: {
          neutral: { ...tokens.color.ramps.neutral },
          primary: { ...tokens.color.ramps.primary },
          accent: { ...tokens.color.ramps.accent },
        },
      },
      shadow: { ...tokens.shadow },
      motion: {
        duration: { ...tokens.motion.duration },
        easing: { ...tokens.motion.easing },
      },
    },
  };
}
