import { createHash } from 'node:crypto';
import sharp from 'sharp';

export const HERO_PHOTO_QUALITY_VERSION = 'hero-photo-v2' as const;

export const HERO_PHOTO_QUALITY_REASON_CODES = [
  'resolution_too_small',
  'aspect_ratio_unsupported',
  'focus_too_soft',
  'exposure_too_dark',
  'exposure_too_bright',
] as const;

export type HeroPhotoQualityReasonCode =
  typeof HERO_PHOTO_QUALITY_REASON_CODES[number];

export const HERO_PHOTO_VIEWPORT_BANDS = ['wide', 'compact', 'mobile'] as const;
export type HeroPhotoViewportBand = typeof HERO_PHOTO_VIEWPORT_BANDS[number];

export const HERO_PHOTO_VIEWPORTS = {
  wide: { width: 1440, height: 900 },
  compact: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
} as const satisfies Record<HeroPhotoViewportBand, { width: number; height: number }>;

export const HERO_PHOTO_FOCAL_MIN = 0.2;
export const HERO_PHOTO_FOCAL_MAX = 0.8;
export const HERO_PHOTO_SAFE_FOCAL_POINTS = [
  { x: 0.8, y: 0.5 },
  { x: 0.2, y: 0.5 },
  { x: 0.5, y: 0.8 },
  { x: 0.5, y: 0.2 },
] as const;

export const HERO_PHOTO_CROP_REASON_CODES = [
  'crop_information_too_low',
  'crop_boundary_cut_risk',
] as const;
export type HeroPhotoCropReasonCode = typeof HERO_PHOTO_CROP_REASON_CODES[number];

export interface HeroPhotoCropMetrics {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  sourceCoverage: number;
  informationScore: number;
  edgeDensity: number;
  boundaryEdgeRatio: number;
}

export interface HeroPhotoCropAssessment {
  focalPoint: { x: number; y: number };
  passed: boolean;
  reasons: HeroPhotoCropReasonCode[];
  metrics: HeroPhotoCropMetrics;
  guidance: string;
}

export type HeroPhotoViewportCrops = Record<
  HeroPhotoViewportBand,
  HeroPhotoCropAssessment[]
>;

export interface HeroPhotoQualityMetrics {
  width: number;
  height: number;
  aspectRatio: number;
  focusScore: number;
  meanLuminance: number;
  darkPixelRatio: number;
  brightPixelRatio: number;
}

export interface HeroPhotoQualityStamp {
  algorithmVersion: typeof HERO_PHOTO_QUALITY_VERSION;
  inputSha256: string;
  passed: boolean;
  reasons: HeroPhotoQualityReasonCode[];
  metrics: HeroPhotoQualityMetrics;
  guidance: string;
  /** New uploads only. Legacy v2 stamps remain valid without viewport crop evidence. */
  viewportCrops?: HeroPhotoViewportCrops;
  stampSha256: string;
}

export const HERO_PHOTO_QUALITY_LIMITS = {
  minimumWidth: 1600,
  minimumHeight: 900,
  minimumAspectRatio: 1.2,
  maximumAspectRatio: 2.4,
  // 160px normalized sample: calibrated against the existing 1920px cinematic photo fixture.
  minimumFocusScore: 0.0008,
  minimumMeanLuminance: 0.16,
  maximumMeanLuminance: 0.86,
  maximumClippedPixelRatio: 0.42,
  minimumCropInformationScore: 0.055,
  maximumBoundaryEdgeRatio: 1.9,
  narrowCropCoverage: 0.46,
} as const;

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function guidanceFor(reasons: readonly HeroPhotoQualityReasonCode[]): string {
  if (reasons.includes('resolution_too_small')) {
    return '사진 크기가 첫 화면에 쓰기엔 조금 작아 이번엔 다보임이 준비한 화면을 사용했어요. 가로 1600픽셀 이상의 선명한 사진으로 바꾸면 자동으로 반영돼요.';
  }
  if (reasons.includes('aspect_ratio_unsupported')) {
    return '사진 비율을 첫 화면에 맞추면 중요한 부분이 너무 많이 잘려 이번엔 다보임이 준비한 화면을 사용했어요. 가로로 넉넉한 사진으로 바꾸면 자동으로 반영돼요.';
  }
  if (reasons.includes('exposure_too_dark')) {
    return '사진이 조금 어두워 이번엔 다보임이 준비한 화면을 사용했어요. 밝은 사진으로 바꾸면 자동으로 반영돼요.';
  }
  if (reasons.includes('exposure_too_bright')) {
    return '사진의 밝은 부분이 많이 날아가 이번엔 다보임이 준비한 화면을 사용했어요. 밝기가 고르게 보이는 사진으로 바꾸면 자동으로 반영돼요.';
  }
  if (reasons.includes('focus_too_soft')) {
    return '사진의 초점이 조금 흐려 이번엔 다보임이 준비한 화면을 사용했어요. 또렷한 사진으로 바꾸면 자동으로 반영돼요.';
  }
  return '사진 품질을 확인했어요. 원본을 바꾸거나 다시 만들지 않고 첫 화면에 맞춰 배치합니다.';
}

export function viewportCropGuidance(
  band: HeroPhotoViewportBand,
  reasons: readonly HeroPhotoCropReasonCode[],
): string {
  if (reasons.length === 0) {
    return band === 'mobile'
      ? '세로 화면에서도 중요한 구도가 안전하게 보입니다.'
      : '이 화면 크기에서 중요한 구도가 안전하게 보입니다.';
  }
  if (band === 'mobile') {
    return '세로 화면에선 사진 구도가 잘려, 모바일은 다보임이 준비한 화면을 사용했어요.';
  }
  if (band === 'compact') {
    return '태블릿 화면에선 사진 구도가 잘려, 이 화면은 다보임이 준비한 화면을 사용했어요.';
  }
  return '큰 화면에선 사진 구도가 잘려, 이 화면은 다보임이 준비한 화면을 사용했어요.';
}

function stableCropAssessment(crop: HeroPhotoCropAssessment) {
  return {
    focalPoint: crop.focalPoint,
    passed: crop.passed,
    reasons: crop.reasons,
    metrics: crop.metrics,
    guidance: crop.guidance,
  };
}

function stableStampPayload(input: Omit<HeroPhotoQualityStamp, 'stampSha256'>): string {
  const metrics = input.metrics;
  return JSON.stringify({
    algorithmVersion: input.algorithmVersion,
    inputSha256: input.inputSha256,
    passed: input.passed,
    reasons: input.reasons,
    metrics: {
      width: metrics.width,
      height: metrics.height,
      aspectRatio: metrics.aspectRatio,
      focusScore: metrics.focusScore,
      meanLuminance: metrics.meanLuminance,
      darkPixelRatio: metrics.darkPixelRatio,
      brightPixelRatio: metrics.brightPixelRatio,
    },
    guidance: input.guidance,
    ...(input.viewportCrops
      ? {
          viewportCrops: Object.fromEntries(HERO_PHOTO_VIEWPORT_BANDS.map((band) => [
            band,
            input.viewportCrops![band].map(stableCropAssessment),
          ])),
        }
      : {}),
  });
}

function focusScore(pixels: Uint8Array, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  let total = 0;
  let squared = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const center = pixels[index] / 255;
      const laplacian = (
        4 * center
        - pixels[index - 1] / 255
        - pixels[index + 1] / 255
        - pixels[index - width] / 255
        - pixels[index + width] / 255
      ) / 4;
      total += laplacian;
      squared += laplacian * laplacian;
      count += 1;
    }
  }
  if (!count) return 0;
  const mean = total / count;
  return Math.max(0, squared / count - mean * mean);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function cropFrame(input: {
  sourceWidth: number;
  sourceHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  focalPoint: { x: number; y: number };
}) {
  const scale = Math.max(
    input.viewportWidth / input.sourceWidth,
    input.viewportHeight / input.sourceHeight,
  );
  const sourceWidth = Math.min(input.sourceWidth, input.viewportWidth / scale);
  const sourceHeight = Math.min(input.sourceHeight, input.viewportHeight / scale);
  const sourceX = clamp(
    input.focalPoint.x * input.sourceWidth - sourceWidth / 2,
    0,
    input.sourceWidth - sourceWidth,
  );
  const sourceY = clamp(
    input.focalPoint.y * input.sourceHeight - sourceHeight / 2,
    0,
    input.sourceHeight - sourceHeight,
  );
  return {
    left: Math.round(sourceX),
    top: Math.round(sourceY),
    width: Math.max(1, Math.min(input.sourceWidth - Math.round(sourceX), Math.round(sourceWidth))),
    height: Math.max(1, Math.min(input.sourceHeight - Math.round(sourceY), Math.round(sourceHeight))),
  };
}

function cropSignal(pixels: Uint8Array, width: number, height: number) {
  let total = 0;
  let squared = 0;
  let edgeTotal = 0;
  let edgeCount = 0;
  let boundaryTotal = 0;
  let boundaryCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const value = pixels[index] / 255;
      total += value;
      squared += value * value;
      if (x + 1 < width) {
        const delta = Math.abs(pixels[index + 1] - pixels[index]) / 255;
        edgeTotal += delta;
        edgeCount += 1;
        if (x <= 1 || x >= width - 3) {
          boundaryTotal += delta;
          boundaryCount += 1;
        }
      }
      if (y + 1 < height) {
        const delta = Math.abs(pixels[index + width] - pixels[index]) / 255;
        edgeTotal += delta;
        edgeCount += 1;
        if (y <= 1 || y >= height - 3) {
          boundaryTotal += delta;
          boundaryCount += 1;
        }
      }
    }
  }
  const count = Math.max(1, pixels.length);
  const mean = total / count;
  const deviation = Math.sqrt(Math.max(0, squared / count - mean * mean));
  const edgeDensity = edgeTotal / Math.max(1, edgeCount);
  const boundaryDensity = boundaryTotal / Math.max(1, boundaryCount);
  return {
    informationScore: deviation + edgeDensity * 0.5,
    edgeDensity,
    boundaryEdgeRatio: boundaryDensity / Math.max(edgeDensity, 0.005),
  };
}

async function assessViewportCrops(
  source: sharp.Sharp,
  width: number,
  height: number,
): Promise<HeroPhotoViewportCrops> {
  const entries = await Promise.all(HERO_PHOTO_VIEWPORT_BANDS.map(async (band) => {
    const viewport = HERO_PHOTO_VIEWPORTS[band];
    const assessments = await Promise.all(HERO_PHOTO_SAFE_FOCAL_POINTS.map(async (focalPoint) => {
      const frame = cropFrame({
        sourceWidth: width,
        sourceHeight: height,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        focalPoint,
      });
      const sample = await source
        .clone()
        .extract(frame)
        .resize({ width: 128, height: 128, fit: 'fill' })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const signal = cropSignal(sample.data, sample.info.width, sample.info.height);
      const metrics: HeroPhotoCropMetrics = {
        sourceX: frame.left,
        sourceY: frame.top,
        sourceWidth: frame.width,
        sourceHeight: frame.height,
        sourceCoverage: round((frame.width * frame.height) / (width * height)),
        informationScore: round(signal.informationScore),
        edgeDensity: round(signal.edgeDensity),
        boundaryEdgeRatio: round(signal.boundaryEdgeRatio),
      };
      const reasons: HeroPhotoCropReasonCode[] = [];
      if (metrics.informationScore < HERO_PHOTO_QUALITY_LIMITS.minimumCropInformationScore) {
        reasons.push('crop_information_too_low');
      }
      if (metrics.sourceCoverage < HERO_PHOTO_QUALITY_LIMITS.narrowCropCoverage
        && metrics.boundaryEdgeRatio > HERO_PHOTO_QUALITY_LIMITS.maximumBoundaryEdgeRatio) {
        reasons.push('crop_boundary_cut_risk');
      }
      return {
        focalPoint: { ...focalPoint },
        passed: reasons.length === 0,
        reasons,
        metrics,
        guidance: viewportCropGuidance(band, reasons),
      } satisfies HeroPhotoCropAssessment;
    }));
    return [band, assessments] as const;
  }));
  return Object.fromEntries(entries) as HeroPhotoViewportCrops;
}

export class HeroPhotoQualityError extends Error {
  readonly code = 'HERO_PHOTO_DECODE_FAILED' as const;

  constructor() {
    super('사진 파일을 읽을 수 없습니다. PNG·JPG·WEBP 원본을 다시 올려주세요.');
    this.name = 'HeroPhotoQualityError';
  }
}

/** Deterministic server assessment over the original encoded bytes. */
export async function assessHeroPhotoQuality(bytes: Buffer): Promise<HeroPhotoQualityStamp> {
  try {
    const source = sharp(bytes, { failOn: 'error', limitInputPixels: 80_000_000 }).rotate();
    const metadata = await source.metadata();
    const width = metadata.autoOrient.width;
    const height = metadata.autoOrient.height;
    if (!width || !height) throw new HeroPhotoQualityError();

    const sample = await source
      .clone()
      .resize({ width: 160, height: 160, fit: 'inside', withoutEnlargement: true })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixels = sample.data;
    const count = pixels.length;
    let luminanceTotal = 0;
    let darkPixels = 0;
    let brightPixels = 0;
    for (const pixel of pixels) {
      const luminance = pixel / 255;
      luminanceTotal += luminance;
      if (luminance <= 0.035) darkPixels += 1;
      if (luminance >= 0.965) brightPixels += 1;
    }

    const metrics: HeroPhotoQualityMetrics = {
      width,
      height,
      aspectRatio: round(width / height),
      focusScore: round(focusScore(pixels, sample.info.width, sample.info.height)),
      meanLuminance: round(luminanceTotal / count),
      darkPixelRatio: round(darkPixels / count),
      brightPixelRatio: round(brightPixels / count),
    };
    const reasons: HeroPhotoQualityReasonCode[] = [];
    if (width < HERO_PHOTO_QUALITY_LIMITS.minimumWidth
      || height < HERO_PHOTO_QUALITY_LIMITS.minimumHeight) {
      reasons.push('resolution_too_small');
    }
    if (metrics.aspectRatio < HERO_PHOTO_QUALITY_LIMITS.minimumAspectRatio
      || metrics.aspectRatio > HERO_PHOTO_QUALITY_LIMITS.maximumAspectRatio) {
      reasons.push('aspect_ratio_unsupported');
    }
    if (metrics.focusScore < HERO_PHOTO_QUALITY_LIMITS.minimumFocusScore) {
      reasons.push('focus_too_soft');
    }
    if (metrics.meanLuminance < HERO_PHOTO_QUALITY_LIMITS.minimumMeanLuminance
      || metrics.darkPixelRatio > HERO_PHOTO_QUALITY_LIMITS.maximumClippedPixelRatio) {
      reasons.push('exposure_too_dark');
    }
    if (metrics.meanLuminance > HERO_PHOTO_QUALITY_LIMITS.maximumMeanLuminance
      || metrics.brightPixelRatio > HERO_PHOTO_QUALITY_LIMITS.maximumClippedPixelRatio) {
      reasons.push('exposure_too_bright');
    }

    const payload: Omit<HeroPhotoQualityStamp, 'stampSha256'> = {
      algorithmVersion: HERO_PHOTO_QUALITY_VERSION,
      inputSha256: createHash('sha256').update(bytes).digest('hex'),
      passed: reasons.length === 0,
      reasons,
      metrics,
      guidance: guidanceFor(reasons),
      viewportCrops: await assessViewportCrops(source, width, height),
    };
    return {
      ...payload,
      stampSha256: createHash('sha256').update(stableStampPayload(payload)).digest('hex'),
    };
  } catch (error) {
    if (error instanceof HeroPhotoQualityError) throw error;
    throw new HeroPhotoQualityError();
  }
}

export function isHeroPhotoQualityStamp(value: unknown): value is HeroPhotoQualityStamp {
  if (!value || typeof value !== 'object') return false;
  const stamp = value as Partial<HeroPhotoQualityStamp>;
  const metrics = stamp.metrics as Partial<HeroPhotoQualityMetrics> | undefined;
  const viewportCropsValid = stamp.viewportCrops === undefined
    || (typeof stamp.viewportCrops === 'object'
      && HERO_PHOTO_VIEWPORT_BANDS.every((band) => {
        const crops = stamp.viewportCrops?.[band];
        return Array.isArray(crops)
          && crops.length === HERO_PHOTO_SAFE_FOCAL_POINTS.length
          && crops.every((crop) => crop
            && typeof crop === 'object'
            && typeof crop.passed === 'boolean'
            && Array.isArray(crop.reasons)
            && crop.reasons.every((reason) =>
              (HERO_PHOTO_CROP_REASON_CODES as readonly unknown[]).includes(reason))
            && typeof crop.guidance === 'string'
            && typeof crop.focalPoint?.x === 'number'
            && typeof crop.focalPoint?.y === 'number'
            && Boolean(crop.metrics)
            && Object.values(crop.metrics).every((metric) =>
              typeof metric === 'number' && Number.isFinite(metric)));
      }));
  const shapeValid = stamp.algorithmVersion === HERO_PHOTO_QUALITY_VERSION
    && typeof stamp.inputSha256 === 'string'
    && /^[0-9a-f]{64}$/u.test(stamp.inputSha256)
    && typeof stamp.stampSha256 === 'string'
    && /^[0-9a-f]{64}$/u.test(stamp.stampSha256)
    && typeof stamp.passed === 'boolean'
    && Array.isArray(stamp.reasons)
    && stamp.reasons.every((reason) =>
      (HERO_PHOTO_QUALITY_REASON_CODES as readonly unknown[]).includes(reason))
    && Boolean(metrics)
    && Number.isInteger(metrics?.width)
    && Number.isInteger(metrics?.height)
    && [
      metrics?.aspectRatio,
      metrics?.focusScore,
      metrics?.meanLuminance,
      metrics?.darkPixelRatio,
      metrics?.brightPixelRatio,
  ].every((metric) => typeof metric === 'number' && Number.isFinite(metric))
    && typeof stamp.guidance === 'string'
    && viewportCropsValid;
  if (!shapeValid) return false;
  const complete = stamp as HeroPhotoQualityStamp;
  const payload: Omit<HeroPhotoQualityStamp, 'stampSha256'> = {
    algorithmVersion: complete.algorithmVersion,
    inputSha256: complete.inputSha256,
    passed: complete.passed,
    reasons: complete.reasons,
    metrics: complete.metrics,
    guidance: complete.guidance,
    ...(complete.viewportCrops ? { viewportCrops: complete.viewportCrops } : {}),
  };
  return createHash('sha256').update(stableStampPayload(payload)).digest('hex')
    === complete.stampSha256;
}
