import type { CSSProperties } from 'react';
import type { ClinicMasterPin, SiteConfig } from '@/lib/types/site';
import { LEDGER_TOKENS } from '@/lib/us-demo/design-language';
import { clinicLedgerRenderTokens } from '@/lib/clinic-master/tokens';

/**
 * LEDGER — Calm Clinical.
 *
 * Every rule below is scoped to `[data-clinic-design-language="ledger"]`, which only a pin carrying
 * the stored field can put on the page. That scoping is not tidiness: `demoPitchLocale: 'ko-owner'`
 * clinic pitches share this stylesheet's delivery path, and the only thing keeping this language
 * off them is that no KR path stamps the field. The selector makes that structural rather than
 * merely true — see `ledger-invariants.test.ts`.
 */

export function ledgerIsActive(config: SiteConfig): boolean {
  return config.clinicMaster?.designLanguage === 'ledger';
}

/**
 * The language's CSS variables.
 *
 * TWO come from the practice and they are the same colour at two lightnesses: `--lg-brand` is the
 * extracted colour at full saturation — the mark, the keylines, the nav underline — and
 * `--lg-brand-deep` is its dark tone-mate, which every text use resolves to. The compile derived
 * and stored both (`--brand` and `--accent`); nothing here re-derives them, because a second
 * derivation is a second answer and only one of them reaches the page.
 */
export function ledgerRootStyle(pin: ClinicMasterPin): Record<string, string> {
  const geometry = clinicLedgerRenderTokens();
  const brand = pin.resolvedPalette?.slots['--brand'] ?? LEDGER_TOKENS.defaultBrand;
  const brandDeep = pin.resolvedPalette?.slots['--accent'] ?? LEDGER_TOKENS.ink;
  const brandInk = pin.resolvedPalette?.slots['--brand-ink'] ?? LEDGER_TOKENS.inkLight;
  return {
    '--lg-brand': brand,
    '--lg-brand-deep': brandDeep,
    '--lg-brand-ink': brandInk,
    '--lg-ink': LEDGER_TOKENS.ink,
    '--lg-text': LEDGER_TOKENS.text,
    '--lg-meta': LEDGER_TOKENS.meta,
    '--lg-surface': LEDGER_TOKENS.surface,
    '--lg-panel': LEDGER_TOKENS.panel,
    '--lg-rule': LEDGER_TOKENS.rule,
    '--lg-rule-2': LEDGER_TOKENS.ruleStrong,
    '--lg-wash': LEDGER_TOKENS.wash,
    '--lg-e': LEDGER_TOKENS.ease,
    /**
     * The data face, named as a literal rather than routed through `--clinic-body-family`. IBM Plex
     * Mono is not any of the pairing's three ROLE families — it is bound to figures by rule — so
     * there is no variable that already holds it.
     */
    '--lg-mono': "'IBM Plex Mono', ui-monospace, Menlo, monospace",
    '--lg-r-control': geometry.radiusControl,
    '--lg-border': geometry.borderWidth,
    '--lg-rule-w': geometry.ruleWidth,
    '--lg-hair': geometry.hairGap,
    '--lg-row-thumb': geometry.rowThumbWidth,
    '--lg-micro-h': geometry.microBarHeight,
  };
}

/**
 * The header's sibling: the board's 38px `--panel` micro-bar, carrying the practice's own published
 * contact line in mono above the white sticky bar.
 *
 * WHAT THE BOARD PUTS HERE AND WE DO NOT: hours. The board's micro-bar reads
 * `address · Mon–Thu 8:00–17:00 · Referring doctors welcome`, taken from periohealth.com's
 * `LocalBusiness` JSON-LD. `SiteConfig.publicContact` carries `phone` and `address` and nothing
 * else, so the strip carries those two. Inventing an opening-hours line for a practice whose hours
 * the compile never collected is exactly the manufacture this language forbids elsewhere.
 *
 * It is a real document-flow element, like the legal notice — it must not cover the header. That
 * is also why it can COLLAPSE rather than needing to be sticky: the board's own micro-bar is
 * `position: static` under a `position: sticky` header, and collapsing it to zero height at
 * `scrollY > 24` is what snaps the header to the top instead of making the reader scroll the last
 * 14px of a bar they have finished with.
 */
export function LedgerMicroBar({ config }: { config: SiteConfig }) {
  if (!ledgerIsActive(config)) return null;
  const contact = config.publicContact;
  const phone = contact?.phone?.trim();
  const address = contact?.address?.trim();
  if (!phone && !address) return null;
  return (
    <div
      data-ledger-micro-bar
      /**
       * The variables ride on the element, not on an ancestor. `SiteRenderer` sets the `--lg-*`
       * properties on the `.anaks-site` root and this strip is a sibling of `TenantHeader`, outside
       * that root entirely — the same trap MARQUEE's utility strip hit, where every `var()` resolved
       * to nothing and the one component whose job is to be the brand colour rendered in the UA
       * serif on white.
       */
      style={ledgerRootStyle(config.clinicMaster!) as CSSProperties}
    >
      <div data-ledger-micro-inner>
        {address ? <span data-ledger-micro-place>{address}</span> : null}
        {phone ? <span data-ledger-micro-tel>{phone}</span> : null}
      </div>
    </div>
  );
}

/**
 * THE COLLAPSE, and the only new client behaviour this language adds.
 *
 * MEASURED FIRST, because the instruction was to measure before writing: the clinic renderer has NO
 * scroll-state architecture. `TenantHeader` is `position: sticky` with an inline `top` and no
 * listener; `ClinicStickyBooking` is `position: fixed` and pure CSS; the only JavaScript on a clinic
 * page is the nav-disclosure shim in `TenantHeader` and the motion runtime's `IntersectionObserver`
 * in `lib/motion/runtime.ts`. So there was nothing to reuse, and the question was which of those two
 * shapes to copy.
 *
 * It copies the observer, not a scroll listener. A sentinel sits at the very top of the document and
 * is exactly as tall as the board's threshold — 24px — so it stops intersecting the viewport at the
 * moment `scrollY` passes 24, and the two elements that care are marked. That gives the board's
 * `scrollY > 24` without running anything on the scroll thread, and it is the pattern already in
 * the tree.
 *
 * THE HEIGHT IS THE THRESHOLD, and the first version got that wrong in a way worth recording: it
 * used a 1px sentinel with `rootMargin: '-24px 0px 0px 0px'`, which shrinks the observation box's
 * TOP edge down by 24px — so a 1px element at document y=0 never intersected, even unscrolled. The
 * measured result was a micro-bar collapsed at rest on both viewports: the state was permanently on
 * rather than never on, which is exactly the sort of always-true condition a screenshot of the top
 * of the page does not show you unless you are looking for it.
 *
 * The observer is deliberately NOT unobserved after firing, unlike the motion runtime's: a reveal
 * is a one-way transition and a header state is not. Scrolling back up must give the micro-bar back.
 *
 * FAIL-SAFE: with no JavaScript the attribute is never set, the micro-bar stays open and the header
 * keeps its resting rule. Nothing is hidden behind the script, and no state it controls is one where
 * AA depends on the script having run.
 */
export const CLINIC_LEDGER_HEADER_RUNTIME = `(function(){
var b=document.querySelector('[data-ledger-micro-bar]');
var h=document.querySelector('.anaks-tenant-header[data-clinic-design-language="ledger"]');
if(!b&&!h)return;
var s=document.createElement('div');
s.setAttribute('data-ledger-scroll-sentinel','');
s.style.cssText='position:absolute;top:0;left:0;width:1px;height:24px;pointer-events:none';
document.body.insertBefore(s,document.body.firstChild);
if(!('IntersectionObserver' in window))return;
new IntersectionObserver(function(es){
var past=!es[0].isIntersecting;
[b,h].forEach(function(el){if(!el)return;
if(past){el.setAttribute('data-ledger-scrolled','');}else{el.removeAttribute('data-ledger-scrolled');}});
},{threshold:0}).observe(s);
})();`;

export function LedgerHeaderRuntime({ config }: { config: SiteConfig }) {
  if (!ledgerIsActive(config)) return null;
  return <script dangerouslySetInnerHTML={{ __html: CLINIC_LEDGER_HEADER_RUNTIME }} />;
}

const S = '.anaks-site[data-clinic-design-language="ledger"]';

/**
 * The fourth stylesheet constant, beside CLINIC_MASTER_CSS, CLINIC_FLOW_CSS and
 * CLINIC_MARQUEE_CSS. Emitted only when the stored field is present, for the same reason those are
 * gated on the pin: a config compiled before this existed must render byte-identically, and
 * stylesheet bytes count.
 */
export const CLINIC_LEDGER_CSS = `
${S} {
  background: var(--lg-surface);
  color: var(--lg-text);
  font-size: 16.5px;
  line-height: 1.7;
}

/*
  ONE PALETTE OVER THE ENGINE'S CADENCE — the defect class MARQUEE ended on, avoided here by
  construction rather than found by screenshot.

  The engine decides ONCE at compile, from real content, which band is base / tint / dark / brand,
  and it writes that decision INLINE on the section element (data-section-surface-tone plus a
  background-color). An author rule for alternation therefore never applies, and a language that
  only paints the bands it remembered ends up running the engine's oklch ramp on some bands and its
  own colours on others. So this language adopts the CADENCE and supplies its own COLOUR for each of
  the four steps — and re-points the --clinic-section-* variables descendants read, rather than
  fighting each child individually.

  MEASURED on the served larkfield-derm page: base x4, tint x2, dark x1, brand x1. Four steps, four
  colours, one palette: white / panel / ink / panel-under-a-steel-keyline.
*/
${S} [data-clinic-flow-section],
${S} [data-clinic-insurance-strip] {
  background-color: var(--lg-surface) !important;
  color: var(--lg-text) !important;
  --clinic-section-text: var(--lg-ink);
  --clinic-section-muted: var(--lg-text);
  --clinic-section-accent: var(--lg-brand-deep);
  --clinic-section-border: var(--lg-rule);
  --clinic-section-surface: var(--lg-surface);
}
${S} [data-section-surface-tone="tint"] {
  background-color: var(--lg-panel) !important;
  --clinic-section-surface: var(--lg-panel);
}
/*
  The dark step. LEDGER's board has no dark band — but the cadence has a dark STEP, and a language
  that leaves one unanswered gets the engine's oklch(0.16 ...) on whichever band the compile chose.
  The colour is the language's own: the ink it writes headings in, which is also the fill behind the
  board's hero photograph (#0B0D10) and its caption band. Body copy lifts to the light partner
  because #333B44 on #12171C is 1.59:1.
*/
${S} [data-section-surface-tone="dark"] {
  background-color: var(--lg-ink) !important;
  color: #FFFFFF !important;
  --clinic-section-text: #FFFFFF;
  --clinic-section-muted: #C6CDD5;
  --clinic-section-accent: var(--lg-brand);
  --clinic-section-border: #3A434D;
  --clinic-section-surface: var(--lg-ink);
}
${S} [data-section-surface-tone="dark"] :is(h1,h2,h3,[data-clinic-flow-heading],[data-clinic-flow-item-heading]) {
  color: #FFFFFF !important;
}
${S} [data-section-surface-tone="dark"] :is([data-clinic-flow-copy],[data-clinic-flow-intro]) {
  color: #C6CDD5 !important;
}
/*
  The brand step IS the closing band, and it is the board's own: --panel, opened by a 2px keyline in
  the practice's colour. This is one of exactly four places the extracted colour is allowed to be
  seen at full strength, and it is the largest of them.
*/
${S} [data-section-surface-tone="brand"],
${S} [data-section-type="cta"] {
  background-color: var(--lg-panel) !important;
  color: var(--lg-text) !important;
  border-top: var(--lg-rule-w) solid var(--lg-brand);
  --clinic-section-text: var(--lg-ink);
  --clinic-section-muted: var(--lg-text);
  --clinic-section-accent: var(--lg-brand-deep);
  --clinic-section-border: var(--lg-rule);
  --clinic-section-surface: var(--lg-panel);
}

/*
  ONE BLOCK RHYTHM at the board's own number. CLINIC_FLOW_CSS already hardcodes 88px for
  features./gallery./directions./cta. — which is exactly .sec{padding:88px 0} — but leaves about.
  sections on --clinic-section-block-desktop, which the airy density sets to 136px. That is a 48px
  step in the middle of the page for no reason a reader can see.
*/
${S} [data-clinic-flow-section],
${S} [data-clinic-insurance-strip] {
  padding-block: 88px;
}
${S} [data-section-type="hero"] {
  padding-block: 0;
}

/* ---- type: one humanist family, and every QUANTITY in mono ---------------- */
/*
  Display leading is the calibrated number. Arc Institute sets h1 AND h2 at 40px/1.2, Wellcome at
  43.7/1.3, eLife at 60/1.2 — this tier sets display type the SMALLEST of the three strata, and the
  board's pre-calibration 56px/1.1/-0.021em was the largest and tightest setting on any of them.
*/
/*
  TRACKING IS !important, and the reason is the same inline-wins trap the surfaces hit. The flow
  renderer writes every heading's letter-spacing INLINE, from resolveTypographyTracking — a
  size-driven engine rule that knows nothing about which language is drawing. MEASURED on the served
  page before this: the hero h1 computed -1.15px at 46px (-0.025em) against the board's -0.014em,
  and the section head -0.36px at 36px against -0.013em. The display setting was tighter than the
  board's by nearly double, which is precisely the "largest and tightest of the three boards" tell
  the reference calibration exists to remove — so it is the one number that cannot be left to the
  engine here.
*/
${S} [data-clinic-flow-heading] {
  font-family: var(--clinic-heading-family);
  font-weight: 600;
  font-size: clamp(27px,2.8vw,36px);
  line-height: 1.2;
  letter-spacing: -.013em !important;
  color: var(--lg-ink);
  max-width: none;
  margin-bottom: 26px;
  padding-bottom: 26px;
  border-bottom: var(--lg-border) solid var(--lg-ink);
}
${S} [data-clinic-flow-intro] {
  font-size: 16.5px;
  line-height: 1.55;
  color: var(--lg-text);
  max-width: 70ch;
}
${S} [data-clinic-flow-item-heading] {
  font-family: var(--clinic-heading-family);
  font-weight: 600;
  font-size: 20px;
  line-height: 1.34;
  letter-spacing: -.009em !important;
  color: var(--lg-ink);
}
${S} [data-clinic-flow-copy] {
  font-size: 15.5px;
  line-height: 1.6;
  color: var(--lg-text);
  max-width: 56ch;
}

/*
  THE MONO TAG CHIP, bound to the ONE hook the renderer emits for sourced item metadata.

  MEASURED across all seven corpora: zero sections emit [data-clinic-flow-marker]. The board applies
  its chip to a publications table's Type column, where the values are the practice's own listing —
  and the discipline the board states is that the component exists only where real data does. So the
  chip is defined here, attached to the sourced hook, and renders on no page in the current corpus.
  That is the correct outcome: manufacturing a category to have somewhere to put a chip is the
  failure this rule exists to prevent.
*/
/*
  !important on every font-family below, and it is measured rather than defensive. The font-pairing
  stylesheet emits
    .anaks-site[data-font-pairing=...] [data-font-role="body"] { font-family: <body> !important }
  and every one of these elements carries data-font-role. Without the same weight the contact band's
  values rendered in Public Sans at 14px — right size, right colour, right column, wrong family —
  and "all quantities are mono" quietly became "some quantities are mono". Measured on the served
  page at 1440 before this: [data-clinic-flow-copy] inside directions. computed Public Sans.
*/
${S} [data-clinic-flow-marker] {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 8px;
  border: var(--lg-border) solid var(--lg-rule-2);
  border-radius: 0;
  background: transparent;
  color: var(--lg-meta) !important;
  font-family: var(--lg-mono) !important;
  font-weight: 500;
  font-size: 10.5px;
  line-height: 1;
  letter-spacing: .11em;
  text-transform: uppercase;
  white-space: nowrap;
  width: fit-content;
}

/* ---- service rows: a ruled grid, not cards ------------------------------- */
/*
  THE ROW, and the reason it is achievable without touching the shared renderer: the served item is
  [item] > [item-copy](h3, p..., control) + [media], in that DOM order. Three outer tracks plus a
  generated index column give the board's four-column rhythm [index | title | body | thumbnail]
  under pure auto-placement — the ::before takes column 1, the copy block column 2, the media
  column 3 — with no explicit grid placement to go stale when a section carries two paragraphs
  instead of one.
*/
${S} [data-clinic-flow-section^="features."] [data-clinic-flow-items] {
  grid-template-columns: 1fr;
  gap: 0;
  counter-reset: lg-row;
  border-top: var(--lg-border) solid var(--lg-rule);
}
${S} [data-clinic-flow-section^="features."] [data-clinic-flow-item] {
  grid-template-columns: 88px minmax(0,1fr) var(--lg-row-thumb);
  column-gap: 32px;
  row-gap: 0;
  align-items: start;
  padding: 24px 16px 24px 0;
  border: 0;
  border-bottom: var(--lg-border) solid var(--lg-rule);
  border-radius: 0;
  background: transparent;
  transition: background .2s var(--lg-e), padding-left .2s var(--lg-e);
}
${S} [data-clinic-flow-section^="features."] [data-clinic-flow-item]:hover {
  background: var(--lg-wash);
  padding-left: 16px;
}
/*
  The index is GENERATED, and that is not the same thing as manufactured metadata. A row's ordinal
  is a fact about the row's position, not a claim about the practice — unlike a category chip, which
  would assert something the source never said.
*/
${S} [data-clinic-flow-section^="features."] [data-clinic-flow-item]::before {
  content: counter(lg-row, decimal-leading-zero);
  counter-increment: lg-row;
  padding-top: 5px;
  font-family: var(--lg-mono);
  font-weight: 500;
  font-size: 11.5px;
  line-height: 1;
  letter-spacing: .14em;
  color: var(--lg-meta);
}
${S} [data-clinic-flow-section^="features."] [data-clinic-flow-item-copy] {
  display: grid;
  grid-template-columns: minmax(0,1fr) minmax(0,1.4fr);
  column-gap: 32px;
  row-gap: 12px;
  align-content: start;
  padding: 0;
}
${S} [data-clinic-flow-section^="features."] [data-clinic-flow-item-heading] {
  grid-column: 1;
  grid-row: 1;
}
${S} [data-clinic-flow-section^="features."] [data-clinic-flow-copy],
${S} [data-clinic-flow-section^="features."] [data-clinic-flow-control] {
  grid-column: 2;
}
/*
  THE THUMBNAIL, at the board's rebuilt size and the language's landscape ratio. It was 108x76 —
  AR 1.42, a ratio used nowhere else on the board and too small to read as anything. Arc runs its
  row thumbnails at ~185px and eLife at 368px.
*/
${S} [data-clinic-flow-section^="features."] [data-clinic-flow-media] {
  width: var(--lg-row-thumb);
  justify-self: end;
  aspect-ratio: 16 / 9;
  border: var(--lg-border) solid var(--lg-rule-2);
  border-radius: 0;
}

/*
  The FAQ is a features. section too, and it is a list of questions rather than a list of services:
  no media, no index rail, and a body that wants the full measure. It keeps the rule and loses the
  grid.
*/
${S} [data-clinic-flow-section="features.faq-accordion"] [data-clinic-flow-item] {
  grid-template-columns: 88px minmax(0,1fr);
  padding: 24px 16px 24px 0;
}
${S} [data-clinic-flow-section="features.faq-accordion"] [data-clinic-flow-item-copy] {
  grid-template-columns: minmax(0,1fr) minmax(0,1.4fr);
}

/*
  The stat table. features.stat-strip is the archetype that carries published figures, and this is
  the board's rule for them: mono numerals at 30px under a 1px INK rule, uppercase 12px labels.
  Unexercised on the LEDGER conformance corpus — larkfield-derm's compile emits no stat-strip — so
  it is declared here rather than shown.
*/
${S} [data-clinic-flow-section="features.stat-strip"] [data-clinic-flow-items] {
  border-top: var(--lg-border) solid var(--lg-ink);
}
${S} [data-clinic-flow-section="features.stat-strip"] [data-clinic-flow-item] {
  grid-template-columns: 1fr;
  padding: 16px 18px 16px 0;
  border-block: 0;
  border-bottom: var(--lg-border) solid var(--lg-rule);
}
${S} [data-clinic-flow-section="features.stat-strip"] [data-clinic-flow-item]::before {
  content: none;
}
${S} [data-clinic-flow-section="features.stat-strip"] [data-clinic-flow-marker] {
  height: auto;
  padding: 0;
  border: 0;
  font-family: var(--lg-mono) !important;
  font-weight: 400;
  font-size: 30px;
  line-height: 1.05;
  letter-spacing: -.02em;
  text-transform: none;
  color: var(--lg-ink) !important;
}

/* ---- the doctor panel: the one place this language has a card ------------ */
/*
  The board's team block is three ID panels, each a 4:5 portrait over the practice's own black, then
  a name, a mono credential line and a ruled definition list. The compile gives one about. item with
  a photograph and prose, so what is reachable is the PANEL — 1px rule, square corners, portrait at
  the language's 4:5 — and what is not is the credential list, because there are no credential pairs
  in the source blocks to rule. That absence is declared rather than filled.
*/
/*
  The panel is BOUNDED. The engine's about. items grid is a single full-width column, so one doctor
  panel stretched to 1140px and put a 4:5 portrait beside four lines of prose with 650px of empty
  card after it. A ruled ID panel is a card-sized object; 44rem is three of them side by side at the
  board's own width.
*/
${S} [data-clinic-flow-section^="about."] [data-clinic-flow-items] {
  grid-template-columns: minmax(0, 44rem);
}
${S} [data-clinic-flow-section^="about."] [data-clinic-flow-item] {
  grid-template-columns: minmax(0,.42fr) minmax(0,1fr);
  gap: 0;
  align-items: stretch;
  border: var(--lg-border) solid var(--lg-rule);
  border-radius: 0;
  background: var(--lg-surface);
  padding: 0;
  /* The 4:5 media resolves its own height from its width, which overshot the row by a pixel or two
     and drew a dark seam under the panel's bottom rule. */
  overflow: hidden;
}
${S} [data-clinic-flow-section^="about."] [data-clinic-flow-item]::before {
  content: none;
}
${S} [data-clinic-flow-section^="about."] [data-clinic-flow-media] {
  aspect-ratio: 4 / 5;
  order: -1;
  border-radius: 0;
  border-right: var(--lg-border) solid var(--lg-rule);
  background: #0B0D10;
}
${S} [data-clinic-flow-section^="about."] [data-clinic-flow-item-copy] {
  padding: 26px 28px;
  align-content: start;
  gap: 10px;
}

/* ---- contact: the ruled label/value band --------------------------------- */
/*
  REBUILT, following the board. The engine draws directions. items as bordered cards in a 2-up grid
  — a boxed island floating on the band's own grid. Arc and eLife close their pages with the same
  ruled-row logic they use everywhere else, so the contact block is ruled INTO the band: a 1px ink
  top rule, then label/value rows with the value in mono, right-aligned, one hairline between each.
  All published values are unchanged.

  DECLARED DEVIATION, and it is a semantic one: the board sets this as a real <dl> with dt/dd. The
  served DOM is <article><h3>label</h3><p>value</p></article>, because element TYPES here come from
  the shared flow renderer's role system — the same component every clinic demo in both locales
  renders. Forking that component's element contract for one language buys the correct tag and puts
  a second element-type path inside the default render tree. The rows are ruled; the tag is not a dl.
*/
${S} [data-clinic-flow-section^="directions."] [data-clinic-flow-items] {
  grid-template-columns: 1fr;
  gap: 0;
  border-top: var(--lg-border) solid var(--lg-ink);
}
${S} [data-clinic-flow-section^="directions."] [data-clinic-flow-item] {
  grid-template-columns: minmax(0,auto) minmax(0,1fr);
  gap: 12px 24px;
  align-items: baseline;
  padding: 13px 0;
  border: 0;
  border-bottom: var(--lg-border) solid var(--lg-rule);
  border-radius: 0;
  background: transparent;
}
${S} [data-clinic-flow-section^="directions."] [data-clinic-flow-item-copy] {
  display: contents;
}
${S} [data-clinic-flow-section^="directions."] [data-clinic-flow-item-heading] {
  font-weight: 400;
  font-size: 14px;
  line-height: 1.45;
  letter-spacing: 0;
  color: var(--lg-meta);
}
${S} [data-clinic-flow-section^="directions."] [data-clinic-flow-copy] {
  justify-self: end;
  max-width: none;
  text-align: right;
  font-family: var(--lg-mono) !important;
  font-weight: 500;
  font-size: 14px;
  line-height: 1.45;
  color: var(--lg-ink);
}

/* ---- gallery: a printed contact sheet ------------------------------------ */
/*
  1px gaps over a --rule background, so the grid reads as one sheet rather than as twelve pictures.
  eLife runs EVERY image on its homepage at 16:9; this language declares 16:9 for everything except
  the doctor portrait, which is 4:5. Clinical images are never rounded and never filtered.
*/
${S} [data-clinic-flow-section^="gallery."] [data-clinic-flow-items] {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--lg-hair);
  background: var(--lg-rule);
  border: var(--lg-border) solid var(--lg-rule);
}
${S} [data-clinic-flow-section^="gallery."] [data-clinic-flow-item] {
  gap: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: var(--lg-surface);
}
${S} [data-clinic-flow-section^="gallery."] [data-clinic-flow-media] {
  aspect-ratio: 16 / 9;
  border: 0;
  border-radius: 0;
  /* The sheet's own rule tone over its own surface — the contact sheet's paper, not paper white. */
  --clinic-gallery-tile-backdrop: color-mix(in srgb, var(--lg-rule) 55%, var(--lg-surface));
}
/*
  A caption band with nothing in it is a 12px strip of white under every tile. The served gallery
  item carries an EMPTY [data-clinic-flow-item-copy]; where the compile does supply a caption it
  becomes the board's mono band.
*/
${S} [data-clinic-flow-section^="gallery."] [data-clinic-flow-item-copy] {
  padding: 10px 12px 12px;
  font-family: var(--lg-mono) !important;
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--lg-meta);
}
${S} [data-clinic-flow-section^="gallery."] [data-clinic-flow-item-copy]:empty {
  display: none;
}

/* ---- affiliation strip: ruled cells, logos at 62% ------------------------ */
/*
  !important throughout, and measured: ClinicInsuranceStrip writes its grid INLINE —
  grid-template-columns: repeat(auto-fit,minmax(148px,1fr)), gap 16, a soft border-radius and a
  theme background on each cell. With a single logo, auto-fit/1fr stretched one rounded white box
  across the whole 1140px band with a 60px mark centred in it. A ruled band of 148-220px cells is
  the board's affiliation strip; a single stretched box is a mistake with a border.
*/
${S} [data-clinic-insurance-logo-grid] {
  grid-template-columns: repeat(auto-fit, minmax(148px, 200px)) !important;
  justify-content: start;
  gap: var(--lg-hair) !important;
  background: var(--lg-rule-2);
  border: var(--lg-border) solid var(--lg-rule-2);
}
/*
  The cells stay WHITE even on the dark band. A practice's accrediting marks are their own artwork whose
  ink we never fetch, so putting them straight onto ink is a coin flip on every mark; a white cell
  is the same decision the header made when it stopped rendering a logo it could not see.
*/
${S} [data-clinic-insurance-logo-box] {
  background: var(--lg-surface) !important;
  border: 0 !important;
  border-radius: 0 !important;
  padding: 22px 16px !important;
}
${S} [data-clinic-insurance-logo-box] img {
  opacity: .62;
}

/* ---- hero ---------------------------------------------------------------- */
/*
  THE ACCENT CARRIES DISPLAY TYPE. Arc Institute sets its homepage h1 in the brand blue while section
  heads stay dark — the accent leads the page rather than only ruling it, and this is the single
  change that most separates the language from a corporate-blue template where the accent appears
  only in buttons. The h1 takes the tone-mate, which is 7.104:1 on white for the board's own steel
  and therefore clears the 4.5 floor this language sets for display type at any clamp value.
*/
${S} [data-clinic-flow-hero-copy] h1,
${S} [data-section-type="hero"] [data-clinic-typography-tier="display"] {
  font-family: var(--clinic-heading-family);
  font-weight: 600;
  font-size: clamp(34px,3.6vw,46px);
  line-height: 1.18;
  letter-spacing: -.014em !important;
  color: var(--lg-brand-deep) !important;
}
${S} [data-clinic-flow-hero-copy] p:not([data-clinic-hero-kicker]) {
  font-size: 18px;
  line-height: 1.6;
  color: var(--lg-text) !important;
  max-width: 44ch;
}
/*
  The kicker is the board's mono index label. Its colour is written by CLINIC_FLOW_CSS with
  !important on [data-clinic-hero-kicker]'s own colour, so this rule needs the same
  weight or the label keeps the engine's accent — the identical trap MARQUEE hit on the same hook.
*/
${S} [data-clinic-hero-kicker] {
  font-family: var(--lg-mono) !important;
  font-weight: 500;
  font-size: 11.5px !important;
  line-height: 1;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--lg-brand-deep) !important;
}
/*
  The plate is a white record card over the photograph: square, ruled, never floating on a radius.

  THE PADDING IS DOUBLED BY DEFAULT, and it measured as the worst balance problem on the page.
  CLINIC_HERO_LAYOUT_CSS pads the plate at clamp(2.5rem,5vw,5rem) and CLINIC_FLOW_CSS pads
  [data-clinic-flow-hero-copy] INSIDE it at another clamp(5rem,12vh,9rem) — so at 1440 the copy sat
  in ~224px of white above it and ~224px below, inside a 46rem plate that then stretched to the
  hero's own min-height. Four lines of type in a 640px white block. The inner padding is the one
  that goes: the plate is the padded element, and the copy inside it is copy.
*/
${S} [data-clinic-hero-mode] [data-clinic-hero-plate] {
  background: var(--lg-surface);
  border-radius: 0;
  border-top: var(--lg-rule-w) solid var(--lg-brand);
  padding: 44px 48px 46px;
}
${S} [data-clinic-hero-mode] [data-clinic-flow-hero-copy] {
  padding-block: 0;
  width: 100%;
  gap: 14px;
}
${S} [data-clinic-hero-mode] [data-clinic-hero-photo] {
  background: #0B0D10;
}
/* The photograph's caption band — the board's steel keyline under mono on the dark plate. */
${S} [data-clinic-stock-disclosure] {
  border-top: var(--lg-border) solid var(--lg-brand);
  background: rgba(11,13,16,.86) !important;
  color: #C6CDD5 !important;
  font-family: var(--lg-mono) !important;
  font-size: 12.5px;
  line-height: 1.5;
}

/* ---- controls: 3px radius, 1px border, no shadows anywhere --------------- */
/*
  !important, and the reason is measured rather than defensive: the renderer writes each button's
  colour and background INLINE keyed on data-variant — background-color:transparent with a colour
  for ghost — and inline beats an author rule. On MARQUEE that produced six invisible buttons per
  page at a contrast ratio of 1.00. The language owns its controls, so it says so.

  .anaks-btn ONLY. [data-clinic-flow-control] is the WRAPPER around the button, not the button;
  styling both draws a filled block around a filled block.
*/
${S} .anaks-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 50px;
  padding: 0 26px;
  border-radius: var(--lg-r-control) !important;
  border: var(--lg-border) solid var(--lg-brand-deep) !important;
  background-color: var(--lg-brand-deep) !important;
  color: #FFFFFF !important;
  box-shadow: none;
  font-family: var(--clinic-control-family);
  font-weight: 600;
  font-size: 15px;
  line-height: 1;
  transition: background-color .2s var(--lg-e), color .2s var(--lg-e);
}
${S} .anaks-btn[data-variant="ghost"],
${S} .anaks-btn[data-variant="outline"] {
  background-color: transparent !important;
  color: var(--lg-brand-deep) !important;
}
${S} .anaks-btn[data-variant="ghost"]:hover,
${S} .anaks-btn[data-variant="outline"]:hover {
  background-color: var(--lg-wash) !important;
}
/*
  The hero's call to action is NOT .anaks-btn — the served DOM renders it as
  <span data-clinic-hero-cta aria-disabled="true"> — so every button rule above misses it.
*/
${S} [data-clinic-hero-cta] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 50px;
  min-height: 50px;
  padding: 0 26px;
  border-radius: var(--lg-r-control);
  border: var(--lg-border) solid var(--lg-brand-deep);
  background: var(--lg-brand-deep);
  color: #FFFFFF !important;
  font-family: var(--clinic-control-family);
  font-weight: 600;
  font-size: 15px;
  line-height: 1;
}

/* ---- micro-bar + header -------------------------------------------------- */
[data-ledger-micro-bar] {
  overflow: hidden;
  height: var(--lg-micro-h);
  background: var(--lg-panel);
  border-bottom: var(--lg-border) solid var(--lg-rule);
  /*
    The literal stack, not var(--clinic-body-family): this element sits outside .anaks-site, where
    that variable is set, so it would resolve to nothing and the strip would render in the UA serif.
  */
  font-family: 'IBM Plex Mono', ui-monospace, Menlo, monospace;
  font-weight: 400;
  font-size: 12.5px;
  line-height: 1;
  color: var(--lg-meta);
  transition: height .3s var(--lg-e);
}
[data-ledger-micro-bar][data-ledger-scrolled] {
  height: 0;
}
[data-ledger-micro-inner] {
  width: min(calc(100% - 3rem), var(--clinic-container-max,1200px));
  margin-inline: auto;
  height: var(--lg-micro-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

/*
  NEVER TRANSPARENT, NEVER DARK, and it does not move: the board is explicit that the header itself
  keeps its height, its colour and its position on scroll, so nothing shifts under the reader. Only
  the rule darkens and a low shadow appears.

  Selectors are on the header element, which carries the language attribute and its own copy of the
  variables, because this component renders outside .anaks-site.
*/
.anaks-tenant-header[data-clinic-design-language="ledger"] {
  background-color: var(--lg-surface) !important;
  color: var(--lg-text);
  border-bottom: var(--lg-border) solid var(--lg-rule) !important;
  backdrop-filter: none;
  font-family: 'Public Sans', 'Helvetica Neue', Arial, sans-serif !important;
  transition: border-color .25s var(--lg-e), box-shadow .25s var(--lg-e);
}
.anaks-tenant-header[data-clinic-design-language="ledger"][data-ledger-scrolled] {
  border-bottom-color: var(--lg-rule-2) !important;
  box-shadow: 0 1px 0 rgba(18,23,28,.04), 0 8px 22px rgba(18,23,28,.05);
}
.anaks-tenant-header[data-clinic-design-language="ledger"] > div {
  min-height: 76px;
}
.anaks-tenant-header[data-clinic-design-language="ledger"] > div > a:first-child {
  font-weight: 700 !important;
  font-size: 16px !important;
  letter-spacing: .055em;
  text-transform: uppercase;
  color: var(--lg-ink) !important;
}
.anaks-tenant-header[data-clinic-design-language="ledger"] nav a,
.anaks-tenant-header[data-clinic-design-language="ledger"] summary {
  color: var(--lg-text) !important;
  font-weight: 500 !important;
  font-size: 15px;
  padding-bottom: 10px;
  border-bottom: var(--lg-rule-w) solid transparent;
  transition: border-color .2s var(--lg-e), color .2s var(--lg-e);
}
.anaks-tenant-header[data-clinic-design-language="ledger"] nav a:hover {
  color: var(--lg-ink) !important;
  border-bottom-color: var(--lg-rule-2);
}
.anaks-tenant-header[data-clinic-design-language="ledger"] nav a[aria-current] {
  color: var(--lg-ink) !important;
  border-bottom-color: var(--lg-brand);
}
.anaks-tenant-header[data-clinic-design-language="ledger"] :focus-visible {
  outline: var(--lg-rule-w) solid var(--lg-brand-deep) !important;
  outline-offset: 3px;
}

/* ---- booking bar: square, 1px rule, a 2px steel top border --------------- */
${S} [data-clinic-sticky-booking],
[data-clinic-design-language="ledger"] [data-clinic-sticky-booking] {
  border: var(--lg-border) solid var(--lg-rule-2);
  border-top: var(--lg-rule-w) solid var(--lg-brand);
  border-left: var(--lg-border) solid var(--lg-rule-2);
  border-radius: 0;
  background: var(--lg-surface);
  box-shadow: 0 16px 40px rgba(18,23,28,.14);
}
${S} [data-clinic-booking-action] {
  height: 54px;
  min-height: 54px;
  border-radius: 0;
  background: var(--lg-brand-deep);
  color: #FFFFFF;
  font-weight: 600;
}
/*
  The Call action is the ghost of the pair. It must NOT read --clinic-accent-contrast blindly: that
  variable holds the ink that sits on the practice's colour, and here the surface is white.
*/
${S} [data-clinic-booking-action="call"] {
  background: var(--lg-surface);
  color: var(--lg-brand-deep);
  border-left: var(--lg-border) solid var(--lg-rule);
}
${S} [data-clinic-booking-disclosure] {
  border-top: var(--lg-border) solid var(--lg-rule);
  color: var(--lg-meta);
  font-size: 12.5px;
  line-height: 1.45;
}

/* ---- focus: authored, because the UA ring is invisible on wash and panel -- */
${S} :where(a,button,[tabindex]):focus-visible {
  outline: var(--lg-rule-w) solid var(--lg-brand-deep);
  outline-offset: 3px;
  border-radius: 2px;
}
${S} [data-section-surface-tone="dark"] :where(a,button,[tabindex]):focus-visible {
  outline-color: var(--lg-brand);
}
[data-ledger-micro-bar] :focus-visible {
  outline: var(--lg-rule-w) solid var(--lg-brand-deep);
  outline-offset: 3px;
}

/* ---- motion: the quietest of the three ----------------------------------- */
/*
  240ms, 8px, opacity-led. Never animates numbers — a surgery count is a fact, not an effect — and
  never photography, tables, nav or credentials, none of which carry a reveal hook.
*/
${S} [data-clinic-motion-signature="ledger-quiet"] [data-clinic-variant-reveal][data-m="reveal"].m-hide {
  opacity: 0;
  transform: translateY(8px);
}
${S} [data-clinic-motion-signature="ledger-quiet"] [data-clinic-variant-reveal][data-m="reveal"].m-show {
  opacity: 1;
  transform: none;
  transition-property: opacity, transform;
  transition-duration: 240ms, 240ms;
  transition-timing-function: var(--lg-e), var(--lg-e);
}
/* The section rule draws rather than fading, at the board's 320ms. */
${S} [data-clinic-motion-signature="ledger-quiet"] [data-clinic-flow-heading] {
  transition: border-color .32s var(--lg-e);
}

@media (max-width: 767.98px) {
  ${S} [data-clinic-flow-section],
  ${S} [data-clinic-insurance-strip] {
    padding-block: 52px;
  }
  ${S} [data-clinic-flow-section^="features."] [data-clinic-flow-item] {
    grid-template-columns: 56px minmax(0,1fr);
    column-gap: 16px;
    row-gap: 14px;
    padding: 20px 0;
  }
  ${S} [data-clinic-flow-section="features.faq-accordion"] [data-clinic-flow-item] {
    grid-template-columns: 56px minmax(0,1fr);
  }
  ${S} [data-clinic-flow-section^="features."] [data-clinic-flow-item-copy],
  ${S} [data-clinic-flow-section="features.faq-accordion"] [data-clinic-flow-item-copy] {
    grid-template-columns: 1fr;
    row-gap: 10px;
  }
  ${S} [data-clinic-flow-section^="features."] [data-clinic-flow-item-heading],
  ${S} [data-clinic-flow-section^="features."] [data-clinic-flow-copy],
  ${S} [data-clinic-flow-section^="features."] [data-clinic-flow-control] {
    grid-column: 1;
  }
  ${S} [data-clinic-flow-section^="features."] [data-clinic-flow-media] {
    grid-column: 2 / -1;
    width: 100%;
    justify-self: stretch;
  }
  ${S} [data-clinic-flow-section^="about."] [data-clinic-flow-item] {
    grid-template-columns: 1fr;
  }
  ${S} [data-clinic-flow-section^="about."] [data-clinic-flow-media] {
    border-right: 0;
    border-bottom: var(--lg-border) solid var(--lg-rule);
  }
  ${S} [data-clinic-flow-section^="gallery."] [data-clinic-flow-items] {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  ${S} [data-clinic-insurance-logo-grid] {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  [data-ledger-micro-inner] {
    justify-content: flex-start;
    gap: 12px;
  }
  [data-ledger-micro-place] {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
  [data-ledger-micro-bar] {
    transition: none !important;
  }
}
`;
