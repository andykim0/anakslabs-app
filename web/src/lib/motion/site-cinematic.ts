import type { CanvasElement, MotionSignatureId, SiteConfig } from '@/lib/types/site';
import { signatureContractFor } from './signature-contract';

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

export type SiteProgressRail = NonNullable<
  NonNullable<SiteConfig['siteCinematic']>['progressRail']
>;

/**
 * 신규 생성 경계의 단일 pin 함수. 실제 scene이 있으면 그것이 우선이고, sanitizer가 정적
 * 폴백으로 낮춘 경우에는 검증된 requested ID, 후보 미리보기는 서버 카탈로그 ID를 소비한다.
 * 계약 없는 candidate/legacy와 시그니처 부재는 보수적으로 레일을 만들지 않는다.
 */
export function withSignatureProgressRail(
  config: SiteConfig,
  previewSignatureId?: MotionSignatureId,
): SiteConfig {
  if (!config.siteCinematic) return config;
  const signatureId = config.motion?.signatures?.[0]?.signatureId
    ?? config.motion?.requestedSignatureId
    ?? previewSignatureId;
  const progressRail: SiteProgressRail =
    signatureContractFor(signatureId ?? '')?.renderContract.progressRail ?? 'none';
  if (config.siteCinematic.progressRail === progressRail) return config;
  return {
    ...config,
    siteCinematic: {
      ...config.siteCinematic,
      progressRail,
    },
  };
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
