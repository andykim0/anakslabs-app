import type { CanvasElement, SiteConfig } from '@/lib/types/site';

/** Server-authored rollout contract. Absence is the permanent legacy pixel-parity path. */
export const SITE_CINEMATIC_DEFAULT: NonNullable<SiteConfig['siteCinematic']> = Object.freeze({
  version: 1,
  heroBackdrop: 'dna-procedural',
  sectionSpine: true,
  quietSections: true,
  integratedTypography: true,
});

/** MAIN 신규 생성본 전용. 기존 SITECINE v1에는 소급하지 않는다. */
export const CONTINUOUS_CANVAS_DEFAULT: NonNullable<
  NonNullable<SiteConfig['siteCinematic']>['continuousCanvas']
> = Object.freeze({
  version: 1,
  toneField: 'palette-bridge',
  immersiveScroll: true,
  minimumContentChapters: 3,
});

export function withSiteCinematicDefault(config: SiteConfig): SiteConfig {
  if (config.siteCinematic?.version === SITE_CINEMATIC_DEFAULT.version) return config;
  return { ...config, siteCinematic: SITE_CINEMATIC_DEFAULT };
}

export function siteCinematicIsEnabled(config: SiteConfig): boolean {
  return config.siteCinematic?.version === SITE_CINEMATIC_DEFAULT.version;
}

/** Server-only generation seam. Calling code decides whether the survey opted into MAIN. */
export function withContinuousCanvasDefault(config: SiteConfig): SiteConfig {
  const cinematic = config.siteCinematic ?? SITE_CINEMATIC_DEFAULT;
  if (cinematic.continuousCanvas?.version === CONTINUOUS_CANVAS_DEFAULT.version) return config;
  return {
    ...config,
    siteCinematic: {
      ...cinematic,
      continuousCanvas: CONTINUOUS_CANVAS_DEFAULT,
    },
  };
}

export function continuousCanvasIsEnabled(config: SiteConfig): boolean {
  return siteCinematicIsEnabled(config) &&
    config.siteCinematic?.continuousCanvas?.version === CONTINUOUS_CANVAS_DEFAULT.version;
}

export type ContinuousFlowLayerRole = 'copy' | 'media' | 'action';

/** DOM choreography role only; content and fixed geometry remain owned by the renderer. */
export function continuousFlowLayerRoleFor(element: CanvasElement): ContinuousFlowLayerRole | undefined {
  if (element.kind === 'text') return 'copy';
  if (element.kind === 'image' || element.kind === 'video' || element.kind === 'map') return 'media';
  if (element.kind === 'button' || element.kind === 'form' || element.kind === 'socialLinks') return 'action';
  return undefined;
}
