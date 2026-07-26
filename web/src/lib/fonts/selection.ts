import type { SurveyInput } from '@/lib/types/domain';
import type { MotionIndustryClass, SiteTheme } from '@/lib/types/site';
import { canonicalIndustryClass } from '@/lib/motion/signatures';
import { resolveTemplate } from '@/lib/data/site-blueprints';
import type { DesignDnaId } from '@/lib/design/dna/types';
import { productionKoreanFontPairingById } from './catalog';
import { fontPairingAssetsAvailable } from './resources';
import {
  KOREAN_FONT_PAIRING_CATALOG_VERSION,
  MODERN_KOREAN_FONT_SELECTION_POLICY,
  type KoreanFontSelectionPolicy,
  type ProductionKoreanFontPairId,
} from './types';

export interface KoreanFontPairingSelectionContext {
  dnaId: DesignDnaId;
  industryClass: MotionIndustryClass;
}

/**
 * FONTMOD 신규 생성의 단일 서버 선택표. DNA1 `type.pair`와 FNT append-only 카탈로그는
 * 바꾸지 않고, 새 후보에 발급하는 production pin만 현대화한다.
 */
export const MODERN_DNA_FONT_PAIRING_MAP = Object.freeze({
  'cafe-warm-editorial': 'kr-nanum-square-round-friendly',
  'dining-refined-contrast': 'kr-pretendard-neutral',
  'beauty-soft-wellness': 'kr-nanum-square-round-friendly',
  'medical-clinical-clarity': 'kr-pretendard-neutral',
  'legal-authoritative-editorial': 'kr-pretendard-neutral',
  'workshop-tactile-heritage': 'kr-pretendard-neutral',
  'academy-structured-friendly': 'kr-nanum-square-round-friendly',
  'retail-bold-geometric': 'kr-gmarket-noto-structured',
} as const satisfies Readonly<Record<DesignDnaId, ProductionKoreanFontPairId>>);

/**
 * 서버 소유 결정표. 업종은 DNA 추천을 고르는 앞 단계에서만 관여하며, 선택된 DNA의 폰트는
 * 이 표 하나로 고정된다. 명조 세트는 기존 pin·명시 재디자인용으로 보존하되 자동 발급하지 않는다.
 */
export function resolveKoreanFontPairingId(
  context: KoreanFontPairingSelectionContext,
): ProductionKoreanFontPairId | null {
  const id = MODERN_DNA_FONT_PAIRING_MAP[context.dnaId];
  return fontPairingAssetsAvailable(id) ? id : null;
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
  options: {
    selectionPolicy?: KoreanFontSelectionPolicy;
  } = {},
): SiteTheme {
  if (!id || !fontPairingAssetsAvailable(id)) return theme;
  const pairing = productionKoreanFontPairingById(id);
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
      ...(options.selectionPolicy
        ? { selectionPolicy: options.selectionPolicy }
        : {}),
    },
  };
}

/** 신규 후보 발급 경계 전용 helper. 저장된 pin 렌더에는 호출되지 않는다. */
export function applyModernKoreanFontPairing(
  theme: SiteTheme,
  id: ProductionKoreanFontPairId | null,
): SiteTheme {
  return applyKoreanFontPairing(theme, id, {
    selectionPolicy: MODERN_KOREAN_FONT_SELECTION_POLICY,
  });
}
