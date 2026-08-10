import type { ClinicSpecialty } from './clinic-palette';

/**
 * TEMPLATE-SYSTEM §1-2 band tokens. Order within a plan follows the measured normalised position,
 * not intuition: hero opens every one of the twenty-six US sites, and about is the most common
 * second block at eleven of twenty-six — not services.
 */
export type ClinicBlockToken =
  | 'hero' | 'about' | 'providers' | 'services' | 'trust'
  | 'videos' | 'gallery' | 'reviews' | 'beforeafter'
  | 'events' | 'insurance' | 'location' | 'faq' | 'booking';

export type ClinicTemplateId = 'T5';

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

export const CLINIC_TEMPLATES: Readonly<Record<ClinicTemplateId, ClinicTemplate>> = Object.freeze({
  T5: CLINIC_TEMPLATE_T5,
});

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
    return {
      templateId: null,
      reason: 'US dental with a gallery — T6 Photo Immersive, not yet implemented',
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
