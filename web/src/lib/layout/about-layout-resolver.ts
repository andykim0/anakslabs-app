import type { CanvasElement, SiteTheme } from '@/lib/types/site';
import { aboutLayoutById } from './about-catalog';
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
import type {
  AboutLayoutContent,
  AboutLayoutVariantId,
  SectionLayoutBandProjection,
  SectionLayoutBreakpointBand,
  SectionLayoutProjection,
} from './section-layout-types';

const BANDS = ['wide', 'compact', 'mobile'] as const satisfies readonly SectionLayoutBreakpointBand[];

function placeBody({
  band,
  elements,
  theme,
  ids,
  frames,
  fontSizes,
  x,
  y,
  width,
}: {
  band: SectionLayoutBreakpointBand;
  elements: readonly CanvasElement[];
  theme: SiteTheme;
  ids: readonly string[];
  frames: Record<string, { x: number; y: number; w: number; h: number }>;
  fontSizes: Record<string, number>;
  x: number;
  y: number;
  width: number;
}): number {
  const spacing = layoutSpacing(theme, band);
  let cursor = y;
  for (const id of ids) {
    const text = textById(elements, id);
    if (!text) continue;
    const size = layoutFontSize(theme, 'body', band === 'mobile' ? 16 : 17);
    const height = layoutTextHeight(
      text.text,
      width,
      size,
      theme.tokens?.typography.lineHeight.body ?? 1.7,
    );
    putFrame(frames, id, x, cursor, width, height);
    fontSizes[id] = size;
    cursor += height + spacing.elementGap;
  }
  return cursor > y ? cursor - spacing.elementGap : y;
}

function resolvedAboutId({
  requestedId,
  content,
  availableMedia,
}: {
  requestedId: AboutLayoutVariantId;
  content: AboutLayoutContent;
  availableMedia: { referential: boolean; atmospheric: boolean };
}): AboutLayoutVariantId {
  if (requestedId === 'about.centered-statement' && !content.about.statementId) {
    return 'about.heading-body-columns';
  }
  if (
    requestedId === 'about.fullbleed-overlay'
    && !availableMedia.referential
    && !availableMedia.atmospheric
  ) {
    return 'about.heading-body-columns';
  }
  return requestedId;
}

function compileBand({
  band,
  resolvedId,
  elements,
  theme,
  content,
  mediaAvailable,
}: {
  band: SectionLayoutBreakpointBand;
  resolvedId: AboutLayoutVariantId;
  elements: readonly CanvasElement[];
  theme: SiteTheme;
  content: AboutLayoutContent;
  mediaAvailable: boolean;
}): SectionLayoutBandProjection {
  const variant = aboutLayoutById(resolvedId);
  const recipe = variant.bands[band];
  const zone = safeZoneFrame(band, recipe.textZone);
  const spacing = layoutSpacing(theme, band);
  const frames: Record<string, { x: number; y: number; w: number; h: number }> = {};
  const fontSizes: Record<string, number> = {};
  const allBodyIds = [...content.about.bodyIds, ...content.about.factIds];

  if (recipe.flow === 'split' && band === 'mobile') {
    const hasFigure = mediaAvailable && Boolean(
      content.about.mediaId && elementById(elements, content.about.mediaId),
    );
    let introY = zone.y;
    if (hasFigure && content.about.mediaId) {
      const mediaHeight = zone.w / (4 / 3);
      putFrame(frames, content.about.mediaId, zone.x, zone.y, zone.w, mediaHeight);
      introY += mediaHeight + spacing.elementGap * 2;
    }
    const intro = layoutSectionIntro({
      band,
      elements,
      theme,
      frames,
      ...content.intro,
      x: zone.x,
      y: introY,
      width: zone.w,
    });
    Object.assign(fontSizes, intro.fontSizes);
    let cursor = placeBody({
      band,
      elements,
      theme,
      ids: [
        ...(content.about.statementId ? [content.about.statementId] : []),
        ...allBodyIds,
      ],
      frames,
      fontSizes,
      x: zone.x,
      y: intro.bottom + spacing.elementGap * 2,
      width: zone.w,
    });
    const cta = buttonById(elements, content.about.ctaId);
    if (cta && content.about.ctaId) {
      cursor += spacing.elementGap;
      putFrame(frames, content.about.ctaId, zone.x, cursor, zone.w, 48);
      cursor += 48;
    }
    return {
      width: 390,
      sectionHeight: Math.ceil(cursor + spacing.sectionBlock),
      frames,
      fontSizes,
      itemOrder: [content.about.id],
    };
  }

  if (recipe.flow === 'split') {
    const hasFigure = mediaAvailable && Boolean(
      content.about.mediaId && elementById(elements, content.about.mediaId),
    );
    const textWidth = hasFigure ? zone.w * 0.52 : zone.w * 0.72;
    const intro = layoutSectionIntro({
      band,
      elements,
      theme,
      frames,
      ...content.intro,
      x: zone.x,
      y: zone.y,
      width: textWidth,
    });
    Object.assign(fontSizes, intro.fontSizes);
    let cursor = intro.bottom + spacing.elementGap * 2;
    cursor = placeBody({
      band,
      elements,
      theme,
      ids: [
        ...(content.about.statementId ? [content.about.statementId] : []),
        ...allBodyIds,
      ],
      frames,
      fontSizes,
      x: zone.x,
      y: cursor,
      width: textWidth,
    });
    const cta = buttonById(elements, content.about.ctaId);
    if (cta && content.about.ctaId) {
      cursor += spacing.elementGap;
      putFrame(frames, content.about.ctaId, zone.x, cursor, textWidth, 46);
      cursor += 46;
    }
    let mediaBottom = 0;
    if (hasFigure && content.about.mediaId) {
      const mediaX = zone.x + zone.w * 0.58;
      const mediaWidth = zone.w * 0.42;
      const mediaHeight = mediaWidth / (4 / 5);
      putFrame(frames, content.about.mediaId, mediaX, zone.y, mediaWidth, mediaHeight);
      mediaBottom = zone.y + mediaHeight;
    }
    return {
      width: band === 'wide' ? 1440 : 768,
      sectionHeight: Math.ceil(Math.max(cursor, mediaBottom) + spacing.sectionBlock),
      frames,
      fontSizes,
      itemOrder: [content.about.id],
    };
  }

  if (recipe.flow === 'centered-statement') {
    const intro = layoutSectionIntro({
      band,
      elements,
      theme,
      frames,
      ...content.intro,
      x: zone.x + zone.w * (band === 'mobile' ? 0 : 0.08),
      y: zone.y,
      width: zone.w * (band === 'mobile' ? 1 : 0.84),
      align: 'center',
    });
    Object.assign(fontSizes, intro.fontSizes);
    let cursor = intro.bottom + spacing.elementGap * 2;
    const statement = textById(elements, content.about.statementId);
    if (statement && content.about.statementId) {
      const width = zone.w * (band === 'mobile' ? 1 : 0.82);
      const x = zone.x + (zone.w - width) / 2;
      const size = layoutFontSize(theme, band === 'mobile' ? 'title' : 'display', band === 'mobile' ? 32 : 48);
      const height = layoutTextHeight(
        statement.text,
        width,
        size,
        theme.tokens?.typography.lineHeight.heading ?? 1.25,
      );
      putFrame(frames, content.about.statementId, x, cursor, width, height);
      fontSizes[content.about.statementId] = size;
      cursor += height + spacing.elementGap * 2;
    }
    const bodyWidth = zone.w * (band === 'mobile' ? 1 : 0.64);
    cursor = placeBody({
      band,
      elements,
      theme,
      ids: allBodyIds,
      frames,
      fontSizes,
      x: zone.x + (zone.w - bodyWidth) / 2,
      y: cursor,
      width: bodyWidth,
    });
    return {
      width: band === 'wide' ? 1440 : band === 'compact' ? 768 : 390,
      sectionHeight: Math.ceil(cursor + spacing.sectionBlock),
      frames,
      fontSizes,
      itemOrder: [content.about.id],
    };
  }

  if (recipe.flow === 'fullbleed-overlay') {
    const textWidth = zone.w * (band === 'mobile' ? 1 : 0.54);
    const intro = layoutSectionIntro({
      band,
      elements,
      theme,
      frames,
      ...content.intro,
      x: zone.x,
      y: zone.y,
      width: textWidth,
    });
    Object.assign(fontSizes, intro.fontSizes);
    let cursor = placeBody({
      band,
      elements,
      theme,
      ids: [
        ...(content.about.statementId ? [content.about.statementId] : []),
        ...allBodyIds,
      ],
      frames,
      fontSizes,
      x: zone.x,
      y: intro.bottom + spacing.elementGap * 2,
      width: textWidth,
    });
    const cta = buttonById(elements, content.about.ctaId);
    if (cta && content.about.ctaId) {
      cursor += spacing.elementGap;
      putFrame(frames, content.about.ctaId, zone.x, cursor, textWidth, 48);
      cursor += 48;
    }
    const sectionHeight = Math.ceil(Math.max(
      band === 'mobile' ? 640 : 680,
      cursor + spacing.sectionBlock,
    ));
    if (content.about.mediaId && elementById(elements, content.about.mediaId)) {
      putFrame(frames, content.about.mediaId, 0, 0, band === 'wide' ? 1440 : band === 'compact' ? 768 : 390, sectionHeight);
    }
    return {
      width: band === 'wide' ? 1440 : band === 'compact' ? 768 : 390,
      sectionHeight,
      frames,
      fontSizes,
      itemOrder: [content.about.id],
      mediaFrame: { x: 0, y: 0, w: band === 'wide' ? 1440 : band === 'compact' ? 768 : 390, h: sectionHeight },
    };
  }

  const introWidth = band === 'mobile' ? zone.w : zone.w * 0.36;
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
  const bodyX = band === 'mobile' ? zone.x : zone.x + zone.w * 0.42;
  const bodyWidth = band === 'mobile' ? zone.w : zone.w * 0.58;
  const bodyStart = band === 'mobile' ? intro.bottom + spacing.elementGap * 2 : zone.y;
  let cursor = placeBody({
    band,
    elements,
    theme,
    ids: [
      ...(content.about.statementId ? [content.about.statementId] : []),
      ...allBodyIds,
    ],
    frames,
    fontSizes,
    x: bodyX,
    y: bodyStart,
    width: bodyWidth,
  });
  const cta = buttonById(elements, content.about.ctaId);
  if (cta && content.about.ctaId) {
    cursor += spacing.elementGap;
    putFrame(frames, content.about.ctaId, bodyX, cursor, bodyWidth, 46);
    cursor += 46;
  }
  return {
    width: band === 'wide' ? 1440 : band === 'compact' ? 768 : 390,
    sectionHeight: Math.ceil(Math.max(intro.bottom, cursor) + spacing.sectionBlock),
    frames,
    fontSizes,
    itemOrder: [content.about.id],
  };
}

export function resolveAboutLayoutVariant({
  requestedId,
  elements,
  theme,
  content,
  availableMedia,
}: {
  requestedId: AboutLayoutVariantId;
  elements: readonly CanvasElement[];
  theme: SiteTheme;
  content: AboutLayoutContent;
  availableMedia: { referential: boolean; atmospheric: boolean };
}): SectionLayoutProjection | null {
  if (content.about.bodyIds.length + content.about.factIds.length + Number(Boolean(content.about.statementId)) < 1) {
    return null;
  }
  const resolvedId = resolvedAboutId({ requestedId, content, availableMedia });
  const variant = aboutLayoutById(resolvedId);
  const mediaAvailable = variant.mediaContract.role === 'atmospheric-background'
    ? availableMedia.referential || availableMedia.atmospheric
    : availableMedia.referential;
  const bands = Object.fromEntries(BANDS.map((band) => [
    band,
    compileBand({ band, resolvedId, elements, theme, content, mediaAvailable }),
  ])) as SectionLayoutProjection['bands'];
  return {
    catalogVersion: 1,
    kind: 'about',
    requestedId,
    resolvedId,
    mediaRole: variant.mediaContract.role,
    enhancement: 'none',
    items: [{
      id: content.about.id,
      elementIds: [
        content.about.statementId,
        ...content.about.bodyIds,
        ...content.about.factIds,
        content.about.mediaId,
        content.about.ctaId,
      ].filter((id): id is string => Boolean(id)),
      ...(content.about.mediaId ? { mediaElementId: content.about.mediaId } : {}),
    }],
    bands,
  };
}
