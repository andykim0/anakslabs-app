import type { ClinicDesignLanguage } from '@/lib/types/site';
import { contrastRatio } from '@/lib/design/quality-standards';

/**
 * The design languages a compile may stamp on a pin.
 *
 * Absence is the current default language, and it stays absence: every pin issued before this
 * field existed already meant it, so writing the default down would move stored bytes without
 * meaning anything the omission does not. Same contract as `specialty`.
 */
export const CLINIC_DESIGN_LANGUAGES = ['marquee'] as const satisfies
  readonly ClinicDesignLanguage[];

/**
 * MARQUEE — Vivid Neighborhood. The constants that are the LANGUAGE rather than the practice.
 *
 * The split matters, and it is the whole generalisation: a MARQUEE demo of a practice that is not
 * Enamel still gets this violet/plum family, because the family is the language's structure — the
 * ink it writes in, the surface its cards sit on, the accent that fills a whole panel. What the
 * practice supplies is one thing: the brand SURFACE, and the ink partner that can legibly sit on
 * it. Everything below is ours.
 *
 * Values are the board's, measured on white with the repo's own `contrastRatio`:
 *   plum        #231942   16.29:1   the language's ink
 *   violet      #7D55C7    5.26:1 carrying white text
 *   violet-deep #5B34A8    8.40:1   text-on-white tone-mate
 *   ink-soft    #4A4160    9.48:1   body on white
 */
export const MARQUEE_TOKENS = Object.freeze({
  /** The language's ink. Every on-brand text decision resolves to this or to `inkLight`. */
  ink: '#231942',
  inkSoft: '#4A4160',
  /** The light ink partner, for a practice whose extracted brand surface is dark. */
  inkLight: '#FFF6EE',
  accent: '#7D55C7',
  accentDeep: '#5B34A8',
  lilac: '#EDE9FF',
  lilacTint: '#F8F6FF',
  cream: '#FFF6EE',
  surface: '#FFFFFF',
  /** The board's own orange, and the default brand surface when a practice cannot supply one. */
  defaultBrand: '#E56B10',
  onPlumLede: '#CFC6E8',
  onPlumLink: '#D8D0EE',
  onPlumMeta: '#B9AFD6',
  spring: 'cubic-bezier(.34,1.56,.64,1)',
  ease: 'cubic-bezier(.2,.7,.3,1)',
} as const);

/**
 * AA floors, pinned per element class rather than applied as one number, because "4.5 everywhere"
 * is both wrong and unmeasurable: the 42px utility strip and the display headings are large-scale
 * text under WCAG 1.4.3 and legitimately clear at 3.0, while body copy does not.
 */
export const MARQUEE_AA = Object.freeze({
  /** WCAG 1.4.3 normal text. */
  normalText: 4.5,
  /** WCAG 1.4.3 large scale: >= 24px, or >= 18.66px when bold. */
  largeText: 3.0,
  largeTextMinimumPx: 24,
  largeBoldMinimumPx: 18.66,
  largeBoldMinimumWeight: 700,
  /**
   * A brand SURFACE that does not read as a fill against the page is not a surface. This is the
   * one number here that is a judgement rather than a WCAG floor, and it is stated as such: it
   * exists so a practice whose extracted "brand" is an off-white does not get adopted as an
   * invisible orange band. It is deliberately far below 3.0 — the band is decoration carrying its
   * own legible ink, not a UI component that must be identified by its boundary.
   */
  brandSurfaceAgainstPage: 1.5,
} as const);

/**
 * Which ink the language writes on a given brand surface — and whether any ink it owns can.
 *
 * This is the rule the whole language turns on. The engine's default gate asks whether the brand
 * can be TEXT on the page (brand/surface >= 4.5), which rejects #E56B10 at 3.26 and, when the
 * darken-to-gate rescue walks it down to #BF590D, produces a colour where white passes (4.52) and
 * plum fails (3.61) — inverting the board's defining rule that orange carries plum, never white.
 * So MARQUEE asks the other question: can the language's ink sit on the practice's colour? Plum on
 * #E56B10 measures 4.997, and the extracted colour survives at full strength.
 *
 * Returns null when neither ink clears AA, which is the honest failure: the caller falls back to
 * the language's own surface pair and records that it did.
 */
export function marqueeInkFor(brand: string): string | null {
  const dark = contrastRatio(MARQUEE_TOKENS.ink, brand);
  const light = contrastRatio(MARQUEE_TOKENS.inkLight, brand);
  const best = dark >= light ? MARQUEE_TOKENS.ink : MARQUEE_TOKENS.inkLight;
  return Math.max(dark, light) >= MARQUEE_AA.normalText ? best : null;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const value = hex.trim().replace(/^#/u, '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  if (!/^[0-9a-fA-F]{6}$/u.test(full)) return null;
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r
    ? 60 * (((g - b) / d) % 6)
    : max === g
      ? 60 * ((b - r) / d + 2)
      : 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s, l };
}

/**
 * Is this candidate too close to a colour the LANGUAGE already owns?
 *
 * Same shape as §2-5's existing accent-separation rule (ΔH 15° or ΔL 0.2), turned on the
 * language's own constants instead of on the specialty accent.
 *
 * MEASURED, and the reason this rule exists at all. Run against the real enameldentistry.com
 * artifact, the ordered candidate ladder is #C95D0C, #231942, #4F327C, #7D55C7, #E56B10, ... —
 * and without this rule the gate adopts #231942, which IS this language's plum. The practice
 * genuinely publishes that colour, so nothing was wrong upstream; the result was still wrong.
 * `--brand` collapsed onto `--ink`, the utility strip and the CTA band went plum, and the demo
 * repainted the language in itself while reporting a successful extraction. A brand surface
 * indistinguishable from the ink it carries is not a surface.
 *
 * With the rule the ladder rejects #C95D0C (no ink reaches AA), #231942 (is the ink), #4F327C
 * (ΔH 7° and ΔL 0.16 from the ink) and #7D55C7 (is the accent), and adopts #E56B10 — the board's
 * own orange, which is the colour the source practice actually leads with.
 */
function tooCloseToLanguageColour(brand: string, owned: string): boolean {
  const a = hexToHsl(brand);
  const b = hexToHsl(owned);
  if (!a || !b) return false;
  const deltaH = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h));
  return deltaH < 15 && Math.abs(a.l - b.l) < 0.2;
}

/** §2-5 for MARQUEE. The brand slot gates on ink-on-brand, not brand-on-surface. */
export function marqueeBrandGateFailures(brand: string): string[] {
  const failures: string[] = [];
  if (marqueeInkFor(brand) === null) failures.push('marquee ink/brand 4.5:1');
  if (contrastRatio(brand, MARQUEE_TOKENS.surface) < MARQUEE_AA.brandSurfaceAgainstPage) {
    failures.push('marquee brand/page 1.5:1');
  }
  if (tooCloseToLanguageColour(brand, MARQUEE_TOKENS.ink)) {
    failures.push('marquee brand/ink separation ΔH 15° or ΔL 0.2');
  }
  if (tooCloseToLanguageColour(brand, MARQUEE_TOKENS.accent)) {
    failures.push('marquee brand/accent separation ΔH 15° or ΔL 0.2');
  }
  return failures;
}

/** Large-scale text under WCAG 1.4.3, so a conformance sweep can classify a node rather than guess. */
export function marqueeTextIsLargeScale(fontSizePx: number, fontWeight: number): boolean {
  return fontSizePx >= MARQUEE_AA.largeTextMinimumPx
    || (fontWeight >= MARQUEE_AA.largeBoldMinimumWeight
      && fontSizePx >= MARQUEE_AA.largeBoldMinimumPx);
}

/** The floor a node of this size and weight must clear. */
export function marqueeAaFloorFor(fontSizePx: number, fontWeight: number): number {
  return marqueeTextIsLargeScale(fontSizePx, fontWeight)
    ? MARQUEE_AA.largeText
    : MARQUEE_AA.normalText;
}
