import type { CSSProperties } from 'react';
import type { ClinicMasterPin, SiteConfig } from '@/lib/types/site';
import { MARQUEE_TOKENS } from '@/lib/us-demo/design-language';
import { clinicMarqueeRenderTokens } from '@/lib/clinic-master/tokens';

/**
 * MARQUEE — Vivid Neighborhood.
 *
 * Every rule below is scoped to `[data-clinic-design-language="marquee"]`, which only a pin
 * carrying the stored field can put on the page. That scoping is not tidiness: `demoPitchLocale:
 * 'ko-owner'` clinic pitches share this stylesheet's delivery path, and the only thing keeping
 * MARQUEE off them is that no KR path stamps the field. The selector makes that structural rather
 * than merely true — see `marquee-invariants.test.ts`.
 */
/**
 * The board's inline stroke under a display keyword, as a percent-encoded SVG used for masking.
 * Hand-drawn rather than a rule: the whole point of the mark is that it does not look ruled.
 */
const MARQUEE_UNDERLINE_MASK =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 14'"
  + " preserveAspectRatio='none'%3E%3Cpath d='M3 9.5C38 3.2 74 11.4 112 6.1 145 1.6 172 8.4 197 4.6'"
  + " fill='none' stroke='%23000' stroke-width='6' stroke-linecap='round'/%3E%3C/svg%3E\")";

export function marqueeIsActive(config: SiteConfig): boolean {
  return config.clinicMaster?.designLanguage === 'marquee';
}

/**
 * The language's CSS variables. The brand pair comes off the stored palette — the practice's own
 * colour and the ink the compile proved can sit on it — and everything else is the language.
 */
export function marqueeRootStyle(pin: ClinicMasterPin): Record<string, string> {
  const radius = clinicMarqueeRenderTokens();
  const brand = pin.resolvedPalette?.slots['--brand'] ?? MARQUEE_TOKENS.defaultBrand;
  const brandInk = pin.resolvedPalette?.slots['--brand-ink'] ?? MARQUEE_TOKENS.ink;
  return {
    '--mq-brand': brand,
    '--mq-brand-ink': brandInk,
    '--mq-ink': MARQUEE_TOKENS.ink,
    '--mq-ink-soft': MARQUEE_TOKENS.inkSoft,
    '--mq-accent': MARQUEE_TOKENS.accent,
    '--mq-accent-deep': MARQUEE_TOKENS.accentDeep,
    '--mq-lilac': MARQUEE_TOKENS.lilac,
    '--mq-lilac-tint': MARQUEE_TOKENS.lilacTint,
    '--mq-cream': MARQUEE_TOKENS.cream,
    '--mq-on-plum-lede': MARQUEE_TOKENS.onPlumLede,
    '--mq-on-plum-link': MARQUEE_TOKENS.onPlumLink,
    '--mq-spring': MARQUEE_TOKENS.spring,
    '--mq-ease': MARQUEE_TOKENS.ease,
    /**
     * The underline mark, as a MASK rather than a coloured asset. Baking a fill into the SVG would
     * freeze one practice's colour into the language; masking lets the stroke be painted with
     * whatever --mq-brand the compile adopted, which is the point of the mark.
     */
    '--mq-underline': MARQUEE_UNDERLINE_MASK,
    '--mq-r-pill': radius.radiusPill,
    '--mq-r-card': radius.radiusCard,
    '--mq-r-panel': radius.radiusPanel,
    '--mq-r-booking': radius.radiusBookingBar,
    '--mq-r-mark': radius.radiusMark,
    '--mq-tile-a': radius.tileA,
    '--mq-tile-b': radius.tileB,
    '--mq-tile-c': radius.tileC,
    '--mq-tile-d': radius.tileD,
    '--mq-border': radius.borderWidth,
    '--mq-rule': radius.ruleWidth,
  };
}

/**
 * The header's sibling: the board's 42px brand-coloured utility strip, which sits ABOVE the sticky
 * bar so the page is colour-confident from its first pixel rather than resolving into colour on
 * scroll. It carries the practice's own published contact line and nothing invented.
 *
 * It is a real document-flow element, like the legal notice — it must not cover the header.
 */
export function MarqueeUtilityStrip({
  config,
}: {
  config: SiteConfig;
}) {
  if (!marqueeIsActive(config)) return null;
  const contact = config.publicContact;
  const phone = contact?.phone?.trim();
  const address = contact?.address?.trim();
  if (!phone && !address) return null;
  /**
   * The variables are carried on the element itself, not inherited.
   *
   * SiteRenderer sets the --mq-* custom properties on the .anaks-site root, and this strip is a
   * sibling of TenantHeader — outside that root entirely. So every var() reference in its rules
   * resolved to nothing and the strip rendered as white with the UA's serif default: the one
   * component whose whole job is to be the brand colour from the first pixel was the one component
   * with no brand colour. Caught in the 1440 utility-strip capture.
   */
  return (
    <div
      data-marquee-utility-strip
      style={marqueeRootStyle(config.clinicMaster!) as CSSProperties}
    >
      <div data-marquee-utility-inner>
        {address ? <span data-marquee-utility-place>{address}</span> : null}
        {phone ? <b data-marquee-utility-phone>{phone}</b> : null}
      </div>
    </div>
  );
}

export function marqueeSiteAttributes(config: SiteConfig): Record<string, string> {
  return marqueeIsActive(config) ? { 'data-clinic-design-language': 'marquee' } : {};
}

export function marqueeStyle(config: SiteConfig): CSSProperties {
  return (marqueeIsActive(config) && config.clinicMaster
    ? marqueeRootStyle(config.clinicMaster)
    : {}) as CSSProperties;
}

const S = '.anaks-site[data-clinic-design-language="marquee"]';

/**
 * The third constant, beside CLINIC_MASTER_CSS and CLINIC_FLOW_CSS. Emitted only when the stored
 * field is present, for the same reason those two are gated on the pin: a config compiled before
 * this existed must render byte-identically, and stylesheet bytes count.
 */
export const CLINIC_MARQUEE_CSS = `
${S} {
  background: #fff;
  color: var(--mq-ink);
}
/*
  EVERY SURFACE COMES FROM THIS LANGUAGE, NOT FROM THE ENGINE'S CADENCE.
  MEASURED on the served page before this rule: the six bands read
    hero rgb(237,233,255) · gallery oklch(0.92 0.015 296.54) · services oklch(0.92 ...) ·
    gallery oklch(0.16 0.04 296.54) · contact #fff · faq #fff · cta rgb(204,51,102)
  — three different colour systems on one page. The engine writes its tone INLINE
  (data-section-surface-tone + background-color), so an author rule for alternation never
  applied and only the two bands carrying !important were ever MARQUEE's.

  So the language adopts the engine's CADENCE (which band is base/tint/dark/brand — a decision
  made once at compile from real content) and supplies its own COLOUR for each step. The rhythm
  stays the engine's; the palette becomes wholly this language's.
*/
${S} [data-clinic-flow-section] {
  background-color: #fff !important;
  color: var(--mq-ink) !important;
  --clinic-section-text: var(--mq-ink);
  --clinic-section-muted: var(--mq-ink-soft);
  --clinic-section-accent: var(--mq-brand);
  --clinic-section-border: var(--mq-ink);
}
${S} [data-section-surface-tone="tint"] {
  background-color: var(--mq-lilac-tint) !important;
}
${S} [data-section-surface-tone="dark"] {
  background-color: var(--mq-ink) !important;
  color: #fff !important;
  --clinic-section-text: #fff;
  --clinic-section-muted: var(--mq-on-plum-lede);
  --clinic-section-accent: var(--mq-brand);
  --clinic-section-border: var(--mq-on-plum-link);
}
${S} [data-section-surface-tone="dark"] :is(h1,h2,h3,p,[data-clinic-flow-heading],[data-clinic-flow-item-heading]) {
  color: #fff !important;
}
${S} [data-section-surface-tone="dark"] [data-clinic-flow-copy],
${S} [data-section-surface-tone="dark"] [data-clinic-flow-intro] {
  color: var(--mq-on-plum-lede) !important;
}
/* A card on the dark band keeps its border but takes a surface that belongs to the band. */
${S} [data-section-surface-tone="dark"] [data-clinic-flow-item] {
  background: rgba(255,255,255,.06);
  border-color: var(--mq-on-plum-link);
}

/*
  ONE BLOCK RHYTHM. The hero was measured at padding 0/0 against every other band's 88/88, which
  is why the page opened with a 1467px band and then changed cadence.
*/
${S} [data-clinic-flow-section],
${S} [data-section-type="hero"] {
  padding-block: var(--clinic-section-block-desktop);
}
/*
  !important on a SECTION background, and the reason is the same inline-wins trap the buttons hit.
  Measured on the served DOM: every flow section carries its surface inline —
  <section data-section-type="cta" data-section-surface-tone="brand"
           style="background-color:oklch(0.9500 0.0400 296.54);...">
  so an author rule for the band never applied and the board's one full-bleed brand moment
  rendered lilac. The section also publishes --clinic-section-* variables that its descendants
  read, so those are re-pointed too rather than fighting each child individually.
*/
${S} [data-section-type="cta"] {
  background-color: var(--mq-brand) !important;
  color: var(--mq-brand-ink) !important;
  --clinic-section-text: var(--mq-brand-ink);
  --clinic-section-muted: var(--mq-brand-ink);
  --clinic-section-accent: var(--mq-ink);
}
/*
  A CTA band has no cards. The band reuses the generic flow-item wrapper, so the card treatment
  landed on it and put a white 22px panel around the single action, floating on the brand surface.
*/
${S} [data-section-type="cta"] [data-clinic-flow-item] {
  border: 0;
  border-radius: 0;
  background: transparent;
  overflow: visible;
}
${S} [data-section-type="cta"] [data-clinic-flow-item]:hover {
  transform: none;
  box-shadow: none;
}
${S} [data-section-type="cta"] [data-clinic-flow-item-copy] {
  padding: 0;
}
${S} [data-section-type="cta"] :is(h1,h2,h3,p,[data-clinic-flow-heading],[data-clinic-flow-intro],[data-clinic-flow-copy],[data-clinic-flow-item-heading]) {
  color: var(--mq-brand-ink) !important;
}

/* ---- type -------------------------------------------------------------- */
/* Display leading is the calibrated number: the consumer-health tier never sets below 1.1, and
   sub-1.0 display leading was the clearest "set by a developer" tell. */
${S} [data-clinic-flow-heading] {
  font-family: var(--clinic-heading-family);
  font-weight: var(--clinic-display-weight);
  font-size: clamp(32px,3.4vw,48px);
  line-height: 1.14;
  letter-spacing: -.018em;
  color: var(--mq-ink);
  max-width: 20ch;
}
${S} [data-section-type="hero"] [data-clinic-flow-heading],
${S} [data-clinic-flow-hero-copy] :is(h1,[data-clinic-flow-heading]) {
  font-size: clamp(44px,5.3vw,74px);
  line-height: 1.08;
  letter-spacing: -.02em;
}
${S} [data-clinic-flow-item-heading] {
  font-family: var(--clinic-heading-family);
  font-weight: var(--clinic-heading-weight);
  font-size: 23px;
  line-height: 1.26;
  letter-spacing: -.014em;
  color: var(--mq-ink);
}
${S} [data-clinic-flow-intro] {
  font-size: 18px;
  line-height: 1.6;
  color: var(--mq-ink-soft);
  max-width: 44ch;
}
${S} [data-clinic-flow-copy] {
  font-size: 15px;
  line-height: 1.6;
  color: var(--mq-ink-soft);
}

/* ---- kicker: a coloured pill, not a coloured word ----------------------- */
${S} [data-clinic-flow-marker] {
  display: inline-flex;
  align-items: center;
  height: 34px;
  padding: 0 16px;
  border-radius: var(--mq-r-pill);
  background: var(--mq-accent);
  color: #fff;
  font-family: var(--clinic-control-family);
  font-weight: 700;
  font-size: 12px;
  line-height: 1;
  letter-spacing: .09em;
  text-transform: uppercase;
}

/*
  The hero eyebrow is a separate hook from [data-clinic-flow-marker] and was inheriting the brand
  colour as 14px text on white — #E56B10 on #FFFFFF is 3.26:1, which is the exact thing the
  language forbids: the extracted colour is a surface, and it never carries small text on light.
  It becomes a pill, like every other kicker in the language.
*/
${S} [data-clinic-hero-kicker] {
  display: inline-flex;
  align-items: center;
  height: 34px;
  padding: 0 16px;
  border-radius: var(--mq-r-pill);
  background-color: var(--mq-accent);
  /*
    THE BOARD'S OWN INVERSION RULE, and it is encoded here rather than left to an author: where a
    violet surface would otherwise carry the extracted orange, the text inverts to white, because
    orange on violet measures 1.612:1. The eyebrow's colour is written inline by the renderer, so
    !important is what actually carries the rule — without it the pill landed and the label stayed
    orange at exactly that ratio, which is the second thing the AA sweep caught.
  */
  color: #fff !important;
  font-family: var(--clinic-control-family);
  font-weight: 700;
  font-size: 12px;
  line-height: 1;
  text-transform: uppercase;
  width: fit-content;
}

/* ---- cards: 2px ink border on every card, constant media slot ---------- */
/*
  EQUAL SLOT STRUCTURE, which is the board's own fix and the one thing that stops ragged card
  bottoms. MEASURED before this rule: us-demo-services ran ten cards from 149px to 439px, a 290px
  spread, because none of them carries media and the body copy lengths differ wildly. The board
  states the rule directly — every card in a row carries the same slot structure so heights settle
  without stretching — and the mechanism is that the copy column grows and the action sits on the
  floor of the card rather than immediately under the last sentence.
*/
${S} [data-clinic-flow-items] {
  gap: 26px;
  align-items: stretch;
}
${S} [data-clinic-flow-item] {
  height: 100%;
  align-content: stretch;
  grid-template-rows: auto 1fr;
}
${S} [data-clinic-flow-item-copy] {
  display: flex;
  flex-direction: column;
  align-content: start;
}
${S} [data-clinic-flow-item] [data-clinic-flow-control] {
  margin-top: auto;
  padding-top: 20px;
}

/*
  NO ORPHAN ROWS.
  MEASURED on the served page: services runs 10 cards in 3 columns (3+3+3+1), contact runs 3 in
  2 columns (2+1), and the CTA band is a 2-column grid holding a single action. Each of those
  leaves a final row that is mostly empty surface, which is what reads as "unbalanced" far more
  than any individual component does. A trailing item that starts its own row is given the rest
  of the row instead of a third of it.

  Written per column count rather than generically because CSS cannot ask how many tracks a grid
  resolved to; the layouts below are the ones the compile actually emits.
*/
${S} [data-clinic-flow-section="features.icon-grid"] [data-clinic-flow-item]:last-child:nth-child(3n+1),
${S} [data-clinic-flow-section="features.featured-first"] [data-clinic-flow-item]:last-child:nth-child(3n+1) {
  grid-column: 1 / -1;
}
${S} [data-clinic-flow-section="directions.info-card-stack"] [data-clinic-flow-item]:last-child:nth-child(2n+1),
${S} [data-section-type="cta"] [data-clinic-flow-item]:last-child:nth-child(2n+1) {
  grid-column: 1 / -1;
}

/*
  The closing band is the one centred composition in the language, which is the board's own
  arrangement: kicker, head at 22ch, lede at 64ch, actions — all on the centre line. Left-aligned
  in a two-column grid it was a column of text against an empty half-band.
*/
${S} [data-section-type="cta"] [data-clinic-flow-inner] {
  text-align: center;
}
${S} [data-section-type="cta"] [data-clinic-flow-heading] {
  max-width: 22ch;
  margin-inline: auto;
}
${S} [data-section-type="cta"] :is([data-clinic-flow-intro],[data-clinic-flow-copy]) {
  max-width: 64ch;
  margin-inline: auto;
}
${S} [data-section-type="cta"] [data-clinic-flow-item],
${S} [data-section-type="cta"] [data-clinic-flow-item-copy] {
  align-items: center;
  justify-items: center;
}
${S} [data-section-type="cta"] [data-clinic-flow-control] {
  margin-inline: auto;
}
${S} [data-clinic-flow-item] {
  border: var(--mq-border) solid var(--mq-ink);
  border-radius: var(--mq-r-card);
  background: #fff;
  overflow: hidden;
  gap: 0;
  transition: transform .2s var(--mq-spring), box-shadow .2s var(--mq-ease);
}
${S} [data-clinic-flow-item]:hover {
  transform: translateY(-6px);
  box-shadow: 0 12px 0 var(--mq-ink);
}
/* Alternating fills, so a row of cards is not six of the same rectangle. */
${S} [data-clinic-flow-item]:nth-child(3n+2) { background: var(--mq-lilac); }
${S} [data-clinic-flow-item]:nth-child(3n+3) { background: var(--mq-cream); }
${S} [data-clinic-flow-item] [data-clinic-flow-media] {
  aspect-ratio: 3 / 2;
  border-radius: 0;
  border-bottom: var(--mq-border) solid var(--mq-ink);
  background: var(--mq-ink);
}
${S} [data-clinic-flow-item] [data-clinic-flow-media] > img {
  transition: transform .5s var(--mq-ease);
}
${S} [data-clinic-flow-item]:hover [data-clinic-flow-media] > img {
  transform: scale(1.04);
}
${S} [data-clinic-flow-item-copy] {
  padding: 24px 26px 26px;
  gap: 10px;
}
/* The row-style layouts keep their structure but take MARQUEE's border weight. */
${S} [data-clinic-flow-section="features.numbered-list"] [data-clinic-flow-items],
${S} [data-clinic-flow-section="features.sticky-heading-two-column"] [data-clinic-flow-items] {
  border-top-width: var(--mq-border);
  border-top-color: var(--mq-ink);
}
${S} [data-clinic-flow-section="features.numbered-list"] [data-clinic-flow-item],
${S} [data-clinic-flow-section="features.sticky-heading-two-column"] [data-clinic-flow-item] {
  border: 0;
  border-bottom: var(--mq-border) solid var(--mq-ink);
  border-radius: 0;
  background: transparent;
}
${S} [data-clinic-flow-section="features.numbered-list"] [data-clinic-flow-item]:hover,
${S} [data-clinic-flow-section="features.sticky-heading-two-column"] [data-clinic-flow-item]:hover {
  transform: none;
  box-shadow: none;
}

/* ---- media / gallery: asymmetric radii so the grid reads hand-placed ---- */
${S} [data-clinic-flow-media] {
  border-radius: var(--mq-tile-a);
  border: var(--mq-border) solid var(--mq-ink);
}
${S} [data-clinic-flow-item]:nth-child(4n+2) [data-clinic-flow-media] { border-radius: var(--mq-tile-b); }
${S} [data-clinic-flow-item]:nth-child(4n+3) [data-clinic-flow-media] { border-radius: var(--mq-tile-c); }
${S} [data-clinic-flow-item]:nth-child(4n+4) [data-clinic-flow-media] { border-radius: var(--mq-tile-d); }
${S} [data-clinic-flow-item] [data-clinic-flow-media] { border-radius: 0; border: 0; }

/* ---- hero: lilac surface, plated art over a solid brand block ---------- */
/* Same inline surface, same remedy: the hero ships background-color:#FFFFFF inline. */
${S} [data-section-type="hero"] {
  background-color: var(--mq-lilac) !important;
}

/*
  The hero copy plate paints --clinic-background over the band. That is right for a language whose
  hero is white; here it cut a white column out of the lilac field. It is a stylesheet rule rather
  than an inline style, so scoping alone wins — no !important needed.
*/
${S} [data-clinic-hero-mode] [data-clinic-hero-plate] {
  background: transparent;
}

/*
  THE HERO PHOTOGRAPH HAD TO FILL ITS OWN COLUMN.
  MEASURED: [data-clinic-hero-photo] stretched to 691x1467 as intended, but the <img> inside it
  rendered 691x383 anchored to the bottom — so the right half of the hero was 1084px of empty
  lilac beside a twenty-line paragraph. That is the single worst balance problem on the page and
  it is a fill bug, not a layout opinion.
*/
${S} [data-clinic-hero-photo] {
  align-content: stretch;
  align-items: stretch;
}
${S} [data-clinic-hero-photo] > img {
  width: 100% !important;
  height: 100% !important;
  min-height: 100%;
  object-fit: cover;
  align-self: stretch;
}

/*
  The hero's call to action is NOT .anaks-btn. The served DOM renders it as
  <span data-clinic-hero-cta="true" aria-disabled="true">, so every button rule in this sheet
  missed it and it kept the engine's square default. It gets the board's button spec directly.
*/
${S} [data-clinic-hero-cta] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 56px;
  padding: 0 30px;
  border-radius: var(--mq-r-pill);
  background-color: var(--mq-brand);
  color: var(--mq-brand-ink) !important;
  box-shadow: 0 5px 0 var(--mq-ink);
  font-family: 'DM Sans', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 700;
  font-size: 15px;
  line-height: 1;
  transition: transform .16s var(--mq-spring), box-shadow .16s var(--mq-ease);
}
${S} [data-clinic-hero-cta]:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 0 var(--mq-ink);
}

/*
  THE UNDERLINE MARK. A stroke in the practice's own colour under the display heading, drawn as a
  mask so the colour stays the extracted brand rather than being baked into the asset. The board
  puts it under one keyword; the compile does not mark a keyword, so inventing one would mean
  touching content. It underlines the head of the heading instead — declared, not silently
  approximated.
*/
${S} [data-clinic-typography-tier="display"]::after {
  content: "";
  display: block;
  width: min(46%, 9em);
  height: .17em;
  margin-top: .12em;
  background-color: var(--mq-brand);
  -webkit-mask-image: var(--mq-underline);
  mask-image: var(--mq-underline);
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}

/*
  GALLERY. The board sizes its rows so every tile lands on the language's 3:2 landscape ratio
  (a 285px column at the 1200px container is a 190px row); aspect-ratio expresses the same rhythm
  without pinning a pixel height that only holds at one container width. Tiles are bare and
  hand-placed — 2px ink borders, one 8px notch per corner pattern — not cards, so the card
  treatment is undone here rather than never applied.
*/
${S} [data-clinic-flow-section^="gallery."] [data-clinic-flow-items] {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
}
${S} [data-clinic-flow-section^="gallery."] [data-clinic-flow-item] {
  border: 0;
  border-radius: 0;
  background: transparent;
  overflow: visible;
  padding: 0;
}
${S} [data-clinic-flow-section^="gallery."] [data-clinic-flow-item]:hover {
  transform: none;
  box-shadow: none;
}
${S} [data-clinic-flow-section^="gallery."] [data-clinic-flow-item-copy] {
  padding: 12px 0 0;
}
${S} [data-clinic-flow-section^="gallery."] [data-clinic-flow-media] {
  aspect-ratio: 3 / 2;
  border: var(--mq-border) solid var(--mq-ink) !important;
  background: var(--mq-ink);
  /* A transparent picture shows the tile's own ink, not the inline surfaceSubtle white. */
  --clinic-gallery-tile-backdrop: var(--mq-ink);
  border-radius: var(--mq-tile-a) !important;
}
${S} [data-clinic-flow-section^="gallery."] [data-clinic-flow-item]:nth-child(4n+2) [data-clinic-flow-media] { border-radius: var(--mq-tile-b) !important; }
${S} [data-clinic-flow-section^="gallery."] [data-clinic-flow-item]:nth-child(4n+3) [data-clinic-flow-media] { border-radius: var(--mq-tile-c) !important; }
${S} [data-clinic-flow-section^="gallery."] [data-clinic-flow-item]:nth-child(4n+4) [data-clinic-flow-media] { border-radius: var(--mq-tile-d) !important; }
${S} [data-clinic-flow-hero-media] {
  position: relative;
  border-radius: var(--mq-r-panel);
  overflow: visible;
}
${S} [data-clinic-flow-hero-media]::before {
  content: "";
  position: absolute;
  inset: 26px -26px -26px 26px;
  border-radius: var(--mq-r-panel);
  background: var(--mq-brand);
  z-index: 0;
}
${S} [data-clinic-flow-hero-media] > :is(img,picture,div) {
  position: relative;
  z-index: 1;
  border-radius: var(--mq-r-panel);
  border: 4px solid var(--mq-ink);
  overflow: hidden;
}

/* ---- buttons: full pill, flat offset shadow, 3px lift ------------------ */
/*
  !important, and the reason is measured rather than defensive. The renderer writes each button's
  colour and background INLINE, keyed on data-variant — background-color:transparent with
  color:#7D55C7 for ghost. Inline beats an author rule, so MARQUEE's fill landed while the label
  kept the old colour and every "View treatment" rendered violet-on-violet at a contrast ratio of
  1.00: six invisible buttons per page, on both viewports. Caught by the AA sweep and confirmed in
  the 1440 services screenshot. The language owns its controls, so it says so.
*/
/*
  .anaks-btn ONLY. [data-clinic-flow-control] is the WRAPPER around the button, not the button:
  styling both painted a violet pill around a white rectangle, visible in the 1440 services shot.
  border-radius is !important for the same reason the colours are — the renderer writes
  border-radius:0 inline, so without it every "pill" rendered square.
*/
${S} .anaks-btn {
  height: 56px;
  padding: 0 30px;
  border-radius: var(--mq-r-pill) !important;
  border: var(--mq-border) solid transparent;
  font-family: var(--clinic-control-family);
  font-weight: 700;
  font-size: 15px;
  line-height: 1;
  letter-spacing: -.005em;
  background-color: var(--mq-accent) !important;
  color: #fff !important;
  box-shadow: 0 5px 0 var(--mq-accent-deep);
  transition: transform .16s var(--mq-spring), box-shadow .16s var(--mq-ease);
}
/* The board's third variant: white fill, ink label, ink border — 16.29:1. */
${S} .anaks-btn[data-variant="ghost"],
${S} .anaks-btn[data-variant="outline"] {
  background-color: #fff !important;
  color: var(--mq-ink) !important;
  border: var(--mq-border) solid var(--mq-ink) !important;
  box-shadow: 0 5px 0 var(--mq-ink);
}
${S} .anaks-btn[data-variant="ghost"]:hover,
${S} .anaks-btn[data-variant="outline"]:hover {
  box-shadow: 0 8px 0 var(--mq-ink);
}
${S} .anaks-btn:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 0 var(--mq-accent-deep);
}
/* ---- utility strip: the brand colour as a SURFACE, from the first pixel - */
[data-marquee-utility-strip] {
  background: var(--mq-brand);
  color: var(--mq-brand-ink);
  /*
    The literal stack, not var(--clinic-control-family): that variable is also set on the
    .anaks-site root this element sits outside of, so it resolved to nothing and the strip rendered
    in the UA serif. The language's text face is fixed anyway — naming it here is honest.
  */
  font-family: 'DM Sans', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 500;
  font-size: 13.5px;
  line-height: 1;
}
[data-marquee-utility-inner] {
  width: min(calc(100% - 3rem), var(--clinic-container-max,1200px));
  margin-inline: auto;
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding-block: 12px;
  flex-wrap: wrap;
}
[data-marquee-utility-phone] { font-weight: 700; }

/* ---- header: never transparent, colour-confident from the first pixel --- */
/*
  The board's header is a plum bar under the brand strip, and it is only reachable because the
  round-3 punchlist made the US demo header render the practice's NAME as text rather than its
  logo file. A logo image would have fought this: the marks are a prospect's own PNGs whose ink we
  deliberately never fetch, so three of the five that exist are white-on-transparent, undecodable,
  or barely legible — and none of them could be recoloured for a dark bar. Text can.

  Selectors are on the header element itself, which carries the language attribute and its own
  copy of the variables, because this component renders outside .anaks-site.
*/
.anaks-tenant-header[data-clinic-design-language="marquee"] {
  background-color: var(--mq-ink) !important;
  color: #fff;
  border-bottom: var(--mq-rule) solid var(--mq-brand) !important;
  font-family: 'DM Sans', 'Helvetica Neue', Arial, sans-serif !important;
}
.anaks-tenant-header[data-clinic-design-language="marquee"] a,
.anaks-tenant-header[data-clinic-design-language="marquee"] summary {
  color: #fff !important;
}
/* The wordmark takes the display face; everything else stays DM Sans. */
.anaks-tenant-header[data-clinic-design-language="marquee"] > div > a:first-child {
  font-family: 'Bricolage Grotesque', 'Helvetica Neue', Arial, sans-serif !important;
  font-weight: 800 !important;
  letter-spacing: -.03em;
}
.anaks-tenant-header[data-clinic-design-language="marquee"] nav a {
  border-bottom: 3px solid transparent;
  padding-bottom: 6px;
  transition: border-color .2s var(--mq-ease);
}
.anaks-tenant-header[data-clinic-design-language="marquee"] nav a:hover,
.anaks-tenant-header[data-clinic-design-language="marquee"] nav a[aria-current] {
  border-bottom-color: var(--mq-brand);
}
.anaks-tenant-header[data-clinic-design-language="marquee"] :focus-visible {
  outline: 3px solid var(--mq-brand) !important;
  outline-offset: 3px;
}

/* ---- booking bar: MARQUEE skin of the common component ----------------- */
${S} [data-clinic-sticky-booking],
[data-clinic-design-language="marquee"] [data-clinic-sticky-booking] {
  border: var(--mq-border) solid var(--mq-ink);
  border-radius: var(--mq-r-booking);
  background: #fff;
  box-shadow: 0 8px 0 var(--mq-ink), 0 22px 44px rgba(35,25,66,.24);
  overflow: hidden;
}
${S} [data-clinic-booking-action] {
  border-radius: 0;
  box-shadow: none;
  height: 56px;
  background: var(--mq-accent);
  color: #fff;
}
/*
  The Call action takes the practice's own colour and the ink the compile proved sits on it.
  It must NOT read --clinic-accent-contrast blindly: the default computes that from brandInkFor,
  which for the board's #E56B10 answers #111318 — legible, but off-language and not the plum the
  language writes in. The stored --brand-ink is the language's answer.
*/
${S} [data-clinic-booking-action="call"] {
  background: var(--mq-brand);
  color: var(--mq-brand-ink);
  border-left: var(--mq-border) solid var(--mq-ink);
}
${S} [data-clinic-booking-disclosure] {
  border-top: var(--mq-border) solid var(--mq-ink);
  color: var(--mq-ink-soft);
  font-size: 13px;
  line-height: 1.4;
}

/* ---- focus: authored, because the UA ring is invisible on plum and brand */
${S} :where(a,button,[tabindex]):focus-visible {
  outline: 3px solid var(--mq-accent-deep);
  outline-offset: 3px;
  border-radius: 4px;
}
[data-marquee-utility-strip] :focus-visible {
  outline: 3px solid var(--mq-ink);
  outline-offset: 3px;
}

/* ---- motion: the spring, with the engine's stagger bound --------------- */
${S} [data-clinic-motion-signature="marquee-spring"] [data-clinic-variant-reveal][data-m="reveal"].m-hide {
  opacity: 0;
  transform: translateY(26px) scale(.972);
}
${S} [data-clinic-motion-signature="marquee-spring"] [data-clinic-variant-reveal][data-m="reveal"].m-show {
  opacity: 1;
  transform: none;
  transition-property: opacity, transform;
  transition-duration: 420ms, 520ms;
  transition-timing-function: var(--mq-ease), var(--mq-spring);
}
@media (max-width: 767.98px) {
  ${S} [data-clinic-motion-signature="marquee-spring"] [data-clinic-variant-reveal][data-m="reveal"].m-hide {
    transform: translateY(16px) scale(.98);
  }
  ${S} [data-clinic-flow-items] { grid-template-columns: 1fr; }
  ${S} [data-clinic-flow-section^="gallery."] [data-clinic-flow-items] {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  ${S} [data-clinic-flow-heading] { max-width: none; }
  [data-marquee-utility-inner] { justify-content: flex-start; }
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
}
`;
