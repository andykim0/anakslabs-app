import fontAssetManifest from '../../../public/fonts/korean/font-assets.json';
import type { SiteTheme, TextElement } from '@/lib/types/site';
import {
  latinFontPairingSlotById,
  productionKoreanFontPairingById,
} from './catalog';
import {
  KOREAN_LEADING_TOKEN_VALUES,
  KOREAN_TRACKING_TOKEN_VALUES,
  type LatinFontPairingSlotId,
  type ProductionKoreanFontPairId,
  type SiteLatinFontPairingPin,
} from './types';
import {
  latinFontManifest,
  latinFontManifestIsProductionReady,
  type LatinFontAsset,
} from './latin-manifest';

interface KoreanFontAsset {
  id: string;
  faceId: string;
  chunkId: string;
  family: string;
  weight: number | string;
  style: 'normal';
  path: string;
  bytes: number;
  sha256: string;
}

type FontAsset = KoreanFontAsset | LatinFontAsset;

interface FontChunk {
  id: string;
  priority: boolean;
  codePoints: number;
  sha256: string;
  unicodeRange: string;
}

const FONT_ASSETS = fontAssetManifest.assets as readonly KoreanFontAsset[];
const FONT_CHUNKS = fontAssetManifest.chunks as readonly FontChunk[];

const PAIRING_FACE_IDS = {
  'kr-pretendard-neutral': ['pretendard-variable'],
  'kr-nanum-myeongjo-readable': [
    'nanum-myeongjo-700',
    'nanum-myeongjo-800',
    'pretendard-variable',
  ],
  'kr-gmarket-noto-structured': [
    'gmarket-sans-500',
    'gmarket-sans-700',
    'noto-sans-kr-variable',
  ],
  'kr-nanum-square-round-friendly': [
    'nanum-square-round-700',
    'nanum-square-round-800',
    'pretendard-variable',
  ],
} as const satisfies Readonly<Record<ProductionKoreanFontPairId, readonly string[]>>;

export interface FontPairingResources {
  id: ProductionKoreanFontPairId | LatinFontPairingSlotId;
  css: string;
  assets: readonly FontAsset[];
  familyCount: number;
  faceCount: number;
  chunkCount: number;
  bytes: number;
}

function isLatinPin(
  pin: SiteTheme['fontPairing'],
): pin is SiteLatinFontPairingPin {
  return Boolean(pin && 'locale' in pin && pin.locale === 'en-US');
}

function cssString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function typographyCss(id: ProductionKoreanFontPairId): string {
  const typography = productionKoreanFontPairingById(id).productionManifest.typography;
  const rule = (
    selector: string,
    role: keyof typeof typography,
  ) => `${selector}{letter-spacing:${KOREAN_TRACKING_TOKEN_VALUES[typography[role].tracking]}!important;line-height:${KOREAN_LEADING_TOKEN_VALUES[typography[role].leading]}!important;}`;
  const root = `.anaks-site[data-font-pairing="${id}"]`;
  return [
    rule(`${root} [data-font-role="display"]`, 'display'),
    rule(`${root} [data-font-role="heading"],${root} [data-signature-heading]`, 'heading'),
    rule(`${root} [data-font-role="lead"]`, 'lead'),
    rule(`${root} [data-font-role="body"]`, 'body'),
    rule(`${root} .anaks-btn`, 'control'),
  ].join('');
}

function chunkCss(asset: KoreanFontAsset): string {
  const chunk = FONT_CHUNKS.find((candidate) => candidate.id === asset.chunkId);
  if (!chunk) throw new Error(`Unknown Korean font chunk: ${asset.chunkId}`);
  return (
    `@font-face{font-family:"${cssString(asset.family)}";src:url("${cssString(asset.path)}") format("woff2");`
    + `font-style:${asset.style};font-weight:${asset.weight};font-display:optional;unicode-range:${chunk.unicodeRange};}`
  );
}

function koreanResourcesFor(
  theme: SiteTheme,
  selectedChunks: ReadonlySet<string> | null,
): FontPairingResources | null {
  const pin = theme.fontPairing;
  if (!pin || isLatinPin(pin)) return null;
  const id = pin.id;
  const faceIds = PAIRING_FACE_IDS[id];
  const assets = FONT_ASSETS.filter((asset) => (
    (faceIds as readonly string[]).includes(asset.faceId)
    && (!selectedChunks || selectedChunks.has(asset.chunkId))
  ));
  const faceCount = new Set(assets.map((asset) => asset.faceId)).size;
  if (faceCount !== faceIds.length) return null;
  return {
    id,
    css: `${assets.map(chunkCss).join('')}${typographyCss(id)}`,
    assets,
    familyCount: new Set(assets.map((asset) => asset.family)).size,
    faceCount,
    chunkCount: new Set(assets.map((asset) => asset.chunkId)).size,
    bytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
  };
}

function latinSystemFallbackResources(pin: SiteLatinFontPairingPin): FontPairingResources {
  const pairing = latinFontPairingSlotById(pin.id);
  const stack = pairing.body;
  const root = `.anaks-site[data-font-pairing="${pin.id}"]`;
  const css = [
    `${root}{font-family:${stack}!important;}`,
    `${root} [data-font-role="display"],${root} [data-font-role="heading"],${root} [data-signature-heading]{font-family:${pairing.heading}!important;}`,
    `${root} [data-font-role="lead"],${root} [data-font-role="body"],${root} .anaks-btn{font-family:${pairing.body}!important;}`,
  ].join('');
  return {
    id: pin.id,
    css,
    assets: [],
    familyCount: 1,
    faceCount: 0,
    chunkCount: 0,
    bytes: 0,
  };
}

function codePointSet(text: string): Set<number> {
  return new Set([...text].map((character) => character.codePointAt(0)!));
}

function unicodeRangeIntersects(unicodeRange: string, codePoints: ReadonlySet<number>): boolean {
  const ranges = codePointsInRange(unicodeRange);
  return [...ranges].some((codePoint) => codePoints.has(codePoint));
}

function latinAssetCss(asset: LatinFontAsset): string {
  return (
    `@font-face{font-family:"${cssString(asset.family)}";src:url("${cssString(asset.path)}") format("woff2");`
    + `font-style:${asset.style};font-weight:${asset.weight};font-display:optional;unicode-range:${asset.unicodeRange};}`
  );
}

function latinProductionResources(
  pin: SiteLatinFontPairingPin,
  text: string | null,
): FontPairingResources | null {
  if (!latinFontManifestIsProductionReady()) return null;
  const manifest = latinFontManifest();
  if (manifest.assetVersion !== pin.assetVersion || manifest.pairingId !== pin.id) return null;
  const selectedChunkIds = text === null
    ? new Set(manifest.chunks.map((chunk) => chunk.id))
    : new Set(
        manifest.chunks
          .filter((chunk) => (
            chunk.priority || unicodeRangeIntersects(chunk.unicodeRange, codePointSet(text))
          ))
          .map((chunk) => chunk.id),
      );
  const assets = manifest.assets.filter((asset) => selectedChunkIds.has(asset.chunkId));
  const pairing = latinFontPairingSlotById(pin.id);
  const root = `.anaks-site[data-font-pairing="${pin.id}"]`;
  const familyCss = [
    `${root}{font-family:${pairing.body}!important;}`,
    `${root} [data-font-role="display"],${root} [data-font-role="heading"],${root} [data-signature-heading]{font-family:${pairing.heading}!important;}`,
    `${root} [data-font-role="lead"],${root} [data-font-role="body"],${root} .anaks-btn{font-family:${pairing.body}!important;}`,
  ].join('');
  return {
    id: pin.id,
    css: `${assets.map(latinAssetCss).join('')}${familyCss}`,
    assets,
    familyCount: new Set(assets.map((asset) => asset.family)).size,
    faceCount: new Set(assets.map((asset) => asset.faceId)).size,
    chunkCount: new Set(assets.map((asset) => asset.chunkId)).size,
    bytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
  };
}

export function fontPairingResources(theme: SiteTheme): FontPairingResources | null {
  const pin = theme.fontPairing;
  if (isLatinPin(pin)) {
    return latinProductionResources(pin, null) ?? latinSystemFallbackResources(pin);
  }
  return koreanResourcesFor(theme, null);
}

function codePointsInRange(unicodeRange: string): Set<number> {
  const output = new Set<number>();
  for (const token of unicodeRange.split(/,\s*/u)) {
    const match = /^U\+([0-9a-f]+)(?:-([0-9a-f]+))?$/iu.exec(token.trim());
    if (!match) continue;
    const start = Number.parseInt(match[1], 16);
    const end = Number.parseInt(match[2] ?? match[1], 16);
    for (let codePoint = start; codePoint <= end; codePoint += 1) output.add(codePoint);
  }
  return output;
}

const CHUNK_CODE_POINTS = new Map(
  FONT_CHUNKS.map((chunk) => [chunk.id, codePointsInRange(chunk.unicodeRange)]),
);

/**
 * Static export projection: the common first-paint chunk is always retained for renderer-owned
 * labels, while tail chunks are copied only when the site's actual text intersects their range.
 */
export function fontPairingResourcesForText(
  theme: SiteTheme,
  text: string,
): FontPairingResources | null {
  if (isLatinPin(theme.fontPairing)) {
    return latinProductionResources(theme.fontPairing, text)
      ?? latinSystemFallbackResources(theme.fontPairing);
  }
  const codePoints = codePointSet(text);
  const selectedChunks = new Set(
    FONT_CHUNKS
      .filter((chunk) => (
        chunk.priority
        || [...(CHUNK_CODE_POINTS.get(chunk.id) ?? [])].some((codePoint) => codePoints.has(codePoint))
      ))
      .map((chunk) => chunk.id),
  );
  return koreanResourcesFor(theme, selectedChunks);
}

export function fontPairingAssetsAvailable(id: ProductionKoreanFontPairId): boolean {
  const faceIds = PAIRING_FACE_IDS[id];
  return faceIds.every((faceId) => (
    FONT_CHUNKS.every((chunk) => (
      FONT_ASSETS.some((asset) => asset.faceId === faceId && asset.chunkId === chunk.id)
    ))
  ));
}

/** Asset checkpoint seam. Version 0 is an explicit no-network system-font fallback. */
export function latinFontPairingAssetsAvailable(id: LatinFontPairingSlotId): boolean {
  return (
    latinFontPairingSlotById(id).latinProductionManifest.status === 'production-ready'
    && latinFontManifestIsProductionReady()
  );
}

export function fontRoleForTextElement(
  element: TextElement,
): 'display' | 'heading' | 'lead' | 'body' {
  const id = element.id.toLowerCase();
  if (/(?:hero|masthead).*(?:title|heading)|headline/.test(id)) return 'display';
  if (/(?:lead|subtitle|subhead|intro|description|dek)/.test(id)) return 'lead';
  return element.style.fontFamily === 'heading' ? 'heading' : 'body';
}

export function productionFontAssetManifest() {
  return fontAssetManifest;
}
