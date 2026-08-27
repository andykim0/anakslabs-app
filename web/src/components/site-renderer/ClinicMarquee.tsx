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
  return (
    <div data-marquee-utility-strip>
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
${S} [data-clinic-flow-section] {
  background: #fff;
  color: var(--mq-ink);
}
/* Alternating surfaces. The language never runs two white bands together. */
${S} [data-clinic-flow-section]:nth-of-type(even) {
  background: var(--mq-lilac-tint);
}
${S} [data-section-type="cta"] {
  background: var(--mq-brand);
  color: var(--mq-brand-ink);
}
${S} [data-section-type="cta"] :is([data-clinic-flow-heading],[data-clinic-flow-intro],[data-clinic-flow-copy]) {
  color: var(--mq-brand-ink);
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
${S} [data-clinic-flow-items] {
  gap: 26px;
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
${S} [data-section-type="hero"] {
  background: var(--mq-lilac);
}
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
  font-family: var(--clinic-control-family);
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
