import type { DesignCandidate } from '@/lib/types/domain';
import type {
  ActiveMotionSignatureId,
  MotionMedia,
  MotionScene,
  Section,
  SiteConfig,
} from '@/lib/types/site';
import type { AssetRecord, AssetRef } from './provenance';
import {
  HERO_PHOTO_FOCAL_MAX,
  HERO_PHOTO_FOCAL_MIN,
  HERO_PHOTO_SAFE_FOCAL_POINTS,
  HERO_PHOTO_VIEWPORT_BANDS,
  viewportCropGuidance,
  type HeroPhotoCropAssessment,
  type HeroPhotoQualityStamp,
  type HeroPhotoViewportBand,
} from './hero-photo-quality';
import {
  SIGNATURE_TEXT_SAFE_ZONE_GEOMETRY,
  isActiveSignatureContractId,
  resolvePlacement,
  type NormalizedSignatureZone,
  type SignatureTextSafeZoneId,
} from '@/lib/motion/signature-contract';

export const SYSTEM_HERO_PREVIEW_URLS = {
  light: '/mock/candidate-light.svg',
  dark: '/mock/candidate-dark.svg',
  dimensional: '/mock/candidate-3d.svg',
} as const;

export interface HeroPhotoFocusPlan {
  signatureId?: ActiveMotionSignatureId;
  wideSafeZone: SignatureTextSafeZoneId;
  compactSafeZone: SignatureTextSafeZoneId;
  mobileSafeZone: SignatureTextSafeZoneId;
  wideSafeGeometry: NormalizedSignatureZone;
  compactSafeGeometry: NormalizedSignatureZone;
  mobileSafeGeometry: NormalizedSignatureZone;
  focalPoint: { x: number; y: number };
  compactFocalPoint: { x: number; y: number };
  mobileFocalPoint: { x: number; y: number };
  responsivePromotion: NonNullable<
    NonNullable<Section['background']['image']>['responsivePromotion']
  >;
}

function channel(value: string): number | null {
  const parsed = Number.parseInt(value, 16);
  return Number.isFinite(parsed) ? parsed / 255 : null;
}

function paletteIsDark(color: string): boolean {
  const match = /^#([0-9a-f]{6})$/iu.exec(color.trim());
  if (!match) return false;
  const r = channel(match[1].slice(0, 2));
  const g = channel(match[1].slice(2, 4));
  const b = channel(match[1].slice(4, 6));
  return r !== null && g !== null && b !== null && (0.2126 * r + 0.7152 * g + 0.0722 * b) < 0.48;
}

/** The URL is a preview surface only. The published no-photo hero is the DNA procedural renderer. */
export function systemHeroPreviewForCandidate(candidate: DesignCandidate): string {
  if (candidate.style === '3d_render') return SYSTEM_HERO_PREVIEW_URLS.dimensional;
  return paletteIsDark(candidate.theme.palette.background)
    ? SYSTEM_HERO_PREVIEW_URLS.dark
    : SYSTEM_HERO_PREVIEW_URLS.light;
}

/**
 * Server-owned decision. A client may round-trip the projection, but the registry record always
 * overwrites presentation, quality, URL, and asset ref at candidates/generate boundaries.
 */
export function resolveHeroPhotoCandidate(
  candidate: DesignCandidate,
  record: AssetRecord,
): DesignCandidate {
  const resolved = { ...candidate };
  delete resolved.heroAssetRef;
  delete resolved.heroPhotoQuality;
  if (record.imageQuality) resolved.heroPhotoQuality = record.imageQuality;

  if (record.imageQuality?.passed) {
    return {
      ...resolved,
      heroImageUrl: record.canonicalUrl,
      heroAssetRef: { assetId: record.id, url: record.canonicalUrl },
      heroPresentation: 'promoted_customer_photo',
    };
  }
  return {
    ...resolved,
    heroImageUrl: systemHeroPreviewForCandidate(candidate),
    heroPresentation: 'system',
  };
}

function pointInside(zone: NormalizedSignatureZone, point: { x: number; y: number }): boolean {
  return point.x >= zone.x
    && point.x <= zone.x + zone.width
    && point.y >= zone.y
    && point.y <= zone.y + zone.height;
}

function distanceFromZone(zone: NormalizedSignatureZone, point: { x: number; y: number }): number {
  const dx = Math.max(zone.x - point.x, 0, point.x - (zone.x + zone.width));
  const dy = Math.max(zone.y - point.y, 0, point.y - (zone.y + zone.height));
  return Math.hypot(dx, dy);
}

export function clampHeroPhotoFocalPoint(point: { x: number; y: number }) {
  return {
    x: Math.min(HERO_PHOTO_FOCAL_MAX, Math.max(HERO_PHOTO_FOCAL_MIN, point.x)),
    y: Math.min(HERO_PHOTO_FOCAL_MAX, Math.max(HERO_PHOTO_FOCAL_MIN, point.y)),
  };
}

function orderedFocalPointsOutsideTextZone(
  zone: NormalizedSignatureZone,
): { x: number; y: number }[] {
  return HERO_PHOTO_SAFE_FOCAL_POINTS
    .map(clampHeroPhotoFocalPoint)
    .sort((left, right) => {
      const outsideDelta = Number(pointInside(zone, left)) - Number(pointInside(zone, right));
      return outsideDelta
        || distanceFromZone(zone, right) - distanceFromZone(zone, left)
        || left.x - right.x
        || left.y - right.y;
    });
}

/** Deterministically reserves the opposite quiet area; no pixel crop or image mutation is involved. */
export function focalPointOutsideTextZone(
  zone: NormalizedSignatureZone,
): { x: number; y: number } {
  return orderedFocalPointsOutsideTextZone(zone)[0]!;
}

function heroSignature(config: SiteConfig, hero: Section): ActiveMotionSignatureId | undefined {
  const id = config.motion?.signatures?.find((scene) => scene.sectionId === hero.id)?.signatureId;
  return id && isActiveSignatureContractId(id) ? id : undefined;
}

function samePoint(
  left: { x: number; y: number },
  right: { x: number; y: number },
): boolean {
  return Math.abs(left.x - right.x) < 0.000_001 && Math.abs(left.y - right.y) < 0.000_001;
}

function resolveBandFocus(
  band: HeroPhotoViewportBand,
  zone: NormalizedSignatureZone,
  quality?: HeroPhotoQualityStamp,
) {
  const ordered = orderedFocalPointsOutsideTextZone(zone);
  const assessments = quality?.viewportCrops?.[band] ?? [];
  const matching = (point: { x: number; y: number }): HeroPhotoCropAssessment | undefined =>
    assessments.find((assessment) => samePoint(assessment.focalPoint, point));
  const selected = ordered.find((point) =>
    matching(point)?.passed && !pointInside(zone, point)) ?? ordered[0]!;
  const assessment = matching(selected);
  const safeForCopy = !pointInside(zone, selected);
  const reasons = assessment
    ? [...assessment.reasons, ...(safeForCopy ? [] : ['text_safe_zone_conflict'] as const)]
    : ['crop_evidence_missing'] as const;
  return {
    focalPoint: selected,
    status: {
      promoted: assessment?.passed === true && safeForCopy,
      reasons: [...reasons],
      guidance: safeForCopy
        ? assessment?.guidance ?? viewportCropGuidance(band, ['crop_information_too_low'])
        : viewportCropGuidance(band, ['crop_boundary_cut_risk']),
    },
  };
}

export function resolveHeroPhotoFocusPlan(
  config: SiteConfig,
  hero: Section,
  quality?: HeroPhotoQualityStamp,
): HeroPhotoFocusPlan {
  const signatureId = heroSignature(config, hero);
  const widePlacement = signatureId
    ? resolvePlacement(signatureId, 0, 'wide', { phase: 'hold' })
    : {
        zone: 'start-middle' as const,
        normalized: SIGNATURE_TEXT_SAFE_ZONE_GEOMETRY.wide['start-middle'],
      };
  const compactPlacement = signatureId
    ? resolvePlacement(signatureId, 0, 'compact', { phase: 'hold' })
    : {
        zone: 'start-middle' as const,
        normalized: SIGNATURE_TEXT_SAFE_ZONE_GEOMETRY.compact['start-middle'],
      };
  const mobilePlacement = signatureId
    ? resolvePlacement(signatureId, 0, 'mobile', { phase: 'hold' })
    : {
        zone: 'center-middle' as const,
        normalized: SIGNATURE_TEXT_SAFE_ZONE_GEOMETRY.mobile['center-middle'],
      };
  const wide = resolveBandFocus('wide', widePlacement.normalized, quality);
  const compact = resolveBandFocus('compact', compactPlacement.normalized, quality);
  const mobile = resolveBandFocus('mobile', mobilePlacement.normalized, quality);
  return {
    ...(signatureId ? { signatureId } : {}),
    wideSafeZone: widePlacement.zone,
    compactSafeZone: compactPlacement.zone,
    mobileSafeZone: mobilePlacement.zone,
    wideSafeGeometry: widePlacement.normalized,
    compactSafeGeometry: compactPlacement.normalized,
    mobileSafeGeometry: mobilePlacement.normalized,
    focalPoint: wide.focalPoint,
    compactFocalPoint: compact.focalPoint,
    mobileFocalPoint: mobile.focalPoint,
    responsivePromotion: {
      version: 1,
      sourceStampSha256: quality?.stampSha256 ?? '0'.repeat(64),
      wide: wide.status,
      compact: compact.status,
      mobile: mobile.status,
    },
  };
}

function rewriteMedia(
  media: MotionMedia | undefined,
  sourceUrl: string,
  systemUrl: string,
  focus: HeroPhotoFocusPlan,
  promoted: boolean,
): MotionMedia | undefined {
  if (!media || media.kind !== 'image' || media.src !== sourceUrl) return media;
  if (promoted) {
    return {
      ...media,
      focalPoint: focus.focalPoint,
      compactFocalPoint: focus.compactFocalPoint,
      mobileFocalPoint: focus.mobileFocalPoint,
      responsivePromotion: focus.responsivePromotion,
    };
  }
  const fallback: MotionMedia = {
    ...media,
    src: systemUrl,
    provenance: 'curated',
    focalPoint: { x: 0.5, y: 0.5 },
    compactFocalPoint: { x: 0.5, y: 0.5 },
    mobileFocalPoint: { x: 0.5, y: 0.5 },
  };
  delete fallback.assetId;
  return fallback;
}

function rewriteScene(
  scene: MotionScene,
  heroId: string,
  sourceUrl: string,
  systemUrl: string,
  focus: HeroPhotoFocusPlan,
  promoted: boolean,
): MotionScene {
  if (scene.sectionId !== heroId) return scene;
  switch (scene.signatureId) {
    case 'sticky-chapters':
      return {
        ...scene,
        chapters: scene.chapters.map((item) => ({
          ...item,
          media: rewriteMedia(item.media, sourceUrl, systemUrl, focus, promoted),
        })),
      };
    case 'true-card-stack':
      return {
        ...scene,
        cards: scene.cards.map((item) => ({
          ...item,
          media: rewriteMedia(item.media, sourceUrl, systemUrl, focus, promoted),
        })),
      };
    case 'portal-zoom':
    case 'scroll-curtain':
      return {
        ...scene,
        scenes: scene.scenes.map((item) => ({
          ...item,
          media: rewriteMedia(item.media, sourceUrl, systemUrl, focus, promoted),
        })),
      };
    case 'mosaic-reveal':
      return {
        ...scene,
        images: scene.images.map((media) =>
          rewriteMedia(media, sourceUrl, systemUrl, focus, promoted) ?? media),
      };
    case 'horizontal-story':
      return {
        ...scene,
        panels: scene.panels.map((item) => ({
          ...item,
          media: rewriteMedia(item.media, sourceUrl, systemUrl, focus, promoted),
        })),
      };
    default:
      return scene;
  }
}

function replaceHero(config: SiteConfig, hero: Section, nextHero: Section): SiteConfig {
  return {
    ...config,
    pages: config.pages.map((page) => ({
      ...page,
      sections: page.sections.map((section) => section.id === hero.id ? nextHero : section),
    })),
  };
}

/**
 * New-generation-only renderer projection. Existing stored configs never call this function, so
 * their SiteConfig and HTML remain unchanged.
 */
export function applyHeroPhotoPromotion(input: {
  config: SiteConfig;
  candidate: DesignCandidate;
  customerPhotoRef: AssetRef;
}): SiteConfig {
  const hero = input.config.pages
    .find((page) => page.slug === '')
    ?.sections.find((section) => section.type === 'hero' && !section.hidden);
  if (!hero || !input.config.siteCinematic) return input.config;

  const promoted = input.candidate.heroPresentation === 'promoted_customer_photo'
    && input.candidate.heroPhotoQuality?.passed === true
    && input.candidate.heroAssetRef?.assetId === input.customerPhotoRef.assetId
    && input.candidate.heroAssetRef.url === input.customerPhotoRef.url;
  const systemUrl = systemHeroPreviewForCandidate(input.candidate);
  const focus = resolveHeroPhotoFocusPlan(
    input.config,
    hero,
    promoted ? input.candidate.heroPhotoQuality : undefined,
  );
  const promotedInAnyBand = promoted && HERO_PHOTO_VIEWPORT_BANDS.some(
    (band) => focus.responsivePromotion[band].promoted,
  );
  const nextHero: Section = promotedInAnyBand
    ? {
        ...hero,
        background: {
          ...hero.background,
          image: {
            ...(hero.background.image ?? { src: input.customerPhotoRef.url }),
            src: input.customerPhotoRef.url,
            focalPoint: focus.focalPoint,
            compactFocalPoint: focus.compactFocalPoint,
            mobileFocalPoint: focus.mobileFocalPoint,
            responsivePromotion: focus.responsivePromotion,
          },
        },
      }
    : {
        ...hero,
        background: (() => {
          const background = { ...hero.background };
          delete background.image;
          return background;
        })(),
      };
  const withHero = replaceHero(input.config, hero, nextHero);
  return {
    ...withHero,
    siteCinematic: {
      ...withHero.siteCinematic!,
      heroBackdrop: promotedInAnyBand ? 'promoted-photo' : 'dna-procedural',
    },
    meta: {
      ...withHero.meta,
      ogImage: promotedInAnyBand ? input.customerPhotoRef.url : systemUrl,
    },
    ...(withHero.motion?.signatures
      ? {
          motion: {
            ...withHero.motion,
            signatures: withHero.motion.signatures.map((scene) =>
              rewriteScene(
                scene,
                hero.id,
                input.customerPhotoRef.url,
                systemUrl,
                focus,
                promotedInAnyBand,
              )),
          },
        }
      : {}),
  };
}
