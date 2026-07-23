import type { SiteTheme, SiteThemeTokens } from '@/lib/types/site';

export type ThemeRadiusRole = 'sharp' | 'soft' | 'pill';
export type ThemeColorRole = Exclude<keyof SiteThemeTokens['color'], 'ramps'>;

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

export function themeSectionBlockDelta(theme: SiteTheme): number {
  if (!theme.tokens) return 0;
  return tokenRemToPx(theme.tokens.spacing.sectionBlock) - 64;
}
