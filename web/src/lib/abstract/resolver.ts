import type { DesignDnaId } from '@/lib/design/dna/types';
import { ABS_FAMILY_CATALOG, absFamilyById } from './catalog';
import { stableIndex } from './seed';
import type {
  AbsAtmosphericSlotId,
  AbsFamilyId,
  AbsIndustryId,
} from './types';

export const ABS_FAMILY_FALLBACK_ID = 'abs.soft-gradient-field' as const satisfies AbsFamilyId;

export interface ResolveAbsFamilyInput {
  requestedFamilyId?: AbsFamilyId;
  dnaId: DesignDnaId;
  industry: AbsIndustryId;
  siteSeed: string;
  sectionId: string;
  slotId: AbsAtmosphericSlotId;
}

function eligible(input: ResolveAbsFamilyInput) {
  return ABS_FAMILY_CATALOG.filter((family) => (
    family.slots.includes(input.slotId)
    && family.dnaAffinity[input.dnaId] !== 'discouraged'
    && family.industryAffinity[input.industry] !== 'discouraged'
  ));
}

/**
 * C5 stability seam. Candidate ordering is normalized here so an equivalent server table
 * produces the same authored family for the lifetime of a stored site seed.
 */
export function selectAbsFamilyFromPool(
  candidates: readonly AbsFamilyId[],
  canonicalSeed: string,
): AbsFamilyId {
  const pool = [...new Set(candidates)].sort();
  if (pool.length === 0) return ABS_FAMILY_FALLBACK_ID;
  return pool[stableIndex(canonicalSeed, pool.length)] ?? ABS_FAMILY_FALLBACK_ID;
}

/** Server-only table resolver. It never accepts model scores, colors, coordinates, or media claims. */
export function resolveAbsFamily(input: ResolveAbsFamilyInput): AbsFamilyId {
  if (input.requestedFamilyId) {
    const requested = absFamilyById(input.requestedFamilyId);
    if (
      requested
      && requested.slots.includes(input.slotId)
      && requested.dnaAffinity[input.dnaId] !== 'discouraged'
      && requested.industryAffinity[input.industry] !== 'discouraged'
    ) {
      return requested.id;
    }
  }

  const allowed = eligible(input);
  const jointlyRecommended = allowed.filter((family) => (
    family.dnaAffinity[input.dnaId] === 'recommended'
    && family.industryAffinity[input.industry] === 'recommended'
  ));
  const dnaRecommended = allowed.filter((family) => family.dnaAffinity[input.dnaId] === 'recommended');
  const pool = (jointlyRecommended.length > 0
    ? jointlyRecommended
    : dnaRecommended.length > 0
      ? dnaRecommended
      : allowed)
    .map((family) => family.id);

  const seed = `${input.siteSeed}|${input.sectionId}|${input.slotId}`;
  return selectAbsFamilyFromPool(pool, seed);
}
