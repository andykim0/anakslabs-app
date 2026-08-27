import { contrastRatio, relLuminance } from '@/lib/design/quality-standards';
import type { ClinicDesignLanguage } from '@/lib/types/site';
import {
  MARQUEE_TOKENS,
  marqueeBrandGateFailures,
  marqueeInkFor,
} from './design-language';

/**
 * TEMPLATE-SYSTEM §2 — the seven slots a template may reference. Nothing else is a colour, and
 * shadows and borders are alpha variants of --ink.
 */
export const CLINIC_PALETTE_SLOTS = [
  '--brand',
  '--brand-ink',
  '--accent',
  '--surface',
  '--surface-2',
  '--ink',
  '--ink-muted',
] as const;

export type ClinicPaletteSlot = (typeof CLINIC_PALETTE_SLOTS)[number];

/**
 * §2-2, in priority order. The logo is first because it is the one colour a brand chose.
 *
 * There is deliberately no origin for a colour declared inline on a decorative element, and the
 * reason is measured rather than assumed. A site can put every chromatic value it owns into
 * translucent gradient stops on wrapper divs, where the colour is a 20%-opacity glow rather than
 * a fill the practice ever shows at full strength. iddentalimplant.com on 2026-08-12: no <style>
 * block on any of its twenty pages, and 248 of 248 chromatic inline occurrences were gradient
 * stops with a maximum alpha of 0.20. Reading those as a brand would report a colour the practice
 * never uses, so a site like that legitimately resolves to the specialty fallback and says so.
 *
 * Note this is also why an accent preset can look better informed than it is: the preset routing
 * flattens alpha away, so it will happily route such a glow to a clean preset. That is not extra
 * signal, it is the same weak signal accepted without asking.
 */
export const CLINIC_PALETTE_ORIGINS = [
  'logo',
  'cta',
  'link',
  'heading',
  'theme-color',
  'specialty-fallback',
] as const;

export type ClinicPaletteOrigin = (typeof CLINIC_PALETTE_ORIGINS)[number];

export const CLINIC_SPECIALTIES = [
  'dental',
  'derm-plastic-aesthetic',
  'ortho-surgery-pain',
  'eye-internal-general',
] as const;

export type ClinicSpecialty = (typeof CLINIC_SPECIALTIES)[number];

/**
 * What an absent `clinicMaster.specialty` means, and nothing more.
 *
 * This used to be `US_DEMO_CLINIC_SPECIALTY`, a module-level literal that every consumer read
 * directly, which made the whole programme dental by construction. Specialty is now resolved once
 * per compile and stored on the pin, so the only remaining job of a constant is to say what the
 * pins issued before that field existed already meant. Consumers take a parameter; nothing reads
 * this to decide a live compile.
 */
export const US_DEMO_FALLBACK_CLINIC_SPECIALTY: ClinicSpecialty = 'dental';

/** §2-3. Recorded so the clinic can overturn the automatic choice. */
export const CLINIC_PALETTE_REFINEMENTS = [
  'none',
  'saturate',
  'electrify',
  'deep-neutral',
  'lighten-demote',
  'ink-reassign',
  /** §2-5 rescue: the practice's own hue and chroma, darkened until the gates pass. */
  'darken-to-gate',
] as const;

export type ClinicPaletteRefinement = (typeof CLINIC_PALETTE_REFINEMENTS)[number];

/** §2-4. Fallback use is recorded in meta, per §7-6. */
export const CLINIC_PALETTE_FALLBACKS: Readonly<Record<ClinicSpecialty, {
  brand: string;
  accent: string;
}>> = Object.freeze({
  dental: { brand: '#152D49', accent: '#4253FF' },
  'derm-plastic-aesthetic': { brand: '#201D1B', accent: '#C8A92D' },
  'ortho-surgery-pain': { brand: '#14151D', accent: '#FECC00' },
  'eye-internal-general': { brand: '#1D364F', accent: '#1890D7' },
});

export interface ClinicPaletteInput {
  /** Candidate colours in §2-2 priority order; the first parseable one wins. */
  candidates: readonly { origin: ClinicPaletteOrigin; hex: string }[];
  /** body background. Forced to white below L 0.92 per §2-2. */
  surface?: string;
  specialty: ClinicSpecialty;
  /**
   * Absent = the default language, and every line below runs exactly as it always has. A language
   * here re-keys which slots come from the practice and which are the language's own, because the
   * default gate encodes an assumption a colour-confident language does not share: that the brand
   * has to be legible as TEXT on the page. See `design-language.ts`.
   */
  designLanguage?: ClinicDesignLanguage;
  /**
   * §2-3 tie-break. A picture-heavy source takes the deep neutral, because high chroma fights
   * photography; a type-led source takes the electric treatment.
   */
  imageDense: boolean;
}

export interface ClinicPalette {
  slots: Readonly<Record<ClinicPaletteSlot, string>>;
  meta: {
    origin: ClinicPaletteOrigin;
    fallbackUsed: boolean;
    refinement: ClinicPaletteRefinement;
    /**
     * §2-5 gates the extracted colour failed. Non-empty with fallbackUsed false means the
     * darken-to-gate rescue cleared them without giving up the practice's hue.
     */
    gateFailures: string[];
  };
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const value = hex.trim().replace(/^#/u, '');
  const full = value.length === 3
    ? value.split('').map((c) => c + c).join('')
    : value;
  if (!/^[0-9a-f]{6}$/iu.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const part = (n: number) => Math.round(Math.max(0, Math.min(255, n)))
    .toString(16)
    .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r
    ? ((g - b) / d + (g < b ? 6 : 0))
    : max === g
      ? (b - r) / d + 2
      : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToHex({ h, s, l }: { h: number; s: number; l: number }): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
      : hp < 3 ? [0, c, x]
        : hp < 4 ? [0, x, c]
          : hp < 5 ? [x, 0, c]
            : [c, 0, x];
  const m = l - c / 2;
  return toHex({ r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 });
}

/**
 * §2-3. Below this, an image-dense source is electrified rather than deepened.
 *
 * deep-neutral drives every colour it touches to s 0.30 / l 0.18. That is a good answer for a
 * source with chroma to spare — deepening a vivid pink to #3C2029 keeps a recognisable wine — and
 * a bad one for a muted mid-tone, where it produces a near-black slate that is indistinguishable
 * from --ink and erases the one colour the demo exists to carry. Ora's #508CBA and Brentwood's
 * #346B9F both landed on the same anonymous navy that way.
 *
 * So the tie-break is not "is the source picture-heavy" alone but "does the source carry enough
 * chroma that deepening preserves its identity". Below the threshold the colour needs lifting,
 * not crushing.
 *
 * MEASURED, and the reason this number and not another. Across the seven corpora, eight raw
 * candidates reach this branch and they are bimodal, not spread: 0.425, 0.429, 0.434, 0.507 |
 * 0.600, 0.600, 0.695. 0.55 is the midpoint of that empty span. Disclosed confound, because it
 * would be dishonest to present the split as cleaner than it is: in THIS corpus saturation and
 * hue co-vary — every low value is a blue or violet, every high value is a pink. Saturation is
 * keyed on rather than hue because a hue band would hard-code "blue is clinical" and would demote
 * a practice whose brand is legitimately green or gold, which is a rule about our taste rather
 * than about the source.
 */
const DEEP_NEUTRAL_MINIMUM_SATURATION = 0.55;

/**
 * §2-3. Hue is preserved and only saturation and lightness are re-imagined: the corpus's largest
 * family was a muted mid blue, and shipping that back leaves the demo in the same world as the
 * site it replaces.
 */
export function refineBrandColor(
  hex: string,
  imageDense: boolean,
): { hex: string; refinement: ClinicPaletteRefinement } {
  const hsl = hexToHsl(hex);
  if (!hsl) return { hex, refinement: 'none' };
  if (hsl.l < 0.12) return { hex, refinement: 'ink-reassign' };
  if (hsl.l > 0.75) {
    return { hex: hslToHex({ ...hsl, l: 0.55 }), refinement: 'lighten-demote' };
  }
  if (hsl.s < 0.35) {
    return { hex: hslToHex({ ...hsl, s: 0.55 }), refinement: 'saturate' };
  }
  if (hsl.s < 0.75 && hsl.l >= 0.25 && hsl.l <= 0.55) {
    return imageDense && hsl.s >= DEEP_NEUTRAL_MINIMUM_SATURATION
      ? { hex: hslToHex({ ...hsl, s: 0.30, l: 0.18 }), refinement: 'deep-neutral' }
      : { hex: hslToHex({ ...hsl, s: 0.90, l: 0.55 }), refinement: 'electrify' };
  }
  return { hex, refinement: 'none' };
}

/** §2-5. A failure here returns the palette to the specialty fallback rather than shipping it. */
export function clinicPaletteGateFailures(input: {
  brand: string;
  brandInk: string;
  accent: string;
  surface: string;
  ink: string;
}): string[] {
  const failures: string[] = [];
  if (contrastRatio(input.ink, input.surface) < 12) failures.push('ink/surface 12:1');
  if (contrastRatio(input.brand, input.surface) < 4.5) failures.push('brand/surface 4.5:1');
  if (contrastRatio(input.brandInk, input.brand) < 4.5) failures.push('brand-ink/brand 4.5:1');
  const brandHsl = hexToHsl(input.brand);
  const accentHsl = hexToHsl(input.accent);
  if (brandHsl && accentHsl) {
    const deltaH = Math.min(
      Math.abs(brandHsl.h - accentHsl.h),
      360 - Math.abs(brandHsl.h - accentHsl.h),
    );
    if (deltaH < 15 && Math.abs(brandHsl.l - accentHsl.l) < 0.2) {
      failures.push('accent separation ΔH 15° or ΔL 0.2');
    }
  }
  return failures;
}

function inkFor(surface: string): { ink: string; inkMuted: string } {
  return relLuminance(surface) > 0.5
    ? { ink: '#111318', inkMuted: '#5A6270' }
    : { ink: '#F5F7FA', inkMuted: '#A8B0BC' };
}

function surfaceStep(surface: string): string {
  const hsl = hexToHsl(surface);
  if (!hsl) return '#F4F6F9';
  // ΔL 3~8 per §2-1, taken away from the extreme so the step stays visible either way.
  return hslToHex({ ...hsl, l: hsl.l > 0.5 ? hsl.l - 0.05 : hsl.l + 0.05 });
}

/** §2-3 hands anything below this to --ink, so the rescue stops there rather than making mud. */
const GATE_RESCUE_MIN_L = 0.12;
const GATE_RESCUE_STEP_L = 0.01;

export function brandInkFor(brand: string): string {
  return contrastRatio('#FFFFFF', brand) >= contrastRatio('#111318', brand)
    ? '#FFFFFF'
    : '#111318';
}

/**
 * The palette a template is allowed to see. Every failure path lands on the specialty fallback
 * and says so in meta, because a demo that quietly invents a brand colour is worse than one that
 * admits it used a default.
 */
/**
 * MARQUEE's seven slots.
 *
 * Written as its own function rather than as conditionals threaded through the default builder,
 * for the same reason the radius tokens get a parallel function: a branch inside the default path
 * is a branch that can be taken by accident, and this path must be unreachable without a stored
 * `designLanguage`. Nothing here calls `refineBrandColor` — MARQUEE's whole premise is that the
 * practice's colour arrives at full strength, so re-imagining its chroma would be re-deciding the
 * one thing the language exists to carry.
 *
 * FROM THE PRACTICE: `--brand` (the surface: the CTA band, the utility strip, the header rule, the
 * block behind the hero plate) and `--brand-ink`, its legible partner drawn from the language's
 * own two inks.
 *
 * FROM THE LANGUAGE: everything else — `--ink` plum, `--ink-muted`, `--accent` violet, `--surface`
 * white, `--surface-2` lilac. A MARQUEE demo of any practice is recognisably the same language.
 */
function buildMarqueePalette(input: ClinicPaletteInput): ClinicPalette {
  const gatesFor = (brand: string) => marqueeBrandGateFailures(brand);
  let adopted: { origin: ClinicPaletteOrigin; hex: string } | null = null;
  let reportedFailures: string[] = [];
  for (const candidate of input.candidates) {
    if (!parseHex(candidate.hex)) continue;
    const failures = gatesFor(candidate.hex);
    if (reportedFailures.length === 0) reportedFailures = failures;
    if (failures.length === 0) {
      adopted = candidate;
      reportedFailures = [];
      break;
    }
  }
  /**
   * The honest failure. No darkening rescue runs here: walking an unusable colour down its own
   * lightness is what produces #BF590D, where the language's ink stops passing and white starts —
   * the exact inversion of the rule this language is built on. If the practice cannot supply a
   * surface the language can write on, the language supplies its own and says so.
   */
  const brand = adopted ? adopted.hex.toUpperCase() : MARQUEE_TOKENS.defaultBrand;
  const brandInk = marqueeInkFor(brand) ?? MARQUEE_TOKENS.ink;
  return {
    slots: Object.freeze({
      '--brand': brand,
      '--brand-ink': brandInk,
      '--accent': MARQUEE_TOKENS.accent,
      '--surface': MARQUEE_TOKENS.surface,
      '--surface-2': MARQUEE_TOKENS.lilacTint,
      '--ink': MARQUEE_TOKENS.ink,
      '--ink-muted': MARQUEE_TOKENS.inkSoft,
    }),
    meta: {
      origin: adopted ? adopted.origin : 'specialty-fallback',
      fallbackUsed: !adopted,
      refinement: 'none',
      gateFailures: reportedFailures,
    },
  };
}

export function buildClinicPalette(input: ClinicPaletteInput): ClinicPalette {
  if (input.designLanguage === 'marquee') return buildMarqueePalette(input);
  const fallback = CLINIC_PALETTE_FALLBACKS[input.specialty];
  const rawSurface = input.surface && parseHex(input.surface) ? input.surface : '#FFFFFF';
  // §2-2: anything darker than 0.92 is not a page background we keep.
  const surface = relLuminance(rawSurface) >= 0.92 ? rawSurface : '#FFFFFF';
  const surface2 = surfaceStep(surface);
  const { ink, inkMuted } = inkFor(surface);
  const accent = fallback.accent;

  const gatesFor = (brand: string) => clinicPaletteGateFailures({
    brand,
    brandInk: brandInkFor(brand),
    accent,
    surface,
    ink,
  });

  /**
   * One candidate's whole journey: §2-3's refinement, then §2-5's gates, then the rescue.
   * `adoptable` is false when this colour cannot be the brand — either no legible lightness
   * exists, or §2-3 sent it to --ink and took the brand from the fallback, which is not this
   * candidate surviving.
   */
  const resolveCandidate = (candidate: { origin: ClinicPaletteOrigin; hex: string }) => {
    const refined = refineBrandColor(candidate.hex, input.imageDense);
    if (refined.refinement === 'ink-reassign') {
      return { candidate, brand: fallback.brand, refinement: refined.refinement, gateFailures: [], adoptable: false };
    }
    const gateFailures = gatesFor(refined.hex);
    if (gateFailures.length === 0) {
      return { candidate, brand: refined.hex, refinement: refined.refinement, gateFailures, adoptable: true };
    }
    /**
     * §2-5 says a gate failure returns to the fallback, but going straight there throws away the
     * one thing the demo exists to carry. Almost every failure is the same failure — the colour
     * is too light to sit on a white page — and that is a fixable property, not a disqualifying
     * one. So walk the lightness down with hue and saturation held, which keeps both the
     * practice's hue and §2-3's re-imagined chroma, and give up only when no legible lightness
     * exists.
     *
     * An achromatic source is excluded: there is no hue to preserve, and darkening it produces a
     * grey that is a worse answer than admitting the specialty default was used.
     */
    const source = hexToHsl(refined.hex);
    const chromatic = (hexToHsl(candidate.hex)?.s ?? 0) >= 0.18;
    if (source && chromatic) {
      for (let l = source.l; l >= GATE_RESCUE_MIN_L; l -= GATE_RESCUE_STEP_L) {
        const attempt = hslToHex({ ...source, l });
        if (gatesFor(attempt).length > 0) continue;
        return { candidate, brand: attempt, refinement: 'darken-to-gate' as const, gateFailures, adoptable: true };
      }
    }
    return { candidate, brand: fallback.brand, refinement: refined.refinement, gateFailures, adoptable: false };
  };

  /**
   * §2-2 hands over a priority-ordered list, so exhaust it before giving up. A practice whose
   * logo colour happens to be unusable still owns the colour on its buttons, and answering with
   * the specialty default while a perfectly good second candidate sat unread is a worse demo
   * than the one the source could support.
   */
  let adopted: ReturnType<typeof resolveCandidate> | null = null;
  let firstAttempt: ReturnType<typeof resolveCandidate> | null = null;
  for (const candidate of input.candidates) {
    if (!parseHex(candidate.hex)) continue;
    const attempt = resolveCandidate(candidate);
    firstAttempt ??= attempt;
    if (attempt.adoptable) {
      adopted = attempt;
      break;
    }
  }

  const finalBrand = adopted ? adopted.brand : fallback.brand;
  // The highest-priority candidate's failures are the ones an operator would ask about, so they
  // stay on the record even when a later candidate was the one adopted.
  const reportedFailures = (adopted ?? firstAttempt)?.gateFailures ?? [];

  return {
    slots: Object.freeze({
      '--brand': finalBrand,
      '--brand-ink': brandInkFor(finalBrand),
      '--accent': fallback.accent,
      '--surface': surface,
      '--surface-2': surface2,
      '--ink': ink,
      '--ink-muted': inkMuted,
    }),
    meta: {
      origin: adopted ? adopted.candidate.origin : 'specialty-fallback',
      fallbackUsed: !adopted,
      refinement: adopted ? adopted.refinement : 'none',
      gateFailures: reportedFailures,
    },
  };
}
