/**
 * Deterministic MotionScene construction from trusted survey/config content.
 *
 * Important: this module never reads CanvasElement.frame/x/y. Element array order is the
 * only fallback order, while repeatable cards, milestones, and mosaics come from structured
 * SurveyInput fields. Section.elements remain untouched as the editor/static fallback.
 */
import { buildNarrativeArc } from '@/lib/data/narrative-arc';
import type { SurveyInput } from '@/lib/types/domain';
import type { AssetRef } from '@/lib/assets/provenance';
import type {
  CustomerCaseMedia,
  MotionMedia,
  MotionScene,
  ProductionMotionSignatureId,
  Section,
  SectionType,
  SiteConfig,
  SitePage,
} from '@/lib/types/site';

const MEDIA_WIDTH = 1600;
const MEDIA_HEIGHT = 900;

export interface BuildMotionSceneOptions {
  /** before-after IDs resolved to server-owned asset records before this builder is called. */
  customerCaseMedia?: readonly CustomerCaseMedia[];
  /**
   * Direct-upload refs already resolved through the authenticated server truth boundary.
   * Survey URLs and client-supplied refs alone are never sufficient evidence.
   */
  customerUploadAssetRefs?: readonly AssetRef[];
}

function homePage(config: SiteConfig): SitePage | undefined {
  return config.pages.find((page) => page.slug === '') ?? config.pages[0];
}

function firstText(section: Section): string | undefined {
  for (const element of section.elements) {
    if (element.kind === 'text' && element.text.trim()) return element.text.trim();
  }
  return undefined;
}

function sectionBody(section: Section): string | undefined {
  const values: string[] = [];
  for (const element of section.elements) {
    if (element.kind === 'text' && element.text.trim()) values.push(element.text.trim());
  }
  return values.length > 1 ? values.slice(1, 3).join(' ') : values[0];
}

/** Hero's first text node is its heading; never duplicate that heading as body copy. */
function heroBody(section: Section): string | undefined {
  const values: string[] = [];
  for (const element of section.elements) {
    if (element.kind === 'text' && element.text.trim()) values.push(element.text.trim());
  }
  return values.length > 1 ? values.slice(1, 3).join(' ') : undefined;
}

function customerUploadRefFor(
  src: string,
  options: BuildMotionSceneOptions,
): AssetRef | undefined {
  return options.customerUploadAssetRefs?.find((ref) => ref.url === src);
}

function mediaTruthFor(
  src: string,
  survey: SurveyInput,
  options: BuildMotionSceneOptions,
): Pick<MotionMedia, 'provenance' | 'assetId'> {
  const verifiedUpload = customerUploadRefFor(src, options);
  if (verifiedUpload) {
    return { provenance: 'customer-provided', assetId: verifiedUpload.assetId };
  }

  // Existing URL-only configs keep their historical render projection. New v2
  // construction fails closed and may only gain customer provenance above.
  if (survey.imageDirectionId) return { provenance: 'unknown' };
  if (survey.heroImageChoice === 'upload' && survey.heroPhotoUrl === src) {
    return { provenance: 'customer-provided' };
  }
  if (survey.heroImageChoice?.startsWith('ai-') && homeImageSource(survey) === src) {
    return { provenance: 'ai-generated' };
  }
  const legacyCustomerUrls = new Set(survey.storePhotoUrls ?? []);
  if (legacyCustomerUrls.has(src)) return { provenance: 'customer-provided' };
  return { provenance: 'unknown' };
}

function homeImageSource(survey: SurveyInput): string | undefined {
  return survey.heroImageChoice === 'upload' ? survey.heroPhotoUrl : undefined;
}

function sectionMedia(
  section: Section,
  survey: SurveyInput,
  id: string,
  options: BuildMotionSceneOptions,
): MotionMedia | undefined {
  const video = section.background.video;
  if (video?.src && video.poster) {
    return {
      id,
      kind: 'video',
      src: video.src,
      poster: video.poster,
      alt: `${section.name} 영상`,
      width: MEDIA_WIDTH,
      height: MEDIA_HEIGHT,
      focalPoint: { x: 0.5, y: 0.5 },
      provenance: 'unknown',
    };
  }
  const background = section.background.image?.src;
  if (background) {
    return {
      id,
      kind: 'image',
      src: background,
      alt: `${section.name} 이미지`,
      width: MEDIA_WIDTH,
      height: MEDIA_HEIGHT,
      focalPoint: { x: 0.5, y: 0.5 },
      ...mediaTruthFor(background, survey, options),
    };
  }
  const image = section.elements.find((element) => element.kind === 'image' && element.src);
  if (!image || image.kind !== 'image') return undefined;
  return {
    id,
    kind: 'image',
    src: image.src,
    alt: image.alt?.trim() || `${section.name} 이미지`,
    width: MEDIA_WIDTH,
    height: MEDIA_HEIGHT,
    focalPoint: { x: 0.5, y: 0.5 },
    ...mediaTruthFor(image.src, survey, options),
  };
}

function targetSection(page: SitePage, types: readonly SectionType[]): Section | undefined {
  return page.sections.find((section) => !section.hidden && types.includes(section.type));
}

function editorialSourcesForSurvey(
  page: SitePage,
  survey: SurveyInput,
  options: BuildMotionSceneOptions,
) {
  return page.sections
    .filter((section) => !section.hidden && !['hero', 'contact', 'cta'].includes(section.type))
    .map((section) => {
      const body = sectionBody(section);
      return body ? {
        section,
        heading: section.name,
        body,
        media: sectionMedia(section, survey, `media-${section.id}`, options),
      } : null;
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);
}

/**
 * Image-or-video signatures consume the already selected hero asset as their first real
 * scene. This keeps onboarding media choice and published output on one production path.
 */
function heroEditorialSource(
  page: SitePage,
  survey: SurveyInput,
  options: BuildMotionSceneOptions,
) {
  const hero = targetSection(page, ['hero']);
  if (!hero) return undefined;
  const media = sectionMedia(hero, survey, `media-${hero.id}`, options);
  const body = heroBody(hero);
  if (!media || !body) return undefined;
  return {
    section: hero,
    heading: firstText(hero) ?? survey.tagline ?? survey.businessName,
    body,
    media,
  };
}

function buildCinematic(
  config: SiteConfig,
  survey: SurveyInput,
  options: BuildMotionSceneOptions,
): MotionScene | null {
  const page = homePage(config);
  const hero = page && targetSection(page, ['hero']);
  const media = hero && sectionMedia(hero, survey, `media-${hero.id}`, options);
  if (!page || !hero || !media || media.kind !== 'video') return null;
  return {
    signatureId: 'cinematic-scrub', pageId: page.id, sectionId: hero.id,
    heading: firstText(hero) ?? survey.tagline ?? survey.businessName,
    ...(heroBody(hero) ? { body: heroBody(hero) } : {}),
    media,
  };
}

function buildManifesto(
  config: SiteConfig,
  survey: SurveyInput,
  options: BuildMotionSceneOptions,
): MotionScene | null {
  const page = homePage(config);
  const hero = page && targetSection(page, ['hero']);
  const media = hero && sectionMedia(hero, survey, `media-${hero.id}`, options);
  const acts = buildNarrativeArc(survey);
  if (!page || !hero || !media || media.kind !== 'video' || acts.length < 3 || acts.length > 5) return null;
  return {
    signatureId: 'scrollytelling-manifesto', pageId: page.id, sectionId: hero.id, media,
    acts: acts.map((act, index) => ({ id: `act-${index + 1}`, ...act })),
  };
}

function buildStickyChapters(
  config: SiteConfig,
  survey: SurveyInput,
  options: BuildMotionSceneOptions,
): MotionScene | null {
  const page = homePage(config);
  const hero = page && targetSection(page, ['hero']);
  if (!page || !hero) return null;
  const heroSource = heroEditorialSource(page, survey, options);
  const sources = [
    ...(heroSource ? [heroSource] : []),
    ...editorialSourcesForSurvey(page, survey, options).filter((source) => source.media),
  ].slice(0, 5);
  if (sources.length < 3) return null;
  return {
    signatureId: 'sticky-chapters', pageId: page.id, sectionId: hero.id,
    chapters: sources.map((source, index) => ({
      id: `chapter-${index + 1}`,
      sourceSectionId: source.section.id,
      heading: source.heading,
      body: source.body,
      ...(source.media ? { media: source.media } : {}),
    })),
  };
}

function buildCards(
  config: SiteConfig,
  survey: SurveyInput,
  options: BuildMotionSceneOptions,
): MotionScene | null {
  const page = homePage(config);
  const section = page && targetSection(page, ['menu', 'features', 'pricing', 'gallery', 'cases']);
  const items = survey.contentItems
    ?.filter((item) => item.name.trim() && Boolean(item.description?.trim() || item.price?.trim()))
    .slice(0, 6) ?? [];
  if (!page || !section || items.length < 3) return null;
  return {
    signatureId: 'true-card-stack', pageId: page.id, sectionId: section.id, heading: section.name,
    cards: items.map((item, index) => ({
      id: `card-${index + 1}`,
      heading: item.name.trim(),
      body: item.description?.trim() || item.price!.trim(),
      ...(item.description?.trim() && item.price?.trim() ? { caption: item.price.trim() } : {}),
      ...(item.photoUrl ? {
        media: {
          id: `card-media-${index + 1}`,
          kind: 'image' as const,
          src: item.photoUrl,
          alt: item.name.trim(),
          width: MEDIA_WIDTH,
          height: MEDIA_HEIGHT,
          focalPoint: { x: 0.5, y: 0.5 },
          ...mediaTruthFor(item.photoUrl, survey, options),
        },
      } : {}),
    })),
  };
}

function buildEditorial(
  signatureId: 'portal-zoom' | 'scroll-curtain' | 'horizontal-story',
  config: SiteConfig,
  survey: SurveyInput,
  options: BuildMotionSceneOptions,
): MotionScene | null {
  const page = homePage(config);
  const hero = page && targetSection(page, ['hero']);
  if (!page || !hero) return null;
  const limits = signatureId === 'portal-zoom' ? [2, 3] : signatureId === 'scroll-curtain' ? [2, 4] : [3, 6];
  const heroSource = heroEditorialSource(page, survey, options);
  const sources = [
    ...(heroSource ? [heroSource] : []),
    ...editorialSourcesForSurvey(page, survey, options).filter((source) => source.media),
  ].slice(0, limits[1]);
  if (sources.length < limits[0]) return null;
  const items = sources.map((source, index) => ({
    id: `${signatureId}-${index + 1}`,
    sourceSectionId: source.section.id,
    heading: source.heading,
    body: source.body,
    ...(source.media ? { media: source.media } : {}),
  }));
  if (signatureId === 'portal-zoom') {
    return { signatureId, pageId: page.id, sectionId: hero.id, scenes: items };
  }
  if (signatureId === 'scroll-curtain') {
    return { signatureId, pageId: page.id, sectionId: hero.id, scenes: items };
  }
  return { signatureId, pageId: page.id, sectionId: hero.id, heading: firstText(hero), panels: items };
}

function buildMosaic(
  config: SiteConfig,
  survey: SurveyInput,
  options: BuildMotionSceneOptions,
): MotionScene | null {
  const page = homePage(config);
  const section = page && targetSection(page, ['gallery']);
  const seenAssetIds = new Set<string>();
  const photos = survey.storePhotoUrls?.filter((src) => {
    if (!src) return false;
    if (!survey.imageDirectionId) return true;
    const ref = customerUploadRefFor(src, options);
    if (!ref || seenAssetIds.has(ref.assetId)) return false;
    seenAssetIds.add(ref.assetId);
    return true;
  }).slice(0, 12) ?? [];
  if (!page || !section || photos.length < 6) return null;
  return {
    signatureId: 'mosaic-reveal', pageId: page.id, sectionId: section.id, heading: section.name,
    images: photos.map((src, index) => {
      const content = survey.contentItems?.find((item) => item.photoUrl === src);
      return {
        id: `mosaic-${index + 1}`,
        kind: 'image' as const,
        src,
        alt: content?.name.trim() || `${survey.businessName} 사진 ${index + 1}`,
        ...(content?.description?.trim() ? { caption: content.description.trim() } : {}),
        width: MEDIA_WIDTH,
        height: MEDIA_HEIGHT,
        focalPoint: { x: 0.5, y: 0.5 },
        ...mediaTruthFor(src, survey, options),
      };
    }),
  };
}

function buildJourney(config: SiteConfig, survey: SurveyInput): MotionScene | null {
  const page = homePage(config);
  const section = page && targetSection(page, ['about', 'features', 'custom', 'faq']);
  if (!page || !section) return null;
  const structured = survey.contentItems
    ?.filter((item) => item.name.trim() && Boolean(item.description?.trim()))
    .slice(0, 7)
    .map((item) => ({
    heading: item.name.trim(),
    body: item.description!.trim(),
    caption: item.price?.trim(),
  })) ?? [];
  const items = structured;
  if (items.length < 3) return null;
  return {
    signatureId: 'path-journey', pageId: page.id, sectionId: section.id, heading: section.name,
    milestones: items.map((item, index) => ({
      id: `milestone-${index + 1}`,
      heading: item.heading,
      body: item.body,
      ...(item.caption ? { caption: item.caption } : {}),
    })),
  };
}

function buildBeforeAfter(
  config: SiteConfig,
  survey: SurveyInput,
  options: BuildMotionSceneOptions,
): MotionScene | null {
  const selection = survey.beforeAfterSelection;
  const page = homePage(config);
  const section = page && targetSection(page, ['gallery', 'cases']);
  if (!selection || !page || !section || selection.beforeAssetId === selection.afterAssetId) return null;
  const before = options.customerCaseMedia?.find((media) => media.assetId === selection.beforeAssetId);
  const after = options.customerCaseMedia?.find((media) => media.assetId === selection.afterAssetId);
  if (
    !before || !after || before.caseId !== selection.caseId || after.caseId !== selection.caseId ||
    !selection.sameCaseAttested || !selection.publicationRightsAttested
  ) return null;
  return {
    signatureId: 'before-after-scrub', pageId: page.id, sectionId: section.id,
    heading: section.name, caseId: selection.caseId, before, after,
    sameCaseAttested: true, publicationRightsAttested: true,
  };
}

/**
 * Stable generation helper. Returns null instead of inventing missing chapters/cards/media.
 * It is pure and never mutates config, survey, or Section.elements.
 */
export function buildMotionSceneFromSurvey(
  config: SiteConfig,
  survey: SurveyInput,
  signatureId: ProductionMotionSignatureId,
  options: BuildMotionSceneOptions = {},
): MotionScene | null {
  switch (signatureId) {
    case 'cinematic-scrub': return buildCinematic(config, survey, options);
    case 'scrollytelling-manifesto': return buildManifesto(config, survey, options);
    case 'sticky-chapters': return buildStickyChapters(config, survey, options);
    case 'true-card-stack': return buildCards(config, survey, options);
    case 'portal-zoom':
    case 'scroll-curtain':
    case 'horizontal-story': return buildEditorial(signatureId, config, survey, options);
    case 'mosaic-reveal': return buildMosaic(config, survey, options);
    case 'path-journey': return buildJourney(config, survey);
    case 'before-after-scrub': return buildBeforeAfter(config, survey, options);
  }
}

/** Test/audit hook: proves no positional inference is part of the scene builder contract. */
export const MOTION_SCENE_ORDER_SOURCE = 'section-element-array-order-and-structured-survey-data' as const;
