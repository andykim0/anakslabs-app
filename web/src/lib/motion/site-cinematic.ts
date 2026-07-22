import type { SiteConfig } from '@/lib/types/site';

/** Server-authored rollout contract. Absence is the permanent legacy pixel-parity path. */
export const SITE_CINEMATIC_DEFAULT: NonNullable<SiteConfig['siteCinematic']> = Object.freeze({
  version: 1,
  heroBackdrop: 'dna-procedural',
  sectionSpine: true,
  quietSections: true,
  integratedTypography: true,
});

export function withSiteCinematicDefault(config: SiteConfig): SiteConfig {
  if (config.siteCinematic?.version === SITE_CINEMATIC_DEFAULT.version) return config;
  return { ...config, siteCinematic: SITE_CINEMATIC_DEFAULT };
}

export function siteCinematicIsEnabled(config: SiteConfig): boolean {
  return config.siteCinematic?.version === SITE_CINEMATIC_DEFAULT.version;
}
