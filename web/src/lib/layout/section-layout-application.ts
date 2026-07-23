import type { CanvasElement, Section, SitePage, SiteTheme, TextElement } from '@/lib/types/site';
import { resolveAboutLayoutVariant } from './about-layout-resolver';
import { resolveFeatureLayoutVariant } from './feature-layout-resolver';
import { resolveGalleryLayoutVariant } from './gallery-layout-resolver';
import type {
  AboutLayoutContent,
  FeatureLayoutContent,
  GalleryLayoutContent,
  SectionLayoutSelection,
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

function galleryContent(section: Section): GalleryLayoutContent | null {
  const intro = introFor(section);
  if (!intro) return null;
  const media = section.elements.filter((element) => element.kind === 'image');
  if (media.length < 2 || media.length > 12) return null;
  const captions = section.elements.filter((element) => (
    element.kind === 'text' && /(?:caption|cap)/u.test(element.id)
  ));
  return {
    intro,
    items: media.map((element, index) => ({
      id: `gallery-${index + 1}`,
      mediaId: element.id,
      ...(captions[index] ? { captionId: captions[index].id } : {}),
    })),
  };
}

export function applySectionLayoutVariants({
  pages,
  theme,
  selection,
}: {
  pages: readonly SitePage[];
  theme: SiteTheme;
  selection: SectionLayoutSelection;
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
        const content = galleryContent(section);
        const projection = content
          ? resolveGalleryLayoutVariant({
              requestedId: selection.gallery,
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
