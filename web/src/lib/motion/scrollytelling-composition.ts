export const SCROLLYTELLING_COMPOSITION_PATTERN_IDS = [
  'center',
  'alternate-lr',
  'left',
  'right',
] as const;

export type ScrollytellingCompositionPattern =
  typeof SCROLLYTELLING_COMPOSITION_PATTERN_IDS[number];

export type CinematicCompositionSignatureId =
  | 'cinematic-scrub'
  | 'scrollytelling-manifesto'
  | 'portal-zoom'
  | 'scroll-curtain'
  | 'horizontal-story';

/** Customer renderer defaults; a future editor control only needs to replace the selected pattern. */
export const CINEMATIC_COMPOSITION_DEFAULTS = {
  'cinematic-scrub': 'left',
  'scrollytelling-manifesto': 'alternate-lr',
  'portal-zoom': 'alternate-lr',
  'scroll-curtain': 'alternate-lr',
  'horizontal-story': 'alternate-lr',
} as const satisfies Record<CinematicCompositionSignatureId, ScrollytellingCompositionPattern>;

export function defaultCinematicCompositionPattern(
  signatureId: CinematicCompositionSignatureId,
): ScrollytellingCompositionPattern {
  return CINEMATIC_COMPOSITION_DEFAULTS[signatureId];
}

export type ScrollytellingPlacement = 'left' | 'right' | 'center';
export type ScrollytellingEntrance = 'from-left' | 'from-right' | 'from-bottom' | 'fade-scale';
export type ScrollytellingCopyTone = 'light' | 'ink';

export interface ScrollytellingResolvedComposition {
  placement: ScrollytellingPlacement;
  entrance: ScrollytellingEntrance;
  tone: ScrollytellingCopyTone;
}

/** 밝은 영역과 충돌하는 특정 막만 예외 처리하는 renderer-level 슬롯이다. */
export type ScrollytellingCompositionOverride = Partial<ScrollytellingResolvedComposition>;

type PatternResolver = (index: number) => Pick<ScrollytellingResolvedComposition, 'placement' | 'entrance'>;

const left: PatternResolver = () => ({ placement: 'left', entrance: 'from-left' });
const right: PatternResolver = () => ({ placement: 'right', entrance: 'from-right' });

const PATTERN_RESOLVERS: Record<ScrollytellingCompositionPattern, PatternResolver> = {
  center: () => ({ placement: 'center', entrance: 'fade-scale' }),
  'alternate-lr': (index) => (index % 2 === 0 ? left(index) : right(index)),
  left,
  right,
};

export function resolveScrollytellingComposition(
  pattern: ScrollytellingCompositionPattern,
  index: number,
  override?: ScrollytellingCompositionOverride | null,
  defaultTone: ScrollytellingCopyTone = 'light',
): ScrollytellingResolvedComposition {
  return {
    ...PATTERN_RESOLVERS[pattern](index),
    tone: defaultTone,
    ...override,
  };
}
