import type { CanvasElement, SiteTheme } from '@/lib/types/site';
import {
  buttonById,
  elementById,
  layoutAspectRatio,
  layoutFontSize,
  layoutSectionIntro,
  layoutSpacing,
  layoutTextHeight,
  putFrame,
  safeZoneFrame,
  textById,
} from './compiler-primitives';
import { featureLayoutById } from './feature-catalog';
import type {
  FeatureLayoutContent,
  FeatureLayoutItemBinding,
  FeatureLayoutVariantId,
  SectionLayoutBandProjection,
  SectionLayoutBreakpointBand,
  SectionLayoutCompiledFrame,
  SectionLayoutProjection,
} from './section-layout-types';

const BANDS = ['wide', 'compact', 'mobile'] as const satisfies readonly SectionLayoutBreakpointBand[];

interface LocalItemLayout {
  height: number;
  frames: Record<string, SectionLayoutCompiledFrame>;
  fontSizes: Record<string, number>;
}

function verticalItem({
  item,
  elements,
  theme,
  band,
  width,
  mediaAspect,
  mediaFirst,
  padded,
}: {
  item: FeatureLayoutItemBinding;
  elements: readonly CanvasElement[];
  theme: SiteTheme;
  band: SectionLayoutBreakpointBand;
  width: number;
  mediaAspect?: string;
  mediaFirst: boolean;
  padded: boolean;
}): LocalItemLayout {
  const spacing = layoutSpacing(theme, band);
  const inset = padded ? spacing.sectionInline : 0;
  const innerWidth = Math.max(40, width - inset * 2);
  const frames: Record<string, SectionLayoutCompiledFrame> = {};
  const fontSizes: Record<string, number> = {};
  let cursor = inset;
  const media = elementById(elements, item.mediaId);
  const addMedia = () => {
    if (!media || !item.mediaId) return;
    const height = innerWidth / layoutAspectRatio(mediaAspect);
    putFrame(frames, item.mediaId, inset, cursor, innerWidth, height);
    cursor += height + spacing.elementGap;
  };
  if (mediaFirst) addMedia();
  const marker = textById(elements, item.markerId);
  if (marker && item.markerId) {
    const size = layoutFontSize(theme, 'caption', 14);
    const height = layoutTextHeight(marker.text, innerWidth, size, 1.4);
    putFrame(frames, item.markerId, inset, cursor, innerWidth, height);
    fontSizes[item.markerId] = size;
    cursor += height + spacing.elementGap;
  }
  const title = textById(elements, item.titleId);
  if (title) {
    const size = layoutFontSize(theme, 'lead', band === 'mobile' ? 19 : 22);
    const height = layoutTextHeight(
      title.text,
      innerWidth,
      size,
      theme.tokens?.typography.lineHeight.heading ?? 1.3,
    );
    putFrame(frames, item.titleId, inset, cursor, innerWidth, height);
    fontSizes[item.titleId] = size;
    cursor += height;
  }
  const body = textById(elements, item.bodyId);
  if (body && item.bodyId) {
    cursor += spacing.elementGap;
    const size = layoutFontSize(theme, 'body', 16);
    const height = layoutTextHeight(
      body.text,
      innerWidth,
      size,
      theme.tokens?.typography.lineHeight.body ?? 1.65,
    );
    putFrame(frames, item.bodyId, inset, cursor, innerWidth, height);
    fontSizes[item.bodyId] = size;
    cursor += height;
  }
  const cta = buttonById(elements, item.ctaId);
  if (cta && item.ctaId) {
    cursor += spacing.elementGap;
    const height = band === 'mobile' ? 48 : 46;
    putFrame(frames, item.ctaId, inset, cursor, innerWidth, height);
    cursor += height;
  }
  if (!mediaFirst) addMedia();
  if (cursor > inset && !mediaFirst && media) cursor -= spacing.elementGap;
  return { height: cursor + inset, frames, fontSizes };
}

function mergeLocal(
  targetFrames: Record<string, SectionLayoutCompiledFrame>,
  targetFontSizes: Record<string, number>,
  local: LocalItemLayout,
  x: number,
  y: number,
): void {
  for (const [id, frame] of Object.entries(local.frames)) {
    putFrame(targetFrames, id, x + frame.x, y + frame.y, frame.w, frame.h);
  }
  Object.assign(targetFontSizes, local.fontSizes);
}

function compileBand({
  band,
  requestedId,
  elements,
  theme,
  content,
}: {
  band: SectionLayoutBreakpointBand;
  requestedId: FeatureLayoutVariantId;
  elements: readonly CanvasElement[];
  theme: SiteTheme;
  content: FeatureLayoutContent;
}): SectionLayoutBandProjection {
  const variant = featureLayoutById(requestedId);
  const recipe = variant.bands[band];
  const spacing = layoutSpacing(theme, band);
  const zone = safeZoneFrame(band, recipe.textZone);
  const frames: Record<string, SectionLayoutCompiledFrame> = {};
  const fontSizes: Record<string, number> = {};
  const introWidth = recipe.flow === 'sticky-heading'
    ? zone.w * (band === 'mobile' ? 1 : 0.36)
    : zone.w * (band === 'mobile' ? 1 : 0.68);
  const intro = layoutSectionIntro({
    band,
    elements,
    theme,
    frames,
    ...content.intro,
    x: zone.x,
    y: zone.y,
    width: introWidth,
  });
  Object.assign(fontSizes, intro.fontSizes);
  const itemStart = intro.bottom + spacing.elementGap * 2;
  const itemOrder = content.items.map((item) => item.id);

  if (recipe.flow === 'alternating-media') {
    let cursor = itemStart;
    for (const [index, item] of content.items.entries()) {
      const media = elementById(elements, item.mediaId);
      const stacked = band === 'mobile' || !media;
      const halfWidth = (zone.w - spacing.elementGap) / 2;
      const textWidth = stacked ? zone.w : halfWidth;
      const local = verticalItem({
        item: { ...item, mediaId: stacked ? item.mediaId : undefined },
        elements,
        theme,
        band,
        width: textWidth,
        mediaAspect: recipe.mediaAspect,
        mediaFirst: false,
        padded: false,
      });
      const mediaWidth = stacked ? 0 : halfWidth;
      const mediaHeight = mediaWidth / layoutAspectRatio(recipe.mediaAspect);
      const rowHeight = Math.max(local.height, mediaHeight);
      const textX = !stacked && index % 2 === 1 ? zone.x + halfWidth + spacing.elementGap : zone.x;
      mergeLocal(frames, fontSizes, local, textX, cursor);
      if (!stacked && media && item.mediaId) {
        const mediaX = index % 2 === 1 ? zone.x : zone.x + halfWidth + spacing.elementGap;
        putFrame(frames, item.mediaId, mediaX, cursor, mediaWidth, mediaHeight);
      }
      cursor += rowHeight + spacing.elementGap * 2;
    }
    return {
      width: band === 'wide' ? 1440 : band === 'compact' ? 768 : 390,
      sectionHeight: Math.ceil(cursor - spacing.elementGap * 2 + spacing.sectionBlock),
      frames,
      fontSizes,
      itemOrder,
    };
  }

  if (recipe.flow === 'numbered-rows') {
    let cursor = itemStart;
    for (const item of content.items) {
      if (band === 'mobile') {
        const local = verticalItem({
          item,
          elements,
          theme,
          band,
          width: zone.w,
          mediaFirst: true,
          padded: false,
        });
        mergeLocal(frames, fontSizes, local, zone.x, cursor);
        cursor += local.height + spacing.elementGap * 2;
        continue;
      }
      const markerWidth = zone.w * 0.12;
      const titleWidth = zone.w * 0.28;
      const bodyWidth = zone.w - markerWidth - titleWidth - spacing.elementGap * 2;
      const marker = textById(elements, item.markerId);
      const title = textById(elements, item.titleId);
      const body = textById(elements, item.bodyId);
      const markerSize = layoutFontSize(theme, 'lead', 22);
      const titleSize = layoutFontSize(theme, 'lead', 22);
      const bodySize = layoutFontSize(theme, 'body', 16);
      const markerHeight = marker ? layoutTextHeight(marker.text, markerWidth, markerSize, 1.3) : 0;
      const titleHeight = title ? layoutTextHeight(title.text, titleWidth, titleSize, 1.35) : 0;
      const bodyHeight = body ? layoutTextHeight(body.text, bodyWidth, bodySize, 1.65) : 0;
      const rowHeight = Math.max(48, markerHeight, titleHeight, bodyHeight);
      putFrame(frames, item.markerId, zone.x, cursor, markerWidth, rowHeight);
      putFrame(frames, item.titleId, zone.x + markerWidth + spacing.elementGap, cursor, titleWidth, rowHeight);
      putFrame(frames, item.bodyId, zone.x + markerWidth + titleWidth + spacing.elementGap * 2, cursor, bodyWidth, rowHeight);
      if (item.markerId) fontSizes[item.markerId] = markerSize;
      fontSizes[item.titleId] = titleSize;
      if (item.bodyId) fontSizes[item.bodyId] = bodySize;
      cursor += rowHeight + spacing.elementGap;
    }
    return {
      width: band === 'wide' ? 1440 : band === 'compact' ? 768 : 390,
      sectionHeight: Math.ceil(cursor - spacing.elementGap + spacing.sectionBlock),
      frames,
      fontSizes,
      itemOrder,
    };
  }

  if (recipe.flow === 'sticky-heading' && band !== 'mobile') {
    const listX = zone.x + zone.w * 0.42;
    const listWidth = zone.w * 0.58;
    let cursor = zone.y;
    for (const item of content.items) {
      const local = verticalItem({
        item,
        elements,
        theme,
        band,
        width: listWidth,
        mediaFirst: true,
        padded: false,
      });
      mergeLocal(frames, fontSizes, local, listX, cursor);
      cursor += local.height + spacing.elementGap * 2;
    }
    return {
      width: band === 'wide' ? 1440 : 768,
      sectionHeight: Math.ceil(Math.max(intro.bottom, cursor - spacing.elementGap * 2) + spacing.sectionBlock),
      frames,
      fontSizes,
      itemOrder,
    };
  }

  if (recipe.flow === 'featured-first' && band !== 'mobile') {
    const majorWidth = zone.w * 0.58;
    const listX = zone.x + majorWidth + spacing.elementGap;
    const listWidth = zone.w - majorWidth - spacing.elementGap;
    const first = verticalItem({
      item: content.items[0],
      elements,
      theme,
      band,
      width: majorWidth,
      mediaAspect: recipe.mediaAspect,
      mediaFirst: true,
      padded: true,
    });
    mergeLocal(frames, fontSizes, first, zone.x, itemStart);
    let cursor = itemStart;
    for (const item of content.items.slice(1)) {
      const local = verticalItem({
        item: { ...item, mediaId: undefined },
        elements,
        theme,
        band,
        width: listWidth,
        mediaFirst: true,
        padded: true,
      });
      mergeLocal(frames, fontSizes, local, listX, cursor);
      cursor += local.height + spacing.elementGap;
    }
    return {
      width: band === 'wide' ? 1440 : 768,
      sectionHeight: Math.ceil(Math.max(itemStart + first.height, cursor - spacing.elementGap) + spacing.sectionBlock),
      frames,
      fontSizes,
      itemOrder,
    };
  }

  let columns = recipe.columns;
  if (recipe.flow === 'icon-grid' && band === 'mobile' && recipe.mobileLongTextColumns === 1) {
    const titleSize = layoutFontSize(theme, 'lead', 19);
    const columnWidth = (zone.w - spacing.elementGap) / 2;
    const hasLongTitle = content.items.some((item) => {
      const title = textById(elements, item.titleId);
      return title && layoutTextHeight(title.text, columnWidth, titleSize, 1.3) >= titleSize * 1.3 * 3;
    });
    if (hasLongTitle) columns = 1;
  }
  const columnWidth = (zone.w - spacing.elementGap * (columns - 1)) / columns;
  const locals = content.items.map((item) => verticalItem({
    item: recipe.flow === 'featured-first' ? { ...item, mediaId: undefined } : item,
    elements,
    theme,
    band,
    width: columnWidth,
    mediaAspect: recipe.mediaAspect,
    mediaFirst: true,
    padded: recipe.flow === 'equal-grid' || recipe.flow === 'icon-grid',
  }));
  let cursor = itemStart;
  for (let rowStart = 0; rowStart < content.items.length; rowStart += columns) {
    const row = locals.slice(rowStart, rowStart + columns);
    const rowHeight = Math.max(...row.map((item) => item.height));
    row.forEach((local, column) => {
      mergeLocal(
        frames,
        fontSizes,
        local,
        zone.x + column * (columnWidth + spacing.elementGap),
        cursor,
      );
    });
    cursor += rowHeight + spacing.elementGap;
  }
  return {
    width: band === 'wide' ? 1440 : band === 'compact' ? 768 : 390,
    sectionHeight: Math.ceil(cursor - spacing.elementGap + spacing.sectionBlock),
    frames,
    fontSizes,
    itemOrder,
  };
}

export function resolveFeatureLayoutVariant({
  requestedId,
  elements,
  theme,
  content,
}: {
  requestedId: FeatureLayoutVariantId;
  elements: readonly CanvasElement[];
  theme: SiteTheme;
  content: FeatureLayoutContent;
}): SectionLayoutProjection | null {
  const variant = featureLayoutById(requestedId);
  if (
    content.items.length < variant.content.minimumItems
    || content.items.length > variant.content.maximumItems
  ) return null;
  const bands = Object.fromEntries(BANDS.map((band) => [
    band,
    compileBand({ band, requestedId, elements, theme, content }),
  ])) as SectionLayoutProjection['bands'];
  return {
    catalogVersion: 1,
    kind: 'features',
    requestedId,
    resolvedId: requestedId,
    mediaRole: variant.mediaContract.role,
    enhancement: 'none',
    items: content.items.map((item) => ({
      id: item.id,
      elementIds: [
        item.markerId,
        item.mediaId,
        item.titleId,
        item.bodyId,
        item.ctaId,
      ].filter((id): id is string => Boolean(id)),
      ...(item.mediaId ? { mediaElementId: item.mediaId } : {}),
    })),
    bands,
  };
}
