import type { ClinicDesignLanguage, ClinicTypographyPreset } from '@/lib/types/site';
import { contrastRatio } from '@/lib/design/quality-standards';

/**
 * The design languages a compile may stamp on a pin.
 *
 * Absence is the current default language, and it stays absence: every pin issued before this
 * field existed already meant it, so writing the default down would move stored bytes without
 * meaning anything the omission does not. Same contract as `specialty`.
 */
export const CLINIC_DESIGN_LANGUAGES = ['marquee', 'ledger'] as const satisfies
  readonly ClinicDesignLanguage[];

/**
 * The language decides the typography, because that is what a design language IS — the pairing is
 * not a second axis an operator tunes on top of it. Written as an exhaustive map rather than a
 * ternary so that adding a language cannot compile until its pairing exists.
 */
export const CLINIC_DESIGN_LANGUAGE_TYPOGRAPHY = Object.freeze({
  marquee: 'clinic-marquee',
  ledger: 'clinic-ledger',
} as const satisfies Readonly<Record<ClinicDesignLanguage, ClinicTypographyPreset>>);

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

/**
 * WCAG 1.4.3's two text classes, shared by every language because they are not a design decision.
 * A language chooses which floor a given element must clear; it does not get to choose what "large
 * scale" means.
 */
export const CLINIC_LANGUAGE_AA = Object.freeze({
  normalText: 4.5,
  largeText: 3.0,
  largeTextMinimumPx: 24,
  largeBoldMinimumPx: 18.66,
  largeBoldMinimumWeight: 700,
} as const);

/** Large-scale text under WCAG 1.4.3, so a conformance sweep can classify a node rather than guess. */
export function clinicTextIsLargeScale(fontSizePx: number, fontWeight: number): boolean {
  return fontSizePx >= CLINIC_LANGUAGE_AA.largeTextMinimumPx
    || (fontWeight >= CLINIC_LANGUAGE_AA.largeBoldMinimumWeight
      && fontSizePx >= CLINIC_LANGUAGE_AA.largeBoldMinimumPx);
}

/** The floor a node of this size and weight must clear, in any language. */
export function clinicAaFloorFor(fontSizePx: number, fontWeight: number): number {
  return clinicTextIsLargeScale(fontSizePx, fontWeight)
    ? CLINIC_LANGUAGE_AA.largeText
    : CLINIC_LANGUAGE_AA.normalText;
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
  return clinicTextIsLargeScale(fontSizePx, fontWeight);
}

/** The floor a node of this size and weight must clear. */
export function marqueeAaFloorFor(fontSizePx: number, fontWeight: number): number {
  return clinicAaFloorFor(fontSizePx, fontWeight);
}

/* ========================================================================== *
 * THE TONE-MATE DERIVATION — the one function both remaining languages turn on.
 * ========================================================================== */

function hslToHex({ h, s, l }: { h: number; s: number; l: number }): string {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const second = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const lightest = l - chroma / 2;
  const [r, g, b] = h < 60
    ? [chroma, second, 0]
    : h < 120
      ? [second, chroma, 0]
      : h < 180
        ? [0, chroma, second]
        : h < 240
          ? [0, second, chroma]
          : h < 300
            ? [second, 0, chroma]
            : [chroma, 0, second];
  return `#${[r, g, b]
    .map((channel) => Math.round((channel + lightest) * 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

/**
 * The DARK TONE-MATE of an extracted brand colour: the same hue and the same saturation, walked
 * down in lightness until it is legible as TEXT on the language's own page surface.
 *
 * THE EXACT FUNCTION, stated so it can be argued with rather than inspected:
 *
 *   1. Read the brand as HSL. Hold `h` and `s` fixed — this is the whole point. §D of the spec
 *      forbids desaturating an accent to reach AA ("an accent is never desaturated to gray to
 *      pass — it is darkened along its own hue"), and holding `s` is what makes that structural
 *      rather than a promise.
 *   2. Step `l` down from the brand's own lightness in 0.005 increments. A brand that ALREADY
 *      clears the floor is returned unchanged on the first iteration, which is why a practice
 *      publishing a dark navy keeps exactly that navy rather than being darkened for no reason.
 *   3. Stop at the first candidate whose `contrastRatio` against `surface` reaches `minimumRatio`.
 *      Contrast is strictly monotonic in `l` at fixed `h`/`s`, so the first hit is also the
 *      LIGHTEST passing tone — the tone-mate stays as close to the practice's colour as the floor
 *      allows, instead of collapsing to near-black.
 *   4. Give up at `floorLightness`. Below it the result is not a tone-mate of anything, it is the
 *      language's ink wearing a hue, and the honest answer is null: the caller falls back and
 *      records that it did.
 *
 * MEASURED against the boards, with this repo's own `contrastRatio` rather than the boards' stated
 * numbers — and the two disagree, which is worth writing down:
 *
 *   LEDGER   #6698C9 -> #2F5B85 at 7.104 on #FFFFFF   (board hand-picks #1F4C7A and calls it
 *                                                      7.4:1; measured here it is 8.849:1, so the
 *                                                      board's own swatch is darker than its floor
 *                                                      needs. The derivation lands lighter and
 *                                                      closer to the practice's blue.)
 *   ATELIER  #A2D1DC -> #285D6A at 6.999 on #FAFAF4   (board hand-picks #1F5B69 and calls it
 *                                                      6.9:1; measured here it is 7.266:1.)
 *
 * Both board swatches clear their stated floors under this instrument, so the floors hold; it is
 * only the printed ratios that were optimistic. The derivation reproduces the boards' RULE — hue
 * kept, saturation kept, lightness driven down to a stated floor — not their exact bytes, because
 * a hand-picked swatch is not a function and only a function generalises to seven practices.
 */
export function brandToneMate(
  brand: string,
  options: { surface: string; minimumRatio: number; floorLightness: number },
): string | null {
  const hsl = hexToHsl(brand);
  if (!hsl) return null;
  for (let l = hsl.l; l >= options.floorLightness - 1e-9; l -= 0.005) {
    const candidate = hslToHex({ ...hsl, l });
    if (contrastRatio(candidate, options.surface) >= options.minimumRatio) return candidate;
  }
  return null;
}

/* ========================================================================== *
 * LEDGER — Calm Clinical.
 * ========================================================================== */

/**
 * LEDGER's constants: the ink, the grays, the rules and the washes. Same split as MARQUEE's, and
 * for the same reason — a LEDGER demo of a dermatology practice is recognisably the same language
 * as a LEDGER demo of a periodontist, because everything below is ours and only the accent is
 * theirs.
 *
 * Values are the board's, measured on white with this repo's own `contrastRatio` (the board prints
 * 16.7 / 10.6 / 5.9 for the first three; this instrument reads them slightly higher, and it is this
 * instrument the AA sweep uses):
 *   ink    #12171C  18.025:1  headings
 *   text   #333B44  11.352:1  body
 *   meta   #5B6672   5.852:1  captions, table heads, mono labels
 *   steel  #6698C9   3.044:1  the board's own extracted blue — a MARK, never small text
 *
 * The two other surfaces are measured too, because the tone-mate is derived against WHITE and then
 * has to survive them: `#2F5B85` reads 7.104 on white, 6.500 on `panel` and 6.237 on `wash`, so
 * the alternate band and the row-hover fill cost about 0.6 and 0.9 of ratio and neither approaches
 * the 4.5 floor. That is why one derivation against one surface is enough for the whole language.
 */
export const LEDGER_TOKENS = Object.freeze({
  /** Headings. Every `h2` in the language is this, including on the panel surface. */
  ink: '#12171C',
  /** Body copy, table cells, row descriptions. */
  text: '#333B44',
  /** Meta: captions, mono column heads, the micro-bar, footnotes. */
  meta: '#5B6672',
  /** The page. LEDGER is a white language; `panel` is its only other surface. */
  surface: '#FFFFFF',
  /** Alternate bands, the micro-bar, the closing band. */
  panel: '#F3F5F7',
  /** Every division in the language. */
  rule: '#DDE2E7',
  /** The heavier hairline: table tops, tag borders, thumbnail frames, the stuck header edge. */
  ruleStrong: '#C3CBD3',
  /** Row and table hover, and the ghost button's fill. */
  wash: '#EAF1F8',
  /** The light ink partner, for a practice whose extracted colour is dark enough to be a surface. */
  inkLight: '#FFFFFF',
  /**
   * The board's own steel, and the default brand when a practice cannot supply one. periohealth.com
   * — the board's source — 403s our crawler's UA and has no artifact, so this constant is the only
   * place that colour reaches the engine.
   */
  defaultBrand: '#6698C9',
  ease: 'cubic-bezier(.33,.9,.35,1)',
} as const);

/**
 * LEDGER's floors.
 *
 * `textToneMate` is 7.0 rather than 4.5, and that is a deliberate over-shoot: the language's rule
 * is that ALL text runs in the tone-mate, including 11.5px mono index labels and 12.5px captions,
 * and a 4.5 floor set on a display heading is not a floor for an 11.5px label sitting on the
 * `--wash` fill. Deriving once at 7.0 means every text use of the accent is covered by the one
 * derivation instead of by a table of exceptions.
 *
 * `displayToneMate` is the floor the hero `h1` must clear, and it is stated separately because the
 * board makes the accent CARRY display type — the single largest visual change on the board and the
 * thing that separates it from a corporate-blue template where the accent only appears in buttons.
 * A display heading is large-scale text under 1.4.3 and would legitimately pass at 3.0; the board
 * asks for 4.5, and the language keeps 4.5 so an h1 that reflows to a smaller clamp value on a
 * narrow viewport does not silently drop below its own class.
 */
export const LEDGER_AA = Object.freeze({
  normalText: CLINIC_LANGUAGE_AA.normalText,
  largeText: CLINIC_LANGUAGE_AA.largeText,
  /** Every text use of the accent resolves to a tone-mate at or above this. */
  textToneMate: 7.0,
  /** The hero display heading's own floor, checked rather than assumed. */
  displayToneMate: 4.5,
  /**
   * Below this lightness a "tone-mate" is just the language's ink with a hue attached, so the
   * derivation stops and says it failed instead of producing mud.
   */
  toneMateFloorLightness: 0.1,
  /**
   * A brand colour that cannot be SEEN on the page is not a keyline. Same judgement as MARQUEE's
   * `brandSurfaceAgainstPage` and deliberately the same number, because it is the same question
   * asked of a different shape: MARQUEE needs its colour to read as a band, LEDGER needs it to read
   * as a 2px rule and a 26px mark. Far below 3.0 on purpose — these are decorative divisions
   * carrying their own legible ink, not UI components identified by their boundary.
   */
  brandAgainstPage: 1.5,
  /**
   * The accent must be CHROMATIC, and this is the rule that keeps the spec's promise from becoming
   * vacuous. "The brand blue never degrades into gray" is easy to honour if the brand ARRIVES gray:
   * a practice publishing #5B6672 would be adopted, never flattened, and the page would still have
   * no accent in it.
   *
   * MEASURED, because HSL saturation is a poor intuition near white and this number has to be
   * defended rather than felt. The language's own neutrals report S = 0.112 (`meta`), 0.143
   * (`text`), 0.154 (`ruleStrong`), 0.172 (`rule`), 0.200 (`panel`) — the near-white ones read
   * HIGH, since HSL divides chroma by `1 - |2L-1|`. The lowest extracted candidate across all seven
   * corpora is #56A28E at 0.31. So 0.20 clears every real candidate with margin and excludes every
   * neutral this language owns.
   *
   * It does not stand alone: `panel`, `rule` and `wash` are also rejected by `brandAgainstPage`
   * (1.093, 1.304 and 1.139 on white), and an ink-like blue is rejected by the separation rule
   * below. Three gates, three different failure shapes.
   */
  brandMinimumSaturation: 0.2,
} as const);

/** The derivation, bound to LEDGER's page surface and text floor. */
export function ledgerTextToneMate(brand: string): string | null {
  return brandToneMate(brand, {
    surface: LEDGER_TOKENS.surface,
    minimumRatio: LEDGER_AA.textToneMate,
    floorLightness: LEDGER_AA.toneMateFloorLightness,
  });
}

/**
 * Which ink can sit ON the practice's colour, for the one place the language fills with it.
 *
 * LEDGER uses its accent almost entirely as line and mark, so this is a smaller question than
 * MARQUEE's — but `--brand-ink` feeds `--clinic-accent-contrast`, which the shared booking bar
 * reads, and a slot that is legible by luck is a slot that stops being legible for the next
 * practice. Returns null when neither ink clears, which is the honest failure.
 */
export function ledgerInkFor(brand: string): string | null {
  const dark = contrastRatio(LEDGER_TOKENS.ink, brand);
  const light = contrastRatio(LEDGER_TOKENS.inkLight, brand);
  const best = dark >= light ? LEDGER_TOKENS.ink : LEDGER_TOKENS.inkLight;
  return Math.max(dark, light) >= CLINIC_LANGUAGE_AA.normalText ? best : null;
}

/**
 * §2-5 for LEDGER. Four gates, and none of them is "is the brand legible as text on white" —
 * because in this language it never is text. #6698C9 measures 3.04 on white and the board ships it
 * as the logo mark, the nav underline and the 2px keyline above the closing band, which is exactly
 * the use the default gate would have darkened it out of.
 */
export function ledgerBrandGateFailures(brand: string): string[] {
  const failures: string[] = [];
  if (ledgerTextToneMate(brand) === null) {
    failures.push(`ledger tone-mate ${LEDGER_AA.textToneMate.toFixed(1)}:1 on white`);
  }
  if (ledgerInkFor(brand) === null) failures.push('ledger ink/brand 4.5:1');
  if (contrastRatio(brand, LEDGER_TOKENS.surface) < LEDGER_AA.brandAgainstPage) {
    failures.push('ledger brand/page 1.5:1');
  }
  const hsl = hexToHsl(brand);
  if (hsl && hsl.s < LEDGER_AA.brandMinimumSaturation) {
    failures.push('ledger brand chroma S 0.20');
  }
  /**
   * ONLY against the ink. MARQUEE separates against its ink AND its accent because it owns two
   * strong colours; LEDGER owns one ink and a family of grays, and separating against the grays
   * was measured to reject the board's own colour: `meta` is #5B6672 at H211.3/L0.402 and the
   * board's steel is H209.7/L0.594, which is ΔH 1.6° and ΔL 0.192 — inside the rule. The chroma
   * gate is what actually distinguishes a gray from an accent here, and it does it by asking the
   * right question.
   */
  if (tooCloseToLanguageColour(brand, LEDGER_TOKENS.ink)) {
    failures.push('ledger brand/ink separation ΔH 15° or ΔL 0.2');
  }
  return failures;
}
