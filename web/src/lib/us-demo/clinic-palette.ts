import { contrastRatio, relLuminance } from '@/lib/design/quality-standards';

/**
 * TEMPLATE-SYSTEM §2 — the seven slots a template may reference. Nothing else is a colour, and
 * shadows and borders are alpha variants of --ink.
 */
export const CLINIC_PALETTE_SLOTS = [
  '--brand',
  '--brand-ink',
  '--accent',
  '--surface',
  '--surface-2',
  '--ink',
  '--ink-muted',
] as const;

export type ClinicPaletteSlot = (typeof CLINIC_PALETTE_SLOTS)[number];

/** §2-2, in priority order. The logo is first because it is the one colour a brand chose. */
export const CLINIC_PALETTE_ORIGINS = [
  'logo',
  'cta',
  'link',
  'heading',
  'theme-color',
  'specialty-fallback',
] as const;

export type ClinicPaletteOrigin = (typeof CLINIC_PALETTE_ORIGINS)[number];

export type ClinicSpecialty =
  | 'dental'
  | 'derm-plastic-aesthetic'
  | 'ortho-surgery-pain'
  | 'eye-internal-general';

/** §2-3. Recorded so the clinic can overturn the automatic choice. */
export const CLINIC_PALETTE_REFINEMENTS = [
  'none',
  'saturate',
  'electrify',
  'deep-neutral',
  'lighten-demote',
  'ink-reassign',
] as const;

export type ClinicPaletteRefinement = (typeof CLINIC_PALETTE_REFINEMENTS)[number];

/** §2-4. Fallback use is recorded in meta, per §7-6. */
export const CLINIC_PALETTE_FALLBACKS: Readonly<Record<ClinicSpecialty, {
  brand: string;
  accent: string;
}>> = Object.freeze({
  dental: { brand: '#152D49', accent: '#4253FF' },
  'derm-plastic-aesthetic': { brand: '#201D1B', accent: '#C8A92D' },
  'ortho-surgery-pain': { brand: '#14151D', accent: '#FECC00' },
  'eye-internal-general': { brand: '#1D364F', accent: '#1890D7' },
});

export interface ClinicPaletteInput {
  /** Candidate colours in §2-2 priority order; the first parseable one wins. */
  candidates: readonly { origin: ClinicPaletteOrigin; hex: string }[];
  /** body background. Forced to white below L 0.92 per §2-2. */
  surface?: string;
  specialty: ClinicSpecialty;
  /**
   * §2-3 tie-break. A picture-heavy source takes the deep neutral, because high chroma fights
   * photography; a type-led source takes the electric treatment.
   */
  imageDense: boolean;
}

export interface ClinicPalette {
  slots: Readonly<Record<ClinicPaletteSlot, string>>;
  meta: {
    origin: ClinicPaletteOrigin;
    fallbackUsed: boolean;
    refinement: ClinicPaletteRefinement;
    /** §2-5 gates that failed on the extracted colour, forcing the fallback. */
    gateFailures: string[];
  };
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const value = hex.trim().replace(/^#/u, '');
  const full = value.length === 3
    ? value.split('').map((c) => c + c).join('')
    : value;
  if (!/^[0-9a-f]{6}$/iu.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const part = (n: number) => Math.round(Math.max(0, Math.min(255, n)))
    .toString(16)
    .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r
    ? ((g - b) / d + (g < b ? 6 : 0))
    : max === g
      ? (b - r) / d + 2
      : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToHex({ h, s, l }: { h: number; s: number; l: number }): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
      : hp < 3 ? [0, c, x]
        : hp < 4 ? [0, x, c]
          : hp < 5 ? [x, 0, c]
            : [c, 0, x];
  const m = l - c / 2;
  return toHex({ r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 });
}

/**
 * §2-3. Hue is preserved and only saturation and lightness are re-imagined: the corpus's largest
 * family was a muted mid blue, and shipping that back leaves the demo in the same world as the
 * site it replaces.
 */
export function refineBrandColor(
  hex: string,
  imageDense: boolean,
): { hex: string; refinement: ClinicPaletteRefinement } {
  const hsl = hexToHsl(hex);
  if (!hsl) return { hex, refinement: 'none' };
  if (hsl.l < 0.12) return { hex, refinement: 'ink-reassign' };
  if (hsl.l > 0.75) {
    return { hex: hslToHex({ ...hsl, l: 0.55 }), refinement: 'lighten-demote' };
  }
  if (hsl.s < 0.35) {
    return { hex: hslToHex({ ...hsl, s: 0.55 }), refinement: 'saturate' };
  }
  if (hsl.s < 0.75 && hsl.l >= 0.25 && hsl.l <= 0.55) {
    return imageDense
      ? { hex: hslToHex({ ...hsl, s: 0.30, l: 0.18 }), refinement: 'deep-neutral' }
      : { hex: hslToHex({ ...hsl, s: 0.90, l: 0.55 }), refinement: 'electrify' };
  }
  return { hex, refinement: 'none' };
}

/** §2-5. A failure here returns the palette to the specialty fallback rather than shipping it. */
export function clinicPaletteGateFailures(input: {
  brand: string;
  brandInk: string;
  accent: string;
  surface: string;
  ink: string;
}): string[] {
  const failures: string[] = [];
  if (contrastRatio(input.ink, input.surface) < 12) failures.push('ink/surface 12:1');
  if (contrastRatio(input.brand, input.surface) < 4.5) failures.push('brand/surface 4.5:1');
  if (contrastRatio(input.brandInk, input.brand) < 4.5) failures.push('brand-ink/brand 4.5:1');
  const brandHsl = hexToHsl(input.brand);
  const accentHsl = hexToHsl(input.accent);
  if (brandHsl && accentHsl) {
    const deltaH = Math.min(
      Math.abs(brandHsl.h - accentHsl.h),
      360 - Math.abs(brandHsl.h - accentHsl.h),
    );
    if (deltaH < 15 && Math.abs(brandHsl.l - accentHsl.l) < 0.2) {
      failures.push('accent separation ΔH 15° or ΔL 0.2');
    }
  }
  return failures;
}

function inkFor(surface: string): { ink: string; inkMuted: string } {
  return relLuminance(surface) > 0.5
    ? { ink: '#111318', inkMuted: '#5A6270' }
    : { ink: '#F5F7FA', inkMuted: '#A8B0BC' };
}

function surfaceStep(surface: string): string {
  const hsl = hexToHsl(surface);
  if (!hsl) return '#F4F6F9';
  // ΔL 3~8 per §2-1, taken away from the extreme so the step stays visible either way.
  return hslToHex({ ...hsl, l: hsl.l > 0.5 ? hsl.l - 0.05 : hsl.l + 0.05 });
}

/**
 * The palette a template is allowed to see. Every failure path lands on the specialty fallback
 * and says so in meta, because a demo that quietly invents a brand colour is worse than one that
 * admits it used a default.
 */
export function buildClinicPalette(input: ClinicPaletteInput): ClinicPalette {
  const fallback = CLINIC_PALETTE_FALLBACKS[input.specialty];
  const rawSurface = input.surface && parseHex(input.surface) ? input.surface : '#FFFFFF';
  // §2-2: anything darker than 0.92 is not a page background we keep.
  const surface = relLuminance(rawSurface) >= 0.92 ? rawSurface : '#FFFFFF';
  const surface2 = surfaceStep(surface);
  const { ink, inkMuted } = inkFor(surface);

  const picked = input.candidates.find((candidate) => parseHex(candidate.hex));
  const refined = picked
    ? refineBrandColor(picked.hex, input.imageDense)
    : { hex: fallback.brand, refinement: 'none' as ClinicPaletteRefinement };
  const brand = refined.refinement === 'ink-reassign' ? fallback.brand : refined.hex;
  const accent = fallback.accent;
  const brandInk = contrastRatio('#FFFFFF', brand) >= contrastRatio('#111318', brand)
    ? '#FFFFFF'
    : '#111318';

  const gateFailures = clinicPaletteGateFailures({ brand, brandInk, accent, surface, ink });
  const useFallback = !picked || gateFailures.length > 0;
  const finalBrand = useFallback ? fallback.brand : brand;
  const finalBrandInk = contrastRatio('#FFFFFF', finalBrand) >= contrastRatio('#111318', finalBrand)
    ? '#FFFFFF'
    : '#111318';

  return {
    slots: Object.freeze({
      '--brand': finalBrand,
      '--brand-ink': finalBrandInk,
      '--accent': fallback.accent,
      '--surface': surface,
      '--surface-2': surface2,
      '--ink': ink,
      '--ink-muted': inkMuted,
    }),
    meta: {
      origin: useFallback ? 'specialty-fallback' : picked!.origin,
      fallbackUsed: useFallback,
      refinement: useFallback ? 'none' : refined.refinement,
      gateFailures,
    },
  };
}
