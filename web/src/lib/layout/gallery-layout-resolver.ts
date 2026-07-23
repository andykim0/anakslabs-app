import type { CanvasElement, SiteTheme } from '@/lib/types/site';
import {
  clampLayoutFocalPoint,
  layoutFontSize,
  layoutSectionIntro,
  layoutSpacing,
  layoutTextHeight,
  putFrame,
  safeZoneFrame,
  textById,
} from './compiler-primitives';
import { galleryLayoutById } from './gallery-catalog';
import type {
  GalleryLayoutContent,
  GalleryLayoutItemBinding,
  GalleryLayoutVariantId,
  GalleryOrientation,
  SectionLayoutBandProjection,
  SectionLayoutBreakpointBand,
  SectionLayoutProjection,
} from './section-layout-types';

const BANDS = ['wide', 'compact', 'mobile'] as const satisfies readonly SectionLayoutBreakpointBand[];

export function galleryOrientation(
  item: Pick<GalleryLayoutItemBinding, 'sourceWidth' | 'sourceHeight'>,
): GalleryOrientation {
  if (!item.sourceWidth || !item.sourceHeight) return 'square';
  const ratio = item.sourceWidth / item.sourceHeight;
  if (ratio <= 0.8) return 'portrait';
  if (ratio >= 1.25) return 'landscape';
  return 'square';
}

function orientationRatio(orientation: GalleryOrientation): number {
  if (orientation === 'portrait') return 3 / 4;
  if (orientation === 'landscape') return 4 / 3;
  return 1;
}

function captionHeight({
  item,
  elements,
  theme,
  width,
}: {
  item: GalleryLayoutItemBinding;
  elements: readonly CanvasElement[];
  theme: SiteTheme;
  width: number;
}): { height: number; size: number } {
  const caption = textById(elements, item.captionId);
  const size = layoutFontSize(theme, 'caption', 14);
  return {
    height: caption
      ? layoutTextHeight(caption.text, width, size, theme.tokens?.typography.lineHeight.body ?? 1.55)
      : 0,
    size,
  };
}

function placeFigure({
  item,
  elements,
  theme,
  band,
  frames,
  fontSizes,
  x,
  y,
  width,
  ratio,
}: {
  item: GalleryLayoutItemBinding;
  elements: readonly CanvasElement[];
  theme: SiteTheme;
  band: SectionLayoutBreakpointBand;
  frames: Record<string, { x: number; y: number; w: number; h: number }>;
  fontSizes: Record<string, number>;
  x: number;
  y: number;
  width: number;
  ratio: number;
}): number {
  const spacing = layoutSpacing(theme, band);
  const mediaHeight = width / ratio;
  putFrame(frames, item.mediaId, x, y, width, mediaHeight);
  const caption = captionHeight({ item, elements, theme, width });
  if (item.captionId && caption.height > 0) {
    putFrame(
      frames,
      item.captionId,
      x,
      y + mediaHeight + spacing.elementGap,
      width,
      caption.height,
    );
    fontSizes[item.captionId] = caption.size;
  }
  return mediaHeight + (caption.height > 0 ? spacing.elementGap + caption.height : 0);
}

function uniformColumns(
  band: SectionLayoutBreakpointBand,
  itemCount: number,
  longCaption: boolean,
): number {
  if (band === 'wide') return itemCount === 2 ? 2 : 3;
  if (band === 'mobile' && longCaption) return 1;
  return 2;
}

function compileUniformBand({
  band,
  elements,
  theme,
  content,
}: {
  band: SectionLayoutBreakpointBand;
  elements: readonly CanvasElement[];
  theme: SiteTheme;
  content: GalleryLayoutContent;
}): SectionLayoutBandProjection {
  const zone = safeZoneFrame(band, 'flow-full');
  const spacing = layoutSpacing(theme, band);
  const frames: Record<string, { x: number; y: number; w: number; h: number }> = {};
  const fontSizes: Record<string, number> = {};
  const intro = layoutSectionIntro({
    band,
    elements,
    theme,
    frames,
    ...content.intro,
    x: zone.x,
    y: zone.y,
    width: zone.w * (band === 'mobile' ? 1 : 0.68),
  });
  Object.assign(fontSizes, intro.fontSizes);
  const captionProbeWidth = band === 'mobile'
    ? (zone.w - spacing.elementGap) / 2
    : zone.w / (band === 'wide' ? 3 : 2);
  const longCaption = band === 'mobile' && content.items.some((item) => {
    const caption = textById(elements, item.captionId);
    if (!caption) return false;
    const size = layoutFontSize(theme, 'caption', 14);
    return layoutTextHeight(caption.text, captionProbeWidth, size, 1.55) >= size * 1.55 * 3;
  });
  const columns = uniformColumns(band, content.items.length, longCaption);
  const columnWidth = (zone.w - spacing.elementGap * (columns - 1)) / columns;
  const ratio = band === 'mobile' ? 1 : 4 / 3;
  let cursor = intro.bottom + spacing.elementGap * 2;
  for (let rowStart = 0; rowStart < content.items.length; rowStart += columns) {
    const row = content.items.slice(rowStart, rowStart + columns);
    const rowOffset = row.length < columns
      ? ((columns - row.length) * (columnWidth + spacing.elementGap)) / 2
      : 0;
    const heights = row.map((item, column) => placeFigure({
      item,
      elements,
      theme,
      band,
      frames,
      fontSizes,
      x: zone.x + rowOffset + column * (columnWidth + spacing.elementGap),
      y: cursor,
      width: columnWidth,
      ratio,
    }));
    cursor += Math.max(...heights) + spacing.elementGap;
  }
  return {
    width: band === 'wide' ? 1440 : band === 'compact' ? 768 : 390,
    sectionHeight: Math.ceil(cursor - spacing.elementGap + spacing.sectionBlock),
    frames,
    fontSizes,
    itemOrder: content.items.map((item) => item.id),
  };
}

function compileBand({
  band,
  resolvedId,
  elements,
  theme,
  content,
}: {
  band: SectionLayoutBreakpointBand;
  resolvedId: GalleryLayoutVariantId;
  elements: readonly CanvasElement[];
  theme: SiteTheme;
  content: GalleryLayoutContent;
}): SectionLayoutBandProjection {
  if (resolvedId === 'gallery.uniform-grid') {
    return compileUniformBand({ band, elements, theme, content });
  }
  const zone = safeZoneFrame(band, 'flow-full');
  const spacing = layoutSpacing(theme, band);
  const frames: Record<string, { x: number; y: number; w: number; h: number }> = {};
  const fontSizes: Record<string, number> = {};
  const intro = layoutSectionIntro({
    band,
    elements,
    theme,
    frames,
    ...content.intro,
    x: zone.x,
    y: zone.y,
    width: zone.w * (band === 'mobile' ? 1 : 0.68),
  });
  Object.assign(fontSizes, intro.fontSizes);
  const start = intro.bottom + spacing.elementGap * 2;

  if (resolvedId === 'gallery.masonry') {
    let columns = band === 'wide' ? 3 : 2;
    if (band === 'mobile' && content.items.length === 2) columns = 1;
    if (content.items.length === 2 && band !== 'mobile') columns = 2;
    const columnWidth = (zone.w - spacing.elementGap * (columns - 1)) / columns;
    const usedWidth = columnWidth * columns + spacing.elementGap * (columns - 1);
    const startX = zone.x + (zone.w - usedWidth) / 2;
    const bottoms = Array.from({ length: columns }, () => start);
    for (const item of content.items) {
      const shortest = bottoms.reduce(
        (best, value, index) => value < bottoms[best] ? index : best,
        0,
      );
      const height = placeFigure({
        item,
        elements,
        theme,
        band,
        frames,
        fontSizes,
        x: startX + shortest * (columnWidth + spacing.elementGap),
        y: bottoms[shortest],
        width: columnWidth,
        ratio: orientationRatio(galleryOrientation(item)),
      });
      bottoms[shortest] += height + spacing.elementGap;
    }
    return {
      width: band === 'wide' ? 1440 : band === 'compact' ? 768 : 390,
      sectionHeight: Math.ceil(Math.max(...bottoms) - spacing.elementGap + spacing.sectionBlock),
      frames,
      fontSizes,
      itemOrder: content.items.map((item) => item.id),
    };
  }

  if (resolvedId === 'gallery.carousel') {
    const currentWidth = zone.w * (band === 'mobile' ? 0.92 : band === 'compact' ? 0.86 : 0.76);
    const ratio = band === 'mobile' ? 4 / 3 : 16 / 9;
    const heights = content.items.map((item) => placeFigure({
      item,
      elements,
      theme,
      band,
      frames,
      fontSizes,
      x: zone.x,
      y: start,
      width: currentWidth,
      ratio,
    }));
    return {
      width: band === 'wide' ? 1440 : band === 'compact' ? 768 : 390,
      sectionHeight: Math.ceil(start + Math.max(...heights) + spacing.sectionBlock),
      frames,
      fontSizes,
      itemOrder: content.items.map((item) => item.id),
    };
  }

  if (band === 'mobile') {
    const ratio = 4 / 3;
    let cursor = start;
    for (const item of content.items) {
      cursor += placeFigure({
        item,
        elements,
        theme,
        band,
        frames,
        fontSizes,
        x: zone.x,
        y: cursor,
        width: zone.w,
        ratio,
      }) + spacing.elementGap;
    }
    return {
      width: 390,
      sectionHeight: Math.ceil(cursor - spacing.elementGap + spacing.sectionBlock),
      frames,
      fontSizes,
      itemOrder: content.items.map((item) => item.id),
    };
  }

  let cursor = start;
  for (let groupStart = 0; groupStart < content.items.length; groupStart += 3) {
    const group = content.items.slice(groupStart, groupStart + 3);
    if (group.length < 3) {
      const columns = group.length;
      const width = (zone.w - spacing.elementGap * (columns - 1)) / columns;
      const heights = group.map((item, index) => placeFigure({
        item,
        elements,
        theme,
        band,
        frames,
        fontSizes,
        x: zone.x + index * (width + spacing.elementGap),
        y: cursor,
        width,
        ratio: 4 / 3,
      }));
      cursor += Math.max(...heights) + spacing.elementGap;
      continue;
    }
    const majorWidth = zone.w * 0.66;
    const minorWidth = zone.w - majorWidth - spacing.elementGap;
    const majorHeight = placeFigure({
      item: group[0],
      elements,
      theme,
      band,
      frames,
      fontSizes,
      x: zone.x,
      y: cursor,
      width: majorWidth,
      ratio: 4 / 3,
    });
    let minorCursor = cursor;
    for (const item of group.slice(1)) {
      minorCursor += placeFigure({
        item,
        elements,
        theme,
        band,
        frames,
        fontSizes,
        x: zone.x + majorWidth + spacing.elementGap,
        y: minorCursor,
        width: minorWidth,
        ratio: 4 / 3,
      }) + spacing.elementGap;
    }
    cursor += Math.max(majorHeight, minorCursor - cursor - spacing.elementGap) + spacing.elementGap;
  }
  return {
    width: band === 'wide' ? 1440 : 768,
    sectionHeight: Math.ceil(cursor - spacing.elementGap + spacing.sectionBlock),
    frames,
    fontSizes,
    itemOrder: content.items.map((item) => item.id),
  };
}

export function resolveGalleryLayoutVariant({
  requestedId,
  elements,
  theme,
  content,
}: {
  requestedId: GalleryLayoutVariantId;
  elements: readonly CanvasElement[];
  theme: SiteTheme;
  content: GalleryLayoutContent;
}): SectionLayoutProjection | null {
  const variant = galleryLayoutById(requestedId);
  if (
    content.items.length < variant.content.minimumItems
    || content.items.length > variant.content.maximumItems
  ) return null;
  const bands = Object.fromEntries(BANDS.map((band) => [
    band,
    compileBand({ band, resolvedId: requestedId, elements, theme, content }),
  ])) as SectionLayoutProjection['bands'];
  const fallbackBands = requestedId === 'gallery.carousel'
    ? Object.fromEntries(BANDS.map((band) => [
        band,
        compileUniformBand({ band, elements, theme, content }),
      ])) as SectionLayoutProjection['bands']
    : undefined;
  return {
    catalogVersion: 1,
    kind: 'gallery',
    requestedId,
    resolvedId: requestedId,
    mediaRole: 'referential-figure',
    enhancement: requestedId === 'gallery.carousel' ? 'carousel' : 'none',
    ...('staticFallbackId' in variant && variant.staticFallbackId
      ? { staticFallbackId: variant.staticFallbackId }
      : {}),
    items: content.items.map((item) => ({
      id: item.id,
      elementIds: [item.mediaId, item.captionId].filter((id): id is string => Boolean(id)),
      mediaElementId: item.mediaId,
      orientation: galleryOrientation(item),
      focalPoint: clampLayoutFocalPoint(item.focalPoint),
    })),
    bands,
    ...(fallbackBands ? { fallbackBands } : {}),
  };
}
