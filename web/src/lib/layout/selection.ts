import { z } from 'zod';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { resolveTemplate } from '@/lib/data/site-blueprints';
import { canonicalIndustryClass } from '@/lib/motion/signatures';
import type { MotionIndustryClass } from '@/lib/types/site';
import type { DesignDnaId } from '@/lib/design/dna/types';
import { HERO_LAYOUT_CATALOG, heroLayoutById } from './catalog';
import {
  HERO_LAYOUT_VARIANT_IDS,
  type HeroLayoutAvailableMedia,
  type HeroLayoutAuthoredIndustry,
  type HeroLayoutVariantId,
} from './types';

const TOOL_NAME = 'select_hero_layout';
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

function runtimeIndustry(survey: SurveyInput): MotionIndustryClass {
  const template = resolveTemplate(survey.purposeId, survey.industry);
  return canonicalIndustryClass(survey.purposeId, template.id, survey.industry);
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
  const industry = runtimeIndustry(survey);
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
  const industry = runtimeIndustry(survey);
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
