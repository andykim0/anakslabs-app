import type { SurveyInput } from '@/lib/types/domain';
import type { MotionIndustryClass, SiteTheme } from '@/lib/types/site';
import { canonicalIndustryClass } from '@/lib/motion/signatures';
import { resolveTemplate } from '@/lib/data/site-blueprints';
import type { DesignDnaId } from '@/lib/design/dna/types';
import { PRODUCTION_KOREAN_FONT_PAIRINGS } from './catalog';
import { fontPairingAssetsAvailable } from './resources';
import {
  KOREAN_FONT_PAIRING_CATALOG_VERSION,
  type ProductionKoreanFontPairId,
} from './types';

export interface KoreanFontPairingSelectionContext {
  dnaId: DesignDnaId;
  industryClass: MotionIndustryClass;
}

function pairingScore(
  id: ProductionKoreanFontPairId,
  context: KoreanFontPairingSelectionContext,
): number | null {
  const pairing = PRODUCTION_KOREAN_FONT_PAIRINGS.find((candidate) => candidate.id === id)!;
  const manifest = pairing.productionManifest;
  if (manifest.dnaAffinity[context.dnaId] === 'blocked') return null;
  if (manifest.industryRouting.blocked.includes(context.industryClass)) return null;
  let score = manifest.dnaAffinity[context.dnaId] === 'recommended' ? 20 : 8;
  if (manifest.industryRouting.primary.includes(context.industryClass)) score += 16;
  else if (manifest.industryRouting.secondary.includes(context.industryClass)) score += 8;
  return score;
}

/**
 * Server-owned deterministic table. `academy` remains catalog metadata only:
 * free-form `other` is never upgraded by guessing and always uses the neutral set.
 */
export function resolveKoreanFontPairingId(
  context: KoreanFontPairingSelectionContext,
): ProductionKoreanFontPairId | null {
  if (context.industryClass === 'other') {
    return fontPairingAssetsAvailable('kr-pretendard-neutral')
      ? 'kr-pretendard-neutral'
      : null;
  }
  return PRODUCTION_KOREAN_FONT_PAIRINGS
    .map((pairing, stableIndex) => ({
      id: pairing.id,
      stableIndex,
      score: pairingScore(pairing.id, context),
    }))
    .filter((candidate): candidate is typeof candidate & { score: number } => candidate.score !== null)
    .filter((candidate) => fontPairingAssetsAvailable(candidate.id))
    .sort((left, right) => right.score - left.score || left.stableIndex - right.stableIndex)[0]?.id ?? null;
}

export function fontIndustryClassForSurvey(survey: SurveyInput): MotionIndustryClass {
  const template = resolveTemplate(survey.purposeId, survey.industry);
  return canonicalIndustryClass(survey.purposeId, template.id, survey.industry);
}

/**
 * A failed selection returns the exact original theme, preventing a half-saved family/manifest pair.
 */
export function applyKoreanFontPairing(
  theme: SiteTheme,
  id: ProductionKoreanFontPairId | null,
): SiteTheme {
  if (!id || !fontPairingAssetsAvailable(id)) return theme;
  const pairing = PRODUCTION_KOREAN_FONT_PAIRINGS.find((candidate) => candidate.id === id);
  if (!pairing) return theme;
  return {
    ...theme,
    fonts: {
      heading: pairing.heading,
      body: pairing.body,
      googleFonts: [],
    },
    fontPairing: {
      catalogVersion: KOREAN_FONT_PAIRING_CATALOG_VERSION,
      id,
    },
  };
}
