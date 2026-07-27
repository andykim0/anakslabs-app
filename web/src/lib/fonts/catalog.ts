import {
  FONT_PAIRINGS,
  type FontPairing,
} from '@/lib/ai/design-knowledge-data';
import {
  LATIN_FONT_PAIRING_SLOT_IDS,
  PRODUCTION_KOREAN_FONT_PAIR_IDS,
  type LatinFontPairingSlotId,
  type LatinFontPairingSlotManifest,
  type ProductionKoreanFontManifest,
  type ProductionKoreanFontPairId,
} from './types';

export interface ProductionKoreanFontPairing extends FontPairing {
  id: ProductionKoreanFontPairId;
  availability: 'new-opt-in';
  productionManifest: ProductionKoreanFontManifest;
}

export interface LatinFontPairingSlot extends FontPairing {
  id: LatinFontPairingSlotId;
  availability: 'locale-opt-in';
  latinProductionManifest: LatinFontPairingSlotManifest;
}

const productionIdSet = new Set<string>(PRODUCTION_KOREAN_FONT_PAIR_IDS);
const latinSlotIdSet = new Set<string>(LATIN_FONT_PAIRING_SLOT_IDS);

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

function isLatinFontPairingSlot(pairing: FontPairing): pairing is LatinFontPairingSlot {
  return (
    latinSlotIdSet.has(pairing.id)
    && pairing.availability === 'locale-opt-in'
    && pairing.latinProductionManifest?.locale === 'en-US'
  );
}

export const LATIN_FONT_PAIRING_SLOTS = FONT_PAIRINGS.filter(isLatinFontPairingSlot);
export const PRODUCTION_LATIN_FONT_PAIRINGS = LATIN_FONT_PAIRING_SLOTS.filter(
  (pairing) => pairing.latinProductionManifest.status === 'production-ready',
);

export function productionKoreanFontPairingById(
  id: ProductionKoreanFontPairId,
): ProductionKoreanFontPairing {
  const pairing = PRODUCTION_KOREAN_FONT_PAIRINGS.find((candidate) => candidate.id === id);
  if (!pairing) throw new Error(`Production Korean font pairing is not registered: ${id}`);
  return pairing;
}

export function latinFontPairingSlotById(id: LatinFontPairingSlotId): LatinFontPairingSlot {
  const pairing = LATIN_FONT_PAIRING_SLOTS.find((candidate) => candidate.id === id);
  if (!pairing) throw new Error(`Latin font pairing slot is not registered: ${id}`);
  return pairing;
}
