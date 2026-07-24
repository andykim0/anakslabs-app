import {
  FONT_PAIRINGS,
  type FontPairing,
} from '@/lib/ai/design-knowledge-data';
import {
  PRODUCTION_KOREAN_FONT_PAIR_IDS,
  type ProductionKoreanFontManifest,
  type ProductionKoreanFontPairId,
} from './types';

export interface ProductionKoreanFontPairing extends FontPairing {
  id: ProductionKoreanFontPairId;
  availability: 'new-opt-in';
  productionManifest: ProductionKoreanFontManifest;
}

const productionIdSet = new Set<string>(PRODUCTION_KOREAN_FONT_PAIR_IDS);

function isProductionKoreanFontPairing(
  pairing: FontPairing,
): pairing is ProductionKoreanFontPairing {
  return (
    productionIdSet.has(pairing.id) &&
    pairing.availability === 'new-opt-in' &&
    pairing.productionManifest?.status === 'production-ready'
  );
}

/**
 * FONT_PAIRINGS is the only authored catalog. This is a typed eligibility view, not a second
 * registry, so legacy and FNT consumers cannot drift onto different metadata.
 */
export const PRODUCTION_KOREAN_FONT_PAIRINGS = FONT_PAIRINGS.filter(
  isProductionKoreanFontPairing,
);

export function productionKoreanFontPairingById(
  id: ProductionKoreanFontPairId,
): ProductionKoreanFontPairing {
  const pairing = PRODUCTION_KOREAN_FONT_PAIRINGS.find((candidate) => candidate.id === id);
  if (!pairing) throw new Error(`Production Korean font pairing is not registered: ${id}`);
  return pairing;
}
