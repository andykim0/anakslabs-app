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
import { directionsLayoutById } from './directions-catalog';
import type {
  DirectionsLayoutContent,
  DirectionsLayoutRowBinding,
  DirectionsLayoutVariantId,
  SectionLayoutBandProjection,
  SectionLayoutBreakpointBand,
  SectionLayoutCompiledFrame,
  SectionLayoutProjection,
} from './section-layout-types';

const BANDS = ['wide', 'compact', 'mobile'] as const satisfies readonly SectionLayoutBreakpointBand[];

function hasMap(elements: readonly CanvasElement[], mapId: string | undefined): boolean {
  return elementById(elements, mapId)?.kind === 'map';
}

function resolvedDirectionsId({
  requestedId,
  elements,
  content,
}: {
  requestedId: DirectionsLayoutVariantId;
  elements: readonly CanvasElement[];
  content: DirectionsLayoutContent;
}): DirectionsLayoutVariantId {
  if (requestedId !== 'directions.info-card-stack' && !hasMap(elements, content.mapId)) {
    return 'directions.info-card-stack';
  }
  if (requestedId === 'directions.full-map-overlay') {
    const longValues = content.rows.filter((row) => {
      const value = textById(elements, row.valueId);
      return (value?.text.length ?? 0) > 72;
    }).length;
    if (content.rows.length > 3 || longValues > 1) return 'directions.map-info-split';
  }
  return requestedId;
}

function placeRows({
  rows,
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
  rows: readonly DirectionsLayoutRowBinding[];
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
  for (const row of rows) {
    const label = textById(elements, row.labelId);
    const value = textById(elements, row.valueId);
    if (!label || !value) continue;
    const labelSize = layoutFontSize(theme, 'caption', 13);
    const labelHeight = layoutTextHeight(label.text, innerWidth, labelSize, 1.45);
    putFrame(frames, row.labelId, x + inset, cursor, innerWidth, labelHeight);
    fontSizes[row.labelId] = labelSize;
    cursor += labelHeight + spacing.elementGap / 2;
    const valueSize = layoutFontSize(theme, 'body', band === 'mobile' ? 16 : 18);
    const valueHeight = layoutTextHeight(
      value.text,
      innerWidth,
      valueSize,
      theme.tokens?.typography.lineHeight.body ?? 1.65,
    );
    putFrame(frames, row.valueId, x + inset, cursor, innerWidth, valueHeight);
    fontSizes[row.valueId] = valueSize;
    cursor += valueHeight + spacing.elementGap;
  }
  return cursor > y + inset ? cursor - spacing.elementGap + inset : y;
}

function placeLinks({
  ids,
  elements,
  frames,
  x,
  y,
  width,
  gap,
}: {
  ids: readonly (string | undefined)[];
  elements: readonly CanvasElement[];
  frames: Record<string, SectionLayoutCompiledFrame>;
  x: number;
  y: number;
  width: number;
  gap: number;
}): number {
  let cursor = y;
  for (const id of ids) {
    if (!id || !buttonById(elements, id)) continue;
    putFrame(frames, id, x, cursor, width, 46);
    cursor += 46 + gap;
  }
  return cursor > y ? cursor - gap : y;
}

function compileBand({
  band,
  resolvedId,
  elements,
  theme,
  content,
}: {
  band: SectionLayoutBreakpointBand;
  resolvedId: DirectionsLayoutVariantId;
  elements: readonly CanvasElement[];
  theme: SiteTheme;
  content: DirectionsLayoutContent;
}): SectionLayoutBandProjection {
  const recipe = directionsLayoutById(resolvedId).bands[band];
  const zone = safeZoneFrame(band, recipe.textZone);
  const spacing = layoutSpacing(theme, band);
  const frames: Record<string, SectionLayoutCompiledFrame> = {};
  const fontSizes: Record<string, number> = {};
  const groupFrames: Record<string, SectionLayoutCompiledFrame> = {};
  const intro = content.intro ? layoutSectionIntro({
    band,
    elements,
    theme,
    frames,
    ...content.intro,
    x: zone.x,
    y: zone.y,
    width: zone.w * (band === 'mobile' ? 1 : 0.68),
  }) : { bottom: zone.y, fontSizes: {} };
  Object.assign(fontSizes, intro.fontSizes);
  const start = intro.bottom + (content.intro ? spacing.elementGap * 2 : 0);

  if (resolvedId === 'directions.info-card-stack') {
    const columns = band === 'mobile' ? 1 : 2;
    const columnWidth = (zone.w - spacing.elementGap * (columns - 1)) / columns;
    let cursor = start;
    for (let rowStart = 0; rowStart < content.rows.length; rowStart += columns) {
      const row = content.rows.slice(rowStart, rowStart + columns);
      const offset = row.length < columns
        ? ((columns - row.length) * (columnWidth + spacing.elementGap)) / 2
        : 0;
      const bottoms = row.map((item, column) => placeRows({
        rows: [item],
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
        groupFrames[`directions-card-${item.id}`] = {
          x: zone.x + offset + column * (columnWidth + spacing.elementGap),
          y: cursor,
          w: columnWidth,
          h: rowHeight,
        };
      });
      cursor += rowHeight + spacing.elementGap;
    }
    const linksBottom = placeLinks({
      ids: [content.placeLinkId, content.detailLinkId],
      elements,
      frames,
      x: zone.x,
      y: cursor + spacing.elementGap,
      width: band === 'mobile' ? zone.w : zone.w * 0.42,
      gap: spacing.elementGap,
    });
    return {
      width: band === 'wide' ? 1440 : band === 'compact' ? 768 : 390,
      sectionHeight: Math.ceil(Math.max(cursor - spacing.elementGap, linksBottom) + spacing.sectionBlock),
      frames,
      fontSizes,
      itemOrder: content.rows.map((row) => row.id),
      groupFrames,
    };
  }

  if (resolvedId === 'directions.map-info-split') {
    const stacked = band === 'mobile';
    const infoWidth = stacked ? zone.w : zone.w * (band === 'wide' ? 0.42 : 0.46);
    const mapX = stacked ? zone.x : zone.x + zone.w * (band === 'wide' ? 0.52 : 0.54);
    const mapWidth = stacked ? zone.w : zone.x + zone.w - mapX;
    const infoBottom = placeRows({
      rows: content.rows,
      elements,
      theme,
      band,
      frames,
      fontSizes,
      x: zone.x,
      y: start,
      width: infoWidth,
    });
    const linksBottom = placeLinks({
      ids: [content.placeLinkId, content.detailLinkId],
      elements,
      frames,
      x: zone.x,
      y: infoBottom + spacing.elementGap,
      width: infoWidth,
      gap: spacing.elementGap,
    });
    const mapY = stacked
      ? Math.max(infoBottom, linksBottom) + spacing.elementGap * 2
      : start;
    const mapHeight = stacked ? Math.min(320, mapWidth * 0.72) : Math.max(320, mapWidth * 0.66);
    putFrame(frames, content.mapId, mapX, mapY, mapWidth, mapHeight);
    return {
      width: band === 'wide' ? 1440 : band === 'compact' ? 768 : 390,
      sectionHeight: Math.ceil(Math.max(infoBottom, linksBottom, mapY + mapHeight) + spacing.sectionBlock),
      frames,
      fontSizes,
      itemOrder: content.rows.map((row) => row.id),
    };
  }

  const mapHeight = band === 'mobile' ? 620 : band === 'compact' ? 560 : 640;
  putFrame(frames, content.mapId, 0, 0, band === 'wide' ? 1440 : band === 'compact' ? 768 : 390, mapHeight);
  const surfaceWidth = zone.w * (band === 'mobile' ? 1 : 0.48);
  const surfaceX = zone.x;
  const surfaceY = Math.max(zone.y, mapHeight * (band === 'mobile' ? 0.36 : 0.34));
  let surfaceBottom = placeRows({
    rows: content.rows,
    elements,
    theme,
    band,
    frames,
    fontSizes,
    x: surfaceX,
    y: surfaceY,
    width: surfaceWidth,
    inset: spacing.sectionInline,
  });
  surfaceBottom = placeLinks({
    ids: [content.placeLinkId, content.detailLinkId],
    elements,
    frames,
    x: surfaceX + spacing.sectionInline,
    y: surfaceBottom + spacing.elementGap,
    width: surfaceWidth - spacing.sectionInline * 2,
    gap: spacing.elementGap,
  }) + spacing.sectionInline;
  groupFrames['directions-map-surface'] = {
    x: surfaceX,
    y: surfaceY,
    w: surfaceWidth,
    h: surfaceBottom - surfaceY,
  };
  return {
    width: band === 'wide' ? 1440 : band === 'compact' ? 768 : 390,
    sectionHeight: Math.ceil(Math.max(mapHeight, surfaceBottom) + spacing.sectionBlock),
    frames,
    fontSizes,
    itemOrder: content.rows.map((row) => row.id),
    groupFrames,
  };
}

export function resolveDirectionsLayoutVariant({
  requestedId,
  elements,
  theme,
  content,
}: {
  requestedId: DirectionsLayoutVariantId;
  elements: readonly CanvasElement[];
  theme: SiteTheme;
  content: DirectionsLayoutContent;
}): SectionLayoutProjection | null {
  if (content.rows.length < 1 || content.rows.length > 4) return null;
  const resolvedId = resolvedDirectionsId({ requestedId, elements, content });
  const bands = Object.fromEntries(BANDS.map((band) => [
    band,
    compileBand({ band, resolvedId, elements, theme, content }),
  ])) as SectionLayoutProjection['bands'];
  return {
    catalogVersion: 1,
    kind: 'directions',
    requestedId,
    resolvedId,
    mediaRole: 'none',
    enhancement: 'none',
    items: content.rows.map((row) => ({
      id: row.id,
      elementIds: [row.labelId, row.valueId],
    })),
    ...(resolvedId === 'directions.info-card-stack'
      ? {
          groups: content.rows.map((row) => ({
            id: `directions-card-${row.id}`,
            appearance: 'directions-card' as const,
            itemId: row.id,
          })),
        }
      : resolvedId === 'directions.full-map-overlay'
        ? { groups: [{ id: 'directions-map-surface', appearance: 'map-surface' as const }] }
        : {}),
    bands,
  };
}
