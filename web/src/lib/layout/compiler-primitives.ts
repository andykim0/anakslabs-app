import { SIGNATURE_TEXT_SAFE_ZONE_GEOMETRY } from '@/lib/motion/signature-contract';
import type {
  ButtonElement,
  CanvasElement,
  SiteTheme,
  TextElement,
} from '@/lib/types/site';
import type {
  SectionLayoutBreakpointBand,
  SectionLayoutCompiledFrame,
} from './section-layout-types';

export const LAYOUT_BAND_WIDTHS = {
  wide: 1440,
  compact: 768,
  mobile: 390,
} as const;

const LAYOUT_BASE_STAGE_HEIGHTS = {
  wide: 900,
  compact: 720,
  mobile: 700,
} as const;

const LEGACY_SPACING = {
  wide: { sectionBlock: 64, sectionInline: 24, elementGap: 20 },
  compact: { sectionBlock: 52, sectionInline: 24, elementGap: 18 },
  mobile: { sectionBlock: 44, sectionInline: 20, elementGap: 16 },
} as const;

export function remToLayoutPixels(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const match = /^(-?\d+(?:\.\d+)?)rem$/u.exec(value);
  return match ? Number(match[1]) * 16 : fallback;
}

export function layoutSpacing(theme: SiteTheme, band: SectionLayoutBreakpointBand) {
  const fallback = LEGACY_SPACING[band];
  return {
    sectionBlock: remToLayoutPixels(theme.tokens?.spacing.sectionBlock, fallback.sectionBlock),
    sectionInline: remToLayoutPixels(theme.tokens?.spacing.sectionInline, fallback.sectionInline),
    elementGap: remToLayoutPixels(theme.tokens?.spacing.elementGap, fallback.elementGap),
  };
}

export function layoutFontSize(
  theme: SiteTheme,
  role: 'caption' | 'body' | 'lead' | 'title' | 'display',
  fallback: number,
): number {
  return remToLayoutPixels(theme.tokens?.typography.size[role], fallback);
}

export function roundedLayoutFrame(
  x: number,
  y: number,
  w: number,
  h: number,
): SectionLayoutCompiledFrame {
  return {
    x: Number(x.toFixed(4)),
    y: Number(y.toFixed(4)),
    w: Number(w.toFixed(4)),
    h: Number(h.toFixed(4)),
  };
}

export function layoutAspectRatio(value: string | undefined): number {
  if (!value) return 4 / 3;
  const [width, height] = value.split(':').map(Number);
  return width && height ? width / height : 4 / 3;
}

export function estimatedLayoutTextLines(
  text: string,
  frameWidth: number,
  fontSize: number,
  capacityFactor = 1,
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

export function layoutTextHeight(
  text: string,
  width: number,
  fontSize: number,
  lineHeight: number,
  maximumLines?: number,
): number {
  const lines = estimatedLayoutTextLines(text, width, fontSize);
  return Math.ceil(Math.min(maximumLines ?? lines, lines) * fontSize * lineHeight);
}

export function elementById(
  elements: readonly CanvasElement[],
  id: string | undefined,
): CanvasElement | undefined {
  return id ? elements.find((element) => element.id === id) : undefined;
}

export function textById(
  elements: readonly CanvasElement[],
  id: string | undefined,
): TextElement | undefined {
  const element = elementById(elements, id);
  return element?.kind === 'text' ? element : undefined;
}

export function buttonById(
  elements: readonly CanvasElement[],
  id: string | undefined,
): ButtonElement | undefined {
  const element = elementById(elements, id);
  return element?.kind === 'button' ? element : undefined;
}

export function safeZoneFrame(
  band: SectionLayoutBreakpointBand,
  zoneId: keyof typeof SIGNATURE_TEXT_SAFE_ZONE_GEOMETRY.wide,
) {
  const width = LAYOUT_BAND_WIDTHS[band];
  const zone = SIGNATURE_TEXT_SAFE_ZONE_GEOMETRY[band][zoneId];
  return {
    x: zone.x * width,
    y: zone.y * LAYOUT_BASE_STAGE_HEIGHTS[band],
    w: zone.width * width,
    h: zone.height * LAYOUT_BASE_STAGE_HEIGHTS[band],
  };
}

export function putFrame(
  frames: Record<string, SectionLayoutCompiledFrame>,
  id: string | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (!id) return;
  frames[id] = roundedLayoutFrame(x, y, w, h);
}

export interface LayoutIntroResult {
  bottom: number;
  fontSizes: Record<string, number>;
}

export function layoutSectionIntro({
  band,
  elements,
  theme,
  frames,
  eyebrowId,
  titleId,
  leadId,
  x,
  y,
  width,
  align = 'left',
}: {
  band: SectionLayoutBreakpointBand;
  elements: readonly CanvasElement[];
  theme: SiteTheme;
  frames: Record<string, SectionLayoutCompiledFrame>;
  eyebrowId?: string;
  titleId: string;
  leadId?: string;
  x: number;
  y: number;
  width: number;
  align?: 'left' | 'center';
}): LayoutIntroResult {
  const spacing = layoutSpacing(theme, band);
  const fontSizes: Record<string, number> = {};
  let cursor = y;
  const eyebrow = textById(elements, eyebrowId);
  if (eyebrow && eyebrowId) {
    const size = layoutFontSize(theme, 'caption', 14);
    const height = layoutTextHeight(eyebrow.text, width, size, 1.45);
    putFrame(frames, eyebrowId, x, cursor, width, height);
    fontSizes[eyebrowId] = size;
    cursor += height + spacing.elementGap;
  }
  const title = textById(elements, titleId);
  if (title) {
    const size = layoutFontSize(theme, band === 'mobile' ? 'title' : 'display', band === 'mobile' ? 34 : 54);
    const height = layoutTextHeight(title.text, width, size, theme.tokens?.typography.lineHeight.heading ?? 1.2);
    putFrame(frames, titleId, x, cursor, width, height);
    fontSizes[titleId] = size;
    cursor += height;
  }
  const lead = textById(elements, leadId);
  if (lead && leadId) {
    cursor += spacing.elementGap;
    const size = layoutFontSize(theme, 'lead', band === 'mobile' ? 17 : 20);
    const leadWidth = align === 'center' ? width * 0.82 : width;
    const leadX = align === 'center' ? x + (width - leadWidth) / 2 : x;
    const height = layoutTextHeight(lead.text, leadWidth, size, theme.tokens?.typography.lineHeight.body ?? 1.65);
    putFrame(frames, leadId, leadX, cursor, leadWidth, height);
    fontSizes[leadId] = size;
    cursor += height;
  }
  return { bottom: cursor, fontSizes };
}

export function clampLayoutFocalPoint(
  point: { x: number; y: number } | undefined,
): { x: number; y: number } {
  return {
    x: Math.max(0.2, Math.min(0.8, point?.x ?? 0.5)),
    y: Math.max(0.2, Math.min(0.8, point?.y ?? 0.5)),
  };
}
