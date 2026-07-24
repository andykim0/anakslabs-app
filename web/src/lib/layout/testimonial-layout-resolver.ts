import type { CanvasElement, SiteTheme } from '@/lib/types/site';
import {
  buttonById,
  elementById,
  layoutFontSize,
  layoutSectionIntro,
  layoutSpacing,
  layoutTextHeight,
  putFrame,
  safeZoneFrame,
  textById,
} from './compiler-primitives';
import { testimonialLayoutById } from './testimonial-catalog';
import type {
  SectionLayoutBandProjection,
  SectionLayoutBreakpointBand,
  SectionLayoutCompiledFrame,
  SectionLayoutProjection,
  TestimonialLayoutContent,
  TestimonialLayoutItemBinding,
  TestimonialLayoutVariantId,
} from './section-layout-types';

const BANDS = ['wide', 'compact', 'mobile'] as const satisfies readonly SectionLayoutBreakpointBand[];

function resolvedTestimonialId(
  requestedId: TestimonialLayoutVariantId,
  content: TestimonialLayoutContent,
): TestimonialLayoutVariantId {
  if (requestedId === 'testimonial.card-grid' && content.items.length < 2) {
    return 'testimonial.single-quote';
  }
  if (requestedId === 'testimonial.quote-photo') {
    const first = content.items[0];
    if (!first?.photoConsentBound || !first.photoId) return 'testimonial.single-quote';
  }
  return requestedId;
}

function placeQuote({
  item,
  elements,
  theme,
  band,
  frames,
  fontSizes,
  x,
  y,
  width,
  inset = 0,
}: {
  item: TestimonialLayoutItemBinding;
  elements: readonly CanvasElement[];
  theme: SiteTheme;
  band: SectionLayoutBreakpointBand;
  frames: Record<string, SectionLayoutCompiledFrame>;
  fontSizes: Record<string, number>;
  x: number;
  y: number;
  width: number;
  inset?: number;
}): number {
  const spacing = layoutSpacing(theme, band);
  const innerWidth = width - inset * 2;
  let cursor = y + inset;
  const quote = textById(elements, item.quoteId);
  if (!quote) return cursor;
  const quoteSize = layoutFontSize(theme, band === 'mobile' ? 'lead' : 'title', band === 'mobile' ? 20 : 30);
  const quoteHeight = layoutTextHeight(
    quote.text,
    innerWidth,
    quoteSize,
    theme.tokens?.typography.lineHeight.heading ?? 1.45,
  );
  putFrame(frames, item.quoteId, x + inset, cursor, innerWidth, quoteHeight);
  fontSizes[item.quoteId] = quoteSize;
  cursor += quoteHeight;
  const source = textById(elements, item.sourceId);
  if (source && item.sourceId) {
    cursor += spacing.elementGap;
    const sourceSize = layoutFontSize(theme, 'caption', 14);
    const sourceHeight = layoutTextHeight(source.text, innerWidth, sourceSize, 1.55);
    putFrame(frames, item.sourceId, x + inset, cursor, innerWidth, sourceHeight);
    fontSizes[item.sourceId] = sourceSize;
    cursor += sourceHeight;
  }
  const sourceLink = buttonById(elements, item.sourceLinkId);
  if (sourceLink && item.sourceLinkId) {
    cursor += spacing.elementGap;
    putFrame(frames, item.sourceLinkId, x + inset, cursor, innerWidth, 42);
    cursor += 42;
  }
  return cursor + inset;
}

function introBottom({
  band,
  content,
  elements,
  theme,
  frames,
  fontSizes,
  x,
  y,
  width,
}: {
  band: SectionLayoutBreakpointBand;
  content: TestimonialLayoutContent;
  elements: readonly CanvasElement[];
  theme: SiteTheme;
  frames: Record<string, SectionLayoutCompiledFrame>;
  fontSizes: Record<string, number>;
  x: number;
  y: number;
  width: number;
}): number {
  if (!content.intro) return y;
  const intro = layoutSectionIntro({
    band,
    elements,
    theme,
    frames,
    ...content.intro,
    x,
    y,
    width,
  });
  Object.assign(fontSizes, intro.fontSizes);
  return intro.bottom;
}

function compileBand({
  band,
  resolvedId,
  elements,
  theme,
  content,
}: {
  band: SectionLayoutBreakpointBand;
  resolvedId: TestimonialLayoutVariantId;
  elements: readonly CanvasElement[];
  theme: SiteTheme;
  content: TestimonialLayoutContent;
}): SectionLayoutBandProjection {
  const recipe = testimonialLayoutById(resolvedId).bands[band];
  const zone = safeZoneFrame(band, recipe.textZone);
  const spacing = layoutSpacing(theme, band);
  const frames: Record<string, SectionLayoutCompiledFrame> = {};
  const fontSizes: Record<string, number> = {};
  const groupFrames: Record<string, SectionLayoutCompiledFrame> = {};
  const items = resolvedId === 'testimonial.card-grid'
    ? content.items.slice(0, 6)
    : content.items.slice(0, 1);
  const introWidth = zone.w * (band === 'mobile' ? 1 : 0.68);
  const introEnd = introBottom({
    band,
    content,
    elements,
    theme,
    frames,
    fontSizes,
    x: zone.x,
    y: zone.y,
    width: introWidth,
  });
  const start = introEnd + (content.intro ? spacing.elementGap * 2 : 0);

  if (resolvedId === 'testimonial.quote-photo') {
    const item = items[0];
    const photo = item?.photoId ? elementById(elements, item.photoId) : undefined;
    const stacked = band === 'mobile';
    const photoWidth = stacked ? zone.w : zone.w * (band === 'wide' ? 0.38 : 0.34);
    const photoHeight = photoWidth / (stacked ? 4 / 3 : 4 / 5);
    if (photo && item.photoId) {
      putFrame(frames, item.photoId, zone.x, start, photoWidth, photoHeight);
    }
    const quoteX = stacked ? zone.x : zone.x + zone.w * (band === 'wide' ? 0.5 : 0.43);
    const quoteY = stacked ? start + photoHeight + spacing.elementGap * 2 : start;
    const quoteWidth = stacked ? zone.w : zone.x + zone.w - quoteX;
    const quoteBottom = placeQuote({
      item,
      elements,
      theme,
      band,
      frames,
      fontSizes,
      x: quoteX,
      y: quoteY,
      width: quoteWidth,
    });
    return {
      width: band === 'wide' ? 1440 : band === 'compact' ? 768 : 390,
      sectionHeight: Math.ceil(Math.max(start + photoHeight, quoteBottom) + spacing.sectionBlock),
      frames,
      fontSizes,
      itemOrder: items.map((entry) => entry.id),
    };
  }

  if (resolvedId === 'testimonial.card-grid') {
    const columns = band === 'wide' ? (items.length === 2 || items.length === 4 ? 2 : 3) : band === 'compact' ? 2 : 1;
    const columnWidth = (zone.w - spacing.elementGap * (columns - 1)) / columns;
    let cursor = start;
    for (let rowStart = 0; rowStart < items.length; rowStart += columns) {
      const row = items.slice(rowStart, rowStart + columns);
      const offset = row.length < columns
        ? ((columns - row.length) * (columnWidth + spacing.elementGap)) / 2
        : 0;
      const bottoms = row.map((item, column) => placeQuote({
        item,
        elements,
        theme,
        band,
        frames,
        fontSizes,
        x: zone.x + offset + column * (columnWidth + spacing.elementGap),
        y: cursor,
        width: columnWidth,
        inset: spacing.sectionInline,
      }));
      const rowHeight = Math.max(...bottoms) - cursor;
      row.forEach((item, column) => {
        groupFrames[`testimonial-card-${item.id}`] = {
          x: zone.x + offset + column * (columnWidth + spacing.elementGap),
          y: cursor,
          w: columnWidth,
          h: rowHeight,
        };
      });
      cursor += rowHeight + spacing.elementGap;
    }
    return {
      width: band === 'wide' ? 1440 : band === 'compact' ? 768 : 390,
      sectionHeight: Math.ceil(cursor - spacing.elementGap + spacing.sectionBlock),
      frames,
      fontSizes,
      itemOrder: items.map((entry) => entry.id),
      groupFrames,
    };
  }

  const quoteWidth = zone.w * (band === 'wide' ? 0.82 : 1);
  const quoteX = zone.x + (zone.w - quoteWidth) / 2;
  const bottom = placeQuote({
    item: items[0],
    elements,
    theme,
    band,
    frames,
    fontSizes,
    x: quoteX,
    y: start,
    width: quoteWidth,
  });
  return {
    width: band === 'wide' ? 1440 : band === 'compact' ? 768 : 390,
    sectionHeight: Math.ceil(bottom + spacing.sectionBlock),
    frames,
    fontSizes,
    itemOrder: items.map((entry) => entry.id),
  };
}

export function resolveTestimonialLayoutVariant({
  requestedId,
  elements,
  theme,
  content,
}: {
  requestedId: TestimonialLayoutVariantId;
  elements: readonly CanvasElement[];
  theme: SiteTheme;
  content: TestimonialLayoutContent;
}): SectionLayoutProjection | null {
  if (content.items.length === 0 || !textById(elements, content.items[0].quoteId)) return null;
  const resolvedId = resolvedTestimonialId(requestedId, content);
  const selectedItems = resolvedId === 'testimonial.card-grid'
    ? content.items.slice(0, 6)
    : content.items.slice(0, 1);
  const bands = Object.fromEntries(BANDS.map((band) => [
    band,
    compileBand({ band, resolvedId, elements, theme, content }),
  ])) as SectionLayoutProjection['bands'];
  return {
    catalogVersion: 1,
    kind: 'testimonial',
    requestedId,
    resolvedId,
    mediaRole: resolvedId === 'testimonial.quote-photo' ? 'referential-figure' : 'none',
    enhancement: 'none',
    items: selectedItems.map((item) => ({
      id: item.id,
      elementIds: [item.quoteId, item.sourceId, item.sourceLinkId, item.photoId]
        .filter((id): id is string => Boolean(id)),
      ...(item.photoId ? { mediaElementId: item.photoId } : {}),
    })),
    ...(resolvedId === 'testimonial.card-grid'
      ? {
          groups: selectedItems.map((item) => ({
            id: `testimonial-card-${item.id}`,
            appearance: 'testimonial-card' as const,
            itemId: item.id,
          })),
        }
      : {}),
    bands,
  };
}
