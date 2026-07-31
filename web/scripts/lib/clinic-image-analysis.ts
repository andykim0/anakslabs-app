import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import type { KoClinicOptimizedImage } from '@/lib/ko-clinic/contracts';

const execFileAsync = promisify(execFile);

export const CLINIC_OCR_ANALYSIS_VERSION = 1 as const;
export const CLINIC_OCR_TEXT_AREA_RATIO_THRESHOLD = 0.025;
export const CLINIC_OCR_LINE_COUNT_THRESHOLD = 6;
export const CLINIC_OCR_CHARACTER_COUNT_THRESHOLD = 48;
export const CLINIC_HERO_TEXT_REGION_WIDTH_RATIO = 0.55;
export const CLINIC_HERO_TEXT_ZONE = Object.freeze({
  y: 0.16,
  width: 0.38,
  height: 0.68,
  leftX: 0.08,
  rightX: 0.54,
});

interface VisionLine {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface VisionResult {
  path: string;
  width: number;
  height: number;
  lines: VisionLine[];
  error?: string;
}

export type ClinicImageForAnalysis =
  Omit<KoClinicOptimizedImage, 'analysis'>
  & Partial<Pick<KoClinicOptimizedImage, 'analysis'>>;

function srgbChannel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

async function meanHeroRegionLuminance(imagePath: string): Promise<number> {
  const metadata = await sharp(imagePath).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`CLINIC_IMAGE_DIMENSIONS_MISSING:${imagePath}`);
  }
  const width = Math.max(
    1,
    Math.floor(metadata.width * CLINIC_HERO_TEXT_REGION_WIDTH_RATIO),
  );
  const { data, info } = await sharp(imagePath)
    .extract({ left: 0, top: 0, width, height: metadata.height })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let luminance = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    luminance += (
      0.2126 * srgbChannel(data[offset])
      + 0.7152 * srgbChannel(data[offset + 1])
      + 0.0722 * srgbChannel(data[offset + 2])
    );
  }
  return luminance / (data.length / info.channels);
}

interface LuminanceStats {
  mean: number;
  variance: number;
}

async function luminanceStatsForNormalizedRegion(
  imagePath: string,
  region: { x: number; y: number; width: number; height: number },
): Promise<LuminanceStats> {
  const metadata = await sharp(imagePath).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`CLINIC_IMAGE_DIMENSIONS_MISSING:${imagePath}`);
  }
  const left = Math.max(0, Math.floor(metadata.width * region.x));
  const top = Math.max(0, Math.floor(metadata.height * region.y));
  const width = Math.max(
    1,
    Math.min(metadata.width - left, Math.floor(metadata.width * region.width)),
  );
  const height = Math.max(
    1,
    Math.min(metadata.height - top, Math.floor(metadata.height * region.height)),
  );
  const { data, info } = await sharp(imagePath)
    .extract({ left, top, width, height })
    .resize({ width: 48, height: 48, fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const values: number[] = [];
  let total = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const value = (
      0.2126 * srgbChannel(data[offset])
      + 0.7152 * srgbChannel(data[offset + 1])
      + 0.0722 * srgbChannel(data[offset + 2])
    );
    values.push(value);
    total += value;
  }
  const mean = total / values.length;
  const variance = values.reduce(
    (sum, value) => sum + (value - mean) ** 2,
    0,
  ) / values.length;
  return { mean, variance };
}

export async function resolveClinicHeroTextZone(
  imagePath: string,
): Promise<NonNullable<KoClinicOptimizedImage['analysis']['heroTextZone']>> {
  const left = await luminanceStatsForNormalizedRegion(imagePath, {
    x: CLINIC_HERO_TEXT_ZONE.leftX,
    y: CLINIC_HERO_TEXT_ZONE.y,
    width: CLINIC_HERO_TEXT_ZONE.width,
    height: CLINIC_HERO_TEXT_ZONE.height,
  });
  const right = await luminanceStatsForNormalizedRegion(imagePath, {
    x: CLINIC_HERO_TEXT_ZONE.rightX,
    y: CLINIC_HERO_TEXT_ZONE.y,
    width: CLINIC_HERO_TEXT_ZONE.width,
    height: CLINIC_HERO_TEXT_ZONE.height,
  });
  const side = right.variance < left.variance ? 'right' : 'left';
  const selected = side === 'left' ? left : right;
  const opposite = side === 'left' ? right : left;
  return {
    version: 1 as const,
    method: 'local-luminance-variance-v1' as const,
    side,
    x: side === 'left'
      ? CLINIC_HERO_TEXT_ZONE.leftX
      : CLINIC_HERO_TEXT_ZONE.rightX,
    y: CLINIC_HERO_TEXT_ZONE.y,
    width: CLINIC_HERO_TEXT_ZONE.width,
    height: CLINIC_HERO_TEXT_ZONE.height,
    meanLuminance: selected.mean,
    luminanceVariance: selected.variance,
    oppositeVariance: opposite.variance,
  };
}

function parseVisionOutput(stdout: string): Map<string, VisionResult> {
  const results = new Map<string, VisionResult>();
  for (const line of stdout.split(/\r?\n/gu).filter(Boolean)) {
    const result = JSON.parse(line) as VisionResult;
    results.set(path.resolve(result.path), result);
  }
  return results;
}

export async function analyzeClinicImages(input: {
  root: string;
  assets: readonly ClinicImageForAnalysis[];
}): Promise<KoClinicOptimizedImage[]> {
  if (input.assets.length === 0) return [];
  const executable = path.join(input.root, 'scripts/clinic-image-ocr');
  const imagePaths = input.assets.map((asset) => (
    path.join(input.root, 'public', asset.publicPath.replace(/^\//u, ''))
  ));
  const { stdout } = await execFileAsync(executable, imagePaths, {
    maxBuffer: 128 * 1024 * 1024,
  });
  const vision = parseVisionOutput(stdout);
  return Promise.all(input.assets.map(async (asset, index) => {
    const imagePath = path.resolve(imagePaths[index]);
    const result = vision.get(imagePath);
    if (!result || result.error) {
      throw new Error(`CLINIC_IMAGE_OCR_FAILED:${asset.sourceUrl}:${result?.error ?? 'missing'}`);
    }
    const recognizedCharacterCount = result.lines.reduce(
      (sum, line) => sum + [...line.text.replace(/\s/gu, '')].length,
      0,
    );
    const textAreaRatio = Math.min(
      1,
      result.lines.reduce((sum, line) => sum + line.w * line.h, 0)
        / Math.max(1, result.width * result.height),
    );
    const textDense = (
      textAreaRatio >= CLINIC_OCR_TEXT_AREA_RATIO_THRESHOLD
      || (
        result.lines.length >= CLINIC_OCR_LINE_COUNT_THRESHOLD
        && recognizedCharacterCount >= CLINIC_OCR_CHARACTER_COUNT_THRESHOLD
      )
    );
    return {
      ...asset,
      analysis: {
        version: CLINIC_OCR_ANALYSIS_VERSION,
        engine: 'apple-vision-v1',
        recognizedLineCount: result.lines.length,
        recognizedCharacterCount,
        textAreaRatio,
        textDense,
        heroTextRegionLuminance: await meanHeroRegionLuminance(imagePath),
        heroTextZone: await resolveClinicHeroTextZone(imagePath),
      },
    };
  }));
}
