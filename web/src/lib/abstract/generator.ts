import { designDnaById } from '@/lib/design/dna/catalog';
import type { DesignDnaSelection } from '@/lib/design/dna/types';
import type { SiteTheme } from '@/lib/types/site';
import {
  SIGNATURE_TEXT_SAFE_ZONE_GEOMETRY,
  type SignatureBreakpointBand,
} from '@/lib/motion/signature-contract';
import { StableSeedSequence } from './seed';
import type {
  AbsBackgroundProjection,
  AbsNormalizedZone,
  AbsOpacityLevel,
  AbsPatternLayer,
  AbsSvgPath,
  ProceduralBackgroundSpec,
} from './types';

export const ABS_OPACITY = Object.freeze({
  trace: 0.12,
  subtle: 0.24,
  field: 0.42,
} satisfies Record<AbsOpacityLevel, number>);

const BAND_WIDTHS = {
  wide: 1440,
  compact: 768,
  mobile: 390,
} as const satisfies Record<SignatureBreakpointBand, number>;

const DEFAULT_INLINE_SPACE = {
  wide: 24,
  compact: 24,
  mobile: 20,
} as const satisfies Record<SignatureBreakpointBand, number>;

type RampSet = NonNullable<NonNullable<SiteTheme['tokens']>['color']['ramps']>;

interface ResolvedDnaShape {
  strategy: 'mono' | 'neutral-accent' | 'duotone';
  chroma: 'muted' | 'balanced' | 'vivid';
  density: 'compact' | 'balanced' | 'airy';
  radius: 'square' | 'soft' | 'rounded';
}

export interface GenerateAbsBackgroundInput {
  spec: ProceduralBackgroundSpec;
  band: SignatureBreakpointBand;
  theme: SiteTheme;
  designDna: DesignDnaSelection;
}

function remToPixels(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const match = /^(\d+(?:\.\d+)?)rem$/u.exec(value);
  return match ? Number(match[1]) * 16 : fallback;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function guardedZone(
  zone: AbsNormalizedZone,
  band: SignatureBreakpointBand,
  inlineSpace: string | undefined,
): AbsNormalizedZone {
  const guard = remToPixels(inlineSpace, DEFAULT_INLINE_SPACE[band]) / BAND_WIDTHS[band];
  const x = clamp(zone.x - guard);
  const right = clamp(zone.x + zone.width + guard);
  const y = clamp(zone.y - guard);
  const bottom = clamp(zone.y + zone.height + guard);
  return {
    x: Number(x.toFixed(6)),
    y: Number(y.toFixed(6)),
    width: Number((right - x).toFixed(6)),
    height: Number((bottom - y).toFixed(6)),
  };
}

function dnaShape(selection: DesignDnaSelection): ResolvedDnaShape {
  const catalog = designDnaById(selection.dnaId);
  if (!catalog) throw new Error(`Unknown DesignDNA id: ${selection.dnaId}`);
  return {
    strategy: selection.overrides.colorStrategy ?? catalog.color.strategy,
    chroma: selection.overrides.colorChroma ?? catalog.color.chroma,
    density: selection.overrides.density ?? catalog.density,
    radius: selection.overrides.radius ?? catalog.radius,
  };
}

function path(
  d: string,
  options: Omit<AbsSvgPath, 'd' | 'opacity'> & { opacity?: number } = {},
): AbsSvgPath {
  return { d, opacity: options.opacity ?? ABS_OPACITY.subtle, ...options };
}

function fieldOpacity(shape: ResolvedDnaShape): number {
  if (shape.chroma === 'muted') return ABS_OPACITY.subtle;
  if (shape.chroma === 'vivid') return 0.34;
  return ABS_OPACITY.field;
}

function traceOpacity(shape: ResolvedDnaShape): number {
  return shape.chroma === 'muted' ? 0.08 : ABS_OPACITY.trace;
}

function planeFor(
  weight: ProceduralBackgroundSpec['bands'][SignatureBreakpointBand]['weightZone'],
  side: 'primary' | 'secondary',
): string {
  const variants = {
    start: side === 'primary'
      ? 'M0 0H390L330 430L190 1000H0Z'
      : 'M0 0H230L180 300L0 430Z',
    end: side === 'primary'
      ? 'M610 0H1000V1000H810L670 430Z'
      : 'M770 0H1000V430L820 300Z',
    upper: side === 'primary'
      ? 'M0 0H1000V280L560 410L0 310Z'
      : 'M420 0H1000V190L700 320Z',
    lower: side === 'primary'
      ? 'M0 690L440 580L1000 720V1000H0Z'
      : 'M520 690L1000 570V1000H740Z',
    balanced: side === 'primary'
      ? 'M0 0H350L1000 720V1000H760L0 300Z'
      : 'M610 0H1000V620L810 520Z',
  } as const;
  return variants[weight];
}

function linework(
  sequence: StableSeedSequence,
  count: number,
  family: 'orthogonal' | 'diagonal' | 'stepped',
  colors: { primary: string; accent: string; border: string },
  opacity: number,
): AbsSvgPath[] {
  const guides = [80, 160, 280, 420, 580, 720, 840, 920] as const;
  return Array.from({ length: count }, (_, index) => {
    const a = guides[sequence.index(guides.length)]!;
    const b = guides[sequence.index(guides.length)]!;
    const color = [colors.primary, colors.accent, colors.border][index % 3]!;
    if (family === 'orthogonal') {
      return path(
        index % 2 === 0
          ? `M0 ${a}H${b}V1000`
          : `M${a} 0V${b}H1000`,
        { fill: 'none', stroke: color, strokeWidth: 2, opacity },
      );
    }
    if (family === 'stepped') {
      const middle = guides[(sequence.index(guides.length) + index) % guides.length]!;
      return path(`M0 ${a}H${middle}V${b}H1000`, {
        fill: 'none',
        stroke: color,
        strokeWidth: 2,
        strokeLinejoin: 'round',
        opacity,
      });
    }
    return path(`M0 ${a}L1000 ${b}`, {
      fill: 'none',
      stroke: color,
      strokeWidth: 2,
      opacity,
    });
  });
}

function fiberPaths(
  sequence: StableSeedSequence,
  count: number,
  color: string,
  opacity: number,
): AbsSvgPath[] {
  const guides = [90, 170, 260, 360, 490, 620, 760, 880] as const;
  return Array.from({ length: count }, (_, index) => {
    const start = guides[sequence.index(guides.length)]!;
    const end = guides[sequence.index(guides.length)]!;
    const bend = guides[(sequence.index(guides.length) + index) % guides.length]!;
    return path(`M0 ${start}Q500 ${bend} 1000 ${end}`, {
      fill: 'none',
      stroke: color,
      strokeWidth: index % 2 === 0 ? 1.4 : 0.9,
      opacity,
    });
  });
}

function patternFor(
  shape: ResolvedDnaShape,
  sequence: StableSeedSequence,
  colors: { primary: string; accent: string },
): AbsPatternLayer {
  const scale = shape.density === 'airy' ? 80 : shape.density === 'compact' ? 52 : 64;
  const rotation = [0, 90, 180, 270] as const;
  const motif = shape.radius === 'square'
    ? 'stepped-corner'
    : shape.radius === 'rounded'
      ? 'capsule-dash'
      : 'slash-pair';
  const motifPaths = motif === 'stepped-corner'
    ? [
        path('M10 18H28V36M38 48H56V30', {
          fill: 'none',
          stroke: colors.primary,
          strokeWidth: 2,
          strokeLinejoin: 'round',
          opacity: 1,
        }),
      ]
    : motif === 'capsule-dash'
      ? [
          path('M10 32H27M38 32H55', {
            fill: 'none',
            stroke: colors.primary,
            strokeWidth: 3,
            strokeLinecap: 'round',
            opacity: 1,
          }),
          path('M24 14H40', {
            fill: 'none',
            stroke: colors.accent,
            strokeWidth: 2,
            strokeLinecap: 'round',
            opacity: 0.7,
          }),
        ]
      : [
          path('M10 48L26 32M34 48L50 32', {
            fill: 'none',
            stroke: colors.primary,
            strokeWidth: 2,
            strokeLinecap: 'round',
            opacity: 1,
          }),
          path('M26 16L34 8', {
            fill: 'none',
            stroke: colors.accent,
            strokeWidth: 2,
            strokeLinecap: 'round',
            opacity: 0.7,
          }),
        ];
  return {
    width: scale,
    height: scale,
    rotation: sequence.pick(rotation),
    paths: motifPaths,
    opacity: traceOpacity(shape),
  };
}

function authoredProjection(
  input: GenerateAbsBackgroundInput,
  ramps: RampSet,
  quietZone: AbsNormalizedZone,
  guardedQuietZone: AbsNormalizedZone,
): AbsBackgroundProjection {
  const { spec, band, theme, designDna } = input;
  const bandContract = spec.bands[band];
  const shape = dnaShape(designDna);
  const canonicalSeed = [
    spec.familyId,
    designDna.dnaId,
    designDna.hueSeed,
    spec.seed,
    spec.slotId,
    band,
    bandContract.textSafeZoneId,
  ].join('|');
  const sequence = new StableSeedSequence(canonicalSeed);
  const n50 = ramps.neutral['50'];
  const n100 = ramps.neutral['100'];
  const n300 = ramps.neutral['300'];
  const n700 = ramps.neutral['700'];
  const p50 = ramps.primary['50'];
  const p100 = ramps.primary['100'];
  const p200 = ramps.primary['200'];
  const p300 = ramps.primary['300'];
  const p400 = ramps.primary['400'];
  const a50 = ramps.accent['50'];
  const a100 = ramps.accent['100'];
  const a200 = ramps.accent['200'];
  const a300 = ramps.accent['300'];
  const a400 = ramps.accent['400'];
  const angles = [118, 134, 150, 166] as const;
  const base = {
    familyId: spec.familyId,
    band,
    mode: 'authored' as const,
    baseColor: n50,
    quietZone,
    guardedQuietZone,
    quietWashColor: bandContract.textSafeZoneId === 'flow-full' ? n50 : n100,
    quietWashOpacity: 0.9,
    scrim: bandContract.scrim,
    definitionId: `abs-${spec.seed}-${band}`,
  };

  if (spec.familyId === 'abs.soft-gradient-field') {
    const accent = shape.strategy === 'mono' ? p100 : sequence.pick([a100, a200] as const);
    const lowFrequencyPaths = bandContract.textSafeZoneId === 'flow-full'
      ? [path(planeFor(bandContract.weightZone, 'primary'), {
          fill: p100,
          opacity: ABS_OPACITY.subtle,
        })]
      : [
          path(planeFor(bandContract.weightZone, 'primary'), {
            fill: accent,
            opacity: fieldOpacity(shape),
          }),
          path(planeFor(bandContract.weightZone, 'secondary'), {
            fill: n100,
            opacity: ABS_OPACITY.field,
          }),
        ];
    return {
      ...base,
      backgroundImage: `linear-gradient(${sequence.pick(angles)}deg,${n50} 0%,${p100} 56%,${n100} 100%)`,
      lowFrequencyPaths,
      highFrequencyPaths: [],
    };
  }

  if (spec.familyId === 'abs.paper-grain-wash') {
    const fiberCount = shape.density === 'airy' ? 3 : shape.density === 'compact' ? 7 : 5;
    return {
      ...base,
      backgroundImage: `linear-gradient(${sequence.pick(angles)}deg,${n50} 0%,${n100} 100%)`,
      lowFrequencyPaths: [
        path(planeFor(bandContract.weightZone, 'secondary'), {
          fill: shape.strategy === 'mono' ? p50 : sequence.pick([p50, a50] as const),
          opacity: ABS_OPACITY.field,
        }),
      ],
      highFrequencyPaths: fiberPaths(
        sequence,
        fiberCount,
        shape.chroma === 'muted' ? n300 : n700,
        traceOpacity(shape),
      ),
      noise: {
        seed: sequence.index(997) + 1,
        baseFrequency: band === 'mobile'
          ? shape.density === 'compact' ? '0.72' : '0.54'
          : shape.density === 'compact' ? '0.58' : '0.42',
        octaves: shape.chroma === 'vivid' ? 3 : 2,
        opacity: designDna.dnaId === 'medical-clinical-clarity' ? 0.05 : traceOpacity(shape),
      },
    };
  }

  if (spec.familyId === 'abs.geometric-linework') {
    const count = shape.density === 'airy' ? 5 : shape.density === 'compact' ? 9 : 7;
    const lineFamily = sequence.pick(['orthogonal', 'diagonal', 'stepped'] as const);
    return {
      ...base,
      backgroundImage: `linear-gradient(${sequence.pick(angles)}deg,${n50} 0%,${p50} 100%)`,
      lowFrequencyPaths: [
        path(planeFor(bandContract.weightZone, 'primary'), {
          fill: p100,
          opacity: ABS_OPACITY.subtle,
        }),
      ],
      highFrequencyPaths: bandContract.textSafeZoneId === 'flow-full'
        ? []
        : linework(sequence, count, lineFamily, {
            primary: sequence.pick([p300, p400] as const),
            accent: shape.strategy === 'mono' ? p300 : sequence.pick([a300, a400] as const),
            border: theme.tokens!.color.border,
          }, traceOpacity(shape)),
    };
  }

  if (spec.familyId === 'abs.duotone-depth-planes') {
    const accent = shape.strategy === 'mono' ? p200 : sequence.pick([a100, a200] as const);
    return {
      ...base,
      backgroundImage: `linear-gradient(${sequence.pick(angles)}deg,${n100} 0%,${n50} 100%)`,
      lowFrequencyPaths: [
        path(planeFor(bandContract.weightZone, 'primary'), {
          fill: sequence.pick([p100, p200] as const),
          opacity: fieldOpacity(shape),
        }),
        path(planeFor(
          bandContract.weightZone === 'start'
            ? 'end'
            : bandContract.weightZone === 'end'
              ? 'start'
              : bandContract.weightZone === 'upper'
                ? 'lower'
                : 'upper',
          'primary',
        ), {
          fill: accent,
          opacity: fieldOpacity(shape),
        }),
        ...(bandContract.textSafeZoneId === 'flow-full'
          ? []
          : [path('M0 360L1000 620V740L0 480Z', {
              fill: shape.strategy === 'mono' ? p300 : a300,
              opacity: ABS_OPACITY.trace,
            })]),
      ],
      highFrequencyPaths: [],
    };
  }

  const pattern = patternFor(shape, sequence, {
    primary: p300,
    accent: shape.strategy === 'mono' ? p300 : a300,
  });
  return {
    ...base,
    backgroundImage: `linear-gradient(${sequence.pick(angles)}deg,${n50} 0%,${shape.strategy === 'mono' ? p50 : a50} 100%)`,
    lowFrequencyPaths: [
      path(planeFor(bandContract.weightZone, 'primary'), {
        fill: p100,
        opacity: ABS_OPACITY.subtle,
      }),
    ],
    highFrequencyPaths: [],
    pattern: bandContract.textSafeZoneId === 'flow-full'
      ? { ...pattern, opacity: Math.min(pattern.opacity, 0.08) }
      : pattern,
  };
}

/**
 * Pure deterministic compiler. Missing ramps deliberately produce one semantic solid field:
 * no legacy palette is reverse-expanded and no arbitrary color enters the authored pipeline.
 */
export function generateAbsBackground(input: GenerateAbsBackgroundInput): AbsBackgroundProjection {
  const bandContract = input.spec.bands[input.band];
  const quietZone = SIGNATURE_TEXT_SAFE_ZONE_GEOMETRY[input.band][bandContract.textSafeZoneId];
  const guardedQuietZone = guardedZone(
    quietZone,
    input.band,
    input.theme.tokens?.spacing.sectionInline,
  );
  const ramps = input.theme.tokens?.color.ramps;
  if (!ramps) {
    const baseColor = input.theme.tokens?.color.backgroundSubtle ?? input.theme.palette.background;
    return {
      familyId: input.spec.familyId,
      band: input.band,
      mode: 'solid',
      baseColor,
      quietZone,
      guardedQuietZone,
      quietWashColor: baseColor,
      quietWashOpacity: 0,
      lowFrequencyPaths: [],
      highFrequencyPaths: [],
      scrim: bandContract.scrim,
      definitionId: `abs-${input.spec.seed}-${input.band}`,
    };
  }
  return authoredProjection(input, ramps, quietZone, guardedQuietZone);
}
