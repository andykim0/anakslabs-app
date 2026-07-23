import type {
  ActiveMotionSignatureId,
  SectionType,
} from '@/lib/types/site';
import {
  defaultCinematicCompositionPattern,
  resolveScrollytellingComposition,
  type ScrollytellingEntrance,
  type ScrollytellingPlacement,
} from '@/lib/motion/scrollytelling-composition';

export const SIGNATURE_CONTRACT_PHASE_IDS = [
  'enter',
  'hold',
  'settle',
  'exit',
] as const;

export type SignatureContractPhaseId = typeof SIGNATURE_CONTRACT_PHASE_IDS[number];

export const SIGNATURE_BREAKPOINT_BANDS = ['wide', 'compact', 'mobile'] as const;
export type SignatureBreakpointBand = typeof SIGNATURE_BREAKPOINT_BANDS[number];

export const SIGNATURE_TEXT_SAFE_ZONE_IDS = [
  'start-middle',
  'start-lower',
  'end-middle',
  'end-lower',
  'center-middle',
  'flow-start',
  'flow-alternate',
  'flow-full',
] as const;

export type SignatureTextSafeZoneId = typeof SIGNATURE_TEXT_SAFE_ZONE_IDS[number];

export interface NormalizedSignatureZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Geometry is normalized and renderer-independent; no viewport or canvas units enter the contract. */
export const SIGNATURE_TEXT_SAFE_ZONE_GEOMETRY = {
  wide: {
    'start-middle': { x: 0.06, y: 0.22, width: 0.42, height: 0.5 },
    'start-lower': { x: 0.06, y: 0.48, width: 0.42, height: 0.42 },
    'end-middle': { x: 0.52, y: 0.22, width: 0.42, height: 0.5 },
    'end-lower': { x: 0.52, y: 0.48, width: 0.42, height: 0.42 },
    'center-middle': { x: 0.2, y: 0.2, width: 0.6, height: 0.58 },
    'flow-start': { x: 0.06, y: 0.12, width: 0.58, height: 0.76 },
    'flow-alternate': { x: 0.18, y: 0.12, width: 0.64, height: 0.76 },
    'flow-full': { x: 0.06, y: 0.08, width: 0.88, height: 0.84 },
  },
  compact: {
    'start-middle': { x: 0.06, y: 0.2, width: 0.52, height: 0.56 },
    'start-lower': { x: 0.06, y: 0.46, width: 0.52, height: 0.44 },
    'end-middle': { x: 0.42, y: 0.2, width: 0.52, height: 0.56 },
    'end-lower': { x: 0.42, y: 0.46, width: 0.52, height: 0.44 },
    'center-middle': { x: 0.14, y: 0.18, width: 0.72, height: 0.62 },
    'flow-start': { x: 0.06, y: 0.1, width: 0.7, height: 0.8 },
    'flow-alternate': { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    'flow-full': { x: 0.05, y: 0.08, width: 0.9, height: 0.84 },
  },
  mobile: {
    'start-middle': { x: 0.06, y: 0.18, width: 0.88, height: 0.5 },
    'start-lower': { x: 0.06, y: 0.48, width: 0.88, height: 0.42 },
    'end-middle': { x: 0.06, y: 0.18, width: 0.88, height: 0.5 },
    'end-lower': { x: 0.06, y: 0.48, width: 0.88, height: 0.42 },
    'center-middle': { x: 0.06, y: 0.2, width: 0.88, height: 0.6 },
    'flow-start': { x: 0.06, y: 0.08, width: 0.88, height: 0.84 },
    'flow-alternate': { x: 0.06, y: 0.08, width: 0.88, height: 0.84 },
    'flow-full': { x: 0.05, y: 0.06, width: 0.9, height: 0.88 },
  },
} as const satisfies Record<
  SignatureBreakpointBand,
  Record<SignatureTextSafeZoneId, NormalizedSignatureZone>
>;

export type SignatureTextColorToken = 'text' | 'background' | 'surface';
export type SignatureScrim = 'none' | 'subtle-scrim';

export interface SignaturePhase {
  id: SignatureContractPhaseId;
  /** Visibility-ratio interval in normalized page progress. */
  visibilityRatio: readonly [number, number];
}

export interface SignatureContrastPolicy {
  textColorToken: SignatureTextColorToken;
  scrim: SignatureScrim;
}

export interface SignatureRenderContract {
  needsPinnedStage: boolean;
  scrollDepthActs: number;
  posterRequired: boolean;
  reducedMotionFallbackZone: SignatureTextSafeZoneId;
  noJsReadable: boolean;
}

export interface SignatureContentShape {
  minSections: number;
  maxSections: number;
  suitableSectionTypes: readonly SectionType[];
}

export interface SignatureContract {
  phases: readonly SignaturePhase[];
  textSafeZones: Readonly<Record<
    SignatureContractPhaseId,
    Readonly<Record<SignatureBreakpointBand, readonly SignatureTextSafeZoneId[]>>
  >>;
  contrastPolicy: Readonly<Record<SignatureContractPhaseId, SignatureContrastPolicy>>;
  renderContract: SignatureRenderContract;
  contentShape: SignatureContentShape;
}

export interface SignatureContractEnvironment {
  [key: string]: string | undefined;
  SIGNATURE_CONTRACT_ENABLED?: string;
}

/** Server-owned rollout switch. Missing, blank, and malformed values are OFF. */
export function signatureContractEnabled(
  environment: SignatureContractEnvironment = process.env,
): boolean {
  return environment.SIGNATURE_CONTRACT_ENABLED === '1';
}

export interface SignaturePlacementContent {
  phase?: SignatureContractPhaseId;
  textLength?: number;
}

export interface ResolvedSignaturePlacement {
  zone: SignatureTextSafeZoneId;
  normalized: NormalizedSignatureZone;
  placement: ScrollytellingPlacement;
  entrance: ScrollytellingEntrance;
}

const phases = (
  enterEnd: number,
  holdEnd: number,
  settleEnd: number,
): readonly SignaturePhase[] => [
  { id: 'enter', visibilityRatio: [0, enterEnd] },
  { id: 'hold', visibilityRatio: [enterEnd, holdEnd] },
  { id: 'settle', visibilityRatio: [holdEnd, settleEnd] },
  { id: 'exit', visibilityRatio: [settleEnd, 1] },
];

function safeZones(
  wide: readonly SignatureTextSafeZoneId[],
  compact: readonly SignatureTextSafeZoneId[],
  mobile: readonly SignatureTextSafeZoneId[],
): SignatureContract['textSafeZones'] {
  const bands = { wide, compact, mobile } as const;
  return {
    enter: bands,
    hold: bands,
    settle: bands,
    exit: bands,
  };
}

function contrast(
  textColorToken: SignatureTextColorToken,
  scrim: SignatureScrim,
): SignatureContract['contrastPolicy'] {
  const policy = { textColorToken, scrim } as const;
  return { enter: policy, hold: policy, settle: policy, exit: policy };
}

/** Active-only authored contracts. Candidate and legacy catalog entries intentionally remain un-authored. */
export const ACTIVE_SIGNATURE_CONTRACTS = {
  // Full-bleed footage keeps copy in alternating edge-safe zones away from the focal center.
  'cinematic-scrub': {
    phases: phases(0.16, 0.66, 0.88),
    textSafeZones: safeZones(
      ['start-middle', 'end-middle'],
      ['start-middle', 'end-middle'],
      ['start-lower', 'start-middle'],
    ),
    contrastPolicy: contrast('text', 'subtle-scrim'),
    renderContract: {
      needsPinnedStage: true,
      scrollDepthActs: 3,
      posterRequired: true,
      reducedMotionFallbackZone: 'start-lower',
      noJsReadable: true,
    },
    contentShape: { minSections: 1, maxSections: 1, suitableSectionTypes: ['hero'] },
  },
  // Narrative acts alternate across the frame while mobile collapses the same rhythm vertically.
  'scrollytelling-manifesto': {
    phases: phases(0.12, 0.7, 0.9),
    textSafeZones: safeZones(
      ['start-middle', 'end-middle', 'center-middle'],
      ['start-middle', 'end-middle'],
      ['start-lower', 'start-middle'],
    ),
    contrastPolicy: contrast('text', 'subtle-scrim'),
    renderContract: {
      needsPinnedStage: true,
      scrollDepthActs: 3,
      posterRequired: true,
      reducedMotionFallbackZone: 'flow-full',
      noJsReadable: true,
    },
    contentShape: {
      minSections: 3,
      maxSections: 5,
      suitableSectionTypes: ['hero', 'about', 'features', 'custom'],
    },
  },
  // Sticky cards own a stable full-flow reading column instead of competing with their stack depth.
  'true-card-stack': {
    phases: phases(0.14, 0.72, 0.9),
    textSafeZones: safeZones(
      ['flow-start', 'flow-full'],
      ['flow-start', 'flow-full'],
      ['flow-full'],
    ),
    contrastPolicy: contrast('text', 'none'),
    renderContract: {
      needsPinnedStage: false,
      scrollDepthActs: 3,
      posterRequired: false,
      reducedMotionFallbackZone: 'flow-full',
      noJsReadable: true,
    },
    contentShape: {
      minSections: 1,
      maxSections: 1,
      suitableSectionTypes: ['menu', 'features', 'pricing', 'gallery', 'cases'],
    },
  },
  // Curtain travel swaps copy and media sides so the reveal edge never crosses the reading zone.
  'scroll-curtain': {
    phases: phases(0.14, 0.68, 0.9),
    textSafeZones: safeZones(
      ['start-middle', 'end-middle'],
      ['start-middle', 'end-middle'],
      ['start-lower', 'start-middle'],
    ),
    contrastPolicy: contrast('text', 'subtle-scrim'),
    renderContract: {
      needsPinnedStage: true,
      scrollDepthActs: 2,
      posterRequired: true,
      reducedMotionFallbackZone: 'flow-full',
      noJsReadable: true,
    },
    contentShape: {
      minSections: 2,
      maxSections: 4,
      suitableSectionTypes: ['hero', 'about', 'features', 'gallery', 'cases', 'custom'],
    },
  },
  // Timeline copy alternates around its path on wide screens and becomes one readable mobile flow.
  'path-journey': {
    phases: phases(0.12, 0.74, 0.92),
    textSafeZones: safeZones(
      ['flow-alternate', 'flow-full'],
      ['flow-alternate', 'flow-full'],
      ['flow-full'],
    ),
    contrastPolicy: contrast('text', 'none'),
    renderContract: {
      needsPinnedStage: false,
      scrollDepthActs: 3,
      posterRequired: false,
      reducedMotionFallbackZone: 'flow-full',
      noJsReadable: true,
    },
    contentShape: {
      minSections: 1,
      maxSections: 1,
      suitableSectionTypes: ['about', 'features', 'custom', 'faq'],
    },
  },
} as const satisfies Record<ActiveMotionSignatureId, SignatureContract>;

const CINEMATIC_ACTIVE_SIGNATURES = [
  'cinematic-scrub',
  'scrollytelling-manifesto',
  'scroll-curtain',
] as const;

function isCinematicActiveSignature(
  signatureId: ActiveMotionSignatureId,
): signatureId is typeof CINEMATIC_ACTIVE_SIGNATURES[number] {
  return (CINEMATIC_ACTIVE_SIGNATURES as readonly string[]).includes(signatureId);
}

function placementForZone(
  zone: SignatureTextSafeZoneId,
  index: number,
): ScrollytellingPlacement {
  if (zone.startsWith('end-')) return 'right';
  if (zone.startsWith('center-')) return 'center';
  if (zone === 'flow-alternate') return index % 2 === 0 ? 'left' : 'right';
  return 'left';
}

function entranceForZone(
  zone: SignatureTextSafeZoneId,
  placement: ScrollytellingPlacement,
): ScrollytellingEntrance {
  if (zone.endsWith('-lower')) return 'from-bottom';
  if (placement === 'right') return 'from-right';
  if (placement === 'center') return 'fade-scale';
  return 'from-left';
}

/**
 * Deterministic contract placement. The existing composition resolver remains the cinematic
 * preference source; this function constrains that preference to authored safe zones.
 */
export function resolvePlacement(
  signatureId: ActiveMotionSignatureId,
  sectionIndex: number,
  breakpointBand: SignatureBreakpointBand,
  content: SignaturePlacementContent = {},
): ResolvedSignaturePlacement {
  const contract = ACTIVE_SIGNATURE_CONTRACTS[signatureId];
  const phase = content.phase ?? 'hold';
  const zones = contract.textSafeZones[phase][breakpointBand];
  const normalizedIndex = Math.abs(Math.trunc(sectionIndex));
  const preferred = isCinematicActiveSignature(signatureId)
    ? resolveScrollytellingComposition(
        defaultCinematicCompositionPattern(signatureId),
        normalizedIndex,
      ).placement
    : undefined;
  const preferredZone = preferred
    ? zones.find((zone) => placementForZone(zone, normalizedIndex) === preferred)
    : undefined;
  const longestFirst = (content.textLength ?? 0) > 240
    ? [...zones].sort((left, right) => {
        const leftGeometry = SIGNATURE_TEXT_SAFE_ZONE_GEOMETRY[breakpointBand][left];
        const rightGeometry = SIGNATURE_TEXT_SAFE_ZONE_GEOMETRY[breakpointBand][right];
        return rightGeometry.width * rightGeometry.height - leftGeometry.width * leftGeometry.height;
      })
    : zones;
  const zone = preferredZone ?? longestFirst[normalizedIndex % longestFirst.length]!;
  const placement = placementForZone(zone, normalizedIndex);
  return {
    zone,
    normalized: SIGNATURE_TEXT_SAFE_ZONE_GEOMETRY[breakpointBand][zone],
    placement,
    entrance: entranceForZone(zone, placement),
  };
}
