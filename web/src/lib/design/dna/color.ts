export interface OklchColor {
  l: number;
  c: number;
  h: number;
}

export interface SrgbColor {
  r: number;
  g: number;
  b: number;
}

const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));
const round = (value: number, places = 6): number => Number(value.toFixed(places));

export function normalizeHue(value: number): number {
  const normalized = value % 360;
  return round(normalized < 0 ? normalized + 360 : normalized, 4);
}

function linearToSrgb(value: number): number {
  const encoded = value >= 0.0031308
    ? 1.055 * Math.pow(value, 1 / 2.4) - 0.055
    : 12.92 * value;
  return clamp(encoded);
}

function srgbToLinear(value: number): number {
  const channel = clamp(value);
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/**
 * CSS Color 4 sample conversion, collapsed from OKLab to linear sRGB.
 * Channels are clipped only at the final sRGB boundary used by WCAG luminance.
 */
export function oklchToSrgb(color: OklchColor): SrgbColor {
  const hueRadians = normalizeHue(color.h) * Math.PI / 180;
  const a = color.c * Math.cos(hueRadians);
  const b = color.c * Math.sin(hueRadians);

  const lRoot = color.l + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = color.l - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = color.l - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;

  return {
    r: round(linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    g: round(linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    b: round(linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  };
}

export function relativeLuminance(color: SrgbColor): number {
  return round(
    0.2126 * srgbToLinear(color.r)
    + 0.7152 * srgbToLinear(color.g)
    + 0.0722 * srgbToLinear(color.b),
  );
}

export function contrastRatio(foreground: OklchColor, background: OklchColor): number {
  const foregroundLuminance = relativeLuminance(oklchToSrgb(foreground));
  const backgroundLuminance = relativeLuminance(oklchToSrgb(background));
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return round((lighter + 0.05) / (darker + 0.05), 4);
}

/** Keeps highly chromatic colors from collapsing into clipped edge colors near black/white. */
export function chromaAtLightness(chroma: number, lightness: number): number {
  const edgeLimit = Math.min(clamp(lightness), 1 - clamp(lightness)) * 0.46;
  return round(Math.min(Math.max(0, chroma), Math.max(0, edgeLimit)), 4);
}

export function formatOklch(color: OklchColor): string {
  const l = clamp(color.l).toFixed(4);
  const c = Math.max(0, color.c).toFixed(4);
  const h = normalizeHue(color.h).toFixed(2);
  return `oklch(${l} ${c} ${h})`;
}

export function parseOklch(value: string): OklchColor {
  const match = /^oklch\((\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\)$/u.exec(value);
  if (!match) throw new Error(`Invalid DNA OKLCH token: ${value}`);
  return { l: Number(match[1]), c: Number(match[2]), h: Number(match[3]) };
}

export interface ContrastCorrection {
  color: OklchColor;
  beforeRatio: number;
  afterRatio: number;
  corrected: boolean;
}

/** Finds the nearest AA-passing lightness on the fixed 0.02 adjustment grid. */
export function ensureContrast(
  foreground: OklchColor,
  background: OklchColor,
  minimum = 4.5,
): ContrastCorrection {
  const original: OklchColor = {
    l: round(clamp(foreground.l), 4),
    c: chromaAtLightness(foreground.c, foreground.l),
    h: normalizeHue(foreground.h),
  };
  const beforeRatio = contrastRatio(original, background);
  if (beforeRatio >= minimum) {
    return { color: original, beforeRatio, afterRatio: beforeRatio, corrected: false };
  }

  for (let step = 1; step <= 50; step += 1) {
    const delta = step * 0.02;
    const candidates = [original.l - delta, original.l + delta]
      .filter((lightness) => lightness >= 0 && lightness <= 1)
      .map((lightness) => {
        const color = {
          l: round(lightness, 4),
          c: chromaAtLightness(original.c, lightness),
          h: original.h,
        };
        return { color, ratio: contrastRatio(color, background) };
      })
      .filter((candidate) => candidate.ratio >= minimum)
      .sort((left, right) => right.ratio - left.ratio || left.color.l - right.color.l);
    const nearest = candidates[0];
    if (nearest) {
      return {
        color: nearest.color,
        beforeRatio,
        afterRatio: nearest.ratio,
        corrected: true,
      };
    }
  }

  const endpoints = [
    { l: 0, c: 0, h: original.h },
    { l: 1, c: 0, h: original.h },
  ].map((color) => ({ color, ratio: contrastRatio(color, background) }))
    .sort((left, right) => right.ratio - left.ratio);
  const fallback = endpoints[0];
  if (!fallback || fallback.ratio < minimum) {
    throw new Error('DNA contrast correction could not reach WCAG AA.');
  }
  return {
    color: fallback.color,
    beforeRatio,
    afterRatio: fallback.ratio,
    corrected: true,
  };
}
