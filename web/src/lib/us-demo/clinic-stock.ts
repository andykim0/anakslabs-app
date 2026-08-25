import { DENTAL_STOCK_MANIFEST } from '@/lib/clinic-master/dental-stock-manifest.generated';
import type { DentalStockManifest } from '@/lib/clinic-master';
import { CLINIC_SPECIALTIES, type ClinicSpecialty } from './clinic-palette';

/**
 * Which licensed stock library belongs to which specialty.
 *
 * The selector itself (`selectDentalStock`) was never dental — it is a deterministic pick from a
 * manifest. What was dental is that there is exactly one manifest and every caller reached for it.
 * This is the seam that makes the choice a lookup, so adding a library is a table entry.
 *
 * All three non-dental entries are null, and that is a measured fact rather than a placeholder:
 * every one of the 64 assets in the dental manifest is dental-specific, including all ten in the
 * nominally neutral `bright-interior` category (their alt text is dental chairs, dental x-ray
 * machines and dentist offices). There is nothing in the library a dermatology or orthopedic page
 * could borrow, so a null here means those pages use the practice's own photographs or none —
 * which is the honest outcome, not a degraded one. Putting a dental chair behind an orthopedic
 * hero would be the actual regression.
 */
export const CLINIC_STOCK_LIBRARIES: Readonly<
  Record<ClinicSpecialty, DentalStockManifest | null>
> = Object.freeze({
  dental: DENTAL_STOCK_MANIFEST,
  'derm-plastic-aesthetic': null,
  'ortho-surgery-pain': null,
  'eye-internal-general': null,
});

export function clinicStockLibraryFor(
  specialty: ClinicSpecialty,
): DentalStockManifest | null {
  return CLINIC_STOCK_LIBRARIES[specialty];
}

/** Specialties with no licensed imagery, for the operator surface and the asset-gap report. */
export function specialtiesWithoutStock(): readonly ClinicSpecialty[] {
  return CLINIC_SPECIALTIES.filter((specialty) => CLINIC_STOCK_LIBRARIES[specialty] === null);
}
