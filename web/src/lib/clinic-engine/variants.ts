import { selectDesignBriefs } from '@/lib/ai/design-knowledge';
import type { SurveyInput } from '@/lib/types/domain';
import type {
  ClinicAccentPreset,
  ClinicTypographyPreset,
} from '@/lib/types/site';
import type { HeroLayoutVariantId } from '@/lib/layout';
import type { ClinicEngineProfile } from './contracts';
import type { ClinicLayoutContentUnit } from './layout-sections';
import type {
  RobustClinicSourceBlock,
  RobustClinicSourcePlan,
} from './robust-source';

export const CLINIC_MOTION_SIGNATURE_IDS = [
  'static',
  'calm-fade',
  'rise-stagger',
  'cinematic',
] as const;

export type ClinicMotionSignatureId = (typeof CLINIC_MOTION_SIGNATURE_IDS)[number];

export const CLINIC_MATERIAL_AXIS_IDS = [
  'beforeafter',
  'reviews',
  'videos',
  'events',
  'gallery',
  'services',
  'providers',
  'us-trust-rich',
  'us-trust-sparse',
  'us-procedure-gallery',
] as const;

export type ClinicMaterialAxisId = (typeof CLINIC_MATERIAL_AXIS_IDS)[number];

export type ClinicClosingBlock = 'source-last' | 'faq-last' | 'visual-last' | 'trust-last';
export type ClinicTone = 'light' | 'dark';

export interface ClinicMaterialAxisEvidence {
  axis: ClinicMaterialAxisId;
  evidenceIds: string[];
  evidenceCount: number;
}

export interface ClinicExpressionRecipe {
  id: string;
  selectionBriefId: string;
  accentPreset: ClinicAccentPreset;
  typographyPreset: ClinicTypographyPreset;
  density: 'airy' | 'balanced';
  tone: ClinicTone;
  heroLayout: HeroLayoutVariantId;
  motionSignature: ClinicMotionSignatureId;
  closingBlock: ClinicClosingBlock;
}

export const CLINIC_EXPRESSION_AXIS_IDS = [
  'typography',
  'palette-tone',
  'hero-form',
  'motion-signature',
  'density-rhythm',
  'closing-block',
] as const;

export type ClinicExpressionAxisId = (typeof CLINIC_EXPRESSION_AXIS_IDS)[number];

export interface ClinicVariantBlueprint {
  id: string;
  expression: ClinicExpressionRecipe;
  activeMaterialAxes: ClinicMaterialAxisEvidence[];
  emphasizedAxis?: ClinicMaterialAxisId;
  expressionDifferenceFromFirst: ClinicExpressionAxisId[];
}

const AXIS_PATTERNS: Readonly<Record<Exclude<ClinicMaterialAxisId, 'us-trust-rich' | 'us-trust-sparse' | 'us-procedure-gallery'>, RegExp>> = {
  beforeafter: /(?:before\s*\/?\s*after|before\s+and\s+after|\uC804\uD6C4|\uBE44\uD3EC\s*\uC560\uD504\uD130|\uCE58\uB8CC\s*\uC804|\uCE58\uB8CC\s*\uD6C4)/iu,
  reviews: /(?:reviews?|testimonials?|patient\s+stories|\uD6C4\uAE30|\uCE58\uB8CC\uACBD\uD5D8\uB2F4|\uCE6D\uCC2C\uD569\uB2C8\uB2E4)/iu,
  videos: /(?:videos?|youtube|\uBCD1\uC6D0\s*tv|\uBBFC\uD2B8\uBCD1\uC6D0tv|\uC601\uC0C1|\uBBF8\uB514\uC5B4)/iu,
  events: /(?:events?|promotions?|special\s+offers?|\uD504\uB85C\uBAA8\uC158|\uC774\uBCA4\uD2B8|\uCCB4\uD5D8\uAC00|\uD560\uC778|\uD2B9\uAC00)/iu,
  gallery: /(?:gallery|facilities|facility|office\s+tour|\uAC24\uB7EC\uB9AC|\uB458\uB7EC\uBCF4\uAE30|\uC2DC\uC124|\uBCD1\uC6D0\s*\uC804\uACBD)/iu,
  services: /(?:services?|treatments?|procedures?|\uC9C4\uB8CC\uACFC|\uC9C4\uB8CC\s*\uC548\uB0B4|\uC2DC\uC220|\uCE58\uB8CC|\uD074\uB9AC\uB2C9)/iu,
  providers: /(?:providers?|doctors?|dentists?|physicians?|medical\s+team|\uC758\uB8CC\uC9C4|\uC6D0\uC7A5|\uC804\uBB38\uC758|\uC758\uC0AC)/iu,
};

const US_TRUST_PATTERNS = [
  /(?:reviews?|testimonials?|patient\s+stories)/iu,
  /(?:board[- ]certified|credentials?|accredit|awards?|recognition|fellowship|association)/iu,
  /(?:press|media|research|publications?|academic|university)/iu,
] as const;

const US_PROCEDURE_RE = /(?:dental|implant|orthodont|veneers?|cosmetic|surgery|procedure|treatment)/iu;

function sourceContext(block: RobustClinicSourceBlock): string {
  return `${block.sourceUrl}\n${block.sourceElementPath}\n${block.text}`;
}

function evidenceForPattern(
  blocks: readonly RobustClinicSourceBlock[],
  pattern: RegExp,
): string[] {
  return blocks.filter((block) => pattern.test(sourceContext(block))).map((block) => block.id);
}

export function detectClinicMaterialAxes(
  plan: RobustClinicSourcePlan,
): ClinicMaterialAxisEvidence[] {
  const result: ClinicMaterialAxisEvidence[] = [];
  if (plan.profile.locale === 'ko-KR') {
    for (const axis of [
      'beforeafter',
      'reviews',
      'videos',
      'events',
      'gallery',
      'services',
      'providers',
    ] as const) {
      const evidenceIds = evidenceForPattern(plan.targetBlocks, AXIS_PATTERNS[axis]);
      if (axis === 'gallery') {
        evidenceIds.push(...plan.pages.flatMap((page) => (
          page.images.map((image) => `image:${page.id}:${image.id}`)
        )));
      }
      const unique = [...new Set(evidenceIds)];
      if (unique.length > 0) {
        result.push({ axis, evidenceIds: unique, evidenceCount: unique.length });
      }
    }
    return result;
  }

  const trustKinds = US_TRUST_PATTERNS.map((pattern, index) => ({
    id: `trust-kind:${index + 1}`,
    blocks: evidenceForPattern(plan.targetBlocks, pattern),
  })).filter((entry) => entry.blocks.length > 0);
  if (trustKinds.length >= 2) {
    const evidenceIds = trustKinds.flatMap((entry) => entry.blocks);
    const uniqueEvidenceIds = [...new Set(evidenceIds)];
    result.push({
      axis: 'us-trust-rich',
      evidenceIds: uniqueEvidenceIds,
      evidenceCount: uniqueEvidenceIds.length,
    });
  } else {
    const evidenceIds = trustKinds.flatMap((entry) => entry.blocks);
    const classificationEvidence = evidenceIds.length > 0
      ? evidenceIds
      : plan.pages.map((page) => `source-page:${page.id}`);
    const uniqueClassificationEvidence = [...new Set(classificationEvidence)];
    result.push({
      axis: 'us-trust-sparse',
      evidenceIds: uniqueClassificationEvidence,
      evidenceCount: uniqueClassificationEvidence.length,
    });
  }

  const procedureImages = plan.pages.flatMap((page) => {
    const pageContext = `${page.finalUrl}\n${page.targetBlocks.map((block) => block.text).join('\n')}`;
    if (!US_PROCEDURE_RE.test(pageContext)) return [];
    return page.images.map((image) => `image:${page.id}:${image.id}`);
  });
  if (procedureImages.length >= 2) {
    result.push({
      axis: 'us-procedure-gallery',
      evidenceIds: procedureImages,
      evidenceCount: procedureImages.length,
    });
  }
  return result;
}

const ACCENTS: readonly ClinicAccentPreset[] = [
  'clean-blue',
  'clean-teal',
  'clean-green',
  'clean-warm-neutral',
  'clean-blue',
  'clean-green',
];

const TYPOGRAPHY: readonly ClinicTypographyPreset[] = [
  'clinic-editorial',
  'clinic-geometric',
  'clinic-neutral',
  'clinic-editorial',
  'clinic-geometric',
  'clinic-neutral',
];

const HERO_LAYOUTS: readonly HeroLayoutVariantId[] = [
  'hero.split-left',
  'hero.image-below',
  'hero.split-right',
  'hero.asymmetric-offset',
  'hero.fullbleed-centered',
  'hero.text-only-bold',
];

const MOTION_SIGNATURES: readonly ClinicMotionSignatureId[] = [
  'static',
  'calm-fade',
  'rise-stagger',
  'cinematic',
  'rise-stagger',
  'calm-fade',
];

const CLOSING_BLOCKS: readonly ClinicClosingBlock[] = [
  'source-last',
  'faq-last',
  'visual-last',
  'trust-last',
  'visual-last',
  'faq-last',
];

function selectorSurvey(plan: RobustClinicSourcePlan): SurveyInput {
  const firstPage = plan.pages[0];
  const businessName = firstPage?.artifactPage.title?.trim()
    || firstPage?.targetBlocks[0]?.text.trim()
    || new URL(firstPage?.finalUrl ?? 'https://clinic.invalid').hostname;
  return {
    businessName,
    purposeId: 'booking_service',
    purpose: 'medical booking service',
    industry: 'medical clinic',
    tone: plan.profile.locale === 'ko-KR'
      ? ['calm', 'trustworthy']
      : ['calm', 'trusted'],
    colorPreference: 'clinical clean',
    referenceImageUrls: [],
    sectionPlan: [],
    templateId: 'booking_service.clinic',
    contentMode: 'provided',
  } as SurveyInput;
}

function expressionAxesThatDiffer(
  left: ClinicExpressionRecipe,
  right: ClinicExpressionRecipe,
): ClinicExpressionAxisId[] {
  const result: ClinicExpressionAxisId[] = [];
  if (left.typographyPreset !== right.typographyPreset) result.push('typography');
  if (left.accentPreset !== right.accentPreset || left.tone !== right.tone) {
    result.push('palette-tone');
  }
  if (left.heroLayout !== right.heroLayout) result.push('hero-form');
  if (left.motionSignature !== right.motionSignature) result.push('motion-signature');
  if (left.density !== right.density) result.push('density-rhythm');
  if (left.closingBlock !== right.closingBlock) result.push('closing-block');
  return result;
}

export function clinicExpressionAxisDifferences(
  left: ClinicExpressionRecipe,
  right: ClinicExpressionRecipe,
): ClinicExpressionAxisId[] {
  return expressionAxesThatDiffer(left, right);
}

function expressionRecipes(
  plan: RobustClinicSourcePlan,
  count: number,
): ClinicExpressionRecipe[] {
  // Reuse the established selector's deterministic ranking, unique style/font/palette discipline,
  // and dark/light guard. Clinic output maps the result into the already-approved pinned enums.
  const briefs = selectDesignBriefs(selectorSurvey(plan), count);
  return briefs.map((brief, index) => ({
    id: `expression-${index + 1}`,
    selectionBriefId: brief.style.id,
    accentPreset: ACCENTS[index],
    typographyPreset: TYPOGRAPHY[index],
    density: index % 2 === 0 ? 'airy' : 'balanced',
    tone: brief.palette.dark ? 'dark' : 'light',
    heroLayout: HERO_LAYOUTS[index],
    motionSignature: MOTION_SIGNATURES[index],
    closingBlock: CLOSING_BLOCKS[index],
  }));
}

export function selectClinicVariantBlueprints(
  plan: RobustClinicSourcePlan,
): ClinicVariantBlueprint[] {
  const materialAxes = detectClinicMaterialAxes(plan);
  const count = 3 + Math.min(3, materialAxes.length);
  const expressions = expressionRecipes(plan, count);
  for (let left = 0; left < expressions.length; left += 1) {
    for (let right = left + 1; right < expressions.length; right += 1) {
      const differences = expressionAxesThatDiffer(expressions[left], expressions[right]);
      if (differences.length < 2) {
        throw new Error(
          `CLINIC_VARIANT_EXPRESSION_DUPLICATE:${left + 1}:${right + 1}:${differences.length}`,
        );
      }
    }
  }
  return expressions.map((expression, index) => ({
    id: `clinic-${expression.id}`,
    expression,
    activeMaterialAxes: materialAxes,
    ...(index > 0 && materialAxes.length > 0
      ? { emphasizedAxis: materialAxes[(index - 1) % materialAxes.length].axis }
      : {}),
    expressionDifferenceFromFirst: index === 0
      ? []
      : expressionAxesThatDiffer(expressions[0], expression),
  }));
}

function unitContext(unit: ClinicLayoutContentUnit): string {
  return [
    unit.title.sourceUrl,
    unit.title.text,
    unit.body?.text,
    ...(unit.details ?? []).map((detail) => detail.text),
    unit.image?.alt,
    unit.image?.src,
  ].filter(Boolean).join('\n');
}

export function clinicMaterialAxesForUnit(
  unit: ClinicLayoutContentUnit,
  profile: ClinicEngineProfile,
): ClinicMaterialAxisId[] {
  const context = unitContext(unit);
  if (profile.locale === 'ko-KR') {
    return (Object.entries(AXIS_PATTERNS) as Array<[
      Exclude<ClinicMaterialAxisId, 'us-trust-rich' | 'us-trust-sparse' | 'us-procedure-gallery'>,
      RegExp,
    ]>).filter(([, pattern]) => pattern.test(context)).map(([axis]) => axis);
  }
  const result: ClinicMaterialAxisId[] = [];
  if (US_TRUST_PATTERNS.filter((pattern) => pattern.test(context)).length > 0) {
    result.push('us-trust-rich');
  }
  if (US_PROCEDURE_RE.test(context) && Boolean(unit.image)) {
    result.push('us-procedure-gallery');
  }
  return result;
}

export function isClinicFaqUnit(unit: ClinicLayoutContentUnit): boolean {
  return /[?？]\s*$/u.test(unit.title.text)
    && Boolean(unit.body?.text.trim());
}
