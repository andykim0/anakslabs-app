import type { DentalStockCategory } from '@/lib/clinic-master';
import type { ClinicSpecialty } from './clinic-palette';

/**
 * The canonical page set: which treatment pages a compiled site may have, what they are called in
 * the nav, and what URL each one gets.
 *
 * This was a single dental table (`CATEGORY_META` in full-preview) keyed by a four-value dental
 * union, so a dermatology practice was given pages called Implants and Preventive Dentistry. The
 * dental entry below is that table unchanged — same ids, same order, same slugs, same labels, same
 * regexes, same stock categories, same fallback — because a dental practice must compile to the
 * bytes it compiled to before this file existed.
 */

export interface ClinicProcedureCategoryDef {
  /**
   * Stable identifier. It reaches the compiled output inside section and page ids
   * (`clinic-procedure-<id>-hero`), so renaming one changes a published site's element ids.
   */
  id: string;
  /** URL slug. Must satisfy isValidPageSlug and not collide with 'about' or 'contact'. */
  slug: string;
  navLabel: string;
  /**
   * Licensed stock pool for this category, or null when no stock exists for the specialty.
   *
   * null is not a gap to be papered over with the nearest dental photograph: a dermatology page
   * under a picture of a dental chair is worse than the same page with the practice's own photo or
   * no photo at all. The mechanism is wired; the assets are a separate deliverable.
   */
  stock: DentalStockCategory | null;
  /**
   * Claims a service into this category. Order matters — first match wins. The last category in a
   * specialty's list has no matcher and takes everything unclaimed.
   */
  match?: RegExp;
  /**
   * Selects from the practice's OWN photographs by alt text, for specialties whose vocabulary the
   * dental topic matcher cannot express. Absent for dental, which keeps its existing topic path.
   */
  photoMatch?: RegExp;
}

export interface ClinicProcedureTaxonomy {
  categories: readonly ClinicProcedureCategoryDef[];
}

/**
 * Dental, verbatim from the original CATEGORY_META and procedureCategory(). The regexes are the
 * former IMPLANT_RE / ORTHODONTIC_RE / COSMETIC_RE in their original evaluation order.
 */
const DENTAL_TAXONOMY: ClinicProcedureTaxonomy = Object.freeze({
  categories: Object.freeze([
    {
      id: 'implant',
      slug: 'implants',
      navLabel: 'Implants',
      stock: 'implant',
      match: /\b(?:dental\s+)?implants?\b|\ball[- ]on[- ](?:4|6)\b|\bfull[- ]arch\b/iu,
    },
    {
      id: 'orthodontic',
      slug: 'orthodontics',
      navLabel: 'Orthodontics',
      stock: 'orthodontic',
      match: /\borthodont(?:ic|ics|ist)?\b|\bbraces\b|\binvisalign\b|\bclear aligners?\b/iu,
    },
    {
      id: 'cosmetic-restorative',
      slug: 'cosmetic-restorative',
      navLabel: 'Cosmetic & Restorative',
      stock: 'cosmetic-restorative',
      match: /\bcosmetic\b|\bveneers?\b|\bwhitening\b|\brestorative\b|\bcrowns?\b|\bbridges?\b|\bdentures?\b/iu,
    },
    {
      id: 'preventive-general',
      slug: 'preventive-dentistry',
      navLabel: 'Preventive Dentistry',
      stock: 'preventive-general',
    },
  ]) as readonly ClinicProcedureCategoryDef[],
});

/**
 * The three verticals with source material. Category names are the practice-facing ones a US
 * patient would recognise, and every `stock` is null because the licensed library is dental only.
 */
const CLINIC_PROCEDURE_TAXONOMY_TABLE: Readonly<
  Record<ClinicSpecialty, ClinicProcedureTaxonomy>
> = Object.freeze({
  dental: DENTAL_TAXONOMY,
  'derm-plastic-aesthetic': Object.freeze({
    categories: Object.freeze([
      {
        id: 'skin-cancer',
        slug: 'skin-cancer',
        navLabel: 'Skin Cancer & Mohs',
        stock: null,
        match: /\bmohs\b|\bskin cancer\b|\bmelanoma\b|\bcarcinoma\b|\bbiops(?:y|ies)\b/iu,
        photoMatch: /\b(?:mohs|surgery|surgical|biopsy|lesion|mole|screening)\b/iu,
      },
      {
        id: 'cosmetic-dermatology',
        slug: 'cosmetic-dermatology',
        navLabel: 'Cosmetic Dermatology',
        stock: null,
        match: /\bbotox\b|\bfillers?\b|\binjectables?\b|\bchemical peels?\b|\bmicroneedling\b|\blaser\b|\brejuvenat/iu,
        photoMatch: /\b(?:botox|filler|injectable|laser|peel|rejuvenat|glow|aesthetic)\b/iu,
      },
      {
        id: 'plastic-surgery',
        slug: 'plastic-surgery',
        navLabel: 'Plastic Surgery',
        stock: null,
        match: /\bplastic surgery\b|\brhinoplasty\b|\bliposuction\b|\baugmentation\b|\bblepharoplasty\b/iu,
        photoMatch: /\b(?:surgery|surgical|operating|procedure)\b/iu,
      },
      {
        id: 'medical-dermatology',
        slug: 'medical-dermatology',
        navLabel: 'Medical Dermatology',
        stock: null,
        photoMatch: /\b(?:skin|acne|eczema|psoriasis|rosacea|derm|consultation|exam)\b/iu,
      },
    ]) as readonly ClinicProcedureCategoryDef[],
  }),
  'ortho-surgery-pain': Object.freeze({
    categories: Object.freeze([
      {
        id: 'joint-replacement',
        slug: 'joint-replacement',
        navLabel: 'Joint Replacement',
        stock: null,
        match: /\bjoint replacements?\b|\barthroplasty\b|\b(?:knee|hip|shoulder) replacements?\b/iu,
        photoMatch: /\b(?:joint|knee|hip|shoulder|replacement|implant|prosthe)\b/iu,
      },
      {
        id: 'sports-medicine',
        slug: 'sports-medicine',
        navLabel: 'Sports Medicine',
        stock: null,
        match: /\bsports medicine\b|\bacl\b|\brotator cuff\b|\bmeniscus\b|\btendons?\b|\bligaments?\b/iu,
        photoMatch: /\b(?:sport|athlet|running|training|injury|field|gym)\b/iu,
      },
      {
        id: 'spine-care',
        slug: 'spine-care',
        navLabel: 'Spine Care',
        stock: null,
        match: /\bspine\b|\bspinal\b|\bdiscs?\b|\bvertebra/iu,
        photoMatch: /\b(?:spine|spinal|back|posture|disc)\b/iu,
      },
      {
        id: 'pain-management',
        slug: 'pain-management',
        navLabel: 'Pain Management & Rehab',
        stock: null,
        photoMatch: /\b(?:therapy|rehab|exercise|physical|recovery|treatment|consultation)\b/iu,
      },
    ]) as readonly ClinicProcedureCategoryDef[],
  }),
  'eye-internal-general': Object.freeze({
    categories: Object.freeze([
      {
        id: 'vision-correction',
        slug: 'vision-correction',
        navLabel: 'Vision Correction',
        stock: null,
        match: /\blasik\b|\brefractive\b|\bvision correction\b|\bcontact lens(?:es)?\b|\bglasses\b/iu,
        photoMatch: /\b(?:lasik|vision|lens|glasses|eye ?wear|optical)\b/iu,
      },
      {
        id: 'cataract-glaucoma',
        slug: 'cataract-glaucoma',
        navLabel: 'Cataract & Glaucoma',
        stock: null,
        match: /\bcataracts?\b|\bglaucoma\b|\bretina\b|\bmacular\b|\bcornea\b/iu,
        photoMatch: /\b(?:cataract|glaucoma|retina|cornea|eye exam|slit lamp)\b/iu,
      },
      {
        id: 'chronic-care',
        slug: 'chronic-care',
        navLabel: 'Chronic Care',
        stock: null,
        match: /\bdiabetes\b|\bhypertension\b|\bcholesterol\b|\bthyroid\b|\bchronic\b/iu,
        photoMatch: /\b(?:monitor|blood pressure|screening|lab|chronic|consultation)\b/iu,
      },
      {
        id: 'primary-care',
        slug: 'primary-care',
        navLabel: 'Primary Care',
        stock: null,
        photoMatch: /\b(?:exam|physician|clinic|office|consultation|check ?up|patient)\b/iu,
      },
    ]) as readonly ClinicProcedureCategoryDef[],
  }),
});

export function clinicProcedureTaxonomy(
  specialty: ClinicSpecialty,
): ClinicProcedureTaxonomy {
  return CLINIC_PROCEDURE_TAXONOMY_TABLE[specialty];
}

/** The category a service falls into. First matching category wins; the last one is the default. */
export function clinicProcedureCategoryFor(
  taxonomy: ClinicProcedureTaxonomy,
  text: string,
): string {
  const matched = taxonomy.categories.find((category) => category.match?.test(text));
  return (matched ?? taxonomy.categories[taxonomy.categories.length - 1]).id;
}

export function clinicProcedureCategoryDef(
  taxonomy: ClinicProcedureTaxonomy,
  id: string,
): ClinicProcedureCategoryDef {
  const found = taxonomy.categories.find((category) => category.id === id);
  if (!found) throw new Error(`Unknown clinic procedure category: ${id}`);
  return found;
}

export { CLINIC_PROCEDURE_TAXONOMY_TABLE };
