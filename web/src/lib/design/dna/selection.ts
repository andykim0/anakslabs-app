import { z } from 'zod';
import type { SurveyInput } from '@/lib/types/domain';
import { resolveTemplate } from '@/lib/data/site-blueprints';
import { galleryById } from '@/lib/design/reference-gallery';
import {
  ACTIVE_MOTION_SIGNATURE_IDS,
  canonicalIndustryClass,
} from '@/lib/motion/signatures';
import { DESIGN_DNA_CATALOG, designDnaById } from './catalog';
import {
  DESIGN_DNA_IDS,
  DNA_CHROMA_NAMES,
  DNA_COLOR_STRATEGIES,
  DNA_DENSITIES,
  DNA_FONT_PAIR_IDS,
  DNA_RADII,
  DNA_TYPE_RATIOS,
  type DesignDnaId,
  type DesignDnaOverrides,
  type DesignDnaSelection,
} from './types';

const TOOL_NAME = 'select_design_dna';
const MAX_SELECTION_ATTEMPTS = 2;
const CANDIDATE_COUNT = 3;

const toolOverridesSchema = z.object({
  type_pair: z.enum(DNA_FONT_PAIR_IDS).optional(),
  type_ratio: z.enum(DNA_TYPE_RATIOS).optional(),
  color_strategy: z.enum(DNA_COLOR_STRATEGIES).optional(),
  color_chroma: z.enum(DNA_CHROMA_NAMES).optional(),
  density: z.enum(DNA_DENSITIES).optional(),
  radius: z.enum(DNA_RADII).optional(),
  motion_default: z.enum(ACTIVE_MOTION_SIGNATURE_IDS).optional(),
}).strict();

export const dnaSelectionToolInputSchema = z.object({
  dna_id: z.enum(DESIGN_DNA_IDS),
  hue_seed: z.number().int().min(0).max(360),
  overrides: toolOverridesSchema,
}).strict();

export type DnaSelectionToolInput = z.infer<typeof dnaSelectionToolInputSchema>;

export interface DnaSelectionToolDefinition {
  name: typeof TOOL_NAME;
  description: string;
  inputSchema: {
    type: 'object';
    additionalProperties: false;
    properties: Record<string, unknown>;
    required: string[];
  };
}

const enumProperty = (values: readonly string[]) => ({ type: 'string', enum: [...values] });

export const DNA_SELECTION_TOOL: DnaSelectionToolDefinition = {
  name: TOOL_NAME,
  description: 'Choose one registered DesignDNA and enum-only adjustments for a customer candidate.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      dna_id: enumProperty(DESIGN_DNA_IDS),
      hue_seed: { type: 'integer', minimum: 0, maximum: 360 },
      overrides: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type_pair: enumProperty(DNA_FONT_PAIR_IDS),
          type_ratio: enumProperty(DNA_TYPE_RATIOS),
          color_strategy: enumProperty(DNA_COLOR_STRATEGIES),
          color_chroma: enumProperty(DNA_CHROMA_NAMES),
          density: enumProperty(DNA_DENSITIES),
          radius: enumProperty(DNA_RADII),
          motion_default: enumProperty(ACTIVE_MOTION_SIGNATURE_IDS),
        },
      },
    },
    required: ['dna_id', 'hue_seed', 'overrides'],
  },
};

export interface DnaSelectionToolRequest {
  prompt: string;
  system: string;
  tool: DnaSelectionToolDefinition;
  expectedCalls: 3;
}

export type DnaSelectionToolInvoker = (
  request: DnaSelectionToolRequest,
) => Promise<readonly unknown[]>;

export interface DnaSelectionResult {
  selections: readonly DesignDnaSelection[];
  source: 'structured-tool' | 'deterministic-fallback';
  attempts: number;
}

const REFERENCE_STYLE_AFFINITY: Readonly<Record<string, readonly DesignDnaId[]>> = {
  'dark-luxury': ['dining-refined-contrast', 'legal-authoritative-editorial'],
  'minimal-swiss': ['medical-clinical-clarity', 'academy-structured-friendly'],
  'editorial-magazine': ['cafe-warm-editorial', 'legal-authoritative-editorial'],
  'soft-clay-3d': ['beauty-soft-wellness', 'academy-structured-friendly'],
  'premium-3d-product': ['retail-bold-geometric'],
  'organic-natural': ['workshop-tactile-heritage', 'beauty-soft-wellness'],
  'warm-cozy': ['cafe-warm-editorial', 'workshop-tactile-heritage'],
  'retro-analog': ['workshop-tactile-heritage', 'cafe-warm-editorial'],
  'glass-modern': ['medical-clinical-clarity', 'retail-bold-geometric'],
  'bold-energy': ['retail-bold-geometric'],
  'botanical-illust': ['beauty-soft-wellness', 'workshop-tactile-heritage'],
  'flat-friendly-illust': ['academy-structured-friendly', 'retail-bold-geometric'],
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function canonicalIndustry(survey: SurveyInput) {
  const templateId = resolveTemplate(survey.purposeId, survey.industry).id;
  return canonicalIndustryClass(survey.purposeId, templateId, survey.industry);
}

function referenceWeight(survey: SurveyInput, dnaId: DesignDnaId): number {
  let score = 0;
  for (const styleId of survey.referenceStyleIds ?? []) {
    if (REFERENCE_STYLE_AFFINITY[styleId]?.includes(dnaId)) score += 12;
  }
  const selectedReference = survey.referenceDesignId
    ? galleryById(survey.referenceDesignId)
    : undefined;
  const dna = designDnaById(dnaId);
  if (selectedReference && dna?.type.pair === selectedReference.fontPairingId) score += 10;
  return score;
}

export function rankDesignDnaForSurvey(survey: SurveyInput) {
  const industry = canonicalIndustry(survey);
  return DESIGN_DNA_CATALOG.map((dna, catalogIndex) => {
    const industryPrior: readonly string[] = dna.industryPrior;
    return {
      dna,
      score:
        (industryPrior.includes(industry) ? 100 : 0)
        + (industryPrior.includes('other') ? 8 : 0)
        + referenceWeight(survey, dna.id),
      catalogIndex,
    };
  }).sort((left, right) => right.score - left.score || left.catalogIndex - right.catalogIndex);
}

function pickDiverseDna(survey: SurveyInput, count = CANDIDATE_COUNT) {
  const selected = [] as Array<(typeof DESIGN_DNA_CATALOG)[number]>;
  const usedFamilies = new Set<string>();
  for (const { dna } of rankDesignDnaForSurvey(survey)) {
    if (usedFamilies.has(dna.moodFamily)) continue;
    selected.push(dna);
    usedFamilies.add(dna.moodFamily);
    if (selected.length === count) break;
  }
  return selected;
}

function fallbackHue(survey: SurveyInput, dnaId: DesignDnaId, index: number): number {
  const seed = [
    survey.industry,
    survey.purposeId,
    survey.tone.join('|'),
    survey.colorPreference,
    (survey.referenceStyleIds ?? []).join('|'),
    survey.referenceDesignId ?? '',
    dnaId,
    String(index),
  ].join('::');
  return hashString(seed) % 361;
}

export function deterministicDnaSelections(survey: SurveyInput): readonly DesignDnaSelection[] {
  return pickDiverseDna(survey).map((dna, index) => ({
    catalogVersion: 1,
    dnaId: dna.id,
    hueSeed: fallbackHue(survey, dna.id, index),
    overrides: {},
  }));
}

function normalizeOverrides(input: DnaSelectionToolInput['overrides']): DesignDnaOverrides {
  return {
    ...(input.type_pair ? { typePair: input.type_pair } : {}),
    ...(input.type_ratio ? { typeRatio: input.type_ratio } : {}),
    ...(input.color_strategy ? { colorStrategy: input.color_strategy } : {}),
    ...(input.color_chroma ? { colorChroma: input.color_chroma } : {}),
    ...(input.density ? { density: input.density } : {}),
    ...(input.radius ? { radius: input.radius } : {}),
    ...(input.motion_default ? { motionDefault: input.motion_default } : {}),
  };
}

export function parseDnaToolSelections(inputs: readonly unknown[]): readonly DesignDnaSelection[] | null {
  if (inputs.length !== CANDIDATE_COUNT) return null;
  const parsed = inputs.map((input) => dnaSelectionToolInputSchema.safeParse(input));
  if (parsed.some((result) => !result.success)) return null;
  const selections = parsed.map((result) => {
    if (!result.success) throw new Error('Unreachable DNA selection parse branch.');
    return {
      catalogVersion: 1 as const,
      dnaId: result.data.dna_id,
      hueSeed: result.data.hue_seed,
      overrides: normalizeOverrides(result.data.overrides),
    };
  });
  if (new Set(selections.map((selection) => selection.dnaId)).size !== CANDIDATE_COUNT) return null;
  const families = selections.map((selection) => designDnaById(selection.dnaId)?.moodFamily);
  if (families.some((family) => !family) || new Set(families).size !== CANDIDATE_COUNT) return null;
  return selections;
}

/** The catalog projection intentionally excludes token values and implementation fields. */
export function dnaSelectionPrompt(survey: SurveyInput): string {
  const catalog = DESIGN_DNA_CATALOG.map((dna) => ({
    id: dna.id,
    description: dna.description,
    industryPrior: dna.industryPrior,
  }));
  const signals = {
    purpose: survey.purpose,
    industry: survey.industry,
    tone: survey.tone,
    referenceStyleIds: survey.referenceStyleIds ?? [],
    referenceDesignId: survey.referenceDesignId ?? null,
  };
  return [
    '등록된 카탈로그 안에서 서로 다른 무드 계열의 후보를 정확히 3개 고르세요.',
    'select_design_dna 도구를 서로 다른 dna_id로 정확히 세 번 호출하세요.',
    '업종 친화도를 우선하고 고객 레퍼런스는 가중치로만 사용하세요. 카탈로그 밖 값은 만들지 마세요.',
    `[고객 신호] ${JSON.stringify(signals)}`,
    `[카탈로그] ${JSON.stringify(catalog)}`,
  ].join('\n');
}

export async function selectDesignDnaCandidates(
  survey: SurveyInput,
  invoke?: DnaSelectionToolInvoker,
): Promise<DnaSelectionResult> {
  if (!invoke) {
    return { selections: deterministicDnaSelections(survey), source: 'deterministic-fallback', attempts: 0 };
  }
  const request: DnaSelectionToolRequest = {
    prompt: dnaSelectionPrompt(survey),
    system: '당신은 제약 안에서만 선택하는 디자인 디렉터입니다. 자유 JSON이나 색상·크기 값을 쓰지 말고 지정된 도구만 정확히 세 번 호출하세요.',
    tool: DNA_SELECTION_TOOL,
    expectedCalls: 3,
  };
  for (let attempt = 1; attempt <= MAX_SELECTION_ATTEMPTS; attempt += 1) {
    try {
      const selected = parseDnaToolSelections(await invoke(request));
      if (selected) return { selections: selected, source: 'structured-tool', attempts: attempt };
    } catch {
      // A provider failure and an invalid tool payload share the same bounded retry policy.
    }
  }
  return {
    selections: deterministicDnaSelections(survey),
    source: 'deterministic-fallback',
    attempts: MAX_SELECTION_ATTEMPTS,
  };
}
