import { z } from 'zod';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import type { MotionIndustryClass } from '@/lib/types/site';
import type { DesignDnaId } from '@/lib/design/dna/types';
import { buildContentDepthHomeModel } from '@/lib/content/content-depth';
import { buildSitePlan, sitePlanV2Enabled } from '@/lib/content/site-plan';
import {
  permittedTestimonials,
  testimonialExposurePolicyForSurvey,
} from '@/lib/content/testimonial-policy';
import { resolveConversionDestination } from '@/lib/onboarding/site-goal';
import { surveyIndustryClass } from '@/lib/onboarding/site-classification';
import { HERO_LAYOUT_CATALOG, heroLayoutById } from './catalog';
import { ABOUT_LAYOUT_CATALOG, aboutLayoutById } from './about-catalog';
import { CTA_LAYOUT_CATALOG, ctaLayoutById } from './cta-catalog';
import { DIRECTIONS_LAYOUT_CATALOG, directionsLayoutById } from './directions-catalog';
import { FEATURE_LAYOUT_CATALOG, featureLayoutById } from './feature-catalog';
import { GALLERY_LAYOUT_CATALOG, galleryLayoutById } from './gallery-catalog';
import {
  TESTIMONIAL_LAYOUT_CATALOG,
  testimonialLayoutById,
} from './testimonial-catalog';
import {
  HERO_LAYOUT_VARIANT_IDS,
  type HeroLayoutAvailableMedia,
  type HeroLayoutAuthoredIndustry,
  type HeroLayoutVariantId,
} from './types';
import {
  ABOUT_LAYOUT_VARIANT_IDS,
  CTA_LAYOUT_VARIANT_IDS,
  DIRECTIONS_LAYOUT_VARIANT_IDS,
  FEATURE_LAYOUT_VARIANT_IDS,
  GALLERY_LAYOUT_VARIANT_IDS,
  TESTIMONIAL_LAYOUT_VARIANT_IDS,
  type AboutLayoutVariantId,
  type CtaLayoutVariantId,
  type DirectionsLayoutVariantId,
  type FeatureLayoutVariantId,
  type GalleryLayoutVariantId,
  type SectionLayoutKind,
  type SectionLayoutSelection,
  type SectionLayoutVariantId,
  type TestimonialLayoutVariantId,
} from './section-layout-types';

const TOOL_NAME = 'select_hero_layout';
const SECTION_TOOL_NAME = 'select_section_layouts';
const MAX_SELECTION_ATTEMPTS = 2;

export const HERO_LAYOUT_OTHER_ALLOWED_IDS = [
  'hero.text-only-bold',
  'hero.split-left',
  'hero.image-below',
] as const satisfies readonly HeroLayoutVariantId[];

/** Catalog-adjacent deterministic fallback table. Order is product policy, never model output. */
export const HERO_LAYOUT_FALLBACK_ORDER = {
  cafe: ['hero.fullbleed-centered', 'hero.split-left', 'hero.overlay-bottom-left', 'hero.image-below'],
  fine_dining: ['hero.fullbleed-centered', 'hero.split-right', 'hero.overlay-bottom-left', 'hero.asymmetric-offset'],
  beauty: ['hero.split-left', 'hero.fullbleed-centered', 'hero.split-right', 'hero.asymmetric-offset'],
  medical: ['hero.split-left', 'hero.text-only-bold', 'hero.image-below'],
  legal: ['hero.text-only-bold', 'hero.split-left', 'hero.image-below'],
  consulting: ['hero.split-left', 'hero.text-only-bold', 'hero.split-right', 'hero.asymmetric-offset'],
  workshop: ['hero.image-below', 'hero.split-right', 'hero.fullbleed-centered', 'hero.asymmetric-offset'],
  retail: ['hero.asymmetric-offset', 'hero.image-below', 'hero.overlay-bottom-left', 'hero.text-only-bold'],
  remodeling: ['hero.image-below', 'hero.split-right', 'hero.asymmetric-offset'],
  photography: ['hero.image-below', 'hero.split-right', 'hero.fullbleed-centered'],
  brand: ['hero.asymmetric-offset', 'hero.image-below', 'hero.text-only-bold'],
  portfolio: ['hero.image-below', 'hero.split-right', 'hero.fullbleed-centered', 'hero.text-only-bold'],
  other: [...HERO_LAYOUT_OTHER_ALLOWED_IDS],
} as const satisfies Readonly<Record<MotionIndustryClass, readonly HeroLayoutVariantId[]>>;

const toolInputSchema = z.object({
  candidate_index: z.number().int().min(0).max(2),
  hero_layout_id: z.enum(HERO_LAYOUT_VARIANT_IDS),
}).strict();

export interface HeroLayoutSelectionToolDefinition {
  name: typeof TOOL_NAME;
  description: string;
  inputSchema: {
    type: 'object';
    additionalProperties: false;
    properties: Record<string, unknown>;
    required: string[];
  };
}

export const HERO_LAYOUT_SELECTION_TOOL: HeroLayoutSelectionToolDefinition = {
  name: TOOL_NAME,
  description: 'Choose one server-registered hero layout for each candidate.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      candidate_index: { type: 'integer', minimum: 0, maximum: 2 },
      hero_layout_id: { type: 'string', enum: [...HERO_LAYOUT_VARIANT_IDS] },
    },
    required: ['candidate_index', 'hero_layout_id'],
  },
};

export interface HeroLayoutSelectionToolRequest {
  prompt: string;
  system: string;
  tool: HeroLayoutSelectionToolDefinition;
  expectedCalls: 3;
}

export type HeroLayoutSelectionToolInvoker = (
  request: HeroLayoutSelectionToolRequest,
) => Promise<readonly unknown[]>;

export interface HeroLayoutSelectionCandidate {
  designDnaId?: DesignDnaId;
  media: HeroLayoutAvailableMedia;
}

function authoredIndustry(industry: MotionIndustryClass): HeroLayoutAuthoredIndustry | null {
  switch (industry) {
    case 'remodeling':
      return 'workshop';
    case 'photography':
    case 'brand':
      return 'portfolio';
    case 'other':
      return null;
    default:
      return industry;
  }
}

function mediaFits(
  id: HeroLayoutVariantId,
  media: HeroLayoutAvailableMedia,
): boolean {
  const requirement = heroLayoutById(id)!.mediaContract.requirement;
  if (requirement === 'required-video-poster') return media.video && media.poster;
  if (requirement === 'required-image') return media.image || media.poster;
  return true;
}

/** Server-only allowlist: industry compatibility ∩ DNA affinity ∩ actual media availability. */
export function allowedHeroLayoutsForCandidate(
  survey: SurveyInput,
  candidate: HeroLayoutSelectionCandidate,
): readonly HeroLayoutVariantId[] {
  const industry = surveyIndustryClass(survey);
  if (industry === 'other') {
    return HERO_LAYOUT_OTHER_ALLOWED_IDS.filter((id) => {
      const layout = heroLayoutById(id)!;
      return (
        (!candidate.designDnaId
          || layout.compatibility.preferredDna.includes(candidate.designDnaId))
        && mediaFits(id, candidate.media)
      );
    });
  }
  const authored = authoredIndustry(industry);
  return HERO_LAYOUT_CATALOG.filter((layout) => {
    if (authored && layout.compatibility.industry[authored] === 'discouraged') return false;
    if (
      candidate.designDnaId
      && !layout.compatibility.preferredDna.includes(candidate.designDnaId)
    ) return false;
    return mediaFits(layout.id, candidate.media);
  }).map((layout) => layout.id);
}

/** Client round-trip boundary revalidation; the stored enum never bypasses the server allowlist. */
export function pinnedHeroLayoutIsAllowed(
  survey: SurveyInput,
  candidate: Pick<DesignCandidate, 'heroLayoutVariantId' | 'designDna' | 'heroImageUrl'>,
): boolean {
  if (!candidate.heroLayoutVariantId) return true;
  return allowedHeroLayoutsForCandidate(survey, {
    ...(candidate.designDna ? { designDnaId: candidate.designDna.dnaId } : {}),
    media: {
      image: Boolean(candidate.heroImageUrl),
      video: false,
      poster: false,
    },
  }).includes(candidate.heroLayoutVariantId);
}

function fallbackFor(
  survey: SurveyInput,
  candidate: HeroLayoutSelectionCandidate,
): HeroLayoutVariantId {
  const allowed = new Set(allowedHeroLayoutsForCandidate(survey, candidate));
  const industry = surveyIndustryClass(survey);
  return HERO_LAYOUT_FALLBACK_ORDER[industry].find((id) => allowed.has(id))
    ?? HERO_LAYOUT_CATALOG.find((layout) => allowed.has(layout.id))?.id
    ?? 'hero.text-only-bold';
}

function intrinsicAllowedCondition(id: HeroLayoutVariantId): string {
  const layout = heroLayoutById(id)!;
  const recommended = Object.entries(layout.compatibility.industry)
    .filter(([, affinity]) => affinity === 'recommended')
    .map(([industry]) => industry)
    .join(',');
  return `추천 업종 ${recommended}; 미디어 계약 ${layout.mediaContract.requirement}; 등록 DNA 궁합만 허용`;
}

/**
 * Prompt catalog projection is intentionally narrow. It contains no score, coordinates,
 * or actual media availability; server validation owns all three.
 */
export function heroLayoutSelectionPrompt(
  survey: SurveyInput,
  candidates: readonly HeroLayoutSelectionCandidate[],
): string {
  const targets = candidates.map((candidate, index) => ({
    candidateIndex: index,
    allowedLayouts: allowedHeroLayoutsForCandidate(survey, candidate).map((id) => {
      const layout = heroLayoutById(id)!;
      return {
        id,
        description: layout.description,
        allowedCondition: intrinsicAllowedCondition(id),
      };
    }),
  }));
  return [
    '각 후보에 허용된 ID 중 히어로 배열 하나를 고르세요.',
    'select_hero_layout 도구를 candidate_index 0, 1, 2에 정확히 한 번씩 호출하세요.',
    `[선택 대상] ${JSON.stringify(targets)}`,
  ].join('\n');
}

function parseSelections(
  survey: SurveyInput,
  candidates: readonly HeroLayoutSelectionCandidate[],
  raw: readonly unknown[],
): readonly HeroLayoutVariantId[] | null {
  if (raw.length !== candidates.length || candidates.length !== 3) return null;
  const parsed = raw.map((value) => toolInputSchema.safeParse(value));
  if (parsed.some((result) => !result.success)) return null;
  const selections = new Array<HeroLayoutVariantId>(3);
  const seen = new Set<number>();
  for (const result of parsed) {
    if (!result.success) return null;
    const index = result.data.candidate_index;
    if (seen.has(index)) return null;
    seen.add(index);
    const allowed = allowedHeroLayoutsForCandidate(survey, candidates[index]);
    if (!allowed.includes(result.data.hero_layout_id)) return null;
    selections[index] = result.data.hero_layout_id;
  }
  return seen.size === 3 && selections.every(Boolean) ? selections : null;
}

export async function selectHeroLayouts(
  survey: SurveyInput,
  candidates: readonly HeroLayoutSelectionCandidate[],
  invoke?: HeroLayoutSelectionToolInvoker,
): Promise<readonly HeroLayoutVariantId[]> {
  const fallback = candidates.map((candidate) => fallbackFor(survey, candidate));
  if (!invoke || candidates.length !== 3) return fallback;
  const request: HeroLayoutSelectionToolRequest = {
    prompt: heroLayoutSelectionPrompt(survey, candidates),
    system: '등록된 ID만 선택하세요. 색·크기·좌표를 만들지 말고 지정 도구만 정확히 세 번 호출하세요.',
    tool: HERO_LAYOUT_SELECTION_TOOL,
    expectedCalls: 3,
  };
  for (let attempt = 0; attempt < MAX_SELECTION_ATTEMPTS; attempt += 1) {
    try {
      const parsed = parseSelections(survey, candidates, await invoke(request));
      if (parsed) return parsed;
    } catch {
      // Provider errors and invalid payloads share one bounded deterministic fallback.
    }
  }
  return fallback;
}

export interface SectionLayoutAvailability {
  features: number;
  about: boolean;
  gallery: number;
  cta?: boolean;
  testimonials?: number;
  directions?: number;
}

export interface SectionLayoutSelectionCandidate {
  designDnaId?: DesignDnaId;
  availability: SectionLayoutAvailability;
}

export const SECTION_LAYOUT_FALLBACK_ORDER = {
  features: [...FEATURE_LAYOUT_VARIANT_IDS],
  about: [...ABOUT_LAYOUT_VARIANT_IDS],
  gallery: [...GALLERY_LAYOUT_VARIANT_IDS],
  cta: [...CTA_LAYOUT_VARIANT_IDS],
  testimonial: [...TESTIMONIAL_LAYOUT_VARIANT_IDS],
  directions: [...DIRECTIONS_LAYOUT_VARIANT_IDS],
} as const satisfies Readonly<Record<SectionLayoutKind, readonly SectionLayoutVariantId[]>>;

const sectionToolInputSchema = z.object({
  candidate_index: z.number().int().min(0).max(2),
  feature_layout_id: z.enum(FEATURE_LAYOUT_VARIANT_IDS).optional(),
  about_layout_id: z.enum(ABOUT_LAYOUT_VARIANT_IDS).optional(),
  gallery_layout_id: z.enum(GALLERY_LAYOUT_VARIANT_IDS).optional(),
  cta_layout_id: z.enum(CTA_LAYOUT_VARIANT_IDS).optional(),
  testimonial_layout_id: z.enum(TESTIMONIAL_LAYOUT_VARIANT_IDS).optional(),
  directions_layout_id: z.enum(DIRECTIONS_LAYOUT_VARIANT_IDS).optional(),
}).strict();

export interface SectionLayoutSelectionToolDefinition {
  name: typeof SECTION_TOOL_NAME;
  description: string;
  inputSchema: {
    type: 'object';
    additionalProperties: false;
    properties: Record<string, unknown>;
    required: string[];
  };
}

export const SECTION_LAYOUT_SELECTION_TOOL: SectionLayoutSelectionToolDefinition = {
  name: SECTION_TOOL_NAME,
  description: 'Choose server-registered section layouts for each candidate.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      candidate_index: { type: 'integer', minimum: 0, maximum: 2 },
      feature_layout_id: { type: 'string', enum: [...FEATURE_LAYOUT_VARIANT_IDS] },
      about_layout_id: { type: 'string', enum: [...ABOUT_LAYOUT_VARIANT_IDS] },
      gallery_layout_id: { type: 'string', enum: [...GALLERY_LAYOUT_VARIANT_IDS] },
      cta_layout_id: { type: 'string', enum: [...CTA_LAYOUT_VARIANT_IDS] },
      testimonial_layout_id: { type: 'string', enum: [...TESTIMONIAL_LAYOUT_VARIANT_IDS] },
      directions_layout_id: { type: 'string', enum: [...DIRECTIONS_LAYOUT_VARIANT_IDS] },
    },
    required: ['candidate_index'],
  },
};

export interface SectionLayoutSelectionToolRequest {
  prompt: string;
  system: string;
  tool: SectionLayoutSelectionToolDefinition;
  expectedCalls: 3;
}

export type SectionLayoutSelectionToolInvoker = (
  request: SectionLayoutSelectionToolRequest,
) => Promise<readonly unknown[]>;

export function sectionLayoutAvailabilityForSurvey(
  survey: SurveyInput,
): SectionLayoutAvailability {
  const honestV2 = Boolean(survey.contentDepth);
  const galleryCount = survey.generalAssetAttestationId
    ? Math.min(
        12,
        new Set((survey.storePhotoAssetRefs ?? []).map((asset) => asset.url)).size,
      )
    : 0;
  let plan: ReturnType<typeof buildSitePlan> | null = null;
  if (sitePlanV2Enabled(survey)) {
    try {
      plan = buildSitePlan(survey);
    } catch {
      // Legacy/incomplete drafts may carry v2 data before their approved hero key is restored.
      // They retain the pre-LIB3 availability projection and receive no new L3 section IDs.
      plan = null;
    }
  }
  const hasNormalCta = Boolean(plan?.sections.some(
    (section) => section.type === 'cta' && section.variant !== 'cta:links',
  ));
  const hasDirections = Boolean(plan?.sections.some(
    (section) => section.type === 'contact' && section.variant === 'contact:map',
  ));
  return {
    features: honestV2 ? 3 : 0,
    about: honestV2,
    gallery: galleryCount >= 2 ? galleryCount : 0,
    cta: hasNormalCta && Boolean(resolveConversionDestination(survey)),
    testimonials: permittedTestimonials(survey).length,
    directions: hasDirections
      ? buildContentDepthHomeModel(survey).directions.length
      : 0,
  };
}

function itemCountFor(
  kind: SectionLayoutKind,
  availability: SectionLayoutAvailability,
): number {
  if (kind === 'features') return availability.features;
  if (kind === 'about') return availability.about ? 1 : 0;
  if (kind === 'gallery') return availability.gallery;
  if (kind === 'cta') return availability.cta ? 1 : 0;
  if (kind === 'testimonial') return availability.testimonials ?? 0;
  return availability.directions ?? 0;
}

function allowedForKind(
  survey: SurveyInput,
  candidate: SectionLayoutSelectionCandidate,
  kind: 'features',
): readonly FeatureLayoutVariantId[];
function allowedForKind(
  survey: SurveyInput,
  candidate: SectionLayoutSelectionCandidate,
  kind: 'about',
): readonly AboutLayoutVariantId[];
function allowedForKind(
  survey: SurveyInput,
  candidate: SectionLayoutSelectionCandidate,
  kind: 'gallery',
): readonly GalleryLayoutVariantId[];
function allowedForKind(
  survey: SurveyInput,
  candidate: SectionLayoutSelectionCandidate,
  kind: 'cta',
): readonly CtaLayoutVariantId[];
function allowedForKind(
  survey: SurveyInput,
  candidate: SectionLayoutSelectionCandidate,
  kind: 'testimonial',
): readonly TestimonialLayoutVariantId[];
function allowedForKind(
  survey: SurveyInput,
  candidate: SectionLayoutSelectionCandidate,
  kind: 'directions',
): readonly DirectionsLayoutVariantId[];
function allowedForKind(
  survey: SurveyInput,
  candidate: SectionLayoutSelectionCandidate,
  kind: SectionLayoutKind,
): readonly SectionLayoutVariantId[] {
  const count = itemCountFor(kind, candidate.availability);
  if (count === 0) return [];
  if (kind === 'testimonial' && !testimonialExposurePolicyForSurvey(survey).allowed) {
    return [];
  }
  const authored = authoredIndustry(surveyIndustryClass(survey));
  const layoutFits = (
    layout:
      | (typeof FEATURE_LAYOUT_CATALOG)[number]
      | (typeof ABOUT_LAYOUT_CATALOG)[number]
      | (typeof GALLERY_LAYOUT_CATALOG)[number]
      | (typeof CTA_LAYOUT_CATALOG)[number]
      | (typeof TESTIMONIAL_LAYOUT_CATALOG)[number]
      | (typeof DIRECTIONS_LAYOUT_CATALOG)[number],
  ): boolean => {
    if (count < layout.content.minimumItems || count > layout.content.maximumItems) return false;
    if (authored && layout.compatibility.industry[authored] === 'discouraged') return false;
    if (
      candidate.designDnaId
      && !layout.compatibility.preferredDna.includes(candidate.designDnaId)
    ) return false;
    return true;
  };
  if (kind === 'features') {
    return FEATURE_LAYOUT_CATALOG.filter(layoutFits).map((layout) => layout.id);
  }
  if (kind === 'about') {
    return ABOUT_LAYOUT_CATALOG.filter(layoutFits).map((layout) => layout.id);
  }
  if (kind === 'gallery') {
    return GALLERY_LAYOUT_CATALOG.filter(layoutFits).map((layout) => layout.id);
  }
  if (kind === 'cta') {
    return CTA_LAYOUT_CATALOG.filter(layoutFits).map((layout) => layout.id);
  }
  if (kind === 'testimonial') {
    // quote-photo needs a future proof↔person-photo publication-consent binding.
    return TESTIMONIAL_LAYOUT_CATALOG
      .filter((layout) => layout.id !== 'testimonial.quote-photo' && layoutFits(layout))
      .map((layout) => layout.id);
  }
  return DIRECTIONS_LAYOUT_CATALOG.filter(layoutFits).map((layout) => layout.id);
}

export function allowedSectionLayoutsForCandidate(
  survey: SurveyInput,
  candidate: SectionLayoutSelectionCandidate,
): {
  features: readonly FeatureLayoutVariantId[];
  about: readonly AboutLayoutVariantId[];
  gallery: readonly GalleryLayoutVariantId[];
  cta: readonly CtaLayoutVariantId[];
  testimonial: readonly TestimonialLayoutVariantId[];
  directions: readonly DirectionsLayoutVariantId[];
} {
  return {
    features: allowedForKind(survey, candidate, 'features'),
    about: allowedForKind(survey, candidate, 'about'),
    gallery: allowedForKind(survey, candidate, 'gallery'),
    cta: allowedForKind(survey, candidate, 'cta'),
    testimonial: allowedForKind(survey, candidate, 'testimonial'),
    directions: allowedForKind(survey, candidate, 'directions'),
  };
}

function sectionFallbackFor(
  survey: SurveyInput,
  candidate: SectionLayoutSelectionCandidate,
): SectionLayoutSelection {
  const allowed = allowedSectionLayoutsForCandidate(survey, candidate);
  const first = <T extends SectionLayoutVariantId>(
    kind: SectionLayoutKind,
    ids: readonly T[],
  ): T | undefined => SECTION_LAYOUT_FALLBACK_ORDER[kind].find(
    (id): id is T => ids.includes(id as T),
  );
  return {
    ...(first('features', allowed.features)
      ? { features: first('features', allowed.features) }
      : {}),
    ...(first('about', allowed.about)
      ? { about: first('about', allowed.about) }
      : {}),
    ...(first('gallery', allowed.gallery)
      ? { gallery: first('gallery', allowed.gallery) }
      : {}),
    ...(first('cta', allowed.cta) ? { cta: first('cta', allowed.cta) } : {}),
    ...(first('testimonial', allowed.testimonial)
      ? { testimonial: first('testimonial', allowed.testimonial) }
      : {}),
    ...(first('directions', allowed.directions)
      ? { directions: first('directions', allowed.directions) }
      : {}),
  };
}

function sectionIntrinsicAllowedCondition(
  kind: SectionLayoutKind,
  id: SectionLayoutVariantId,
): string {
  const layout = layoutByKind(kind, id);
  const recommended = Object.entries(layout.compatibility.industry)
    .filter(([, affinity]) => affinity === 'recommended')
    .map(([industry]) => industry)
    .join(',');
  return `추천 업종 ${recommended}; 실제 콘텐츠 수 범위 ${layout.content.minimumItems}-${layout.content.maximumItems}; 등록 DNA 궁합만 허용`;
}

function layoutByKind(kind: SectionLayoutKind, id: SectionLayoutVariantId) {
  if (kind === 'features') return featureLayoutById(id as FeatureLayoutVariantId);
  if (kind === 'about') return aboutLayoutById(id as AboutLayoutVariantId);
  if (kind === 'gallery') return galleryLayoutById(id as GalleryLayoutVariantId);
  if (kind === 'cta') return ctaLayoutById(id as CtaLayoutVariantId);
  if (kind === 'testimonial') {
    return testimonialLayoutById(id as TestimonialLayoutVariantId);
  }
  return directionsLayoutById(id as DirectionsLayoutVariantId);
}

export function sectionLayoutSelectionPrompt(
  survey: SurveyInput,
  candidates: readonly SectionLayoutSelectionCandidate[],
): string {
  const targets = candidates.map((candidate, index) => {
    const allowed = allowedSectionLayoutsForCandidate(survey, candidate);
    const entries = <T extends SectionLayoutVariantId>(
      kind: SectionLayoutKind,
      values: readonly T[],
    ) => values.map((id) => {
      const layout = layoutByKind(kind, id);
      return {
        id,
        description: layout.description,
        allowedCondition: sectionIntrinsicAllowedCondition(kind, id),
      };
    });
    return {
      candidateIndex: index,
      allowedLayouts: {
        features: entries('features', allowed.features),
        about: entries('about', allowed.about),
        gallery: entries('gallery', allowed.gallery),
        cta: entries('cta', allowed.cta),
        testimonial: entries('testimonial', allowed.testimonial),
        directions: entries('directions', allowed.directions),
      },
    };
  });
  return [
    '각 후보에 허용된 섹션 배열 ID를 고르세요. 비어 있는 종류는 필드를 생략하세요.',
    'select_section_layouts 도구를 candidate_index 0, 1, 2에 정확히 한 번씩 호출하세요.',
    `[선택 대상] ${JSON.stringify(targets)}`,
  ].join('\n');
}

function parseSectionSelections(
  survey: SurveyInput,
  candidates: readonly SectionLayoutSelectionCandidate[],
  raw: readonly unknown[],
): readonly SectionLayoutSelection[] | null {
  if (raw.length !== candidates.length || candidates.length !== 3) return null;
  const parsed = raw.map((value) => sectionToolInputSchema.safeParse(value));
  if (parsed.some((result) => !result.success)) return null;
  const selections = new Array<SectionLayoutSelection>(3);
  const seen = new Set<number>();
  for (const result of parsed) {
    if (!result.success) return null;
    const index = result.data.candidate_index;
    if (seen.has(index)) return null;
    seen.add(index);
    const allowed = allowedSectionLayoutsForCandidate(survey, candidates[index]);
    const selected: SectionLayoutSelection = {};
    const pairs = [
      ['features', result.data.feature_layout_id, allowed.features],
      ['about', result.data.about_layout_id, allowed.about],
      ['gallery', result.data.gallery_layout_id, allowed.gallery],
      ['cta', result.data.cta_layout_id, allowed.cta],
      ['testimonial', result.data.testimonial_layout_id, allowed.testimonial],
      ['directions', result.data.directions_layout_id, allowed.directions],
    ] as const;
    for (const [kind, id, ids] of pairs) {
      if (ids.length === 0) {
        if (id !== undefined) return null;
        continue;
      }
      if (!id || !(ids as readonly string[]).includes(id)) return null;
      selected[kind] = id as never;
    }
    selections[index] = selected;
  }
  return seen.size === 3 && selections.every(Boolean) ? selections : null;
}

export async function selectSectionLayouts(
  survey: SurveyInput,
  candidates: readonly SectionLayoutSelectionCandidate[],
  invoke?: SectionLayoutSelectionToolInvoker,
): Promise<readonly SectionLayoutSelection[]> {
  const fallback = candidates.map((candidate) => sectionFallbackFor(survey, candidate));
  if (!invoke || candidates.length !== 3) return fallback;
  const request: SectionLayoutSelectionToolRequest = {
    prompt: sectionLayoutSelectionPrompt(survey, candidates),
    system: '등록된 ID만 선택하세요. 색·크기·좌표를 만들지 말고 지정 도구만 정확히 세 번 호출하세요.',
    tool: SECTION_LAYOUT_SELECTION_TOOL,
    expectedCalls: 3,
  };
  for (let attempt = 0; attempt < MAX_SELECTION_ATTEMPTS; attempt += 1) {
    try {
      const parsed = parseSectionSelections(survey, candidates, await invoke(request));
      if (parsed) return parsed;
    } catch {
      // Provider errors and invalid payloads share one bounded deterministic fallback.
    }
  }
  return fallback;
}
