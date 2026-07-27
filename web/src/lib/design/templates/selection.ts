import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import {
  allowedHeroLayoutsForCandidate,
  allowedSectionLayoutsForCandidate,
  sectionLayoutAvailabilityForSurvey,
} from '@/lib/layout';
import {
  canUseMotionSignature,
  motionContextFromSurvey,
} from '@/lib/motion/signatures';
import { resolveTemplate } from '@/lib/data/site-blueprints';
import { rankDesignDnaForSurvey } from '@/lib/design/dna';
import { NAMED_TEMPLATE_CATALOG, namedTemplateById } from './catalog';
import type {
  NamedTemplate,
  NamedTemplateImageDirectionRecipe,
  NamedTemplateSelection,
  ResolvedNamedTemplate,
} from './types';

export const NAMED_TEMPLATE_RECOMMENDATION_MAX = 6;
export const NAMED_TEMPLATE_NO_UPLOAD_MIN = 3;

function exactRouteMatches(template: NamedTemplate, survey: SurveyInput): boolean {
  return template.route.purposeId === survey.purposeId
    && template.route.exactIndustryIds.includes(survey.industry);
}

function imageDirectionRecipeForSurvey(
  template: NamedTemplate,
  survey: SurveyInput,
): NamedTemplateImageDirectionRecipe | undefined {
  if (template.recipe.imageDirectionId === survey.imageDirectionId) {
    return {
      imageDirectionId: template.recipe.imageDirectionId,
      mediaRequirement: template.mediaRequirement,
    };
  }
  return template.additionalImageDirections?.find(
    (recipe) => recipe.imageDirectionId === survey.imageDirectionId,
  );
}

function mediaRequirementMatches(template: NamedTemplate, survey: SurveyInput): boolean {
  const recipe = imageDirectionRecipeForSurvey(template, survey);
  if (!recipe) return false;
  if (recipe.mediaRequirement !== 'verified-referential') return true;
  return Boolean(
    survey.generalAssetAttestationId
    && survey.heroPhotoAssetRef?.assetId
    && survey.heroPhotoUrl
    && survey.heroPhotoAssetRef.url === survey.heroPhotoUrl,
  );
}

function layoutContractMatches(template: NamedTemplate, survey: SurveyInput): boolean {
  const availability = sectionLayoutAvailabilityForSurvey(survey);
  const heroAllowed = allowedHeroLayoutsForCandidate(survey, {
    designDnaId: template.recipe.designDna.dnaId,
    media: {
      image: true,
      video: template.recipe.heroLayoutId === 'hero.video-scrim',
      poster: template.recipe.heroLayoutId === 'hero.video-scrim',
    },
  });
  if (!heroAllowed.includes(template.recipe.heroLayoutId)) return false;

  const allowed = allowedSectionLayoutsForCandidate(survey, {
    designDnaId: template.recipe.designDna.dnaId,
    availability,
  });
  return Object.entries(template.recipe.sectionLayoutIds).every(([kind, id]) => (
    id === undefined
    || allowed[kind as keyof typeof allowed].length === 0
    || (allowed[kind as keyof typeof allowed] as readonly string[]).includes(id)
  ));
}

function motionContractMatches(template: NamedTemplate, survey: SurveyInput): boolean {
  const context = motionContextFromSurvey(survey, 'premium');
  const signatureId = imageDirectionRecipeForSurvey(template, survey)?.motionSignatureId
    ?? template.recipe.motionSignatureId;
  return canUseMotionSignature(signatureId, context).allowed;
}

function compatibilityMatches(template: NamedTemplate, survey: SurveyInput): boolean {
  const siteTemplateId = resolveTemplate(survey.purposeId, survey.industry).id;
  return template.recipe.sitePlanTemplateIds.includes(siteTemplateId)
    && exactRouteMatches(template, survey)
    && mediaRequirementMatches(template, survey)
    && layoutContractMatches(template, survey)
    && motionContractMatches(template, survey);
}

function signalRank(survey: SurveyInput): ReadonlyMap<string, number> {
  // TPL ON에서는 레거시 36장 선택이 조합을 고정하지 않는다. 무드 신호만 기존 DNA
  // 랭킹에 남고, 참고 URL에서 추출한 색은 아래 hue pin으로만 소비한다.
  const signalOnlySurvey = survey.referenceDesignId
    ? { ...survey, referenceDesignId: undefined }
    : survey;
  return new Map(
    rankDesignDnaForSurvey(signalOnlySurvey).map(({ dna }, index) => [dna.id, index]),
  );
}

function hueSeedFromCustomerColor(value: string): number | null {
  const match = /#([0-9a-f]{6}|[0-9a-f]{3})\b/iu.exec(value);
  if (!match) return null;
  const normalized = match[1].length === 3
    ? match[1].split('').map((digit) => `${digit}${digit}`).join('')
    : match[1];
  const numeric = Number.parseInt(normalized, 16);
  const red = ((numeric >> 16) & 0xff) / 255;
  const green = ((numeric >> 8) & 0xff) / 255;
  const blue = (numeric & 0xff) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  if (delta === 0) return 0;
  const raw = maximum === red
    ? ((green - blue) / delta) % 6
    : maximum === green
      ? (blue - red) / delta + 2
      : (red - green) / delta + 4;
  return Math.round((raw * 60 + 360) % 360);
}

function resolvedDesignDna(
  template: NamedTemplate,
  survey: SurveyInput,
): ResolvedNamedTemplate['designDna'] {
  const customerHue = hueSeedFromCustomerColor(survey.colorPreference);
  return {
    ...template.recipe.designDna,
    ...(customerHue === null ? {} : { hueSeed: customerHue }),
    overrides: { ...template.recipe.designDna.overrides },
  };
}

/**
 * 카탈로그 레코드만 정렬한다. 고객 무드는 DNA 랭킹 가중치로, 참고 URL에서
 * 추출된 색·직접 색은 정규화 hue pin으로만 소비하며 새 조합을 만들지 않는다.
 */
export function namedTemplatesForSurvey(
  survey: SurveyInput,
  limit = NAMED_TEMPLATE_RECOMMENDATION_MAX,
): readonly NamedTemplate[] {
  const dnaRanks = signalRank(survey);
  return NAMED_TEMPLATE_CATALOG
    .filter((template) => compatibilityMatches(template, survey))
    .map((template) => ({
      template,
      score:
        template.route.recommendationRank * 10
        + (dnaRanks.get(template.recipe.designDna.dnaId) ?? 99) * 3,
    }))
    .sort((left, right) => left.score - right.score || left.template.id.localeCompare(right.template.id))
    .slice(0, limit)
    .map(({ template }) => template);
}

export function resolveNamedTemplate(
  template: NamedTemplate,
  survey: SurveyInput,
): ResolvedNamedTemplate | null {
  if (!compatibilityMatches(template, survey)) return null;
  const imageRecipe = imageDirectionRecipeForSurvey(template, survey);
  if (!imageRecipe) return null;
  const allowed = allowedSectionLayoutsForCandidate(survey, {
    designDnaId: template.recipe.designDna.dnaId,
    availability: sectionLayoutAvailabilityForSurvey(survey),
  });
  const sectionLayoutVariantIds = Object.fromEntries(
    Object.entries(template.recipe.sectionLayoutIds).filter(([kind, id]) => (
      id !== undefined
      && (allowed[kind as keyof typeof allowed] as readonly string[]).includes(id)
    )),
  ) as ResolvedNamedTemplate['sectionLayoutVariantIds'];
  return {
    template,
    selection: { catalogVersion: 1, templateId: template.id },
    designDna: resolvedDesignDna(template, survey),
    heroLayoutVariantId: template.recipe.heroLayoutId,
    sectionLayoutVariantIds,
    recommendedMotionSignatureId: imageRecipe.motionSignatureId
      ?? template.recipe.motionSignatureId,
    imageDirectionId: imageRecipe.imageDirectionId,
    mediaRequirement: imageRecipe.mediaRequirement,
  };
}

/** 생성 경계의 client round-trip 재검증. 카탈로그 ID만으로 임의 조합을 열지 않는다. */
export function validateNamedTemplateSelection(
  selection: NamedTemplateSelection | undefined,
  survey: SurveyInput,
): ResolvedNamedTemplate | null {
  if (!selection || selection.catalogVersion !== 1) return null;
  const template = namedTemplateById(selection.templateId);
  return template ? resolveNamedTemplate(template, survey) : null;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * 후보 round-trip은 templateId 하나만 신뢰하지 않는다. 카탈로그에서 다시 계산한
 * 실제 DNA·배열·모션 핀과 모두 같아야 신규 생성 경계를 통과한다.
 */
export function candidateMatchesNamedTemplate(
  candidate: DesignCandidate,
  survey: SurveyInput,
): boolean {
  if (!candidate.namedTemplate) return true;
  const resolved = validateNamedTemplateSelection(candidate.namedTemplate, survey);
  return Boolean(
    resolved
    && candidate.imageDirectionId === resolved.imageDirectionId
    && sameJson(candidate.designDna, resolved.designDna)
    && candidate.heroLayoutVariantId === resolved.heroLayoutVariantId
    && sameJson(candidate.sectionLayoutVariantIds ?? {}, resolved.sectionLayoutVariantIds)
    && candidate.recommendedMotionSignatureId === resolved.recommendedMotionSignatureId,
  );
}

export function fingerprintDistance(
  left: NamedTemplate,
  right: NamedTemplate,
): number {
  const leftValues = Object.values(left.visualFingerprint);
  const rightValues = Object.values(right.visualFingerprint);
  return leftValues.reduce(
    (distance, value, index) => distance + (value === rightValues[index] ? 0 : 1),
    0,
  );
}
