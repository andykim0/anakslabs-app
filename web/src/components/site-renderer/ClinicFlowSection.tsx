import { Fragment, type CSSProperties, type ReactNode } from 'react';
import type {
  CanvasElement,
  ClinicDesignLanguage,
  Section,
  SiteTheme,
  TextElement,
} from '@/lib/types/site';
import { fontRoleForTextElement } from '@/lib/fonts/resources';
import { ClinicHeroLayoutSection } from './ClinicHeroLayout';
import {
  resolveSectionSurfaceTone,
  resolveThemePaint,
  type SectionSurfacePaint,
} from '@/lib/design/site-theme-tokens';
import {
  resolveTypographyTracking,
  type TypographyTrackingRole,
} from '@/lib/design/typography-tracking';
import type { MotionPlan } from '@/lib/motion/apply';
import { ElementContent } from './ElementContent';

/**
 * The element id `applyDentalStockToClinicMaster` gives its licensed-imagery disclosure. Matched
 * by id rather than by text so no sentence a practice actually wrote can be removed from its own
 * page, and duplicated as a literal rather than imported so the renderer bundle does not pull in
 * DENTAL_STOCK_MANIFEST. `p3-clinic-master.test.ts` pins the producing id.
 */
export const CLINIC_STOCK_DISCLOSURE_ELEMENT_ID = 'clinic-dental-stock-disclosure';

export const CLINIC_FLOW_CSS = `
[data-clinic-flow-section] {
  position: relative;
  width: 100%;
  overflow: clip;
  padding-block: var(--clinic-section-block-desktop);
}
[data-clinic-flow-inner] {
  width: min(calc(100% - 3rem), var(--clinic-container-max));
  margin-inline: auto;
}
[data-clinic-flow-heading] {
  max-width: 44rem;
  margin: 0 0 var(--clinic-heading-gap);
  font-family: var(--clinic-heading-family);
  font-size: clamp(2rem, 4vw, 3.25rem);
  font-weight: var(--clinic-heading-weight);
  line-height: 1.12;
  color: var(--clinic-section-text,var(--clinic-text));
}
[data-clinic-flow-intro] {
  max-width: 46rem;
  margin: 0 0 var(--clinic-stack-rhythm);
  font-size: clamp(1rem, 1.5vw, 1.2rem);
  line-height: 1.7;
}
[data-clinic-flow-items] {
  display: grid;
  grid-template-columns: repeat(3,minmax(0,1fr));
  gap: var(--clinic-grid-gutter);
  align-items: start;
}
[data-clinic-flow-item] {
  min-width: 0;
  display: grid;
  gap: 1rem;
  align-content: start;
}
[data-clinic-flow-item-copy] {
  min-width: 0;
  display: grid;
  gap: 1rem;
  align-content: start;
}
[data-clinic-flow-item-heading] {
  margin: 0;
  font-family: var(--clinic-heading-family);
  font-size: clamp(1.25rem, 2vw, 1.75rem);
  font-weight: var(--clinic-heading-weight);
  line-height: 1.25;
}
[data-clinic-flow-section="features.dark-value-band"] [data-clinic-flow-items] {
  grid-template-columns: 1fr;
}
[data-clinic-flow-section="features.dark-value-band"] [data-clinic-flow-item-heading] {
  max-width: 54rem;
  font-size: clamp(2.25rem,5vw,4rem);
  font-weight: var(--clinic-display-weight);
  line-height: 1.08;
}
[data-clinic-flow-copy] {
  margin: 0;
  font-size: clamp(1rem, 1.25vw, 1.125rem);
  line-height: 1.7;
}
[data-clinic-flow-marker] {
  color: var(--clinic-section-accent,var(--clinic-accent));
  font-family: var(--clinic-control-family);
  font-size: .875rem;
  font-weight: var(--clinic-control-weight);
}
[data-clinic-flow-media] {
  width: 100%;
  min-width: 0;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: var(--clinic-radius-md);
}
[data-clinic-flow-media] > img,
[data-clinic-flow-media] > video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
[data-clinic-flow-section="features.zigzag-media"] [data-clinic-flow-items] {
  grid-template-columns: 1fr;
}
[data-clinic-flow-section="features.zigzag-media"] [data-clinic-flow-item] {
  grid-template-columns: minmax(0,1.05fr) minmax(0,.95fr);
  gap: var(--clinic-grid-gutter);
  align-items: center;
}
[data-clinic-flow-section="features.zigzag-media"] [data-clinic-flow-item]:nth-child(even) [data-clinic-flow-item-copy] {
  order: 2;
}
[data-clinic-flow-section="features.numbered-list"] [data-clinic-flow-items],
[data-clinic-flow-section="features.sticky-heading-two-column"] [data-clinic-flow-items] {
  grid-template-columns: 1fr;
  gap: 0;
  border-top: 1px solid var(--clinic-section-border,var(--clinic-border));
}
[data-clinic-flow-section="features.numbered-list"] [data-clinic-flow-item],
[data-clinic-flow-section="features.sticky-heading-two-column"] [data-clinic-flow-item] {
  grid-template-columns: minmax(4rem,.3fr) minmax(0,1.7fr);
  gap: var(--clinic-grid-gutter);
  padding-block: 2rem;
  border-bottom: 1px solid var(--clinic-section-border,var(--clinic-border));
}
[data-clinic-flow-section="features.featured-first"] [data-clinic-flow-item]:first-child {
  grid-column: span 2;
}
[data-clinic-flow-section="features.faq-accordion"] [data-clinic-flow-items] {
  grid-template-columns: 1fr;
  gap: 1rem;
}
[data-clinic-flow-section="features.faq-accordion"] [data-clinic-flow-item] {
  padding: 1.5rem;
  border: 1px solid var(--clinic-section-border,var(--clinic-border));
  border-radius: var(--clinic-radius-md);
  background: var(--clinic-section-surface,var(--clinic-surface));
}
[data-clinic-flow-section="features.stat-strip"] [data-clinic-flow-items] {
  grid-template-columns: repeat(var(--clinic-flow-columns),minmax(0,1fr));
  gap: 1rem;
}
[data-clinic-flow-section="features.stat-strip"] [data-clinic-flow-item] {
  padding-block: 1.25rem;
  border-block: 1px solid var(--clinic-section-border,var(--clinic-border));
}
[data-clinic-flow-section="features.stat-strip"] [data-clinic-flow-marker] {
  font-size: clamp(1rem,1.5vw,1.25rem);
}
[data-clinic-flow-section="features.prose-article"] [data-clinic-flow-inner] {
  max-width: 68rem;
}
[data-clinic-flow-section="features.prose-article"] [data-clinic-flow-items] {
  grid-template-columns: minmax(0, 40em);
  justify-content: center;
  gap: var(--clinic-stack-rhythm);
}
[data-clinic-flow-section="features.prose-article"] [data-clinic-flow-item] {
  gap: 1.25rem;
}
[data-clinic-flow-section="features.prose-article"] [data-clinic-flow-copy] {
  white-space: pre-wrap;
}
[data-ko-clinic] [data-clinic-flow-section="features.prose-article"] [data-clinic-flow-copy] {
  font-size: clamp(1rem,1.18vw,1.0625rem);
  white-space: normal !important;
}
[data-ko-clinic] [data-font-role] {
  word-break: keep-all;
  overflow-wrap: break-word;
}
[data-ko-clinic] :is(h1,h2,h3)[data-font-role] {
  text-wrap: balance;
}
[data-clinic-flow-section^="about."] [data-clinic-flow-items] {
  grid-template-columns: 1fr;
}
[data-clinic-flow-section^="about."] [data-clinic-flow-item] {
  grid-template-columns: minmax(0,.9fr) minmax(0,1.1fr);
  gap: var(--clinic-grid-gutter);
  align-items: center;
}
[data-clinic-flow-section^="about."] [data-clinic-flow-item][data-clinic-flow-has-media="false"] {
  grid-template-columns: minmax(0,46rem);
}
[data-clinic-flow-section^="about."] [data-clinic-flow-media] {
  aspect-ratio: 34 / 43;
  order: -1;
}
[data-clinic-flow-section^="gallery."] [data-clinic-flow-items] {
  grid-template-columns: repeat(4,minmax(0,1fr));
  gap: 1rem;
}
[data-clinic-flow-section^="gallery."] [data-clinic-flow-item] {
  gap: .75rem;
}
[data-clinic-flow-section^="cta."] {
  color: var(--clinic-section-text,var(--clinic-text));
}
[data-clinic-flow-section^="cta."] [data-clinic-flow-heading],
[data-clinic-flow-section^="cta."] [data-clinic-flow-copy],
[data-clinic-flow-section^="cta."] [data-clinic-flow-item-heading] {
  color: var(--clinic-section-text,var(--clinic-text)) !important;
}
[data-clinic-flow-section^="cta."] [data-clinic-flow-items],
[data-clinic-flow-section^="directions."] [data-clinic-flow-items] {
  grid-template-columns: repeat(2,minmax(0,1fr));
}
[data-clinic-flow-section^="directions."] [data-clinic-flow-item] {
  padding: 1.5rem;
  border: 1px solid var(--clinic-section-border,var(--clinic-border));
  border-radius: var(--clinic-radius-md);
  background: var(--clinic-section-surface,var(--clinic-surface));
}
[data-clinic-flow-section="faq.compact"] [data-clinic-flow-items] {
  grid-template-columns: 1fr;
  gap: 0;
  border-top: 1px solid var(--clinic-section-border,var(--clinic-border));
}
[data-clinic-flow-section="faq.compact"] [data-clinic-flow-item] {
  padding-block: 1.5rem;
  border-bottom: 1px solid var(--clinic-section-border,var(--clinic-border));
}
[data-clinic-flow-section^="hero."] {
  padding-block: 0;
  background: var(--clinic-background);
}
[data-clinic-flow-section^="features."],
[data-clinic-flow-section^="gallery."],
[data-clinic-flow-section^="directions."],
[data-clinic-flow-section^="cta."],
[data-clinic-flow-section="faq.compact"] {
  padding-block: 88px;
}
[data-clinic-flow-hero-media] {
  position: relative;
  display: grid;
  min-height: clamp(34rem,72vh,50rem);
  overflow: hidden;
  isolation: isolate;
}
[data-clinic-flow-hero-media] > img {
  position: absolute;
  inset: 0;
  z-index: -2;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
[data-clinic-flow-hero-media]::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background: linear-gradient(
    90deg,
    rgba(255,255,255,var(--clinic-hero-overlay-opacity,.94)),
    rgba(255,255,255,.72) 48%,
    rgba(255,255,255,.12)
  );
}
[data-clinic-flow-hero-copy] {
  width: min(calc(100% - 3rem), var(--clinic-container-max));
  margin-inline: auto;
  padding-block: clamp(5rem,12vh,9rem);
  display: grid;
  align-content: center;
  justify-items: start;
  gap: 1.25rem;
}
[data-clinic-flow-hero-copy] h1 {
  max-width: 48rem;
  margin: 0;
  color: var(--clinic-section-text,var(--clinic-text));
  font-family: var(--clinic-heading-family);
  font-size: clamp(2.75rem,6vw,5.5rem);
  font-weight: var(--clinic-display-weight);
  line-height: 1.02;
}
[data-ko-clinic] [data-clinic-flow-hero-copy] h1[data-clinic-ko-long-token] {
  font-size: clamp(2.25rem,4vw,3.5rem);
}
[data-clinic-flow-hero-copy] p {
  max-width: 42rem;
  margin: 0;
  color: var(--clinic-section-text,var(--clinic-text));
  font-size: clamp(1.05rem,1.5vw,1.3rem);
  line-height: 1.7;
}
[data-clinic-flow-hero-copy][data-clinic-ko-hero-copy] > p:not([data-clinic-hero-kicker]) {
  line-height: 1.45;
}
[data-clinic-flow-hero-copy][data-clinic-article-hero-copy] h1 {
  font-size: clamp(2.25rem,4vw,4rem);
  line-height: 1.1;
  text-wrap: balance;
}
[data-clinic-hero-kicker] {
  color: var(--clinic-section-accent,var(--clinic-accent)) !important;
  font-family: var(--clinic-control-family);
  font-size: .875rem !important;
  font-weight: var(--clinic-control-weight);
  text-transform: uppercase;
}
[data-clinic-article-evidence] {
  display: flex;
  flex-wrap: wrap;
  gap: .35rem 1rem;
  align-items: baseline;
  color: var(--clinic-section-muted,var(--clinic-muted));
  font-size: .875rem;
}
[data-clinic-article-evidence] p {
  color: inherit;
  font-size: inherit;
  line-height: 1.5;
}
[data-clinic-hero-cta] {
  display: inline-flex;
  min-height: 3.25rem;
  align-items: center;
  justify-content: center;
  margin-top: .75rem;
  padding-inline: 1.5rem;
  border-radius: var(--clinic-radius-md);
  color: var(--clinic-accent-contrast);
  background: var(--clinic-accent);
  font-family: var(--clinic-control-family);
  font-weight: var(--clinic-control-weight);
}
@media (max-width: 767.98px) {
  [data-clinic-flow-section] {
    padding-block: var(--clinic-section-block-mobile);
  }
  [data-clinic-flow-section^="features."],
  [data-clinic-flow-section^="gallery."],
  [data-clinic-flow-section^="directions."],
  [data-clinic-flow-section^="cta."],
  [data-clinic-flow-section="faq.compact"] {
    padding-block: 56px;
  }
  [data-clinic-flow-inner] {
    width: min(calc(100% - 3rem), var(--clinic-container-max));
  }
  [data-clinic-flow-items],
  [data-clinic-flow-section="features.zigzag-media"] [data-clinic-flow-item],
  [data-clinic-flow-section="features.numbered-list"] [data-clinic-flow-item],
  [data-clinic-flow-section="features.sticky-heading-two-column"] [data-clinic-flow-item],
  [data-clinic-flow-section^="about."] [data-clinic-flow-item],
  [data-clinic-flow-section^="cta."] [data-clinic-flow-items],
  [data-clinic-flow-section^="directions."] [data-clinic-flow-items] {
    grid-template-columns: 1fr;
  }
  [data-clinic-flow-section^="gallery."] [data-clinic-flow-items] {
    grid-template-columns: repeat(2,minmax(0,1fr));
  }
  [data-clinic-flow-section="features.zigzag-media"] [data-clinic-flow-item]:nth-child(even) [data-clinic-flow-item-copy] {
    order: initial;
  }
  [data-clinic-flow-section="features.featured-first"] [data-clinic-flow-item]:first-child {
    grid-column: auto;
  }
  [data-clinic-flow-section="features.stat-strip"] [data-clinic-flow-items] {
    grid-template-columns: repeat(2,minmax(0,1fr));
  }
  [data-clinic-flow-hero-media] {
    min-height: 38rem;
  }
  [data-clinic-flow-hero-media]::after {
    background: linear-gradient(180deg,rgba(255,255,255,.9),rgba(255,255,255,.72));
  }
  [data-clinic-flow-hero-copy] {
    padding-block: 5rem 6rem;
  }
}
`
/**
 * GALLERY CROP ANCHOR — on the renderer that actually draws the clinic galleries.
 *
 * A tile is 4:3 landscape ([data-clinic-flow-media]) and the photograph fills it with
 * object-fit: cover, which without an anchor takes the middle horizontal slice. Practice
 * photography is mostly standing and seated portraits with the face in the upper quarter, so the
 * middle slice is a torso: on the issued round-3 preview all 24 of Ora's gallery tiles computed
 * 50% 50% and 15 of them cut heads.
 *
 * The same anchor was written once before, in SectionLayoutProjectionRenderer, against
 * [data-section-type="gallery"] [data-section-layout-item] img. That is a real path — a
 * survey-built site's gallery still renders through it — but it is NOT the path a clinic demo
 * takes: SectionCanvas and SectionStack both branch on clinicFlow BEFORE they look at
 * section.sectionLayout, so every clinic gallery is this component's DOM, which carries neither
 * of those two attributes. The rule shipped and never fired. clinic-gallery-crop.test.ts now
 * measures the anchor on real issued markup, so a repeat of that miss fails in the suite rather
 * than in a prospect's inbox.
 *
 * 25% rather than 0%: the anchor also serves the landscape photographs in the same grid, whose
 * subject is near the middle. A quarter is above centre far enough to bring faces into frame and
 * close enough to centre that a landscape shot loses nothing that matters.
 *
 * SCOPE. ClinicFlowSection renders the KR tenant clinics too — same component, same selectors —
 * so an unscoped rule would silently re-crop every published KR gallery. SiteRenderer sets
 * data-ko-clinic for, and only for, clinicLocale === 'ko-KR', so excluding it leaves KR byte for
 * byte as it was and admits exactly the en-US clinic demo this was measured on.
 *
 * Appended rather than written inline because the CSS in this file ships to the browser: a
 * comment inside the template literal is served to every visitor.
 */
+ `
.anaks-site[data-clinic-master]:not([data-ko-clinic]) [data-clinic-flow-section^="gallery."] [data-clinic-flow-media] > img {
  object-position: 50% 25%;
}
`
/**
 * GALLERY TILE BACKDROP — what shows through a picture that is not fully opaque.
 *
 * `ImageContent` paints every image's own box with `surfaceSubtle` as an INLINE style, so on a
 * light theme the backdrop is white. That is invisible under a photograph and glaring under a
 * logo or a wedge mark: one measured tile is an alpha-masked PNG that is 29.3% transparent, and
 * the white read as a blown-out panel rather than as a picture on a surface.
 *
 * Only an inline style can be beaten by `!important`, which is why this is written as one, and it
 * is scoped exactly like the crop anchor above — clinic master, en-US, gallery media only. Hero
 * media, procedure media and every KR tenant gallery keep the paint they have.
 *
 * The value is a variable each design language sets from ITS OWN surface family, defaulting to the
 * section's surface tinted 6% toward the section's own text. Nothing here is a new colour: the
 * default cannot leave the section's own two tokens, and each language's override names tokens it
 * already draws its rules and cards with.
 *
 * NO AA IMPACT IN ANY LANGUAGE. This paints the inside of [data-clinic-flow-media], which contains
 * one <img> and nothing else — the tile caption is [data-clinic-flow-item-copy], a sibling box
 * outside it, in all three languages. No text is rendered against this surface, so no contrast
 * pair changes. Verified against the marquee, ledger and atelier invariant suites.
 */
+ `
.anaks-site[data-clinic-master]:not([data-ko-clinic]) [data-clinic-flow-section^="gallery."] [data-clinic-flow-media] > img {
  background: var(
    --clinic-gallery-tile-backdrop,
    color-mix(
      in srgb,
      var(--clinic-section-text, var(--clinic-text)) 6%,
      var(--clinic-section-surface, var(--clinic-surface))
    )
  ) !important;
}
`
/**
 * OPERATOR SOURCING NOTE — a caption, never body copy.
 *
 * CLINIC_STOCK_DISCLOSURE ("Licensed sample imagery · replaced with your practice photography")
 * is a compile-side constant in clinic-master/dental-stock.ts. It is OUR statement about where WE
 * got the picture, and it arrives in the hero as an ordinary text element — which this component
 * turned into a paragraph in the copy block, so it read as a sentence the practice had written
 * about itself, immediately under their own opening line, on every stock-hero inner page.
 * Measured on Ora's issued service pages, where it was visible hero body copy.
 *
 * It is lifted out of the copy in the hero branch and set here instead: small, muted, anchored to
 * the bottom of the picture it describes. The legacy hero nests its copy inside
 * data-clinic-flow-hero-media, which is position:relative, so the caption is absolutely placed
 * there rather than added as a flow row that would push the practice's own name down.
 */
+ `
[data-clinic-stock-disclosure] {
  margin: 0;
  padding: .5rem clamp(1.5rem, 4vw, 4rem);
  color: var(--clinic-section-muted,var(--clinic-muted));
  font-size: .75rem;
  line-height: 1.4;
}
[data-clinic-flow-hero-media] > [data-clinic-stock-disclosure-anchored] {
  position: absolute;
  inset: auto 0 0 0;
  z-index: 1;
  width: min(calc(100% - 3rem), var(--clinic-container-max));
  margin-inline: auto;
  padding-inline: 0;
}
`;

export const KO_CLINIC_FLOW_MEASURE_CSS = `
[data-ko-clinic] [data-clinic-flow-section="features.prose-article"] :is(
  [data-clinic-flow-item-heading],
  [data-clinic-flow-copy]
) {
  width: 100%;
  max-width: 30em;
  justify-self: center;
}
[data-ko-clinic] [data-clinic-flow-section^="hero."] {
  background: var(--clinic-section-surface,var(--clinic-text));
}
[data-ko-clinic] [data-clinic-flow-hero-media] {
  background: var(--clinic-section-surface,var(--clinic-text));
}
[data-ko-clinic] [data-clinic-flow-hero-media] > img {
  opacity: .82;
}
[data-ko-clinic] [data-clinic-flow-hero-media]::after {
  background: linear-gradient(
    90deg,
    color-mix(in srgb,var(--clinic-section-surface,var(--clinic-text)) 98%,transparent) 0%,
    color-mix(in srgb,var(--clinic-section-surface,var(--clinic-text)) 94%,transparent) 42%,
    color-mix(in srgb,var(--clinic-section-surface,var(--clinic-text)) 54%,transparent) 68%,
    color-mix(in srgb,var(--clinic-section-surface,var(--clinic-text)) 28%,transparent) 100%
  );
}
[data-ko-clinic] [data-clinic-hero-text-zone="right"] [data-clinic-flow-hero-media]::after {
  background: linear-gradient(
    270deg,
    color-mix(in srgb,var(--clinic-section-surface,var(--clinic-text)) 98%,transparent) 0%,
    color-mix(in srgb,var(--clinic-section-surface,var(--clinic-text)) 94%,transparent) 42%,
    color-mix(in srgb,var(--clinic-section-surface,var(--clinic-text)) 54%,transparent) 68%,
    color-mix(in srgb,var(--clinic-section-surface,var(--clinic-text)) 28%,transparent) 100%
  );
}
[data-ko-clinic] [data-clinic-hero-text-zone] [data-clinic-flow-hero-copy] {
  position: absolute;
  top: var(--ko-hero-zone-y);
  left: var(--ko-hero-zone-x);
  width: var(--ko-hero-zone-width);
  height: var(--ko-hero-zone-height);
  margin: 0;
  padding: 0;
  align-content: center;
}
[data-ko-clinic] [data-clinic-flow-hero-copy] :is(h1,p),
[data-ko-clinic] [data-clinic-hero-kicker],
[data-ko-clinic] [data-clinic-article-evidence] {
  color: var(--clinic-section-text,#fff) !important;
}
[data-ko-clinic] [data-clinic-flow-section="features.three-column-cards"] [data-clinic-flow-item],
[data-ko-clinic] [data-clinic-flow-section="features.featured-first"] [data-clinic-flow-item] {
  padding: clamp(1.25rem,2.4vw,2rem);
  border: 1px solid var(--clinic-section-border,var(--clinic-border));
  border-radius: var(--clinic-radius-md);
  background: var(--clinic-section-surface,var(--clinic-surface));
}
[data-ko-clinic] [data-clinic-flow-section="features.three-column-cards"] [data-clinic-flow-media] {
  aspect-ratio: 4 / 5;
}
[data-ko-clinic] [data-clinic-provider-grid] [data-clinic-flow-items] {
  grid-template-columns: repeat(var(--clinic-provider-columns),minmax(0,1fr));
  grid-auto-rows: 1fr;
  align-items: stretch;
}
[data-ko-clinic] [data-clinic-provider-grid] [data-clinic-provider-card] {
  height: 100%;
  grid-template-rows: minmax(0,1fr) auto;
  align-content: stretch;
}
[data-ko-clinic] [data-clinic-provider-grid] [data-clinic-flow-item-copy] {
  height: 100%;
  grid-template-rows: auto minmax(0,1fr) auto;
  align-content: stretch;
}
[data-ko-clinic] [data-clinic-provider-grid] [data-clinic-flow-item-heading] {
  display: block;
  max-block-size: none;
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
  word-break: keep-all;
  overflow-wrap: break-word;
  -webkit-box-orient: initial;
  -webkit-line-clamp: unset;
  line-clamp: unset;
}
[data-ko-clinic] [data-clinic-provider-card-body],
[data-ko-clinic] [data-clinic-provider-card-actions] {
  min-width: 0;
}
[data-ko-clinic] [data-clinic-provider-card-actions]:empty {
  min-height: 0;
}
[data-ko-clinic] [data-ko-reveal-group][data-m="reveal"].m-hide {
  transform: translateY(24px);
}
[data-ko-clinic] [data-ko-reveal-group][data-m="reveal"].m-show {
  transition-duration: 280ms;
  transition-timing-function: cubic-bezier(.22,1,.36,1);
}
@media (max-width: 767.98px) {
  [data-ko-clinic] [data-clinic-hero-text-zone] [data-clinic-flow-hero-copy] {
    position: relative;
    inset: auto;
    width: min(calc(100% - 3rem),var(--clinic-container-max));
    height: auto;
    margin-inline: auto;
    padding-block: 5rem 6rem;
  }
  [data-ko-clinic] [data-clinic-flow-hero-media]::after,
  [data-ko-clinic] [data-clinic-hero-text-zone="right"] [data-clinic-flow-hero-media]::after {
    background: linear-gradient(
      180deg,
      color-mix(in srgb,var(--clinic-section-surface,var(--clinic-text)) 88%,transparent),
      color-mix(in srgb,var(--clinic-section-surface,var(--clinic-text)) 96%,transparent)
    );
  }
  [data-ko-clinic] [data-ko-reveal-group][data-m="reveal"].m-hide {
    transform: translateY(16px);
  }
  [data-ko-clinic] [data-clinic-provider-grid] [data-clinic-flow-items] {
    grid-template-columns: 1fr;
  }
}
@media (prefers-reduced-motion: reduce) {
  [data-ko-clinic] [data-ko-reveal-group] {
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
  }
}
`;

function clinicHeroTextZone(section: Section) {
  const marker = section.elements.find((element) => (
    element.kind === 'shape' && element.id.includes('-hero-text-zone-')
  ));
  const match = marker?.id.match(
    /-hero-text-zone-(left|right)-x(\d+)-y(\d+)-w(\d+)-h(\d+)$/u,
  );
  if (!match) return undefined;
  return {
    side: match[1] as 'left' | 'right',
    x: Number(match[2]) / 10_000,
    y: Number(match[3]) / 10_000,
    width: Number(match[4]) / 10_000,
    height: Number(match[5]) / 10_000,
  };
}

function textStyle(
  element: TextElement,
  theme: SiteTheme,
  trackingRole: TypographyTrackingRole = 'body',
  uppercase = false,
  trackingFontSizePx = element.style.fontSize,
): CSSProperties {
  const fontWeight = trackingRole === 'display'
    ? 'var(--clinic-display-weight)'
    : trackingRole === 'heading' || trackingRole === 'stat-number'
      ? 'var(--clinic-heading-weight)'
      : trackingRole === 'eyebrow' || trackingRole === 'stat-label'
        ? 'var(--clinic-control-weight)'
        : 400;
  return {
    color: 'var(--clinic-section-text,var(--clinic-text))',
    fontFamily: element.style.fontFamily === 'heading'
      ? theme.fonts.heading
      : theme.fonts.body,
    fontWeight,
    fontStyle: element.style.italic ? 'italic' : undefined,
    textAlign: element.style.align,
    whiteSpace: 'pre-wrap',
    letterSpacing: resolveTypographyTracking({
      fontSizePx: trackingFontSizePx,
      uppercase,
      role: trackingRole,
    }),
  };
}

type ClinicSurfaceStyle = CSSProperties & Record<string, string | number | undefined>;

function clinicSurface(
  section: Section,
  theme: SiteTheme,
): { paint: SectionSurfacePaint; style: ClinicSurfaceStyle } | null {
  const tone = section.surfaceTone ?? section.sectionLayout?.surfaceTone;
  if (!tone) return null;
  const paint = resolveSectionSurfaceTone(theme, tone);
  return {
    paint,
    style: {
      backgroundColor: paint.background,
      color: paint.text,
      '--clinic-section-text': paint.text,
      '--clinic-section-muted': paint.muted,
      '--clinic-section-accent': paint.accent,
      '--clinic-section-border': paint.border,
      '--clinic-section-surface': paint.surface,
    },
  };
}

/**
 * Some legacy KO headings were authored as animated character spans and therefore
 * have no whitespace in their verbatim text node. Preserve textContent byte-for-byte
 * while exposing Unicode word boundaries to the browser instead of allowing an
 * emergency syllable split from overflow-wrap.
 */
function compactKoTokenSegments(token: string): string[] {
  if (!/[\uAC00-\uD7A3]/u.test(token)) return [token];
  let segments = [...new Intl.Segmenter('ko', { granularity: 'word' }).segment(token)]
    .map((entry) => entry.segment)
    .filter(Boolean);
  // ICU treats compacted animation-source headings as one token. In that case,
  // expose only Korean grammatical endings as break opportunities; no character
  // is inserted, deleted, translated, or reordered.
  if (segments.length < 2) {
    const endings = /(?:\uC73C\uB85C|\uC5D0\uC11C|\uC5D0\uAC8C|\uAE4C\uC9C0|\uBD80\uD130|\uCC98\uB7FC|\uBCF4\uB2E4|\uB3C4\uB85D|\uC5C8\uB358|\uC600\uB358|\uD588\uB358|\uB358|\uC758|\uC744|\uB97C|\uC5D0|\uC640|\uACFC|\uC544|\uC5B4)/gu;
    segments = [];
    let cursor = 0;
    for (const match of token.matchAll(endings)) {
      const end = (match.index ?? 0) + match[0].length;
      if (end <= cursor || end >= token.length) continue;
      segments.push(token.slice(cursor, end));
      cursor = end;
    }
    if (cursor < token.length) segments.push(token.slice(cursor));
  }
  return segments.length > 0 ? segments : [token];
}

function koHeadingBreakOpportunities(text: string): ReactNode {
  if (!/[\uAC00-\uD7A3]/u.test(text)) return text;
  return text.split(/(\s+)/u).map((token, tokenIndex) => {
    if (!token || /^\s+$/u.test(token)) return token;
    const segments = compactKoTokenSegments(token);
    return segments.map((segment, segmentIndex) => (
      <Fragment key={`${tokenIndex}-${segmentIndex}-${segment}`}>
        {segmentIndex > 0 ? <wbr /> : null}
        {segment}
      </Fragment>
    ));
  });
}

function fontRole(element: TextElement, theme: SiteTheme): Record<string, string> {
  const role = theme.fontPairing ? fontRoleForTextElement(element) : undefined;
  return role ? { 'data-font-role': role } : {};
}

function FlowText({
  element,
  theme,
  role,
  headingLevel = 3,
}: {
  element: TextElement;
  theme: SiteTheme;
  role: 'intro' | 'heading' | 'display-heading' | 'copy' | 'caption' | 'marker' | 'stat-marker';
  headingLevel?: 2 | 3;
}) {
  const attributes = fontRole(element, theme);
  if (role === 'heading' || role === 'display-heading') {
    const HeadingTag = headingLevel === 2 ? 'h2' : 'h3';
    return (
      <HeadingTag
        data-clinic-flow-item-heading
        data-clinic-typography-tier={role === 'display-heading' ? 'display' : 'subhead'}
        data-clinic-tracking-role={role === 'display-heading' ? 'display' : 'heading'}
        style={textStyle(
          element,
          theme,
          role === 'display-heading' ? 'display' : 'heading',
          false,
          role === 'display-heading' ? 48 : 28,
        )}
        {...attributes}
      >
        {koHeadingBreakOpportunities(element.text)}{' '}
      </HeadingTag>
    );
  }
  if (role === 'marker' || role === 'stat-marker') {
    return (
      <span
        data-clinic-flow-marker
        data-clinic-tracking-role={role === 'stat-marker' ? 'stat-number' : 'eyebrow'}
        style={textStyle(
          element,
          theme,
          role === 'stat-marker' ? 'stat-number' : 'eyebrow',
          role === 'marker',
          role === 'stat-marker' ? 20 : 14,
        )}
        {...attributes}
      >
        {element.text}{' '}
      </span>
    );
  }
  if (role === 'caption') {
    return (
      <p
        data-clinic-flow-caption
        data-clinic-tracking-role="body"
        style={{
          ...textStyle(element, theme, 'body'),
          margin: 0,
          color: 'var(--clinic-section-muted,var(--clinic-muted))',
          fontSize: '.875rem',
          lineHeight: 1.4,
        }}
        {...attributes}
      >
        {element.text}{' '}
      </p>
    );
  }
  return (
    <p
      {...(role === 'intro'
        ? { 'data-clinic-flow-intro': true }
        : { 'data-clinic-flow-copy': true })}
      data-clinic-tracking-role="body"
      style={textStyle(element, theme, 'body')}
      {...attributes}
    >
      {element.text}{' '}
    </p>
  );
}

function isMarker(element: CanvasElement): boolean {
  return element.kind === 'text' && /(?:^|-)marker-\d+$/u.test(element.id);
}

function FlowElement({
  element,
  theme,
  isFirst,
  interactive,
  siteId,
  hrefForPageSlug,
  markerRole = 'marker',
  runtimeDelivery = 'client',
}: {
  element: CanvasElement;
  theme: SiteTheme;
  isFirst?: boolean;
  interactive: boolean;
  siteId?: string;
  hrefForPageSlug?: (slug: string) => string;
  markerRole?: 'marker' | 'stat-marker';
  runtimeDelivery?: 'inline' | 'client';
}) {
  if (element.kind === 'text') {
    return (
      <FlowText
        element={element}
        theme={theme}
        role={isMarker(element) ? markerRole : 'copy'}
      />
    );
  }
  if (element.kind === 'image' || element.kind === 'video') {
    return (
      <div data-clinic-flow-media>
        <ElementContent
          element={element}
          theme={theme}
          variant="stack"
          eager={isFirst}
          interactive={interactive}
          siteId={siteId}
          runtimeDelivery={runtimeDelivery}
        />
      </div>
    );
  }
  if (element.kind === 'shape' || element.kind === 'divider') return null;
  const pageSlug = element.kind === 'button'
    ? /^\/([a-z0-9]+(?:-[a-z0-9]+)*)$/u.exec(element.href)?.[1]
    : undefined;
  const renderedElement = element.kind === 'button' && pageSlug && hrefForPageSlug
    ? { ...element, href: hrefForPageSlug(pageSlug) }
    : element;
  return (
    <div data-clinic-flow-control>
      <ElementContent
        element={renderedElement}
        theme={theme}
        variant="stack"
        eager={isFirst}
        interactive={interactive}
        siteId={siteId}
        runtimeDelivery={runtimeDelivery}
      />
    </div>
  );
}

function FlowItem({
  elements,
  theme,
  isFirst,
  interactive,
  siteId,
  hrefForPageSlug,
  listItem = false,
  variantId,
  headingLevel = 3,
  providerCard = false,
  motionAttributes,
  runtimeDelivery = 'client',
}: {
  elements: CanvasElement[];
  theme: SiteTheme;
  isFirst?: boolean;
  interactive: boolean;
  siteId?: string;
  hrefForPageSlug?: (slug: string) => string;
  listItem?: boolean;
  variantId?: string;
  headingLevel?: 2 | 3;
  providerCard?: boolean;
  motionAttributes?: Record<string, string>;
  runtimeDelivery?: 'inline' | 'client';
}) {
  const heading = elements.find((element): element is TextElement => (
    element.kind === 'text' && !isMarker(element)
  ));
  // Arbitrary clinic imports mark source-backed title-only fragments as captions. The
  // layout resolver still receives its required item-title binding, while the
  // visible DOM avoids manufacturing a run of empty headings. Other masters
  // never receive this compiler-owned suffix and keep their existing output.
  const headingRendersAsCopy = heading?.id.includes('-ko-copy-only-') ?? false;
  const headingRendersAsCaption = heading?.id.includes('-clinic-route-caption-only-') ?? false;
  const remainder = heading
    ? elements.filter((element) => element.id !== heading.id)
    : elements;
  const media = remainder.filter(
    (element) => element.kind === 'image' || element.kind === 'video',
  );
  const content = remainder.filter(
    (element) => element.kind !== 'image' && element.kind !== 'video',
  );
  const providerBody = providerCard
    ? content.filter((element) => element.kind !== 'button')
    : content;
  const providerActions = providerCard
    ? content.filter((element) => element.kind === 'button')
    : [];
  const ItemTag = listItem ? 'li' : 'article';
  return (
    <ItemTag
      data-clinic-flow-item
      {...motionAttributes}
      {...(providerCard ? { 'data-clinic-provider-card': '' } : {})}
      data-clinic-flow-has-media={media.length > 0 ? 'true' : 'false'}
      style={listItem ? { listStyle: 'none' } : undefined}
    >
      <div data-clinic-flow-item-copy>
        {heading?.kind === 'text' ? (
          <FlowText
            element={heading}
            theme={theme}
            role={headingRendersAsCaption
              ? 'caption'
              : headingRendersAsCopy
                ? 'copy'
                : variantId === 'features.dark-value-band'
                  ? 'display-heading'
                  : 'heading'}
            headingLevel={headingLevel}
          />
        ) : null}
        {providerCard ? (
          <>
            <div data-clinic-provider-card-body>
              {providerBody.map((element) => (
                <FlowElement
                  key={element.id}
                  element={element}
                  theme={theme}
                  isFirst={Boolean(isFirst)}
                  interactive={interactive}
                  siteId={siteId}
                  hrefForPageSlug={hrefForPageSlug}
                  markerRole={variantId === 'features.stat-strip' ? 'stat-marker' : 'marker'}
                  runtimeDelivery={runtimeDelivery}
                />
              ))}
            </div>
            <div data-clinic-provider-card-actions>
              {providerActions.map((element) => (
                <FlowElement
                  key={element.id}
                  element={element}
                  theme={theme}
                  isFirst={Boolean(isFirst)}
                  interactive={interactive}
                  siteId={siteId}
                  hrefForPageSlug={hrefForPageSlug}
                  markerRole={variantId === 'features.stat-strip' ? 'stat-marker' : 'marker'}
                  runtimeDelivery={runtimeDelivery}
                />
              ))}
            </div>
          </>
        ) : content.map((element) => (
            <FlowElement
              key={element.id}
              element={element}
              theme={theme}
              isFirst={Boolean(isFirst)}
              interactive={interactive}
              siteId={siteId}
              hrefForPageSlug={hrefForPageSlug}
              markerRole={variantId === 'features.stat-strip' ? 'stat-marker' : 'marker'}
              runtimeDelivery={runtimeDelivery}
            />
          ))}
      </div>
      {media.map((element) => (
        <FlowElement
          key={element.id}
          element={element}
          theme={theme}
          isFirst={Boolean(isFirst)}
          interactive={interactive}
          siteId={siteId}
          hrefForPageSlug={hrefForPageSlug}
          runtimeDelivery={runtimeDelivery}
        />
      ))}
    </ItemTag>
  );
}

export function resolveBalancedClinicCardColumns(itemCount: number): number {
  const boundedCount = Math.max(1, Math.floor(itemCount));
  const maximumColumns = Math.min(3, boundedCount);
  for (let columns = maximumColumns; columns >= 2; columns -= 1) {
    if (boundedCount % columns === 0) return columns;
  }
  return maximumColumns;
}

/**
 * `marquee-spring` is the fifth and `ledger-quiet` the sixth, and unlike the first four they are not
 * parsed out of a section id: the clinic-engine variant path names its signature in the id, while a
 * design language IS the signature for every section it draws. So they are resolved from the stored
 * field instead.
 */
type ClinicVariantMotionSignature =
  | 'static'
  | 'calm-fade'
  | 'rise-stagger'
  | 'cinematic'
  | 'marquee-spring'
  | 'ledger-quiet'
  | 'atelier-settle';

/**
 * The two numbers a design-language signature owns, as a table rather than as a chain of ternaries
 * — a sixth arm on that chain was where the stagger for one language would have been read for
 * another. `itemCap` is the highest item index that still earns a step.
 */
const CLINIC_LANGUAGE_MOTION = Object.freeze({
  'marquee-spring': { groupDelay: 140, staggerStep: 70, itemCap: 5 },
  /**
   * The board's own cap, and it is TIGHTER than the engine's. 40ms x 4 walks a row out to 160ms and
   * then holds, which is what "deliberately the quietest of the three" means when a services grid
   * has ten rows in it. The engine's cap of 5 still bounds it; this language simply does not use
   * the last step.
   */
  'ledger-quiet': { groupDelay: 80, staggerStep: 40, itemCap: 4 },
  /**
   * The slowest of the three, and the one that meets the engine's cap head-on. The board staggers
   * uncapped at 90ms, so an eleven-tile contact sheet would walk out to 900ms of delay on top of a
   * 900ms transition; the cap holds it at 450ms. Declared, not silently absorbed.
   */
  'atelier-settle': { groupDelay: 180, staggerStep: 90, itemCap: 5 },
} as const);

/**
 * Which signature a design language draws with. Exhaustive over `ClinicDesignLanguage`, so adding a
 * language cannot compile until it has decided how it moves.
 */
const CLINIC_DESIGN_LANGUAGE_MOTION_SIGNATURE = Object.freeze({
  marquee: 'marquee-spring',
  ledger: 'ledger-quiet',
  atelier: 'atelier-settle',
} as const satisfies Readonly<Record<ClinicDesignLanguage, ClinicVariantMotionSignature>>);

/** Only the two clinic-engine signatures that are not a design language keep the old chain. */
const CLINIC_ENGINE_MOTION = Object.freeze({
  'calm-fade': { groupDelay: 80, staggerStep: 40 },
  'rise-stagger': { groupDelay: 160, staggerStep: 60 },
  cinematic: { groupDelay: 220, staggerStep: 80 },
} as const);

function clinicVariantMotionSignature(sectionId: string): ClinicVariantMotionSignature | undefined {
  const match = /-clinic-variant-motion-(static|calm-fade|rise-stagger|cinematic)$/u.exec(sectionId);
  return match?.[1] as ClinicVariantMotionSignature | undefined;
}

function clinicRevealAttributes(input: {
  signature?: ClinicVariantMotionSignature;
  group: 0 | 1;
  legacyKoMotion: boolean;
  itemIndex?: number;
}): Record<string, string> {
  if (input.signature) {
    if (input.signature === 'static') return {};
    const language = input.signature in CLINIC_LANGUAGE_MOTION
      ? CLINIC_LANGUAGE_MOTION[input.signature as keyof typeof CLINIC_LANGUAGE_MOTION]
      : null;
    const timing = language
      ?? CLINIC_ENGINE_MOTION[input.signature as keyof typeof CLINIC_ENGINE_MOTION];
    const baseDelay = input.group === 0 ? 0 : timing.groupDelay;
    /**
     * CONFORMANCE DEVIATION, deliberate and kept. MARQUEE's board staggers uncapped; the engine
     * bounds the index at 5, so a row of nine items runs 0..350ms and then holds at 350ms rather
     * than walking out to 560ms. The cap wins: it is the engine's existing guarantee that a long
     * grid cannot leave its last card invisible for most of a second, and it applies to every
     * signature rather than being special-cased away for one.
     *
     * A language may cap TIGHTER than the engine, and LEDGER does at 4 — its board says so, and a
     * bound below the engine's bound is still inside it.
     */
    const cap = Math.min(language?.itemCap ?? 5, 5);
    const delay = baseDelay + Math.min(input.itemIndex ?? 0, cap) * timing.staggerStep;
    return {
      'data-m': 'reveal',
      'data-m-delay': String(delay),
      'data-clinic-variant-reveal': input.itemIndex === undefined
        ? String(input.group)
        : `${input.group}-${input.itemIndex}`,
    };
  }
  return input.legacyKoMotion
    ? {
        'data-m': 'reveal',
        'data-m-delay': input.group === 0 ? '0' : '70',
        'data-ko-reveal-group': String(input.group),
      }
    : {};
}

export function ClinicFlowSection({
  section,
  theme,
  isFirst,
  interactive = true,
  siteId,
  pageHeading,
  hrefForPageSlug,
  locale = 'en-US',
  motionPlan,
  runtimeDelivery = 'client',
  designLanguage,
}: {
  section: Section;
  theme: SiteTheme;
  isFirst?: boolean;
  interactive?: boolean;
  siteId?: string;
  pageHeading?: string;
  hrefForPageSlug?: (slug: string) => string;
  locale?: 'en-US' | 'ko-KR';
  motionPlan?: MotionPlan;
  runtimeDelivery?: 'inline' | 'client';
  /** Read from the stored pin by the caller. Absent = the default language, unchanged. */
  designLanguage?: ClinicDesignLanguage;
}) {
  const projection = section.sectionLayout;
  const surface = clinicSurface(section, theme);
  /**
   * A section id naming a variant signature still wins — that path is the clinic-engine's and it
   * is explicit. Otherwise a design language supplies its own.
   */
  const variantMotionSignature = clinicVariantMotionSignature(section.id)
    ?? (designLanguage ? CLINIC_DESIGN_LANGUAGE_MOTION_SIGNATURE[designLanguage] : undefined);
  /**
   * The reveal these attributes drive is locale-neutral: runtime.ts styles
   * [data-m="reveal"] for any .anaks-site, and only the extra translate distance is scoped to
   * [data-ko-clinic]. Gating the attributes on ko-KR therefore left every US clinic demo with
   * the motion stylesheet and the runtime shipped but nothing marked to reveal — the page
   * carried zero data-m attributes and nothing could move.
   */
  const legacyKoMotion = !variantMotionSignature
    && Boolean(motionPlan)
    && motionPlan?.intensity !== 'off';
  const variantSectionAttributes = variantMotionSignature
    ? {
        'data-clinic-motion-signature': variantMotionSignature,
        ...(variantMotionSignature === 'cinematic' ? { 'data-m-progress': '' } : {}),
      }
    : {};
  const sourceBreadcrumbMetadata = section.elements.filter(
    (element): element is TextElement => (
      element.kind === 'text'
      && element.id.includes('-source-breadcrumb-metadata')
    ),
  );
  const sourceBreadcrumbMetadataIds = new Set(
    sourceBreadcrumbMetadata.map((element) => element.id),
  );
  const renderSourceBreadcrumbMetadata = sourceBreadcrumbMetadata.map((element) => (
    <span
      key={element.id}
      hidden
      data-ko-clinic-source-breadcrumb={element.id}
    >
      {element.text}
    </span>
  ));
  if (section.type === 'hero') {
    const heroTextZone = locale === 'ko-KR'
      ? clinicHeroTextZone(section)
      : undefined;
    const text = section.elements.filter(
      (element): element is TextElement => element.kind === 'text',
    );
    const articleAuthor = text.find((element) => (
      element.id.includes('-article-author') && !element.id.includes('-article-author-label')
    ));
    const articleAuthorLabel = text.find((element) => (
      element.id.includes('-article-author-label')
    ));
    const articleDate = text.find((element) => (
      element.id.endsWith('-article-date') || element.id.includes('-article-date-iso-')
    ));
    const articleDateLabel = text.find((element) => (
      element.id.includes('-article-date-label')
    ));
    const articleDateTime = articleDate?.id.match(
      /-article-date-iso-(\d{4}-\d{2}-\d{2})/u,
    )?.[1] ?? articleDate?.text;
    /**
     * The operator's licensed-imagery disclosure is not the practice's copy.
     *
     * `applyDentalStockToClinicMaster` appends it to the hero as an ordinary text element, and
     * every text element in this hero becomes a <p> in the copy block — so the sentence
     * "Licensed sample imagery · replaced with your practice photography", which is OUR note
     * about where WE got the picture, shipped as visible body copy in the practice's own voice,
     * directly under their opening line, on every stock-hero inner page.
     *
     * Matched on the compiler-owned element id rather than the text so nothing a practice happens
     * to write can be silently removed from its own page. It is lifted out here and handed to the
     * layout as a caption on the photograph.
     */
    const imageDisclosure = text.find(
      (element) => element.id.endsWith(CLINIC_STOCK_DISCLOSURE_ELEMENT_ID),
    );
    const contentText = text.filter(
      (element) => (
        element.id !== articleAuthor?.id
        && element.id !== articleAuthorLabel?.id
        && element.id !== articleDate?.id
        && element.id !== articleDateLabel?.id
        && element.id !== imageDisclosure?.id
      ),
    );
    const heading = (
      locale === 'ko-KR'
        ? contentText[0]?.text.trim()
        : pageHeading?.trim()
    ) || contentText[0]?.text.trim() || section.name;
    const compactKoDisplay = locale === 'ko-KR'
      && /[\uAC00-\uD7A3]/u.test(heading)
      && !/\s/u.test(heading)
      && [...heading].length >= 8;
    const sourceHeading = contentText[0]?.text.trim();
    const remainingText = sourceHeading === heading ? contentText.slice(1) : contentText;
    const heroId = section.heroLayout?.resolvedId ?? 'hero.source-flow';
    const heroCopy = (
      <div
        data-clinic-flow-hero-copy
        {...(locale === 'ko-KR'
          ? {
              'data-clinic-ko-hero-copy': '',
              ...(articleAuthor || articleDate
                ? { 'data-clinic-article-hero-copy': '' }
                : {}),
            }
          : {})}
      >
        <p
          data-clinic-hero-kicker
          data-font-role="body"
          data-clinic-tracking-role="eyebrow"
          style={{
            letterSpacing: resolveTypographyTracking({
              fontSizePx: 14,
              uppercase: true,
              role: 'eyebrow',
            }),
          }}
        >
          {section.name}{' '}
        </p>
        <h1
          data-font-role="heading"
          data-clinic-typography-tier="display"
          data-clinic-tracking-role="display"
          {...(compactKoDisplay ? { 'data-clinic-ko-long-token': '' } : {})}
          style={{
            letterSpacing: resolveTypographyTracking({
              fontSizePx: 88,
              uppercase: false,
              role: 'display',
            }),
          }}
        >
          {koHeadingBreakOpportunities(heading)}{' '}
        </h1>
        {remainingText.map((element) => (
          <p
            key={element.id}
            style={textStyle(element, theme)}
            {...fontRole(element, theme)}
          >
            {element.text}{' '}
          </p>
        ))}
        {articleAuthor || articleDate ? (
          <div data-clinic-article-evidence>
            {articleAuthor ? (
              <p data-clinic-article-byline>
                {articleAuthorLabel?.text ?? 'By'}{' '}
                <span itemProp="author">{articleAuthor.text}</span>
              </p>
            ) : null}
            {articleDate ? (
              <p data-clinic-article-date>
                <time dateTime={articleDateTime}>
                  {articleDateLabel?.text ?? 'Last updated'}{' '}
                  {articleDate.text}
                </time>
              </p>
            ) : null}
          </div>
        ) : null}
        <span
          aria-disabled="true"
          data-clinic-hero-cta
          data-font-role="body"
          data-clinic-tracking-role="button"
          style={{
            letterSpacing: resolveTypographyTracking({
              fontSizePx: 16,
              uppercase: false,
              role: 'button',
            }),
          }}
        >
          Book Appointment
        </span>
      </div>
    );

    /**
     * [D2] Gate on the stored field's presence only — never re-derive the mode here. Previews are
     * force-dynamic and re-render with the latest code, so a config compiled before this existed
     * (the outreach link already in a clinic's inbox) must keep taking the legacy path below.
     */
    if (section.clinicHeroLayout) {
      return (
        <ClinicHeroLayoutSection
          section={section}
          decision={section.clinicHeroLayout}
          heading={heading}
          isFirst={Boolean(isFirst)}
          {...(imageDisclosure ? { imageDisclosure: imageDisclosure.text } : {})}
          surfaceStyle={surface?.style}
          sectionAttributes={{
            ...(surface
              ? {
                  'data-section-surface-tone': surface.paint.resolvedTone,
                  'data-section-surface-enhanced': surface.paint.enhanced ? 'true' : 'false',
                }
              : {}),
            ...(variantSectionAttributes as Record<string, string>),
          }}
        >
          {heroCopy}
        </ClinicHeroLayoutSection>
      );
    }
    return (
      <section
        id={section.id}
        data-anchor={section.id}
        data-section-type={section.type}
        data-clinic-flow-section={heroId}
        data-clinic-archetype={heroId}
        {...variantSectionAttributes}
        {...(locale === 'ko-KR'
          ? {
              'data-clinic-hero-slider': 'reserved',
              'data-clinic-hero-slide-count': section.background.image ? '1' : '0',
            }
          : {})}
        {...(heroTextZone
          ? { 'data-clinic-hero-text-zone': heroTextZone.side }
          : {})}
        {...(surface
          ? {
              'data-section-surface-tone': surface.paint.resolvedTone,
              'data-section-surface-enhanced': surface.paint.enhanced ? 'true' : 'false',
            }
          : {})}
        aria-label={section.name}
        style={{
          ...surface?.style,
          ...(locale === 'ko-KR'
            ? {
                '--clinic-hero-overlay-opacity':
                  section.background.image?.overlayOpacity ?? 0.94,
                ...(heroTextZone
                  ? {
                      '--ko-hero-zone-x': `${heroTextZone.x * 100}%`,
                      '--ko-hero-zone-y': `${heroTextZone.y * 100}%`,
                      '--ko-hero-zone-width': `${heroTextZone.width * 100}%`,
                      '--ko-hero-zone-height': `${heroTextZone.height * 100}%`,
                    }
                  : {}),
              }
            : {}),
        } as CSSProperties}
      >
        <div data-clinic-flow-hero-media>
          {section.background.image ? (
            // The clinic source compiler only places prospect or pinned licensed imagery here.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={section.background.image.src}
              alt={locale === 'ko-KR' ? heading : `${heading} practice`}
              loading={isFirst ? 'eager' : 'lazy'}
              fetchPriority={isFirst ? 'high' : undefined}
              decoding="async"
              {...(variantMotionSignature === 'cinematic' ? { 'data-m': 'kenburns' } : {})}
            />
          ) : null}
          {heroCopy}
          {imageDisclosure ? (
            <p data-clinic-stock-disclosure data-clinic-stock-disclosure-anchored>
              {imageDisclosure.text}
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  if (!projection) {
    const text = section.elements.filter(
      (element): element is TextElement => element.kind === 'text',
    );
    const title = text.find((element) => element.text.trim() === section.name.trim());
    const content = text.filter((element) => element.id !== title?.id);
    const faqLike = section.type === 'faq'
      || section.id.includes('faq')
      || content.some((element) => /[?？]\s*$/u.test(element.text));
    return (
      <section
        id={section.id}
        data-anchor={section.id}
        data-section-type={section.type}
        data-clinic-flow-section={faqLike ? 'faq.compact' : `${section.type}.source-flow`}
        data-clinic-archetype={faqLike ? 'faq.compact' : `${section.type}.source-flow`}
        {...variantSectionAttributes}
        {...(surface
          ? {
              'data-section-surface-tone': surface.paint.resolvedTone,
              'data-section-surface-enhanced': surface.paint.enhanced ? 'true' : 'false',
            }
          : {})}
        aria-label={section.name}
        style={{
          ...(surface?.style ?? {
            backgroundColor: resolveThemePaint(
              theme,
              section.background.color,
              'backgroundSubtle',
            ),
          }),
          backgroundImage: section.background.gradient,
        }}
      >
        {renderSourceBreadcrumbMetadata}
        <div data-clinic-flow-inner>
          <h2
            {...clinicRevealAttributes({
              signature: variantMotionSignature,
              group: 0,
              legacyKoMotion,
            })}
            data-clinic-flow-heading
            data-font-role="heading"
            data-clinic-typography-tier="section"
            data-clinic-tracking-role="heading"
            style={{
              color: 'var(--clinic-section-text,var(--clinic-text))',
              letterSpacing: resolveTypographyTracking({
                fontSizePx: 52,
                uppercase: false,
                role: 'heading',
              }),
            }}
          >
            {koHeadingBreakOpportunities(section.name)}
          </h2>
          <div
            data-clinic-flow-items
            {...clinicRevealAttributes({
              signature: variantMotionSignature,
              group: 1,
              legacyKoMotion,
            })}
          >
            {faqLike ? content.map((element, index) => (
              /[?？]\s*$/u.test(element.text) ? (
                <article key={element.id} data-clinic-flow-item>
                  <FlowText element={element} theme={theme} role="heading" />
                  {content[index + 1] && !/[?？]\s*$/u.test(content[index + 1].text)
                    ? (
                        <FlowText
                          element={content[index + 1]}
                          theme={theme}
                          role="copy"
                        />
                      )
                    : null}
                </article>
              ) : (
                index === 0 || /[?？]\s*$/u.test(content[index - 1].text)
                  ? null
                  : (
                      <FlowText
                        key={element.id}
                        element={element}
                        theme={theme}
                        role="copy"
                      />
                    )
              )
            )) : (
              <article data-clinic-flow-item>
                {content.map((element, index) => (
                  <FlowText
                    key={element.id}
                    element={element}
                    theme={theme}
                    role={index === 0 ? 'heading' : 'copy'}
                  />
                ))}
              </article>
            )}
          </div>
        </div>
      </section>
    );
  }
  const visibleElements = section.elements.filter(
    (element) => !sourceBreadcrumbMetadataIds.has(element.id),
  );
  const elements = new Map(visibleElements.map((element) => [element.id, element]));
  const itemElementIds = new Set(projection.items.flatMap((item) => item.elementIds));
  const introElements = visibleElements.filter((element) => !itemElementIds.has(element.id));
  const introTitle = introElements.find((element) => element.kind === 'text');
  const introRemainder = introElements.filter((element) => element.id !== introTitle?.id);
  const sectionTitle = section.name.trim() || (
    introTitle?.kind === 'text' ? introTitle.text : 'Section'
  );
  const introNodes: ReactNode[] = [];
  if (
    introTitle?.kind === 'text'
    && introTitle.text.trim().toLocaleLowerCase('en-US')
      !== sectionTitle.toLocaleLowerCase('en-US')
  ) {
    introNodes.push(
      <FlowText key={introTitle.id} element={introTitle} theme={theme} role="intro" />,
    );
  }
  for (const element of introRemainder) {
    introNodes.push(
      <FlowElement
        key={element.id}
        element={element}
        theme={theme}
        isFirst={isFirst}
        interactive={interactive}
        siteId={siteId}
        hrefForPageSlug={hrefForPageSlug}
        runtimeDelivery={runtimeDelivery}
      />,
    );
  }
  const ItemsTag = projection.kind === 'features' ? 'ul' : 'div';
  const koProviderGrid = (
    locale === 'ko-KR'
    && section.id === 'ko-home-providers'
  );
  const itemGridStyle = projection.resolvedId === 'features.stat-strip'
    ? {
        '--clinic-flow-columns': Math.min(4, Math.max(2, projection.items.length)),
        margin: 0,
        padding: 0,
      } as CSSProperties
    : koProviderGrid
      ? {
          '--clinic-provider-columns': resolveBalancedClinicCardColumns(
            projection.items.length,
          ),
          margin: 0,
          padding: 0,
        } as CSSProperties
    : projection.kind === 'features'
      ? { margin: 0, padding: 0 }
      : undefined;
  const koProseArticle = (
    locale === 'ko-KR'
    && projection.resolvedId === 'features.prose-article'
  );
  return (
    <section
      id={section.id}
      data-anchor={section.id}
      data-section-type={section.type}
      data-clinic-flow-section={projection.resolvedId}
      data-clinic-archetype={projection.resolvedId}
      {...variantSectionAttributes}
      {...(koProviderGrid ? { 'data-clinic-provider-grid': '' } : {})}
      {...(surface
        ? {
            'data-section-surface-tone': surface.paint.resolvedTone,
            'data-section-surface-enhanced': surface.paint.enhanced ? 'true' : 'false',
          }
        : {})}
      aria-label={section.name}
      style={{
        ...(surface?.style ?? {
          backgroundColor: resolveThemePaint(
            theme,
            section.background.color,
            'backgroundSubtle',
          ),
        }),
        backgroundImage: section.background.gradient,
      }}
    >
      {renderSourceBreadcrumbMetadata}
      <div data-clinic-flow-inner>
        {!koProseArticle ? (
          <h2
            {...clinicRevealAttributes({
              signature: variantMotionSignature,
              group: 0,
              legacyKoMotion,
            })}
            data-clinic-flow-heading
            data-font-role="heading"
            data-clinic-typography-tier="section"
            data-clinic-tracking-role="heading"
            style={{
              color: 'var(--clinic-section-text,var(--clinic-text))',
              letterSpacing: resolveTypographyTracking({
                fontSizePx: 52,
                uppercase: false,
                role: 'heading',
              }),
            }}
          >
            {koHeadingBreakOpportunities(sectionTitle)}
          </h2>
        ) : null}
        {introNodes}
        <ItemsTag
          data-clinic-flow-items
          style={itemGridStyle}
          {...(!variantMotionSignature
            ? clinicRevealAttributes({ group: 1, legacyKoMotion })
            : {})}
        >
          {projection.items.map((item, itemIndex) => (
            <FlowItem
              key={item.id}
              elements={item.elementIds.flatMap((id) => {
                const element = elements.get(id);
                return element ? [element] : [];
              })}
              theme={theme}
              isFirst={Boolean(isFirst)}
              interactive={interactive}
              siteId={siteId}
              hrefForPageSlug={hrefForPageSlug}
              listItem={projection.kind === 'features'}
              variantId={projection.resolvedId}
              headingLevel={koProseArticle ? 2 : 3}
              providerCard={koProviderGrid}
              motionAttributes={variantMotionSignature
                ? clinicRevealAttributes({
                    signature: variantMotionSignature,
                    group: 1,
                    itemIndex,
                    legacyKoMotion: false,
                  })
                : undefined}
              runtimeDelivery={runtimeDelivery}
            />
          ))}
        </ItemsTag>
      </div>
    </section>
  );
}
