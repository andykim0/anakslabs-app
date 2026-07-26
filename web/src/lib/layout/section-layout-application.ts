import type {
  ButtonElement,
  CanvasElement,
  Section,
  SiteConfig,
  SitePage,
  SiteTheme,
  TextElement,
} from '@/lib/types/site';
import type { AssetRef } from '@/lib/assets/provenance';
import { resolveAboutLayoutVariant } from './about-layout-resolver';
import { resolveCtaLayoutVariant } from './cta-layout-resolver';
import { resolveDirectionsLayoutVariant } from './directions-layout-resolver';
import { resolveFeatureLayoutVariant } from './feature-layout-resolver';
import { resolveGalleryLayoutVariant } from './gallery-layout-resolver';
import { resolveTestimonialLayoutVariant } from './testimonial-layout-resolver';
import type {
  AboutLayoutContent,
  CtaLayoutContent,
  DirectionsLayoutVariantId,
  DirectionsLayoutContent,
  FeatureLayoutContent,
  GalleryLayoutContent,
  GalleryLayoutVariantId,
  SectionLayoutSelection,
  TestimonialLayoutContent,
} from './section-layout-types';

function textElements(section: Section): TextElement[] {
  return section.elements
    .filter((element): element is TextElement => element.kind === 'text')
    .sort((left, right) => left.frame.y - right.frame.y || left.frame.x - right.frame.x);
}

function firstId(
  elements: readonly CanvasElement[],
  pattern: RegExp,
): string | undefined {
  return elements.find((element) => pattern.test(element.id))?.id;
}

function ids(
  elements: readonly CanvasElement[],
  pattern: RegExp,
): string[] {
  return elements.filter((element) => pattern.test(element.id)).map((element) => element.id);
}

function introFor(section: Section) {
  const text = textElements(section);
  const eyebrowId = firstId(text, /kicker/u);
  const explicitTitle = firstId(
    text,
    /main-(?:story|values|gallery-(?:teaser|full))-title/u,
  );
  const titleId = explicitTitle ?? text.find((element) => (
    element.id !== eyebrowId
    && element.style.fontFamily === 'heading'
  ))?.id;
  if (!titleId) return null;
  const leadId = firstId(
    text,
    /(?:main-(?:story|values)-lead|subtitle|gallery-(?:teaser|full)-description)/u,
  );
  const ctaId = firstId(section.elements, /(?:link|cta)/u);
  return {
    ...(eyebrowId ? { eyebrowId } : {}),
    titleId,
    ...(leadId ? { leadId } : {}),
    ...(ctaId ? { ctaId } : {}),
  };
}

function featureContent(section: Section): FeatureLayoutContent | null {
  const intro = introFor(section);
  if (!intro) return null;
  const markerIds = ids(section.elements, /(?:main-value-number|feat-num)/u);
  const titleIds = ids(section.elements, /(?:main-value-title|feat-title)/u)
    .filter((id) => id !== intro.titleId);
  const bodyIds = ids(section.elements, /(?:main-value-body|feat-desc)/u);
  const mediaIds = section.elements
    .filter((element) => element.kind === 'image')
    .map((element) => element.id);
  const count = titleIds.length;
  if (count < 2) return null;
  return {
    intro,
    items: Array.from({ length: count }, (_, index) => ({
      id: `feature-${index + 1}`,
      titleId: titleIds[index],
      ...(bodyIds[index] ? { bodyId: bodyIds[index] } : {}),
      ...(markerIds[index] ? { markerId: markerIds[index] } : {}),
      ...(mediaIds[index] ? { mediaId: mediaIds[index] } : {}),
    })),
  };
}

function aboutContent(section: Section): AboutLayoutContent | null {
  const intro = introFor(section);
  if (!intro) return null;
  const mediaId = section.elements.find((element) => element.kind === 'image')?.id;
  const statementId = firstId(section.elements, /(?:main-story-lead|about-point)/u);
  const bodyIds = ids(section.elements, /(?:main-story-body|about-body)/u);
  const factIds = ids(section.elements, /(?:fact|proof)/u);
  if (!statementId && bodyIds.length + factIds.length === 0) return null;
  return {
    intro: {
      ...intro,
      // A statement is choreography content, not a duplicated intro lead.
      ...(statementId && intro.leadId === statementId ? { leadId: undefined } : {}),
    },
    about: {
      id: 'about-1',
      ...(statementId ? { statementId } : {}),
      bodyIds,
      factIds,
      ...(mediaId ? { mediaId } : {}),
    },
  };
}

function galleryContent(
  section: Section,
  assetRefs: readonly AssetRef[] | undefined,
): GalleryLayoutContent | null {
  const intro = introFor(section);
  if (!intro) return null;
  const media = section.elements.filter((element) => element.kind === 'image');
  if (media.length < 2 || media.length > 12) return null;
  const captions = section.elements.filter((element) => (
    element.kind === 'text' && /(?:caption|cap)/u.test(element.id)
  ));
  return {
    intro,
    items: media.map((element, index) => {
      const ref = assetRefs?.find((candidate) => candidate.url === element.src);
      return {
        id: `gallery-${index + 1}`,
        mediaId: element.id,
        ...(captions[index] ? { captionId: captions[index].id } : {}),
        ...(ref?.width && ref.height
          ? { sourceWidth: ref.width, sourceHeight: ref.height }
          : {}),
      };
    }),
  };
}

function buttonElements(section: Section): ButtonElement[] {
  return section.elements.filter(
    (element): element is ButtonElement => element.kind === 'button',
  );
}

function ctaContent(section: Section): CtaLayoutContent | null {
  // cta:links는 링크 허브이며 일반 CTA 변형의 대상이 아니다.
  const primary = buttonElements(section).find((element) => /plan-cta-primary/u.test(element.id));
  const intro = introFor(section);
  if (!intro || !primary) return null;
  const secondary = buttonElements(section).find((element) => (
    element.id !== primary.id && /cta-(?:secondary|action)/u.test(element.id)
  ));
  return {
    intro,
    primaryActionId: primary.id,
    ...(secondary ? { secondaryActionId: secondary.id } : {}),
  };
}

function testimonialContent(section: Section): TestimonialLayoutContent | null {
  const quotes = section.elements.filter(
    (element): element is TextElement => (
      element.kind === 'text' && /testimonial-quote/u.test(element.id)
    ),
  );
  if (quotes.length === 0) return null;
  const sources = section.elements.filter(
    (element): element is TextElement => (
      element.kind === 'text' && /testimonial-source-\d+/u.test(element.id)
    ),
  );
  const sourceLinks = buttonElements(section).filter((element) => (
    /testimonial-source-link/u.test(element.id)
  ));
  const intro = introFor(section);
  return {
    ...(intro ? { intro } : {}),
    items: quotes.map((quote, index) => ({
      id: `testimonial-${index + 1}`,
      quoteId: quote.id,
      ...(sources[index] ? { sourceId: sources[index].id } : {}),
      ...(sourceLinks[index] ? { sourceLinkId: sourceLinks[index].id } : {}),
      // No proof↔person-photo consent contract exists yet; quote-photo must resolve down.
      photoConsentBound: false,
    })),
  };
}

function directionsContent(section: Section): DirectionsLayoutContent | null {
  const labels = section.elements.filter(
    (element): element is TextElement => (
      element.kind === 'text' && /directions-(?:teaser-)?label/u.test(element.id)
    ),
  );
  const values = section.elements.filter(
    (element): element is TextElement => (
      element.kind === 'text' && /directions-(?:teaser-)?value/u.test(element.id)
    ),
  );
  if (labels.length === 0 || labels.length !== values.length) return null;
  const map = section.elements.find((element) => element.kind === 'map');
  const placeLink = buttonElements(section).find((element) => (
    /directions-place-link/u.test(element.id)
  ));
  const detailLink = buttonElements(section).find((element) => (
    /directions-teaser-link/u.test(element.id)
  ));
  const intro = introFor(section);
  return {
    ...(intro ? { intro } : {}),
    mode: section.id.includes('teaser') ? 'teaser' : 'full',
    rows: labels.map((label, index) => ({
      id: `direction-${index + 1}`,
      labelId: label.id,
      valueId: values[index].id,
    })),
    ...(map ? { mapId: map.id } : {}),
    ...(placeLink ? { placeLinkId: placeLink.id } : {}),
    ...(detailLink ? { detailLinkId: detailLink.id } : {}),
  };
}

export function applySectionLayoutVariants({
  pages,
  theme,
  selection,
  assetRefs,
}: {
  pages: readonly SitePage[];
  theme: SiteTheme;
  selection: SectionLayoutSelection;
  assetRefs?: readonly AssetRef[];
}): void {
  for (const page of pages) {
    for (const section of page.sections) {
      if (section.type === 'features' && selection.features) {
        const content = featureContent(section);
        const projection = content
          ? resolveFeatureLayoutVariant({
              requestedId: selection.features,
              elements: section.elements,
              theme,
              content,
            })
          : null;
        if (projection) section.sectionLayout = projection;
      } else if (section.type === 'about' && selection.about) {
        const content = aboutContent(section);
        const projection = content
          ? resolveAboutLayoutVariant({
              requestedId: selection.about,
              elements: section.elements,
              theme,
              content,
              availableMedia: {
                // MAIN/SitePlan about media is customer-provided when present.
                referential: Boolean(content.about.mediaId),
                atmospheric: true,
              },
            })
          : null;
        if (projection) section.sectionLayout = projection;
      } else if (section.type === 'gallery' && selection.gallery) {
        const content = galleryContent(section, assetRefs);
        const projection = content
          ? resolveGalleryLayoutVariant({
              requestedId: selection.gallery,
              elements: section.elements,
              theme,
              content,
            })
          : null;
        if (projection) section.sectionLayout = projection;
      } else if (section.type === 'cta' && selection.cta) {
        const content = ctaContent(section);
        const projection = content
          ? resolveCtaLayoutVariant({
              requestedId: selection.cta,
              elements: section.elements,
              theme,
              content,
            })
          : null;
        if (projection) section.sectionLayout = projection;
      } else if (section.type === 'testimonials' && selection.testimonial) {
        const content = testimonialContent(section);
        const projection = content
          ? resolveTestimonialLayoutVariant({
              requestedId: selection.testimonial,
              elements: section.elements,
              theme,
              content,
            })
          : null;
        if (projection) section.sectionLayout = projection;
      } else if (
        section.type === 'contact'
        && section.id.includes('directions')
        && selection.directions
      ) {
        const content = directionsContent(section);
        const projection = content
          ? resolveDirectionsLayoutVariant({
              requestedId: selection.directions,
              elements: section.elements,
              theme,
              content,
            })
          : null;
        if (projection) section.sectionLayout = projection;
      }
    }
  }
}

/**
 * extras가 MapElement를 주입한 뒤 directions projection만 다시 컴파일한다.
 * 저장된 requestedId는 바꾸지 않으며 URL 추정·geocode를 하지 않는다.
 */
export function recompileDirectionsSectionLayouts(input: SiteConfig): SiteConfig {
  const config = structuredClone(input);
  for (const page of config.pages) {
    for (const section of page.sections) {
      const projection = section.sectionLayout;
      if (projection?.kind !== 'directions') continue;
      const content = directionsContent(section);
      if (!content) continue;
      const next = resolveDirectionsLayoutVariant({
        requestedId: projection.requestedId as DirectionsLayoutVariantId,
        elements: section.elements,
        theme: config.theme,
        content,
      });
      if (next) section.sectionLayout = next;
    }
  }
  return config;
}

/**
 * Upload registration adds immutable raster dimensions after the initial
 * content build. Recompile only existing gallery projections so masonry can
 * consume those server-owned dimensions without inventing a gallery or
 * changing its requested layout.
 */
export function recompileGallerySectionLayouts(input: SiteConfig): SiteConfig {
  const config = structuredClone(input);
  for (const page of config.pages) {
    for (const section of page.sections) {
      const projection = section.sectionLayout;
      if (projection?.kind !== 'gallery') continue;
      const content = galleryContent(section, config.assetRefs);
      if (!content) continue;
      const next = resolveGalleryLayoutVariant({
        requestedId: projection.requestedId as GalleryLayoutVariantId,
        elements: section.elements,
        theme: config.theme,
        content,
      });
      if (next) section.sectionLayout = next;
    }
  }
  return config;
}
