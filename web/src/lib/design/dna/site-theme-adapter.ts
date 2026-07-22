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

/**
 * The current SiteTheme contract has six color slots, one radius, and a font pair.
 * This explicit report prevents unsupported TokenSet groups from being silently approximated.
 */
export const DNA_SITE_THEME_PROJECTION_REPORT = Object.freeze({
  represented: Object.freeze([
    'typography.heading/body/googleFonts',
    'color.semantic.background/surface/text/textMuted/primary/accent',
    'radius.medium',
  ]),
  losses: Object.freeze([
    'color.ramps and semantic border/focus/link/on-colors/surfaceStrong: SiteTheme has no slots',
    'typography ratio/sizes/line-heights: generated canvas typography is not theme-token driven yet',
    'spacing scale: generated canvas geometry is not theme-token driven yet',
    'radius small/large/pill: SiteTheme exposes one base radius only',
    'shadow scale: SiteTheme has no shadow slots',
    'motion signature/durations/easing: motion is stored outside SiteTheme',
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
  };
}
