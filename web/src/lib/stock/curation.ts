import { createHash } from 'node:crypto';
import type { PexelsPhoto } from './pexels-client';
import type { StockBucket, StockMood, StockOrientation } from './types';

const PEOPLE_OR_BODY = /\b(person|people|woman|women|man|men|girl|boy|child|face|hand|hands|human)\b/iu;
const BRAND_OR_TEXT = /\b(brand|logo|sign|label|lettering|text|screen|menu|poster)\b/iu;

function metadataText(photo: PexelsPhoto): string {
  return `${photo.alt ?? ''} ${decodeURIComponent(new URL(photo.url).pathname.replaceAll('-', ' '))}`;
}

export function automatedStockReview(photo: PexelsPhoto): {
  passed: boolean;
  reasons: string[];
} {
  const value = metadataText(photo);
  const reasons = [
    ...(PEOPLE_OR_BODY.test(value) ? ['person-or-body-metadata'] : []),
    ...(BRAND_OR_TEXT.test(value) ? ['brand-or-text-metadata'] : []),
  ];
  return { passed: reasons.length === 0, reasons };
}

export function stockOrientation(width: number, height: number): StockOrientation {
  const ratio = width / height;
  if (ratio >= 1.55) return 'landscape-wide';
  if (ratio >= 1.1) return 'landscape-card';
  if (ratio <= 0.88) return 'portrait';
  return 'square';
}

function rgb(hex: string | null): [number, number, number] {
  if (!hex || !/^#[0-9a-f]{6}$/iu.test(hex)) return [128, 128, 128];
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

export function stockMood(avgColor: string | null): StockMood {
  const [red, green, blue] = rgb(avgColor);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance < 0.38 ? 'dark' : luminance > 0.68 ? 'light' : 'balanced';
}

/** Relaxed pilot mapping: orientation first, then deterministic mood variation. */
export function automaticStockBucket(photo: PexelsPhoto): StockBucket {
  const orientation = stockOrientation(photo.width, photo.height);
  if (orientation === 'portrait') return 'MP';
  if (orientation === 'square') return 'MS';
  const landscape = photo.width / photo.height >= 1.55;
  if (!landscape) return 'ML';
  const mood = stockMood(photo.avg_color);
  if (mood === 'dark') return 'HL';
  if (photo.width / photo.height >= 1.72) return 'HP';
  return 'HC';
}

/** Stable UUID registry identity; stockKey remains the provider-neutral business key. */
export function deterministicStockAssetId(stockKey: string): string {
  const bytes = createHash('sha256').update(stockKey).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
