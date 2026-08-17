import type { ClinicSpecialty } from './clinic-palette';
import type {
  ProspectPublicSourceBlock,
  ProspectPublicSourceKind,
} from './contracts';

/**
 * TEMPLATE-SYSTEM §1-2 band tokens. Order within a plan follows the measured normalised position,
 * not intuition: hero opens every one of the twenty-six US sites, and about is the most common
 * second block at eleven of twenty-six — not services.
 */
export type ClinicBlockToken =
  | 'hero' | 'about' | 'providers' | 'services' | 'trust'
  | 'videos' | 'gallery' | 'reviews' | 'beforeafter'
  | 'events' | 'insurance' | 'location' | 'faq' | 'booking';

export const CLINIC_TEMPLATE_IDS = ['T5', 'T6'] as const;

export type ClinicTemplateId = (typeof CLINIC_TEMPLATE_IDS)[number];

export type ClinicMotionCharacter = 'minimal' | 'medium' | 'strong' | 'parallax';

export interface ClinicTemplate {
  id: ClinicTemplateId;
  name: string;
  /** §1-4 R/S. S reads in one pass; R repeats trust blocks. */
  typeGroup: 'R' | 'S';
  plan: readonly ClinicBlockToken[];
  /** §1-4: the observed floor across twenty-six US sites is five blocks. Four is outside range. */
  minBlocks: number;
  maxBlocks: number;
  /** §5-4 exact values. */
  motion: {
    character: ClinicMotionCharacter;
    durationMs: number;
    shiftPx: number;
    staggerMs: number;
    scrubOrPin: boolean;
  };
  /** §3 palette tolerance — how much of an extracted colour the layout can absorb. */
  paletteTolerance: 'narrow' | 'medium' | 'wide' | 'maximum';
  h1MinPx: number;
  h1MaxPx: number;
}

/**
 * T5 is first because its palette tolerance is the widest: whatever the extractor produces, a
 * page whose content is whitespace and one block of type does not break. §7-1.
 */
export const CLINIC_TEMPLATE_T5: ClinicTemplate = Object.freeze({
  id: 'T5',
  name: 'Mono Statement',
  typeGroup: 'S',
  // §3 T5 — five to six blocks. FAQ is present in every template and sits low (§0-2, position 0.82).
  plan: ['hero', 'about', 'services', 'reviews', 'faq', 'booking'] as const,
  minBlocks: 5,
  maxBlocks: 6,
  motion: {
    character: 'strong' as const,
    durationMs: 800,
    shiftPx: 24,
    staggerMs: 120,
    scrubOrPin: false,
  },
  paletteTolerance: 'maximum',
  h1MinPx: 120,
  h1MaxPx: 160,
});

/**
 * §3 T6 — the one template the canon lets parallax into, and the only one whose plan repeats
 * gallery. Its subject is the room: a practice whose strength is the place it works in.
 *
 * paletteTolerance is 'narrow' verbatim from the canon, and it is a real constraint rather than a
 * label: a bright extracted brand dies on a photograph, so brand colour belongs to the sections
 * outside the pictures and text over a picture stays white.
 */
export const CLINIC_TEMPLATE_T6: ClinicTemplate = Object.freeze({
  id: 'T6',
  name: 'Photo Immersive',
  typeGroup: 'S',
  // §3 T6 — gallery twice, at the measured normalised position 0.57. Reproduced on three sites.
  plan: ['hero', 'about', 'gallery', 'services', 'gallery', 'reviews', 'faq', 'booking'] as const,
  minBlocks: 8,
  maxBlocks: 10,
  motion: {
    character: 'parallax' as const,
    durationMs: 600,
    shiftPx: 16,
    staggerMs: 90,
    // §5-4: parallax speed <= 70 and at most one pin per page. T6 is the only template allowed it.
    scrubOrPin: true,
  },
  paletteTolerance: 'narrow',
  h1MinPx: 88,
  h1MaxPx: 88,
});

export const CLINIC_TEMPLATES: Readonly<Record<ClinicTemplateId, ClinicTemplate>> = Object.freeze({
  T5: CLINIC_TEMPLATE_T5,
  T6: CLINIC_TEMPLATE_T6,
});

/**
 * §7-6: "T6 requires the image quality gate; demote on failure." Photo Immersive is a template
 * made of photographs, so a practice whose pictures are mostly logos and icons would get a
 * gallery band full of rejects — worse than the master it already had.
 *
 * Two conditions, because the two failure modes are different. Absolute count covers a site with
 * good photographs but too few to fill a repeated gallery; the ratio covers a site with plenty of
 * images of which few are photographs. Measured eligible-to-projected across the samples:
 * cameods 36/36 (100%), dental360 29/31 (94%), iddental 18/46 (39%) — so the 60% line separates
 * them with wide margin on both sides rather than being tuned to a boundary case.
 */
export const T6_MINIMUM_ELIGIBLE_PHOTOS = 12;
export const T6_MINIMUM_ELIGIBLE_RATIO = 0.6;

export function t6ImageGate(input: {
  eligiblePhotoCount: number;
  projectedPhotoCount: number;
}): { passes: boolean; reason: string } {
  const ratio = input.projectedPhotoCount === 0
    ? 0
    : input.eligiblePhotoCount / input.projectedPhotoCount;
  const percent = Math.round(ratio * 100);
  if (input.eligiblePhotoCount < T6_MINIMUM_ELIGIBLE_PHOTOS) {
    return {
      passes: false,
      reason: `only ${input.eligiblePhotoCount} usable photographs, fewer than the ${T6_MINIMUM_ELIGIBLE_PHOTOS} a repeated gallery needs`,
    };
  }
  if (ratio < T6_MINIMUM_ELIGIBLE_RATIO) {
    return {
      passes: false,
      reason: `${percent}% of the images are usable photographs, under the ${Math.round(T6_MINIMUM_ELIGIBLE_RATIO * 100)}% a photo-led template needs`,
    };
  }
  return {
    passes: true,
    reason: `${input.eligiblePhotoCount} usable photographs at ${percent}% of the pool`,
  };
}

/** §5-4 motion tokens, verbatim. Templates read these; they do not invent durations. */
export const CLINIC_MOTION_TOKENS = Object.freeze({
  hoverMs: 200,
  uiMs: 300,
  revealMs: 500,
  slowMs: 800,
  easeOut: 'cubic-bezier(0.33, 1, 0.68, 1)',
  easeOutStrong: 'cubic-bezier(0.16, 1, 0.30, 1)',
  easeInOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  /** §5-1: four of five measured US sites reveal at 0px; 100px is Korean grammar. */
  revealShiftPx: 16,
  revealShiftMaxPx: 24,
  staggerMs: 90,
});

export interface ClinicTemplateAssignmentInput {
  specialty: ClinicSpecialty;
  market: 'US' | 'KR';
  /** §1-4: trust + reviews section count. Two or more repeats makes it R. */
  trustSectionCount: number;
  /** §1-3/§3 T7: a network with branch locations, which is a US-only axis. */
  multiLocation: boolean;
  /** §3 T5: a practice built around one procedure. */
  singleProcedureFocus: boolean;
  galleryHeavy: boolean;
  /** §7-6 T6 image quality gate. Absent means the caller could not measure the pool. */
  imageGate?: { passes: boolean; reason: string };
}

export interface ClinicTemplateAssignment {
  templateId: ClinicTemplateId | null;
  /** Named so the operator can see why, and argue with it. */
  reason: string;
  /** The template the doc points at when it is not one we have built yet. */
  designatedByDoc: string;
}

/**
 * §7-2: specialty narrows the sections, R/S narrows the length, the visual family narrows the
 * expression. Colour is last and never decides the template.
 *
 * Only T5 is implemented, so this reports honestly when the right answer is a template that does
 * not exist yet rather than forcing every clinic into the one we have.
 */
export function assignClinicTemplate(
  input: ClinicTemplateAssignmentInput,
): ClinicTemplateAssignment {
  const group = input.trustSectionCount >= 2 ? 'R' : 'S';
  if (input.singleProcedureFocus && group === 'S') {
    return {
      templateId: 'T5',
      reason: 'single-procedure focus with one trust pass — Mono Statement',
      designatedByDoc: 'T5',
    };
  }
  if (input.multiLocation && input.market === 'US') {
    return {
      templateId: null,
      reason: 'multi-location US network — T7 Multi-unit, not yet implemented',
      designatedByDoc: 'T7',
    };
  }
  if (input.specialty === 'dental' && input.galleryHeavy) {
    /**
     * T6 is designated by the source; whether it is *used* is decided by the pictures. On failure
     * the canon says demote to T1/T2, and neither exists — so rather than invent one, the compile
     * keeps premium-dental-v1 and records why, which is the honest version of a demotion.
     */
    const gate = input.imageGate;
    return gate?.passes
      ? {
          templateId: 'T6',
          reason: `US dental with a gallery — T6 Photo Immersive, ${gate.reason}`,
          designatedByDoc: 'T6',
        }
      : {
          templateId: null,
          reason: gate
            ? `US dental with a gallery — T6 Photo Immersive declined: ${gate.reason}`
            : 'US dental with a gallery — T6 Photo Immersive, not yet implemented',
          designatedByDoc: 'T6',
        };
  }
  if (input.specialty === 'ortho-surgery-pain') {
    return {
      templateId: null,
      reason: 'orthopaedic — T3 Split Frame, not yet implemented',
      designatedByDoc: 'T3',
    };
  }
  if (group === 'R') {
    return {
      templateId: null,
      reason: 'trust repeated across the page — T2 Editorial Long-form, not yet implemented',
      designatedByDoc: 'T2',
    };
  }
  return {
    templateId: null,
    reason: 'single-doctor local practice — T8 Compact Practice, not yet implemented',
    designatedByDoc: 'T8',
  };
}

/**
 * Two rows of three in the master's grid. Every crawled sample clears it by a wide margin, so it
 * is a floor rather than a tuned threshold — it exists to keep a practice with three photographs
 * out of the picture-led family, not to split this corpus.
 */
const GALLERY_HEAVY_MIN_PHOTOS = 6;

/**
 * Derive the assignment inputs from what the crawl actually shows, so the decision is recorded on
 * every compile rather than living only in a unit test. §7-2 order: specialty, then R/S, then the
 * visual family.
 *
 * Every input is read from the source. An earlier version counted section types on the compiled
 * config, which cannot decide anything: by the time those sections exist the layout has already
 * been chosen, so the decision was describing its own output.
 */
export function clinicTemplateDecisionFromSource(input: {
  /** §7-2 reads specialty first, so it is an input rather than a module constant. */
  specialty: ClinicSpecialty;
  pageUrls: readonly string[];
  blocks: readonly ProspectPublicSourceBlock[];
  /** Source photographs that passed the photo gate — what a gallery band would have to fill. */
  eligiblePhotoCount: number;
  /** Everything the image projection kept, before the photo gate. Denominator for §7-6's ratio. */
  projectedPhotoCount?: number;
}): ClinicTemplateAssignment & { input: ClinicTemplateAssignmentInput } {
  const paths = input.pageUrls.map((url) => {
    try {
      return new URL(url).pathname.toLocaleLowerCase('en-US');
    } catch {
      return '';
    }
  });
  const hasKind = (...kinds: ProspectPublicSourceKind[]) => input.blocks.some(
    (block) => kinds.includes(block.kind),
  );
  const hasPath = (pattern: RegExp) => paths.some((path) => pattern.test(path));
  /**
   * A network has more than one address. That is the whole claim, so count addresses.
   *
   * The previous rule counted URLs matching /locations/ and called two a network, which read
   * cameods — a single practice with a locations index and one satellite page — as a multi-site
   * group. Measured across the samples: dental360 has eight address blocks against seven location
   * URLs and genuinely operates in Chicago, Waukesha, Dyer and Mundelein; cameods has one address
   * against two location URLs; iddental has one address and no location URL at all. Only the
   * address count separates them.
   *
   * Addresses are normalised before counting because one practice writes its own address several
   * ways — "3435 W. Irving Park Rd, Chicago, IL" and "3435 W Irving Park Rd Chicago, IL" are the
   * same door, and counting punctuation would rebuild the false positive we just removed.
   */
  const normalizedAddress = (text: string) => text
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();
  const distinctAddresses = new Set(
    input.blocks
      .filter((block) => block.kind === 'address')
      .map((block) => normalizedAddress(block.text))
      .filter((text) => text.length > 0),
  );
  // The /locations/ URL signal is still in the crawl and is deliberately NOT consulted here: it
  // is what produced the false positive above, and a signal that cannot change the answer is not
  // a signal worth carrying in the decision.
  const services = input.blocks
    .filter((block) => block.kind === 'service')
    .map((block) => block.text)
    .join(' ')
    .toLocaleLowerCase('en-US');
  const procedureFamilies = [
    /\bimplant/u, /\borthodont|braces|invisalign|aligner/u, /\bcosmetic|veneer|whitening/u,
    /\bperiodont|gum\b/u, /\bendodont|root canal/u, /\boral surgery|extraction/u,
    /\bpediatric|children/u, /\brestorative|crown|bridge|denture|filling/u,
  ].filter((pattern) => pattern.test(services)).length;
  /**
   * §1-4 counts trust bands, and the source shows a band by carrying either its content or a page
   * devoted to it. Three qualify: patient reviews, the people who provide the care, and what the
   * practice accepts as payment.
   */
  const trustSectionCount = [
    hasPath(/review|testimonial/u),
    hasKind('provider_name', 'provider_credential', 'provider_bio')
      || hasPath(/doctor|provider|meet-the|our-team|staff|physician/u),
    hasKind('insurance', 'price_or_financing') || hasPath(/insurance|financing|payment/u),
  ].filter(Boolean).length;
  const assignmentInput: ClinicTemplateAssignmentInput = {
    specialty: input.specialty,
    market: 'US',
    trustSectionCount,
    multiLocation: distinctAddresses.size >= 2,
    // One family across the whole service list is a single-procedure practice.
    singleProcedureFocus: procedureFamilies === 1,
    galleryHeavy: input.eligiblePhotoCount >= GALLERY_HEAVY_MIN_PHOTOS,
    imageGate: t6ImageGate({
      eligiblePhotoCount: input.eligiblePhotoCount,
      projectedPhotoCount: input.projectedPhotoCount ?? input.eligiblePhotoCount,
    }),
  };
  return { ...assignClinicTemplate(assignmentInput), input: assignmentInput };
}
