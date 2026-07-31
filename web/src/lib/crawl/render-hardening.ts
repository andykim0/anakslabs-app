export const MAX_SCREENSHOT_SEGMENT_HEIGHT = 16_384;
export const DIM_SCRIM_MIN_COVER = 0.55;
export const DIM_SCRIM_MIN_ALPHA = 0.15;
export const DIM_SCRIM_MAX_LUMINANCE = 0.35;

interface RgbaColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

function byte(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 255 ? parsed : null;
}

function alpha(value: string | undefined): number | null {
  if (value === undefined) return 1;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : null;
}

export function parseComputedRgba(value: string): RgbaColor | null {
  const match = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/iu
    .exec(value.trim());
  if (!match) return null;
  const red = byte(match[1]);
  const green = byte(match[2]);
  const blue = byte(match[3]);
  const opacity = alpha(match[4]);
  return red === null || green === null || blue === null || opacity === null
    ? null
    : { red, green, blue, alpha: opacity };
}

function linearChannel(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: Pick<RgbaColor, 'red' | 'green' | 'blue'>): number {
  return (
    0.2126 * linearChannel(color.red)
    + 0.7152 * linearChannel(color.green)
    + 0.0722 * linearChannel(color.blue)
  );
}

export function paintedLuminance(
  color: Pick<RgbaColor, 'red' | 'green' | 'blue'>,
): number {
  return (
    0.2126 * color.red
    + 0.7152 * color.green
    + 0.0722 * color.blue
  ) / 255;
}

/**
 * Exact 30-layer validated predicate. Every condition is required: partial
 * predicates delete transparent heroes or normal dark content sections.
 */
export function isDimBackdrop(input: {
  rectWidth: number;
  rectHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  computedBackgroundColor: string;
  interactiveDescendantCount: number;
  innerTextLength: number;
}): boolean {
  const color = parseComputedRgba(input.computedBackgroundColor);
  const viewportArea = input.viewportWidth * input.viewportHeight;
  const cover = viewportArea > 0
    ? (input.rectWidth * input.rectHeight) / viewportArea
    : 0;
  return Boolean(
    color
    && cover >= DIM_SCRIM_MIN_COVER
    && color.alpha > DIM_SCRIM_MIN_ALPHA
    && paintedLuminance(color) < DIM_SCRIM_MAX_LUMINANCE
    && input.interactiveDescendantCount === 0
    && input.innerTextLength <= 4,
  );
}

export function screenshotSegments(
  totalHeight: number,
  maximumHeight = MAX_SCREENSHOT_SEGMENT_HEIGHT,
): Array<{ y: number; height: number }> {
  if (!Number.isFinite(totalHeight) || totalHeight <= 0) return [];
  if (!Number.isFinite(maximumHeight) || maximumHeight <= 0) {
    throw new RangeError('maximumHeight must be a positive finite number');
  }
  const result: Array<{ y: number; height: number }> = [];
  const roundedTotal = Math.ceil(totalHeight);
  const roundedMaximum = Math.floor(maximumHeight);
  for (let y = 0; y < roundedTotal; y += roundedMaximum) {
    result.push({ y, height: Math.min(roundedMaximum, roundedTotal - y) });
  }
  return result;
}
