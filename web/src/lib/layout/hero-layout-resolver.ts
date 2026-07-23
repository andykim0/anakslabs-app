import { SIGNATURE_TEXT_SAFE_ZONE_GEOMETRY } from '@/lib/motion/signature-contract';
import type {
  ButtonElement,
  CanvasElement,
  Frame,
  Section,
  SiteTheme,
  TextElement,
} from '@/lib/types/site';
import { HERO_LAYOUT_CATALOG, heroLayoutById } from './catalog';
import type {
  HeroLayoutAvailableMedia,
  HeroLayoutBandProjection,
  HeroLayoutBreakpointBand,
  HeroLayoutCompiledFrame,
  HeroLayoutProjection,
  HeroLayoutVariant,
  HeroLayoutVariantId,
} from './types';

const BAND_WIDTHS = {
  wide: 1440,
  compact: 768,
  mobile: 390,
} as const;

const BASE_STAGE_HEIGHTS = {
  wide: 900,
  compact: 720,
  mobile: 700,
} as const;

const LEGACY_SPACING = {
  wide: { sectionBlock: 64, sectionInline: 24, elementGap: 20 },
  compact: { sectionBlock: 52, sectionInline: 24, elementGap: 18 },
  mobile: { sectionBlock: 44, sectionInline: 20, elementGap: 16 },
} as const;

function remToPixels(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const match = /^(-?\d+(?:\.\d+)?)rem$/u.exec(value);
  return match ? Number(match[1]) * 16 : fallback;
}

function themeSpacing(theme: SiteTheme, band: HeroLayoutBreakpointBand) {
  const fallback = LEGACY_SPACING[band];
  return {
    sectionBlock: remToPixels(theme.tokens?.spacing.sectionBlock, fallback.sectionBlock),
    sectionInline: remToPixels(theme.tokens?.spacing.sectionInline, fallback.sectionInline),
    elementGap: remToPixels(theme.tokens?.spacing.elementGap, fallback.elementGap),
  };
}

function themeFontSize(
  theme: SiteTheme,
  role: 'caption' | 'body' | 'lead' | 'title' | 'display',
  fallback: number,
): number {
  return remToPixels(theme.tokens?.typography.size[role], fallback);
}

export function estimatedHeroHeadlineLines(
  text: string,
  frameWidth: number,
  fontSize: number,
  capacityFactor = 0.92,
): number {
  const capacity = Math.max(1, (frameWidth / Math.max(1, fontSize)) * capacityFactor);
  return text.split('\n').reduce((total, line) => {
    const units = Array.from(line).reduce((width, character) => {
      if (/\s/u.test(character)) return width + 0.34;
      if (/[\u3131-\u318e\uac00-\ud7a3]/u.test(character)) return width + 1;
      return width + 0.58;
    }, 0);
    return total + Math.max(1, Math.ceil(units / capacity));
  }, 0);
}

function estimatedBodyLines(text: string, frameWidth: number, fontSize: number): number {
  return estimatedHeroHeadlineLines(text, frameWidth, fontSize, 1);
}

function aspectRatio(value: string | undefined): number {
  if (!value) return 16 / 10;
  const [width, height] = value.split(':').map(Number);
  return width && height ? width / height : 16 / 10;
}

function elementFor(elements: readonly CanvasElement[], needle: string): CanvasElement | undefined {
  return elements.find((element) => element.id.includes(needle));
}

function elementsFor(elements: readonly CanvasElement[], needle: string): CanvasElement[] {
  return elements.filter((element) => element.id.includes(needle));
}

function asText(element: CanvasElement | undefined): TextElement | undefined {
  return element?.kind === 'text' ? element : undefined;
}

function asButton(element: CanvasElement | undefined): ButtonElement | undefined {
  return element?.kind === 'button' ? element : undefined;
}

function chipWidth(text: string, fontSize: number, maxWidth: number): number {
  const measured = Array.from(text).reduce((sum, character) => (
    sum + (/\s/u.test(character) ? 0.34 : /[\u3131-\u318e\uac00-\ud7a3]/u.test(character) ? 1 : 0.58)
  ), 0) * fontSize;
  return Math.min(maxWidth, Math.max(72, Math.ceil(measured + 32)));
}

function buttonWidth(button: ButtonElement, fontSize: number, maxWidth: number): number {
  return Math.min(maxWidth, Math.max(132, Math.ceil(button.label.length * fontSize + 56)));
}

function frame(x: number, y: number, w: number, h: number): HeroLayoutCompiledFrame {
  return {
    x: Number(x.toFixed(4)),
    y: Number(y.toFixed(4)),
    w: Number(w.toFixed(4)),
    h: Number(h.toFixed(4)),
  };
}

function mediaAvailableFor(
  variant: HeroLayoutVariant,
  available: HeroLayoutAvailableMedia,
): boolean {
  switch (variant.mediaContract.requirement) {
    case 'none':
      return false;
    case 'required-video-poster':
      return available.video && available.poster;
    case 'optional-image':
      return available.image;
    case 'required-image':
      return available.image || available.poster;
  }
}

function resolveVariant(
  requestedId: HeroLayoutVariantId,
  available: HeroLayoutAvailableMedia,
): HeroLayoutVariant {
  const requested = heroLayoutById(requestedId);
  if (!requested) return HERO_LAYOUT_CATALOG[0];
  if (requested.mediaContract.requirement === 'required-video-poster') {
    if (available.video && available.poster) return requested;
    if (available.poster) return heroLayoutById('hero.fullbleed-centered')!;
    return heroLayoutById('hero.text-only-bold')!;
  }
  if (requested.mediaContract.requirement === 'required-image' && !available.image && !available.poster) {
    return heroLayoutById('hero.text-only-bold')!;
  }
  return requested;
}

function compileBand({
  band,
  variant,
  elements,
  theme,
  mediaAvailable,
}: {
  band: HeroLayoutBreakpointBand;
  variant: HeroLayoutVariant;
  elements: readonly CanvasElement[];
  theme: SiteTheme;
  mediaAvailable: boolean;
}): HeroLayoutBandProjection {
  const width = BAND_WIDTHS[band];
  const baseHeight = BASE_STAGE_HEIGHTS[band];
  const recipe = variant.bands[band];
  const fallbackFlow = !mediaAvailable && recipe.media.placement !== 'none';
  const zoneId = fallbackFlow ? 'flow-start' : recipe.textZone;
  const zone = SIGNATURE_TEXT_SAFE_ZONE_GEOMETRY[band][zoneId];
  const spacing = themeSpacing(theme, band);
  const align = fallbackFlow ? 'start' : recipe.align;
  let contentX = zone.x * width;
  let contentWidth = zone.width * width;
  const frames: Record<string, HeroLayoutCompiledFrame> = {};
  const fontSizes: Record<string, number> = {};
  let mediaFrame: HeroLayoutCompiledFrame | undefined;
  let offsetPanelBounds: {
    x: number;
    y: number;
    right: number;
  } | undefined;

  if (mediaAvailable && recipe.media.placement === 'fixed' && recipe.media.frame) {
    const authored = recipe.media.frame;
    const mediaWidth = authored.width * width;
    mediaFrame = frame(
      authored.x * width,
      authored.y * baseHeight,
      mediaWidth,
      mediaWidth / aspectRatio(recipe.media.aspect),
    );
  } else if (
    mediaAvailable
    && recipe.flow === 'offset-surface'
    && recipe.media.placement === 'fixed'
    && recipe.media.columns
  ) {
    const [start, end] = recipe.media.columns;
    const columnWidth = (zone.width * width) / recipe.gridColumns;
    const mediaWidth = (end - start + 1) * columnWidth;
    mediaFrame = frame(
      zone.x * width + (start - 1) * columnWidth,
      zone.y * baseHeight,
      mediaWidth,
      mediaWidth / aspectRatio(recipe.media.aspect),
    );
  }

  if (mediaAvailable && recipe.flow === 'offset-surface' && mediaFrame) {
    const zoneRight = (zone.x + zone.width) * width;
    const panelX = band === 'mobile'
      ? zone.x * width + (zone.width * width) / recipe.gridColumns / 2
      : Math.max(
          ((recipe.contentColumns[0] - 1) / recipe.gridColumns) * width,
          mediaFrame.x + mediaFrame.w + spacing.elementGap,
        );
    const panelY = band === 'mobile'
      ? mediaFrame.y + mediaFrame.h + spacing.elementGap
      : Math.max(
          mediaFrame.y + spacing.elementGap * 2,
          zone.y * baseHeight - spacing.sectionInline,
        );
    offsetPanelBounds = {
      x: panelX,
      y: panelY,
      right: zoneRight,
    };
    contentX = Math.max(
      zone.x * width,
      panelX + spacing.sectionInline,
    );
    contentWidth = Math.max(
      spacing.sectionInline * 4,
      zoneRight - contentX - spacing.sectionInline,
    );
  }

  const logo = elementFor(elements, 'hero-logo');
  const eyebrow = asText(elementFor(elements, 'hero-kicker'));
  const headline = asText(elementFor(elements, 'hero-title'));
  const lead = asText(elementFor(elements, 'hero-sub'));
  const chips = elementsFor(elements, 'hero-chip-label').filter(
    (element): element is TextElement => element.kind === 'text',
  );
  const primary = asButton(elements.find((element) => (
    element.id.includes('hero-cta') && !element.id.includes('cta2')
  )));
  const secondary = asButton(elementFor(elements, 'hero-cta2'));

  const displaySize = band === 'mobile'
    ? themeFontSize(theme, 'title', 38)
    : themeFontSize(theme, 'display', band === 'wide' ? 76 : 56);
  const titleSize = themeFontSize(theme, 'title', band === 'mobile' ? 36 : 48);
  // ElementContent can retain the stored leading when a DNA role would not fit the
  // compiled frame. Reserve the larger of both contracts so the server projection
  // cannot make the renderer fall back into an overlapping line box.
  const headingLineHeight = Math.max(
    theme.tokens?.typography.lineHeight.heading ?? 1.3,
    headline?.style.lineHeight ?? 1.3,
  );
  let headingSize = displaySize;
  let headingLines = headline
    ? estimatedHeroHeadlineLines(headline.text, contentWidth, headingSize)
    : 0;
  if (headingLines > 3 && displaySize !== titleSize) {
    headingSize = titleSize;
    headingLines = headline
      ? estimatedHeroHeadlineLines(headline.text, contentWidth, headingSize)
      : 0;
  }

  const eyebrowSize = themeFontSize(theme, 'caption', band === 'mobile' ? 13 : 14);
  const leadSize = themeFontSize(theme, 'lead', band === 'mobile' ? 16 : 18);
  const bodyLineHeight = Math.max(
    theme.tokens?.typography.lineHeight.body ?? 1.65,
    eyebrow?.style.lineHeight ?? 1.6,
    lead?.style.lineHeight ?? 1.65,
  );
  const chipSize = themeFontSize(theme, 'caption', 13);
  const buttonSize = themeFontSize(theme, 'body', 15);
  let cursorY = offsetPanelBounds
    ? offsetPanelBounds.y + spacing.sectionInline
    : zone.y * baseHeight;
  const flowItems: HeroLayoutCompiledFrame[] = [];

  const place = (
    element: CanvasElement,
    itemWidth: number,
    itemHeight: number,
    gapBefore = spacing.elementGap,
  ) => {
    if (flowItems.length > 0) cursorY += gapBefore;
    const x = align === 'center' ? contentX + (contentWidth - itemWidth) / 2 : contentX;
    const next = frame(x, cursorY, itemWidth, itemHeight);
    frames[element.id] = next;
    flowItems.push(next);
    cursorY += itemHeight;
  };

  if (logo) {
    const logoWidth = Math.min(contentWidth, band === 'wide' ? 140 : band === 'compact' ? 116 : 104);
    place(logo, logoWidth, band === 'wide' ? 64 : band === 'compact' ? 54 : 48, 0);
  }
  if (eyebrow) {
    fontSizes[eyebrow.id] = eyebrowSize;
    place(eyebrow, contentWidth, Math.ceil(eyebrowSize * bodyLineHeight), logo ? spacing.elementGap : 0);
  }
  if (headline) {
    fontSizes[headline.id] = headingSize;
    place(
      headline,
      contentWidth,
      Math.ceil(Math.max(1, headingLines) * headingSize * headingLineHeight),
      flowItems.length > 0 ? spacing.elementGap : 0,
    );
  }
  if (lead) {
    const leadLines = estimatedBodyLines(lead.text, contentWidth, leadSize);
    fontSizes[lead.id] = leadSize;
    place(lead, contentWidth, Math.ceil(leadLines * leadSize * bodyLineHeight));
  }

  if (chips.length > 0) {
    if (flowItems.length > 0) cursorY += spacing.elementGap;
    const perRow = Math.min(recipe.chipItemsPerRow, chips.length);
    const cellWidth = (contentWidth - spacing.elementGap * (perRow - 1)) / perRow;
    const rows = Math.ceil(chips.length / perRow);
    chips.forEach((chip, index) => {
      const row = Math.floor(index / perRow);
      const column = index % perRow;
      const rowCount = Math.min(perRow, chips.length - row * perRow);
      const rowWidth = rowCount * cellWidth + (rowCount - 1) * spacing.elementGap;
      const rowX = align === 'center' ? contentX + (contentWidth - rowWidth) / 2 : contentX;
      const widthForChip = recipe.chipItemsPerRow === 1
        ? contentWidth
        : chipWidth(chip.text, chipSize, cellWidth);
      const cellX = rowX + column * (cellWidth + spacing.elementGap);
      frames[chip.id] = frame(
        align === 'center' ? cellX + (cellWidth - widthForChip) / 2 : cellX,
        cursorY + row * (40 + spacing.elementGap),
        widthForChip,
        40,
      );
      fontSizes[chip.id] = chipSize;
    });
    const chipsFrame = frame(contentX, cursorY, contentWidth, rows * 40 + (rows - 1) * spacing.elementGap);
    flowItems.push(chipsFrame);
    cursorY += chipsFrame.h;
  }

  const buttons = [primary, secondary].filter((button): button is ButtonElement => Boolean(button));
  if (buttons.length > 0) {
    if (flowItems.length > 0) cursorY += spacing.elementGap * 2;
    const stackButtons = recipe.ctaLayout === 'stack'
      || buttons.reduce((sum, button, index) => (
        sum + buttonWidth(button, buttonSize, contentWidth) + (index > 0 ? spacing.elementGap : 0)
      ), 0) > contentWidth;
    let x = contentX;
    if (!stackButtons && align === 'center') {
      const total = buttons.reduce((sum, button, index) => (
        sum + buttonWidth(button, buttonSize, contentWidth) + (index > 0 ? spacing.elementGap : 0)
      ), 0);
      x += (contentWidth - total) / 2;
    }
    buttons.forEach((button, index) => {
      const buttonWidthValue = stackButtons
        ? contentWidth
        : buttonWidth(button, buttonSize, contentWidth);
      const y = stackButtons
        ? cursorY + index * (52 + spacing.elementGap)
        : cursorY;
      frames[button.id] = frame(x, y, buttonWidthValue, 52);
      fontSizes[button.id] = buttonSize;
      if (!stackButtons) x += buttonWidthValue + spacing.elementGap;
    });
    const buttonRows = stackButtons ? buttons.length : 1;
    const buttonsFrame = frame(
      contentX,
      cursorY,
      contentWidth,
      buttonRows * 52 + (buttonRows - 1) * spacing.elementGap,
    );
    flowItems.push(buttonsFrame);
    cursorY += buttonsFrame.h;
  }

  const contentTop = flowItems.length > 0 ? Math.min(...flowItems.map((item) => item.y)) : cursorY;
  const contentBottom = flowItems.length > 0 ? Math.max(...flowItems.map((item) => item.y + item.h)) : cursorY;
  if (align === 'center' && recipe.flow === 'center-overlay' && flowItems.length > 0) {
    const centeredTop = zone.y * baseHeight + Math.max(0, (zone.height * baseHeight - (contentBottom - contentTop)) / 2);
    const delta = centeredTop - contentTop;
    for (const [id, value] of Object.entries(frames)) {
      frames[id] = frame(value.x, value.y + delta, value.w, value.h);
    }
  }

  const finalContentBottom = Object.values(frames).length > 0
    ? Math.max(...Object.values(frames).map((item) => item.y + item.h))
    : 0;
  if (mediaAvailable && recipe.media.placement === 'after-flow') {
    const mediaWidth = contentWidth;
    mediaFrame = frame(
      contentX,
      finalContentBottom + spacing.elementGap * 2,
      mediaWidth,
      mediaWidth / aspectRatio(recipe.media.aspect),
    );
  }

  const naturalFullbleedHeight = mediaAvailable && recipe.media.placement === 'fullbleed'
    ? width / aspectRatio(recipe.media.aspect)
    : 0;
  let sectionHeight = Math.ceil(Math.max(
    finalContentBottom + spacing.sectionBlock,
    mediaFrame ? mediaFrame.y + mediaFrame.h + spacing.sectionBlock : 0,
    naturalFullbleedHeight,
  ));
  sectionHeight = Math.max(sectionHeight, band === 'wide' ? 640 : band === 'compact' ? 560 : 520);
  if (mediaAvailable && recipe.media.placement === 'fullbleed') {
    mediaFrame = frame(0, 0, width, sectionHeight);
  }

  let panelFrame: HeroLayoutCompiledFrame | undefined;
  if (recipe.panel === 'surface-offset' && finalContentBottom > contentTop) {
    if (offsetPanelBounds) {
      panelFrame = frame(
        offsetPanelBounds.x,
        offsetPanelBounds.y,
        offsetPanelBounds.right - offsetPanelBounds.x,
        finalContentBottom - offsetPanelBounds.y + spacing.sectionInline,
      );
    } else {
      panelFrame = frame(
        Math.max(0, contentX - spacing.sectionInline),
        Math.max(0, contentTop - spacing.sectionInline),
        Math.min(width, contentWidth + spacing.sectionInline * 2),
        finalContentBottom - contentTop + spacing.sectionInline * 2,
      );
    }
  }

  return {
    width,
    sectionHeight,
    align,
    frames,
    fontSizes,
    ...(mediaFrame ? { mediaFrame } : {}),
    ...(panelFrame ? { panelFrame } : {}),
  };
}

export interface ResolveHeroLayoutVariantInput {
  requestedId: HeroLayoutVariantId;
  section: Section;
  theme: SiteTheme;
  availableMedia: HeroLayoutAvailableMedia;
}

export interface ResolvedHeroLayoutVariant {
  projection: HeroLayoutProjection;
  elements: CanvasElement[];
  height: number;
}

/**
 * Server compiler boundary: normalized catalog recipes become deterministic canvas frames.
 * It has no viewport measurements and never changes a section unless the caller explicitly
 * supplies a new catalog ID.
 */
export function resolveHeroLayoutVariant({
  requestedId,
  section,
  theme,
  availableMedia,
}: ResolveHeroLayoutVariantInput): ResolvedHeroLayoutVariant {
  const resolved = resolveVariant(requestedId, availableMedia);
  const mediaAvailable = mediaAvailableFor(resolved, availableMedia);
  const bands = Object.fromEntries(
    (['wide', 'compact', 'mobile'] as const).map((band) => [
      band,
      compileBand({
        band,
        variant: resolved,
        elements: section.elements,
        theme,
        mediaAvailable,
      }),
    ]),
  ) as HeroLayoutProjection['bands'];
  const wide = bands.wide;
  const overlayCopy = mediaAvailable && (
    resolved.bands.wide.media.placement === 'fullbleed'
    || resolved.bands.wide.flow === 'lower-overlay'
    || resolved.bands.wide.flow === 'video-overlay'
  );
  const elements = section.elements.map((element) => {
    const compiled = wide.frames[element.id];
    if (!compiled) return { ...element };
    const next = { ...element, frame: { ...compiled } as Frame };
    if (element.kind === 'text') {
      next.style = {
        ...element.style,
        fontSize: wide.fontSizes[element.id] ?? element.style.fontSize,
        align: wide.align === 'center' ? 'center' : 'left',
        color: overlayCopy ? element.style.color : theme.palette.text,
      };
    } else if (element.kind === 'button') {
      next.style = {
        ...element.style,
        ...(element.style.variant !== 'solid' && !overlayCopy
          ? { color: theme.palette.text, textColor: theme.palette.text }
          : {}),
      };
    }
    return next;
  });
  return {
    projection: {
      catalogVersion: 1,
      requestedId,
      resolvedId: resolved.id,
      mediaKind: mediaAvailable
        ? resolved.mediaContract.requirement === 'required-video-poster' ? 'video' : 'image'
        : 'none',
      scrim: overlayCopy ? resolved.scrim : 'none',
      bands,
    },
    elements,
    height: wide.sectionHeight,
  };
}
