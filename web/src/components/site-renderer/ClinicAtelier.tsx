import type { ClinicMasterPin, SiteConfig } from '@/lib/types/site';
import { ATELIER_TOKENS } from '@/lib/us-demo/design-language';
import { clinicAtelierRenderTokens } from '@/lib/clinic-master/tokens';

/**
 * ATELIER — Editorial Luxury.
 *
 * Every rule below is scoped to `[data-clinic-design-language="atelier"]`, which only a pin carrying
 * the stored field can put on the page — the same structural isolation MARQUEE and LEDGER have, and
 * for the same reason: `demoPitchLocale: 'ko-owner'` clinic pitches share this stylesheet's delivery
 * path and nothing but the selector keeps this language off them. See `atelier-invariants.test.ts`.
 */

export function atelierIsActive(config: SiteConfig): boolean {
  return config.clinicMaster?.designLanguage === 'atelier';
}

/**
 * The language's CSS variables. Two come from the practice — the extracted colour at full
 * saturation and its dark tone-mate — and every other value is the language's own, including the
 * ink field, which the header's whole behaviour depends on being dark.
 */
export function atelierRootStyle(pin: ClinicMasterPin): Record<string, string> {
  const geometry = clinicAtelierRenderTokens();
  const brand = pin.resolvedPalette?.slots['--brand'] ?? ATELIER_TOKENS.defaultBrand;
  const brandDeep = pin.resolvedPalette?.slots['--accent'] ?? ATELIER_TOKENS.ink;
  const brandInk = pin.resolvedPalette?.slots['--brand-ink'] ?? ATELIER_TOKENS.ink;
  return {
    '--at-brand': brand,
    '--at-brand-deep': brandDeep,
    '--at-brand-ink': brandInk,
    '--at-ink': ATELIER_TOKENS.ink,
    '--at-ink-soft': ATELIER_TOKENS.inkSoft,
    '--at-cream': ATELIER_TOKENS.cream,
    '--at-paper': ATELIER_TOKENS.paper,
    '--at-rule': ATELIER_TOKENS.rule,
    '--at-rule-2': ATELIER_TOKENS.ruleStrong,
    '--at-on-ink-rule': ATELIER_TOKENS.onInkRule,
    '--at-on-ink-rule-2': ATELIER_TOKENS.onInkRuleStrong,
    '--at-on-ink-lede': ATELIER_TOKENS.onInkLede,
    '--at-on-ink-hero-lede': ATELIER_TOKENS.onInkHeroLede,
    '--at-on-ink-cap': ATELIER_TOKENS.onInkCaption,
    '--at-e': ATELIER_TOKENS.easeOut,
    '--at-border': geometry.borderWidth,
    '--at-rule-w': geometry.ruleWidth,
    '--at-hair': geometry.hairGap,
    '--at-arrow': geometry.rowArrow,
    '--at-caption-band': geometry.captionBand,
    '--at-header-tall': geometry.headerTall,
    '--at-header-short': geometry.headerShort,
  };
}

export function atelierSiteAttributes(config: SiteConfig): Record<string, string> {
  return atelierIsActive(config) ? { 'data-clinic-design-language': 'atelier' } : {};
}

/**
 * THE HEADER'S TWO STATES, and the one piece of client behaviour this language adds.
 *
 * MEASURED FIRST, like LEDGER's: the clinic renderer has no scroll-state architecture at all —
 * `TenantHeader` is `position: sticky` with an inline `top` and no listener, `ClinicStickyBooking`
 * is `position: fixed` and pure CSS, and the only JavaScript on a clinic page is the nav-disclosure
 * shim and the motion runtime's `IntersectionObserver`. So this copies the observer, with a
 * sentinel exactly as tall as the board's own 64px threshold.
 *
 * IT ALSO DECIDES WHETHER THE TRANSPARENT STATE IS ALLOWED TO EXIST, and that is the load-bearing
 * half. A transparent header is only legible over the ink field; over a cream band it is cream on
 * cream. The board can assume its hero because it has one page. A demo has twelve, and a treatment
 * sub-page does not open on a hero at all.
 *
 * So `data-atelier-over-hero` is set only when the FIRST section of the document is a hero, and the
 * transparent rules require it. The default without JavaScript, and on every page whose first band
 * is not a hero, is the solid cream header — which is the state AA holds in unconditionally. The
 * fail-safe direction is the safe one: no script means no transparency, never the reverse.
 */
export const CLINIC_ATELIER_HEADER_RUNTIME = `(function(){
var h=document.querySelector('.anaks-tenant-header[data-clinic-design-language="atelier"]');
if(!h)return;
var first=document.querySelector('main section');
if(first&&first.getAttribute('data-section-type')==='hero'){h.setAttribute('data-atelier-over-hero','');}
var s=document.createElement('div');
s.setAttribute('data-atelier-scroll-sentinel','');
s.style.cssText='position:absolute;top:0;left:0;width:1px;height:64px;pointer-events:none';
document.body.insertBefore(s,document.body.firstChild);
if(!('IntersectionObserver' in window))return;
new IntersectionObserver(function(es){
if(es[0].isIntersecting){h.removeAttribute('data-atelier-scrolled');}
else{h.setAttribute('data-atelier-scrolled','');}
},{threshold:0}).observe(s);
})();`;

export function AtelierHeaderRuntime({ config }: { config: SiteConfig }) {
  if (!atelierIsActive(config)) return null;
  return <script dangerouslySetInnerHTML={{ __html: CLINIC_ATELIER_HEADER_RUNTIME }} />;
}

const S = '.anaks-site[data-clinic-design-language="atelier"]';
const H = '.anaks-tenant-header[data-clinic-design-language="atelier"]';

/**
 * The fifth stylesheet constant, gated on the stored field like the other four: a config compiled
 * before this existed must render byte-identically, and stylesheet bytes count.
 */
export const CLINIC_ATELIER_CSS = `
${S} {
  background: var(--at-cream);
  color: var(--at-ink);
  font-size: 17px;
  line-height: 1.65;
}

/*
  ONE PALETTE OVER THE ENGINE'S CADENCE. The engine decides once at compile which band is
  base/tint/dark/brand and writes it INLINE, so an author rule for alternation never applies and a
  language that paints only the bands it remembered runs the engine's oklch ramp on the rest. This
  language adopts the cadence and answers all four steps, and its answer has THREE colours because
  the board has three surfaces: cream, paper, and the ink field that carries both the dark band and
  the closing spread.

  Measured on the served apa page: base x4, tint x2, dark x1, brand x1.
*/
${S} [data-clinic-flow-section],
${S} [data-clinic-insurance-strip] {
  background-color: var(--at-cream) !important;
  color: var(--at-ink) !important;
  --clinic-section-text: var(--at-ink);
  --clinic-section-muted: var(--at-ink-soft);
  --clinic-section-accent: var(--at-brand-deep);
  --clinic-section-border: var(--at-rule);
  --clinic-section-surface: var(--at-cream);
}
/* The board's .sec--paper: a lift, not a tint. Cream is the base and paper is the brighter step. */
${S} [data-section-surface-tone="tint"] {
  background-color: var(--at-paper) !important;
  --clinic-section-surface: var(--at-paper);
}
/*
  THE INK FIELD, and it answers two cadence steps because the board uses one surface for both: its
  .sec--ink band and its .cta-band are the same #14120F. Every on-ink text colour below was measured
  against it rather than assumed — cream 17.847, mist 11.298, the band lede 9.465, the caption 6.611.
*/
${S} [data-section-surface-tone="dark"],
${S} [data-section-surface-tone="brand"],
${S} [data-section-type="hero"],
${S} [data-section-type="cta"] {
  background-color: var(--at-ink) !important;
  color: var(--at-cream) !important;
  --clinic-section-text: var(--at-cream);
  --clinic-section-muted: var(--at-on-ink-lede);
  --clinic-section-accent: var(--at-brand);
  --clinic-section-border: var(--at-on-ink-rule);
  --clinic-section-surface: var(--at-ink);
}
${S} [data-section-surface-tone="dark"] :is(h1,h2,h3,[data-clinic-flow-heading],[data-clinic-flow-item-heading]),
${S} [data-section-surface-tone="brand"] :is(h1,h2,h3,[data-clinic-flow-heading],[data-clinic-flow-item-heading]),
${S} [data-section-type="hero"] :is(h1,h2,h3,[data-clinic-flow-heading],[data-clinic-flow-item-heading]),
${S} [data-section-type="cta"] :is(h1,h2,h3,[data-clinic-flow-heading],[data-clinic-flow-item-heading]) {
  color: var(--at-cream) !important;
}
${S} [data-section-surface-tone="dark"] :is([data-clinic-flow-copy],[data-clinic-flow-intro]),
${S} [data-section-surface-tone="brand"] :is([data-clinic-flow-copy],[data-clinic-flow-intro]),
${S} [data-section-type="cta"] :is([data-clinic-flow-copy],[data-clinic-flow-intro]) {
  color: var(--at-on-ink-lede) !important;
}

/*
  ONE BLOCK RHYTHM at the board's own 112px. CLINIC_FLOW_CSS hardcodes 88px for most archetypes and
  leaves about. on --clinic-section-block-desktop, which the airy density sets to 136 — a 48px step
  in the middle of the page for no reason a reader can see. This language is the airiest of the
  three and the board says so.
*/
${S} [data-clinic-flow-section],
${S} [data-clinic-insurance-strip] {
  padding-block: 112px;
}
${S} [data-section-type="hero"] {
  padding-block: 0;
}

/* ---- type: a serif set SMALL, open-leaded, tracked POSITIVE ---------------- */
/*
  THE CALIBRATION, and the single specific tell this language turns on. Aman sets its serif section
  heads at 31.1px/1.45/+0.0161em and Aesop at 30px/1.33 — small, open-leaded, and tracked POSITIVE.
  The pre-calibration board was at 56px/1.06/-0.01em: larger, tighter and negatively tracked, which
  is the tech-display idiom rather than the editorial one. These are the refined numbers.

  letter-spacing is !important throughout for the reason LEDGER's is: the flow renderer writes it
  INLINE from a size-driven engine rule, and a size-driven rule tracks display type NEGATIVELY as it
  grows — which is precisely the value this language must not have.
*/
${S} [data-clinic-flow-heading] {
  font-family: var(--clinic-heading-family);
  font-weight: 400;
  font-size: clamp(33px,3.3vw,46px);
  line-height: 1.16;
  letter-spacing: .006em !important;
  max-width: 22ch;
  margin-bottom: 38px;
}
${S} [data-clinic-flow-hero-copy] h1,
${S} [data-section-type="hero"] [data-clinic-typography-tier="display"] {
  font-family: var(--clinic-heading-family);
  font-weight: 400;
  font-size: clamp(52px,6.1vw,86px);
  line-height: 1.06;
  letter-spacing: -.008em !important;
  max-width: 15ch;
}
${S} [data-clinic-flow-item-heading] {
  font-family: var(--clinic-heading-family);
  font-weight: 400;
  font-size: 28px;
  line-height: 1.22;
  letter-spacing: .006em !important;
}
${S} [data-clinic-flow-intro] {
  font-weight: 300;
  font-size: 17.5px;
  line-height: 1.6;
  color: var(--at-ink-soft);
  max-width: 46ch;
}
${S} [data-clinic-flow-copy] {
  font-weight: 300;
  font-size: 16px;
  line-height: 1.68;
  color: var(--at-ink-soft);
  max-width: 52ch;
}
${S} [data-clinic-flow-hero-copy] p:not([data-clinic-hero-kicker]) {
  font-weight: 300;
  font-size: 17.5px;
  line-height: 1.6;
  color: var(--at-on-ink-hero-lede) !important;
  max-width: 46ch;
}
/*
  The eyebrow. Its colour is written by CLINIC_FLOW_CSS with !important on the hook itself, so this
  needs the same weight — the identical trap both other languages hit on the same element. Over the
  ink hero it takes the brand at full saturation, which is 11.298 on ink; on cream it would be 1.580
  and takes the tone-mate instead.
*/
${S} [data-clinic-hero-kicker] {
  font-family: var(--clinic-control-family) !important;
  font-weight: 500;
  font-size: 11px !important;
  line-height: 1;
  letter-spacing: .28em;
  text-transform: uppercase;
  color: var(--at-brand) !important;
}
${S} [data-clinic-flow-marker] {
  font-family: var(--clinic-control-family) !important;
  font-weight: 500;
  font-size: 11px;
  line-height: 1;
  letter-spacing: .28em;
  text-transform: uppercase;
  color: var(--at-brand-deep) !important;
}

/* ---- rows: there are no cards in this language ---------------------------- */
/*
  THE BOARD'S OWN COMPONENT NOTE IS "Cards — there are none." Content sits in hairline rows with a
  1px rule between, filling to paper and indenting 20px on hover. So the engine's card treatment is
  undone here rather than never applied: no border box, no radius, no fill, no shadow.

  THE RAIL IS SIZED TO WHAT IT CARRIES. The board's rail is 200px because it holds the index OVER
  the service category, and its stated fix was that a wide rail holding a lone numeral is a dead
  gutter. The compile surfaces no category — measured: zero [data-clinic-flow-marker] across all
  seven corpora — so the rail is 88px and holds the index it actually has. Restoring the 200px
  without the category would restore exactly the defect the board removed.
*/
${S} [data-clinic-flow-section^="features."] [data-clinic-flow-items] {
  grid-template-columns: 1fr;
  gap: 0;
  counter-reset: at-row;
  border-top: var(--at-border) solid var(--at-rule);
}
${S} [data-clinic-flow-section^="features."] [data-clinic-flow-item] {
  grid-template-columns: 88px minmax(0,1fr) minmax(0,1.3fr);
  column-gap: 40px;
  row-gap: 0;
  align-items: start;
  padding: 38px 20px 38px 0;
  border: 0;
  border-bottom: var(--at-border) solid var(--at-rule);
  border-radius: 0;
  background: transparent;
  transition: background .45s var(--at-e), padding-left .45s var(--at-e);
}
${S} [data-clinic-flow-section^="features."] [data-clinic-flow-item]:hover {
  background: var(--at-paper);
  padding-left: 20px;
}
/*
  The index is GENERATED and set in the serif, which is the board's own treatment (.row .num is
  Instrument Serif 15px in the tone-mate). A row's ordinal is a fact about its position; it is not
  the manufactured metadata the category chip would be.
*/
${S} [data-clinic-flow-section^="features."] [data-clinic-flow-item]::before {
  content: counter(at-row, decimal-leading-zero);
  counter-increment: at-row;
  padding-top: 6px;
  font-family: var(--clinic-heading-family);
  font-weight: 400;
  font-size: 15px;
  line-height: 1;
  letter-spacing: .04em;
  color: var(--at-brand-deep);
}
${S} [data-clinic-flow-section^="features."] [data-clinic-flow-item-copy] {
  display: contents;
}
${S} [data-clinic-flow-section^="features."] [data-clinic-flow-item-heading] {
  grid-column: 2;
  grid-row: 1;
}
${S} [data-clinic-flow-section^="features."] [data-clinic-flow-copy],
${S} [data-clinic-flow-section^="features."] [data-clinic-flow-control] {
  grid-column: 3;
}
${S} [data-clinic-flow-section^="features."] [data-clinic-flow-control] {
  margin-top: 18px;
}
/*
  The row's media, where a features. row carries one. The board's row has no thumbnail — its right
  column reduces to a 46px arrow — but the compile does attach photography to service rows on some
  corpora, and hiding a real image to match a board that never had one is not conformance.
  3:2 is this language's landscape ratio.
*/
/*
  BOUNDED, and measured before it was. Spanning the media across columns 2 and 3 put a 992x661
  photograph inside a hairline row, so three of nine service rows were 700px tall and the other six
  were 130px — the row rhythm the whole language rests on, broken by the one element the board's row
  does not have. It keeps its 3:2 landscape ratio and sits under the copy at a plate width.
*/
${S} [data-clinic-flow-section^="features."] [data-clinic-flow-media] {
  grid-column: 3;
  width: min(100%, 320px);
  margin-top: 22px;
  aspect-ratio: 3 / 2;
  border: var(--at-border) solid var(--at-rule);
  border-radius: 0;
}
${S} [data-clinic-flow-section="features.faq-accordion"] [data-clinic-flow-item] {
  grid-template-columns: 88px minmax(0,1fr) minmax(0,1.3fr);
  padding: 30px 20px 30px 0;
}

/* ---- the section head: h2 left, affordance on its baseline, lede beneath --- */
/*
  Aman composes exactly this way — h2 442px wide with a 326px lede at 39ch directly beneath it — and
  Arc puts its "See all research" link on the h2's own baseline. The engine gives one h2 and an
  optional intro; the intro sits under the head at a narrower measure and the head is closed by a
  full-width rule, which is the half of the composition the DOM can carry.
*/
${S} [data-clinic-flow-inner] > [data-clinic-flow-heading] + [data-clinic-flow-intro] {
  margin-top: -18px;
  margin-bottom: 38px;
}

/* ---- text links and buttons: square, 1px, uppercase at .2em --------------- */
/*
  !important on colour and background, measured rather than defensive: the renderer writes each
  button's colour and background INLINE keyed on data-variant, and inline beats an author rule. On
  MARQUEE that produced six invisible buttons per page at a contrast ratio of 1.00.

  PRIMARY IS A FILLED INK BLOCK THAT INVERTS TO OUTLINE ON HOVER, and ghost inverts the other way —
  the board's own pair. Nothing here has a radius or a shadow.
*/
${S} .anaks-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 54px;
  padding: 0 30px;
  border-radius: 0 !important;
  border: var(--at-border) solid var(--at-ink) !important;
  background-color: var(--at-ink) !important;
  color: var(--at-cream) !important;
  box-shadow: none;
  /*
    font-size and font-weight are !important for the reason the colours are: ElementContent writes
    the button's own style object INLINE from the element, fontSize included, so an author rule at
    any specificity loses. MEASURED before this: 15px/600 against the board's 12px/500, with the
    letter-spacing correct — the one property the element does not carry inline.
  */
  font-family: var(--clinic-control-family) !important;
  font-weight: 500 !important;
  font-size: 12px !important;
  line-height: 1;
  letter-spacing: .2em !important;
  text-transform: uppercase;
  width: fit-content;
  justify-self: start;
  transition: background-color .38s var(--at-e), color .38s var(--at-e),
    border-color .38s var(--at-e);
}
${S} .anaks-btn:hover {
  background-color: transparent !important;
  color: var(--at-ink) !important;
}
${S} .anaks-btn[data-variant="ghost"],
${S} .anaks-btn[data-variant="outline"] {
  background-color: transparent !important;
  color: var(--at-ink) !important;
}
${S} .anaks-btn[data-variant="ghost"]:hover,
${S} .anaks-btn[data-variant="outline"]:hover {
  background-color: var(--at-ink) !important;
  color: var(--at-cream) !important;
}
/*
  A ghost control inside a hairline row is the board's TEXT LINK, not a 54px block: uppercase at
  .2em over a 1px rule that shifts to the tone-mate on hover.

  DECLARED DEVIATION. The board ends its row with a bare 46px arrow target. The engine's row control
  carries a label ("View treatment"), and replacing a labelled link with an unlabelled arrow removes
  its accessible name — so the row keeps the label and takes the board's own link component, padded
  to clear the 44px interactive minimum on its short axis.
*/
${S} [data-clinic-flow-section^="features."] .anaks-btn[data-variant="ghost"] {
  height: auto;
  min-height: 44px;
  padding: 12px 0 7px;
  border: 0 !important;
  border-bottom: var(--at-border) solid var(--at-rule-2) !important;
  background-color: transparent !important;
  color: var(--at-ink) !important;
  border-radius: 0 !important;
  transition: border-color .38s var(--at-e), color .38s var(--at-e);
}
${S} [data-clinic-flow-section^="features."] .anaks-btn[data-variant="ghost"]:hover {
  background-color: transparent !important;
  color: var(--at-brand-deep) !important;
  border-bottom-color: var(--at-brand-deep) !important;
}
${S} [data-clinic-hero-cta] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 54px;
  min-height: 54px;
  padding: 0 30px;
  border-radius: 0;
  border: var(--at-border) solid var(--at-cream);
  background: var(--at-cream);
  color: var(--at-ink) !important;
  font-family: var(--clinic-control-family);
  font-weight: 500;
  font-size: 12px;
  line-height: 1;
  letter-spacing: .2em;
  text-transform: uppercase;
  transition: background .38s var(--at-e), color .38s var(--at-e);
}
${S} [data-clinic-hero-cta]:hover {
  background: transparent;
  color: var(--at-cream) !important;
}

/* ---- hero: the ink field, with the photograph in its own column ----------- */
/*
  The board's hero is 1fr / 31.5%. The engine's split mode is 52/48, which is a different picture:
  a serif display line at 86px wants the width, and the photograph is a column rather than half the
  page. The proportion is part of the composition, so the language sets it.
*/
${S} [data-clinic-hero-mode="split"] [data-clinic-hero-split] {
  grid-template-columns: minmax(0,1fr) 31.5%;
  min-height: clamp(34rem,74vh,53rem);
}
/*
  The plate is the ink field itself, not a cream card cut out of it. CLINIC_HERO_LAYOUT_CSS paints
  --clinic-background behind it, which is right for a language whose hero is light and wrong for one
  whose hero is the darkest surface it owns. Author rule beats an author rule, so no !important.
*/
${S} [data-clinic-hero-mode] [data-clinic-hero-plate] {
  background: transparent;
  border-radius: 0;
  width: min(100%, calc(var(--clinic-container-max, 1140px) * .685));
  padding: 150px 84px 84px 0;
}
/*
  THE PHOTOGRAPH HAD TO FILL ITS OWN COLUMN, and this is the same fill bug MARQUEE found on the same
  hook. MEASURED: the 31.5% column stretched to the hero's full height as intended, but the <img>
  inside it rendered at its own intrinsic height anchored to the bottom — 400px of empty ink above a
  photograph, in the one composition this language leads with. CLINIC_HERO_LAYOUT_CSS sets
  align-content:end on the photo box so the licensed-imagery caption can sit at its foot, which is
  right for a caption and wrong for the image.
*/
${S} [data-clinic-hero-mode] [data-clinic-hero-photo] {
  background: #0A0908;
  align-content: stretch;
  align-items: stretch;
}
${S} [data-clinic-hero-mode] [data-clinic-hero-photo] > img {
  width: 100% !important;
  height: 100% !important;
  min-height: 100%;
  object-fit: cover;
  align-self: stretch;
}
${S} [data-clinic-hero-mode] [data-clinic-flow-hero-copy] {
  padding-block: 0;
  width: 100%;
  gap: 26px;
}
/*
  THE PLATE, in the board's sense of the word: a cream caption block over the photograph, anchored
  by a 2px rule in the practice's colour. The served hook is the licensed-imagery disclosure, which
  is already positioned at the foot of the photograph column — so the component the board draws and
  the element the engine emits are the same object, and it only needs its skin.
*/
${S} [data-clinic-stock-disclosure] {
  border-left: var(--at-rule-w) solid var(--at-brand);
  background: var(--at-cream) !important;
  color: var(--at-ink) !important;
  font-family: var(--clinic-control-family);
  font-weight: 400;
  font-size: 11px;
  line-height: 1.5;
  letter-spacing: .16em;
  text-transform: uppercase;
}

/* ---- the doctor spread ---------------------------------------------------- */
/*
  4:5 portrait, no card, no border box — the board's .spread is a figure beside prose with a
  hairline quote rule, and its whole grammar is the absence of a container.
*/
${S} [data-clinic-flow-section^="about."] [data-clinic-flow-item] {
  grid-template-columns: minmax(0,.86fr) minmax(0,1.14fr);
  gap: 96px;
  align-items: center;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0;
}
${S} [data-clinic-flow-section^="about."] [data-clinic-flow-media] {
  aspect-ratio: 4 / 5;
  border-radius: 0;
}
${S} [data-clinic-flow-section^="about."] [data-clinic-flow-item-copy] {
  gap: 22px;
}
/*
  The first paragraph of the spread is the board's pull quote: serif italic at 31px over a 1px rule
  in the practice's colour. It is a real quotation on the board and a lede here, so it takes the
  treatment without taking the quotation marks — the copy is the source's own and is not editorialised.
*/
${S} [data-clinic-flow-section^="about."] [data-clinic-flow-copy]:first-of-type {
  font-family: var(--clinic-heading-family);
  font-style: italic;
  font-weight: 400;
  font-size: 31px;
  line-height: 1.42;
  color: var(--at-ink);
  max-width: none;
  padding-left: 30px;
  border-left: var(--at-border) solid var(--at-brand);
}

/* ---- the contact sheet ---------------------------------------------------- */
/*
  1px gaps over a --rule background, so the grid reads as one printed sheet rather than as twelve
  loose pictures. Tiles are 1:1 — this language's contact-sheet ratio — and photography is never
  rounded, never filtered and never animated.
*/
/*
  THE GRID LINES RIDE ON THE TILES, NOT ON THE CONTAINER, and that is a fix rather than a
  preference. Painting --rule behind a 1px-gap grid draws the sheet's lines for free — until the
  last row is short. MEASURED on the served apa page: eight tiles in five columns left two empty
  cells, and the container's fill painted a 456x227 slab of rule colour where nothing was, which
  reads as a broken image rather than as an empty cell. A ring on each tile draws exactly the same
  1px lines (adjacent rings meet inside the 1px gap) and draws nothing where there is no tile.
*/
${S} [data-clinic-flow-section^="gallery."] [data-clinic-flow-items] {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--at-hair);
  background: transparent;
}
${S} [data-clinic-flow-section^="gallery."] [data-clinic-flow-item] {
  gap: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: var(--at-cream);
  box-shadow: 0 0 0 var(--at-border) var(--at-rule);
}
${S} [data-clinic-flow-section^="gallery."] [data-clinic-flow-media] {
  aspect-ratio: 1;
  border: 0;
  border-radius: 0;
}
/*
  THE CONSTANT CAPTION BAND — Apparatus Studio's ruled "IN STOCK : LIGHTING" strip, at the board's
  own 52px, never overlaid and never loose padding inside the cell.

  DECLARED: it renders on no page in the current corpus. The compile emits an EMPTY
  [data-clinic-flow-item-copy] for every gallery tile on all seven artifacts, so a constant 52px
  band would be 52px of nothing under each of twelve tiles. The alternative — promoting each image's
  alt text into a visible caption — was rejected: alt text is an accessibility description written
  for a screen reader, not a caption, and apa's own reads "Practice information" on three of four
  before/after tiles.
*/
${S} [data-clinic-flow-section^="gallery."] [data-clinic-flow-item-copy] {
  display: flex;
  align-items: center;
  min-height: var(--at-caption-band);
  padding: 0 16px;
  border-top: var(--at-border) solid var(--at-rule);
  font-family: var(--clinic-control-family);
  font-weight: 400;
  font-size: 11px;
  line-height: 1.5;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--at-ink-soft);
}
${S} [data-clinic-flow-section^="gallery."] [data-clinic-flow-item-copy]:empty {
  display: none;
}
/*
  On the ink band the sheet's own grid lines invert with it — the gaps ARE the background, so a
  --rule fill behind an ink tile would draw a cream grid on a dark field. Written as a compound
  selector rather than a descendant one: the dark section IS the gallery section on this corpus, and
  a descendant selector would be asking a section to contain itself.
*/
${S} [data-section-surface-tone="dark"][data-clinic-flow-section^="gallery."] [data-clinic-flow-item] {
  box-shadow: 0 0 0 var(--at-border) var(--at-on-ink-rule);
}
${S} [data-section-surface-tone="dark"] [data-clinic-flow-item] {
  background: var(--at-ink);
}

/* ---- the closing spread --------------------------------------------------- */
/*
  REBUILT, following the board. The previous composition was a centred eyebrow/h2/lede/button stack
  on flat ink — the only centred moment in an otherwise left-aligned system. Aman closes with an
  asymmetric spread: a narrow left rail carrying the head, a short lede and one hairline affordance,
  against a wide right column of RULED ROWS reusing the page's own row vocabulary.

  The engine gives the closing band an inner block and an items grid, which is exactly those two
  columns; the items become the ruled entries, with the same 1px rules and the same hover indent the
  service rows have. So the closing band belongs to the language instead of interrupting it.
*/
${S} [data-clinic-flow-section^="cta."] [data-clinic-flow-inner] {
  display: grid;
  grid-template-columns: minmax(0,.78fr) minmax(0,1fr);
  column-gap: 100px;
  /*
    row-gap 0, because the rail's own margins are the rhythm. The inner block carries the engine's
    --clinic-stack-rhythm as a grid gap, which stacked on top of the item's padding put 100px of
    ink between the lede and the single action.
  */
  row-gap: 0;
  align-items: start;
}
/*
  THE SPREAD NEEDS SOMETHING TO SPREAD AGAINST. The board's right column is four ruled city rows,
  taken from apa's four published locations. The compile's closing band emits ONE item — the action
  — so the asymmetric composition rendered a lone ruled row and one button against 500px of empty
  ink, which is the same "unbalance" that centring was rebuilt to fix, wearing a different layout.
  With a single entry the band falls back to its left rail. Declared: the spread is reachable and
  correct, and the current corpus does not exercise it.
*/
${S} [data-clinic-flow-section^="cta."] [data-clinic-flow-inner]:has([data-clinic-flow-item]:only-child) {
  grid-template-columns: minmax(0,.78fr);
}
${S} [data-clinic-flow-section^="cta."] [data-clinic-flow-inner]:has([data-clinic-flow-item]:only-child) [data-clinic-flow-items] {
  grid-column: 1;
  grid-row: auto;
  border-top: 0;
}
${S} [data-clinic-flow-section^="cta."] [data-clinic-flow-inner]:has([data-clinic-flow-item]:only-child) [data-clinic-flow-item] {
  border-bottom: 0;
  padding: 38px 0 0;
}
${S} [data-clinic-flow-section^="cta."] [data-clinic-flow-heading] {
  grid-column: 1;
  max-width: 13ch;
  margin-bottom: 22px;
}
${S} [data-clinic-flow-section^="cta."] [data-clinic-flow-intro],
${S} [data-clinic-flow-section^="cta."] [data-clinic-flow-item] [data-clinic-flow-copy] {
  font-family: var(--clinic-control-family) !important;
}
${S} [data-clinic-flow-section^="cta."] [data-clinic-flow-intro] {
  margin-top: 22px;
  margin-bottom: 0;
}
${S} [data-clinic-flow-section^="cta."] [data-clinic-flow-intro] {
  grid-column: 1;
  max-width: 34ch;
  color: var(--at-on-ink-lede) !important;
}
${S} [data-clinic-flow-section^="cta."] [data-clinic-flow-items] {
  grid-column: 2;
  grid-row: 1 / span 4;
  grid-template-columns: 1fr;
  gap: 0;
  border-top: var(--at-border) solid var(--at-on-ink-rule);
}
${S} [data-clinic-flow-section^="cta."] [data-clinic-flow-item] {
  grid-template-columns: minmax(0,1fr) auto;
  align-items: baseline;
  column-gap: 24px;
  padding: 23px 6px 23px 0;
  border: 0;
  border-bottom: var(--at-border) solid var(--at-on-ink-rule);
  border-radius: 0;
  background: transparent;
  transition: color .35s var(--at-e), padding-left .35s var(--at-e);
}
${S} [data-clinic-flow-section^="cta."] [data-clinic-flow-item]:hover {
  padding-left: 16px;
}
${S} [data-clinic-flow-section^="cta."] [data-clinic-flow-item-copy] {
  display: contents;
}
${S} [data-clinic-flow-section^="cta."] [data-clinic-flow-item-heading] {
  grid-column: 1;
  font-size: 26px;
  line-height: 1.2;
}
${S} [data-clinic-flow-section^="cta."] [data-clinic-flow-copy] {
  grid-column: 2;
  justify-self: end;
  max-width: 34ch;
  text-align: right;
  font-family: var(--clinic-control-family);
  font-weight: 400;
  font-size: 11px;
  line-height: 1.5;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--at-on-ink-cap) !important;
}
${S} [data-clinic-flow-section^="cta."] [data-clinic-flow-control] {
  grid-column: 1;
  margin-top: 38px;
}
/* On ink the buttons take the board's own on-ink pair: a mist-bordered outline that fills on hover. */
${S} [data-section-type="cta"] .anaks-btn,
${S} [data-section-surface-tone="dark"] .anaks-btn {
  border-color: var(--at-brand) !important;
  background-color: transparent !important;
  color: var(--at-cream) !important;
}
${S} [data-section-type="cta"] .anaks-btn:hover,
${S} [data-section-surface-tone="dark"] .anaks-btn:hover {
  background-color: var(--at-brand) !important;
  color: var(--at-brand-ink) !important;
}

/* ---- contact: hairline rows, like everything else ------------------------- */
${S} [data-clinic-flow-section^="directions."] [data-clinic-flow-items] {
  grid-template-columns: 1fr;
  gap: 0;
  border-top: var(--at-border) solid var(--at-rule);
}
${S} [data-clinic-flow-section^="directions."] [data-clinic-flow-item] {
  grid-template-columns: minmax(0,auto) minmax(0,1fr);
  gap: 12px 24px;
  align-items: baseline;
  padding: 23px 0;
  border: 0;
  border-bottom: var(--at-border) solid var(--at-rule);
  border-radius: 0;
  background: transparent;
}
${S} [data-clinic-flow-section^="directions."] [data-clinic-flow-item-copy] {
  display: contents;
}
${S} [data-clinic-flow-section^="directions."] [data-clinic-flow-item-heading] {
  font-family: var(--clinic-control-family);
  font-weight: 500;
  font-size: 11px;
  line-height: 1.5;
  letter-spacing: .2em;
  text-transform: uppercase;
  color: var(--at-ink-soft);
}
${S} [data-clinic-flow-section^="directions."] [data-clinic-flow-copy] {
  justify-self: end;
  max-width: none;
  text-align: right;
  /* !important, or the pairing sheet's [data-font-role="body"] rule keeps it in Jost. Measured. */
  font-family: var(--clinic-heading-family) !important;
  font-weight: 400;
  font-size: 22px;
  line-height: 1.3;
  letter-spacing: .006em;
  color: var(--at-ink);
}

/*
  THE RULED FOOTER INDEX IS NOT ATTEMPTED, and this is where the reason lives.

  The board's footer is a four-column link index — column heads at 10px/.26em ruled off, links at
  14px/1.5 weight 300 — built from the practice's own navigation. A private preview has no such
  footer: what renders below <main> is PublicContactBar, a shared component that sits OUTSIDE
  .anaks-site with no language hook on it or on any ancestor, so no scoped rule in this file can
  reach it. Giving it one would mean changing a component every locale and every language renders,
  in order to skin one of them.
*/

/* ---- the insurance strip -------------------------------------------------- */
${S} [data-clinic-insurance-logo-grid] {
  grid-template-columns: repeat(auto-fit, minmax(148px, 200px)) !important;
  justify-content: start;
  gap: var(--at-hair) !important;
  background: var(--at-rule);
  border: var(--at-border) solid var(--at-rule);
}
${S} [data-clinic-insurance-logo-box] {
  background: var(--at-cream) !important;
  border: 0 !important;
  border-radius: 0 !important;
  padding: 22px 16px !important;
}

/* ---- header: transparent over the ink field, cream once resolved ---------- */
/*
  THE TRANSPARENT STATE EXISTS ONLY WHEN THE HERO IS THE INK FIELD. data-atelier-over-hero is set
  by the runtime only when the FIRST section of the document is a hero — a treatment sub-page opens
  on a services band, and a transparent header there is cream on cream. The solid state below is
  the DEFAULT, including with no JavaScript at all, and it is the state AA holds in unconditionally.

  The negative margin is what makes the transparent state real rather than merely colourless: the
  header stays in flow and sticky, and pulling the content up by its own height puts the ink field
  behind it. That is the board's position:absolute at rest and position:fixed on scroll, in
  one mechanism instead of two.
*/
${H} {
  background-color: var(--at-cream) !important;
  color: var(--at-ink);
  border-bottom: var(--at-border) solid var(--at-rule) !important;
  backdrop-filter: none;
  font-family: Jost, 'Helvetica Neue', Arial, sans-serif !important;
  transition: background-color .42s var(--at-e), border-color .42s var(--at-e),
    color .42s var(--at-e);
}
${H} > div {
  min-height: var(--at-header-short);
}
${H}[data-atelier-over-hero]:not([data-atelier-scrolled]) {
  background-color: transparent !important;
  border-bottom-color: var(--at-on-ink-rule-2) !important;
}
/*
  The pull is the TALL height, not the short one. The margin decides the initial layout offset once;
  the header's own height then changes on scroll like any fixed header, overlaying whatever is under
  it. Pulling by 74 instead would leave the hero's first 22px behind a 96px header at rest — the top
  of the ink field hidden under the bar that is supposed to be floating over it.
*/
${H}[data-atelier-over-hero] {
  margin-bottom: calc(var(--at-header-tall) * -1);
}
${H}[data-atelier-over-hero]:not([data-atelier-scrolled]) > div {
  min-height: var(--at-header-tall);
}
${H} > div > a:first-child {
  font-family: 'Instrument Serif', Georgia, 'Times New Roman', serif !important;
  font-weight: 400 !important;
  font-size: 22px !important;
  letter-spacing: .02em;
  color: var(--at-ink) !important;
}
${H} nav a,
${H} summary {
  color: var(--at-ink) !important;
  font-weight: 400 !important;
  font-size: 13px;
  letter-spacing: .13em;
  text-transform: uppercase;
  padding-bottom: 8px;
  border-bottom: var(--at-border) solid transparent;
  transition: opacity .3s var(--at-e), border-color .3s var(--at-e), color .42s var(--at-e);
}
${H} nav a[aria-current],
${H} nav a:hover {
  border-bottom-color: var(--at-brand);
}
/*
  The transparent state's ink. Cream on #14120F measures 17.847 and the brand rule on it 11.298, so
  both halves of the header clear AA in BOTH states rather than in the resting one only.

  nav > a AND > summary, DIRECT CHILDREN ONLY, and that is the whole of a defect the AA sweep
  found rather than a stylistic preference. A bare 'nav a' also matches the eight links inside the
  Treatments disclosure PANEL — an absolutely-positioned drop-down with its own light fill written
  inline by TenantHeader — so the inversion painted cream links on a near-white panel at 1.009:1,
  on both viewports, in a state a screenshot of the closed header never shows. The panel is not
  over the hero; it is over itself, and it takes the skin below.
*/
${H}[data-atelier-over-hero]:not([data-atelier-scrolled]) > div > a:first-child,
${H}[data-atelier-over-hero]:not([data-atelier-scrolled]) nav > a,
${H}[data-atelier-over-hero]:not([data-atelier-scrolled]) nav > span > a,
${H}[data-atelier-over-hero]:not([data-atelier-scrolled]) > div > details > summary,
${H}[data-atelier-over-hero]:not([data-atelier-scrolled]) nav > details > summary,
${H}[data-atelier-over-hero]:not([data-atelier-scrolled]) nav > span > details > summary {
  color: var(--at-cream) !important;
}
/*
  The disclosure panel, on both header states. TenantHeader writes its surface, border and radius
  INLINE from the theme, so each needs the same weight to lose — and its links must never inherit
  the over-hero inversion, whichever state the bar behind them is in.
*/
${H} details > div {
  background-color: var(--at-cream) !important;
  border: var(--at-border) solid var(--at-rule) !important;
  border-radius: 0 !important;
  box-shadow: 0 18px 48px rgba(20,18,15,.18) !important;
}
${H} details > div a,
${H} details > details > summary,
${H} details a {
  color: var(--at-ink) !important;
  font-size: 13px;
  letter-spacing: .13em;
  text-transform: uppercase;
}
${H} :focus-visible {
  outline: var(--at-rule-w) solid var(--at-brand-deep) !important;
  outline-offset: 3px;
}
${H}[data-atelier-over-hero]:not([data-atelier-scrolled]) :focus-visible {
  outline-color: var(--at-brand) !important;
}

/* ---- booking bar: cream panel, 1px ink border, square, outer ring --------- */
/*
  The outer ring is not decoration: this bar sits over the ink closing band as often as over cream,
  and a 1px ink border on a #14120F field is invisible. The board specifies the ring for exactly
  that reason.
*/
${S} [data-clinic-sticky-booking],
[data-clinic-design-language="atelier"] [data-clinic-sticky-booking] {
  border: var(--at-border) solid var(--at-ink);
  border-left: var(--at-border) solid var(--at-ink);
  border-radius: 0;
  background: var(--at-cream);
  box-shadow: 0 0 0 1px rgba(250,250,244,.30), 0 18px 48px rgba(20,18,15,.28);
}
${S} [data-clinic-booking-action] {
  height: 56px;
  min-height: 56px;
  border-radius: 0;
  background: var(--at-ink);
  color: var(--at-cream);
  font-family: var(--clinic-control-family);
  font-weight: 500;
  font-size: 11px;
  letter-spacing: .2em;
  text-transform: uppercase;
}
${S} [data-clinic-booking-action="call"] {
  background: var(--at-cream);
  color: var(--at-ink);
  border-left: var(--at-border) solid var(--at-ink);
}
${S} [data-clinic-booking-disclosure] {
  border-top: var(--at-border) solid var(--at-rule);
  background: var(--at-cream);
  color: var(--at-ink-soft);
  font-size: 12px;
  line-height: 1.4;
}

/* ---- focus: authored, because the UA ring is invisible on ink ------------- */
${S} :where(a,button,[tabindex]):focus-visible {
  outline: var(--at-rule-w) solid var(--at-brand-deep);
  outline-offset: 3px;
  border-radius: 0;
}
${S} [data-section-surface-tone="dark"] :where(a,button,[tabindex]):focus-visible,
${S} [data-section-type="hero"] :where(a,button,[tabindex]):focus-visible,
${S} [data-section-type="cta"] :where(a,button,[tabindex]):focus-visible {
  outline-color: var(--at-brand);
}

/* ---- motion: fade and settle, the slowest of the three -------------------- */
/*
  NEVER photography, NEVER scale, NEVER rotation. The reveal is opacity and an 18px rise and nothing
  else, and the rules draw with scaleX from the left rather than fading in.
*/
${S} [data-clinic-motion-signature="atelier-settle"] [data-clinic-variant-reveal][data-m="reveal"].m-hide {
  opacity: 0;
  transform: translateY(18px);
}
${S} [data-clinic-motion-signature="atelier-settle"] [data-clinic-variant-reveal][data-m="reveal"].m-show {
  opacity: 1;
  transform: none;
  transition-property: opacity, transform;
  transition-duration: 900ms, 900ms;
  transition-timing-function: var(--at-e), var(--at-e);
}
${S} [data-clinic-motion-signature="atelier-settle"] [data-clinic-flow-items] {
  transform-origin: left center;
  transition: transform 1100ms var(--at-e);
}

@media (max-width: 767.98px) {
  ${S} [data-clinic-flow-section],
  ${S} [data-clinic-insurance-strip] {
    padding-block: 74px;
  }
  ${S} [data-clinic-flow-section^="features."] [data-clinic-flow-item],
  ${S} [data-clinic-flow-section="features.faq-accordion"] [data-clinic-flow-item] {
    grid-template-columns: 1fr;
    row-gap: 14px;
    padding: 28px 0;
  }
  ${S} [data-clinic-flow-section^="features."] [data-clinic-flow-item-heading],
  ${S} [data-clinic-flow-section^="features."] [data-clinic-flow-copy],
  ${S} [data-clinic-flow-section^="features."] [data-clinic-flow-control],
  ${S} [data-clinic-flow-section^="features."] [data-clinic-flow-media] {
    grid-column: 1;
  }
  ${S} [data-clinic-flow-section^="about."] [data-clinic-flow-item] {
    grid-template-columns: 1fr;
    gap: 38px;
  }
  ${S} [data-clinic-flow-section^="gallery."] [data-clinic-flow-items] {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  ${S} [data-clinic-flow-section^="cta."] [data-clinic-flow-inner] {
    grid-template-columns: 1fr;
    row-gap: 48px;
  }
  ${S} [data-clinic-flow-section^="cta."] [data-clinic-flow-heading],
  ${S} [data-clinic-flow-section^="cta."] [data-clinic-flow-intro],
  ${S} [data-clinic-flow-section^="cta."] [data-clinic-flow-items],
  ${S} [data-clinic-flow-section^="cta."] [data-clinic-flow-control] {
    grid-column: 1;
    grid-row: auto;
  }
  ${S} [data-clinic-hero-mode] [data-clinic-hero-plate] {
    width: 100%;
    padding: 100px 22px 42px;
  }
  ${S} [data-clinic-insurance-logo-grid] {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }
  ${H}[data-atelier-over-hero] {
    margin-bottom: -66px;
  }
  ${H} > div,
  ${H}[data-atelier-over-hero]:not([data-atelier-scrolled]) > div {
    min-height: 66px;
  }
}
@media (prefers-reduced-motion: reduce) {
  ${S} [data-clinic-motion-signature] [data-clinic-variant-reveal],
  ${S} [data-clinic-flow-item],
  ${S} .anaks-btn {
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
    animation: none !important;
  }
  ${H} {
    transition: none !important;
  }
}
`;
