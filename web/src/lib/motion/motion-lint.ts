import type { ActiveMotionSignatureId } from '@/lib/types/site';
import {
  ACTIVE_SIGNATURE_CONTRACTS,
  SIGNATURE_BREAKPOINT_BANDS,
  SIGNATURE_CONTRACT_PHASE_IDS,
  SIGNATURE_TEXT_SAFE_ZONE_GEOMETRY,
  resolvePlacement,
  type NormalizedSignatureZone,
  type SignatureBreakpointBand,
  type SignatureContractPhaseId,
  type SignatureTextSafeZoneId,
} from '@/lib/motion/signature-contract';

export const MOTION_LINT_AA_RATIO = 4.5;
export const MOTION_LINT_CLS_BUDGET = 0.001;

export const MOTION_LINT_VIOLATION_CODES = [
  'text-outside-safe-zone',
  'contrast-below-aa',
  'text-clipped',
  'horizontal-overflow',
  'cls-budget-exceeded',
  'no-js-content-missing',
  'media-focus-inside-text-safe-zone',
  'media-crop-subject-cut-risk',
] as const;

export type MotionLintViolationCode = typeof MOTION_LINT_VIOLATION_CODES[number];

export interface MotionLintMeasurement {
  signatureId: ActiveMotionSignatureId;
  phase: SignatureContractPhaseId;
  breakpoint: SignatureBreakpointBand;
  textBox: NormalizedSignatureZone;
  allowedZones: readonly SignatureTextSafeZoneId[];
  contrastRatio: number;
  clipped: boolean;
  horizontalOverflow: number;
  cls: number;
  noJsText: string;
}

export interface MotionLintViolation {
  code: MotionLintViolationCode;
  signatureId: ActiveMotionSignatureId;
  phase: SignatureContractPhaseId;
  breakpoint: SignatureBreakpointBand;
  detail: string;
}

export interface MotionLintPalette {
  text: string;
  background: string;
  surface: string;
}

export interface MotionLintMatrixResult {
  checked: number;
  violations: MotionLintViolation[];
}

export interface MotionLintMediaFocusMeasurement {
  signatureId: ActiveMotionSignatureId;
  phase: SignatureContractPhaseId;
  breakpoint: SignatureBreakpointBand;
  sectionIndex: number;
  focalPoint: { x: number; y: number };
}

export interface MotionLintPromotedCropMeasurement extends MotionLintMediaFocusMeasurement {
  promoted: boolean;
  cropPassed: boolean;
  cropReasons: readonly string[];
}

const EPSILON = 0.000_001;

/** IMG promotion gate: the authored focus point must stay out of the exact copy zone. */
export function lintMotionMediaFocus(
  measurement: MotionLintMediaFocusMeasurement,
): MotionLintViolation[] {
  const placement = resolvePlacement(
    measurement.signatureId,
    measurement.sectionIndex,
    measurement.breakpoint,
    { phase: measurement.phase },
  );
  const point = measurement.focalPoint;
  const zone = placement.normalized;
  const overlaps = point.x + EPSILON >= zone.x
    && point.x <= zone.x + zone.width + EPSILON
    && point.y + EPSILON >= zone.y
    && point.y <= zone.y + zone.height + EPSILON;
  return overlaps
    ? [{
        code: 'media-focus-inside-text-safe-zone',
        signatureId: measurement.signatureId,
        phase: measurement.phase,
        breakpoint: measurement.breakpoint,
        detail: `media focus overlaps ${placement.zone}`,
      }]
    : [];
}

/** IMG-R1 promotion gate: a promoted band must pass crop heuristics and copy-zone separation. */
export function lintPromotedHeroPhotoCrop(
  measurement: MotionLintPromotedCropMeasurement,
): MotionLintViolation[] {
  if (!measurement.promoted) return [];
  const violations = lintMotionMediaFocus(measurement);
  if (!measurement.cropPassed) {
    violations.push({
      code: 'media-crop-subject-cut-risk',
      signatureId: measurement.signatureId,
      phase: measurement.phase,
      breakpoint: measurement.breakpoint,
      detail: `promoted crop failed: ${measurement.cropReasons.join(', ') || 'unknown'}`,
    });
  }
  return violations;
}

function boxIsInside(outer: NormalizedSignatureZone, inner: NormalizedSignatureZone): boolean {
  return inner.x + EPSILON >= outer.x &&
    inner.y + EPSILON >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width + EPSILON &&
    inner.y + inner.height <= outer.y + outer.height + EPSILON;
}

function violation(
  measurement: MotionLintMeasurement,
  code: MotionLintViolationCode,
  detail: string,
): MotionLintViolation {
  return {
    code,
    signatureId: measurement.signatureId,
    phase: measurement.phase,
    breakpoint: measurement.breakpoint,
    detail,
  };
}

/** Pure gate shared by unit fixtures and the existing browser-review pipeline. */
export function lintMotionMeasurement(
  measurement: MotionLintMeasurement,
): MotionLintViolation[] {
  const allowed = measurement.allowedZones.some((zoneId) => boxIsInside(
    SIGNATURE_TEXT_SAFE_ZONE_GEOMETRY[measurement.breakpoint][zoneId],
    measurement.textBox,
  ));
  const violations: MotionLintViolation[] = [];
  if (!allowed) {
    violations.push(violation(measurement, 'text-outside-safe-zone', 'text bbox is outside every declared safe zone'));
  }
  if (!Number.isFinite(measurement.contrastRatio) || measurement.contrastRatio + EPSILON < MOTION_LINT_AA_RATIO) {
    violations.push(violation(measurement, 'contrast-below-aa', `contrast ${measurement.contrastRatio.toFixed(2)} is below ${MOTION_LINT_AA_RATIO}`));
  }
  if (measurement.clipped) {
    violations.push(violation(measurement, 'text-clipped', 'static or reduced-motion text is clipped'));
  }
  if (measurement.horizontalOverflow > EPSILON) {
    violations.push(violation(measurement, 'horizontal-overflow', `overflow ${measurement.horizontalOverflow.toFixed(4)}`));
  }
  if (measurement.cls > MOTION_LINT_CLS_BUDGET + EPSILON) {
    violations.push(violation(measurement, 'cls-budget-exceeded', `CLS ${measurement.cls.toFixed(4)} exceeds ${MOTION_LINT_CLS_BUDGET}`));
  }
  if (!measurement.noJsText.trim()) {
    violations.push(violation(measurement, 'no-js-content-missing', 'semantic no-JS text is empty'));
  }
  return violations;
}

function rgbChannel(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/iu.exec(hex.trim());
  if (!match) return Number.NaN;
  const value = match[1];
  return 0.2126 * rgbChannel(Number.parseInt(value.slice(0, 2), 16)) +
    0.7152 * rgbChannel(Number.parseInt(value.slice(2, 4), 16)) +
    0.0722 * rgbChannel(Number.parseInt(value.slice(4, 6), 16));
}

export function motionContrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  if (!Number.isFinite(foregroundLuminance) || !Number.isFinite(backgroundLuminance)) return Number.NaN;
  const light = Math.max(foregroundLuminance, backgroundLuminance);
  const dark = Math.min(foregroundLuminance, backgroundLuminance);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Contract-authoring matrix: active signature x phase x breakpoint. Layout values come from
 * the real resolver; semantic colors come from the rendered DNA theme supplied by the caller.
 */
export function runMotionLintContractMatrix({
  signatureId,
  palette,
  representativeContent,
}: {
  signatureId: ActiveMotionSignatureId;
  palette: MotionLintPalette;
  representativeContent: string;
}): MotionLintMatrixResult {
  const contract = ACTIVE_SIGNATURE_CONTRACTS[signatureId];
  const violations: MotionLintViolation[] = [];
  let checked = 0;
  for (const phase of SIGNATURE_CONTRACT_PHASE_IDS) {
    for (const breakpoint of SIGNATURE_BREAKPOINT_BANDS) {
      const placement = resolvePlacement(signatureId, checked, breakpoint, {
        phase,
        textLength: representativeContent.length,
      });
      const textToken = contract.contrastPolicy[phase].textColorToken;
      const foreground = palette[textToken];
      const background = textToken === 'background' ? palette.text : palette.background;
      const measurement: MotionLintMeasurement = {
        signatureId,
        phase,
        breakpoint,
        textBox: placement.normalized,
        allowedZones: contract.textSafeZones[phase][breakpoint],
        contrastRatio: motionContrastRatio(foreground, background),
        clipped: false,
        horizontalOverflow: 0,
        cls: 0,
        noJsText: representativeContent,
      };
      violations.push(...lintMotionMeasurement(measurement));
      checked += 1;
    }
  }
  return { checked, violations };
}
