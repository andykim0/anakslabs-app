import type { CSSProperties, ReactNode } from 'react';
import type {
  CanvasElement,
  Section,
  SiteTheme,
  TextElement,
} from '@/lib/types/site';
import { fontRoleForTextElement } from '@/lib/fonts/resources';
import {
  resolveSectionSurfaceTone,
  resolveThemePaint,
  type SectionSurfacePaint,
} from '@/lib/design/site-theme-tokens';
import {
  resolveTypographyTracking,
  type TypographyTrackingRole,
} from '@/lib/design/typography-tracking';
import { ElementContent } from './ElementContent';

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
  background: linear-gradient(90deg,rgba(255,255,255,.94),rgba(255,255,255,.72) 48%,rgba(255,255,255,.12));
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
[data-clinic-flow-hero-copy] p {
  max-width: 42rem;
  margin: 0;
  color: var(--clinic-section-text,var(--clinic-text));
  font-size: clamp(1.05rem,1.5vw,1.3rem);
  line-height: 1.7;
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
`;

function textStyle(
  element: TextElement,
  theme: SiteTheme,
  trackingRole: TypographyTrackingRole = 'body',
  uppercase = false,
  trackingFontSizePx = element.style.fontSize,
): CSSProperties {
  return {
    color: 'var(--clinic-section-text,var(--clinic-text))',
    fontFamily: element.style.fontFamily === 'heading'
      ? theme.fonts.heading
      : theme.fonts.body,
    fontWeight: element.style.fontWeight,
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

function fontRole(element: TextElement, theme: SiteTheme): Record<string, string> {
  const role = theme.fontPairing ? fontRoleForTextElement(element) : undefined;
  return role ? { 'data-font-role': role } : {};
}

function FlowText({
  element,
  theme,
  role,
}: {
  element: TextElement;
  theme: SiteTheme;
  role: 'intro' | 'heading' | 'display-heading' | 'copy' | 'marker' | 'stat-marker';
}) {
  const attributes = fontRole(element, theme);
  if (role === 'heading' || role === 'display-heading') {
    return (
      <h3
        data-clinic-flow-item-heading
        data-clinic-typography-tier={role === 'display-heading' ? 'display' : 'subhead'}
        data-clinic-tracking-role={role === 'display-heading' ? 'display' : 'heading'}
        style={textStyle(
          element,
          theme,
          role === 'display-heading' ? 'display' : 'heading',
          false,
          role === 'display-heading' ? 64 : 28,
        )}
        {...attributes}
      >
        {element.text}{' '}
      </h3>
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
}: {
  element: CanvasElement;
  theme: SiteTheme;
  isFirst?: boolean;
  interactive: boolean;
  siteId?: string;
  hrefForPageSlug?: (slug: string) => string;
  markerRole?: 'marker' | 'stat-marker';
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
}: {
  elements: CanvasElement[];
  theme: SiteTheme;
  isFirst?: boolean;
  interactive: boolean;
  siteId?: string;
  hrefForPageSlug?: (slug: string) => string;
  listItem?: boolean;
  variantId?: string;
}) {
  const heading = elements.find((element): element is TextElement => (
    element.kind === 'text' && !isMarker(element)
  ));
  const remainder = heading
    ? elements.filter((element) => element.id !== heading.id)
    : elements;
  const media = remainder.filter(
    (element) => element.kind === 'image' || element.kind === 'video',
  );
  const content = remainder.filter(
    (element) => element.kind !== 'image' && element.kind !== 'video',
  );
  const ItemTag = listItem ? 'li' : 'article';
  return (
    <ItemTag
      data-clinic-flow-item
      data-clinic-flow-has-media={media.length > 0 ? 'true' : 'false'}
      style={listItem ? { listStyle: 'none' } : undefined}
    >
      <div data-clinic-flow-item-copy>
        {heading?.kind === 'text' ? (
          <FlowText
            element={heading}
            theme={theme}
            role={variantId === 'features.dark-value-band'
              ? 'display-heading'
              : 'heading'}
          />
        ) : null}
        {content.map((element) => (
          <FlowElement
            key={element.id}
            element={element}
            theme={theme}
            isFirst={isFirst}
            interactive={interactive}
            siteId={siteId}
            hrefForPageSlug={hrefForPageSlug}
            markerRole={variantId === 'features.stat-strip' ? 'stat-marker' : 'marker'}
          />
        ))}
      </div>
      {media.map((element) => (
        <FlowElement
          key={element.id}
          element={element}
          theme={theme}
          isFirst={isFirst}
          interactive={interactive}
          siteId={siteId}
          hrefForPageSlug={hrefForPageSlug}
        />
      ))}
    </ItemTag>
  );
}

export function ClinicFlowSection({
  section,
  theme,
  isFirst,
  interactive = true,
  siteId,
  pageHeading,
  hrefForPageSlug,
}: {
  section: Section;
  theme: SiteTheme;
  isFirst?: boolean;
  interactive?: boolean;
  siteId?: string;
  pageHeading?: string;
  hrefForPageSlug?: (slug: string) => string;
}) {
  const projection = section.sectionLayout;
  const surface = clinicSurface(section, theme);
  if (section.type === 'hero') {
    const text = section.elements.filter(
      (element): element is TextElement => element.kind === 'text',
    );
    const articleAuthor = text.find((element) => element.id.includes('-article-author'));
    const articleDate = text.find((element) => element.id.endsWith('-article-date'));
    const contentText = text.filter(
      (element) => element.id !== articleAuthor?.id && element.id !== articleDate?.id,
    );
    const heading = pageHeading?.trim() || contentText[0]?.text.trim() || section.name;
    const sourceHeading = contentText[0]?.text.trim();
    const remainingText = sourceHeading === heading ? contentText.slice(1) : contentText;
    const heroId = section.heroLayout?.resolvedId ?? 'hero.source-flow';
    return (
      <section
        id={section.id}
        data-anchor={section.id}
        data-section-type={section.type}
        data-clinic-flow-section={heroId}
        data-clinic-archetype={heroId}
        {...(surface
          ? {
              'data-section-surface-tone': surface.paint.resolvedTone,
              'data-section-surface-enhanced': surface.paint.enhanced ? 'true' : 'false',
            }
          : {})}
        aria-label={section.name}
        style={surface?.style}
      >
        <div data-clinic-flow-hero-media>
          {section.background.image ? (
            // The clinic source compiler only places prospect or pinned licensed imagery here.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={section.background.image.src}
              alt={`${heading} practice`}
              loading={isFirst ? 'eager' : 'lazy'}
              fetchPriority={isFirst ? 'high' : undefined}
              decoding="async"
            />
          ) : null}
          <div data-clinic-flow-hero-copy>
            <p
              data-clinic-hero-kicker
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
              style={{
                letterSpacing: resolveTypographyTracking({
                  fontSizePx: 88,
                  uppercase: false,
                  role: 'display',
                }),
              }}
            >
              {heading}{' '}
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
            {articleAuthor && articleDate ? (
              <div data-clinic-article-evidence>
                <p data-clinic-article-byline>
                  By <span itemProp="author">{articleAuthor.text}</span>
                </p>
                <p data-clinic-article-date>
                  <time dateTime={articleDate.text}>
                    Last updated {articleDate.text}
                  </time>
                </p>
              </div>
            ) : null}
            <span
              aria-disabled="true"
              data-clinic-hero-cta
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
        <div data-clinic-flow-inner>
          <h2
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
            {section.name}
          </h2>
          <div data-clinic-flow-items>
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
  const elements = new Map(section.elements.map((element) => [element.id, element]));
  const itemElementIds = new Set(projection.items.flatMap((item) => item.elementIds));
  const introElements = section.elements.filter((element) => !itemElementIds.has(element.id));
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
      />,
    );
  }
  const ItemsTag = projection.kind === 'features' ? 'ul' : 'div';
  const itemGridStyle = projection.resolvedId === 'features.stat-strip'
    ? {
        '--clinic-flow-columns': Math.min(4, Math.max(2, projection.items.length)),
        margin: 0,
        padding: 0,
      } as CSSProperties
    : projection.kind === 'features'
      ? { margin: 0, padding: 0 }
      : undefined;

  return (
    <section
      id={section.id}
      data-anchor={section.id}
      data-section-type={section.type}
      data-clinic-flow-section={projection.resolvedId}
      data-clinic-archetype={projection.resolvedId}
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
      <div data-clinic-flow-inner>
        <h2
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
          {sectionTitle}
        </h2>
        {introNodes}
        <ItemsTag
          data-clinic-flow-items
          style={itemGridStyle}
        >
          {projection.items.map((item) => (
            <FlowItem
              key={item.id}
              elements={item.elementIds.flatMap((id) => {
                const element = elements.get(id);
                return element ? [element] : [];
              })}
              theme={theme}
              isFirst={isFirst}
              interactive={interactive}
              siteId={siteId}
              hrefForPageSlug={hrefForPageSlug}
              listItem={projection.kind === 'features'}
              variantId={projection.resolvedId}
            />
          ))}
        </ItemsTag>
      </div>
    </section>
  );
}
