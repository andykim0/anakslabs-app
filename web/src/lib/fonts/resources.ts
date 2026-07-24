import fontAssetManifest from '../../../public/fonts/korean/font-assets.json';
import type { SiteTheme, TextElement } from '@/lib/types/site';
import { productionKoreanFontPairingById } from './catalog';
import {
  KOREAN_LEADING_TOKEN_VALUES,
  KOREAN_TRACKING_TOKEN_VALUES,
  type ProductionKoreanFontPairId,
} from './types';

interface FontAsset {
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

interface FontChunk {
  id: string;
  priority: boolean;
  codePoints: number;
  sha256: string;
  unicodeRange: string;
}

const FONT_ASSETS = fontAssetManifest.assets as readonly FontAsset[];
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
  id: ProductionKoreanFontPairId;
  css: string;
  assets: readonly FontAsset[];
  familyCount: number;
  faceCount: number;
  chunkCount: number;
  bytes: number;
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

function chunkCss(asset: FontAsset): string {
  const chunk = FONT_CHUNKS.find((candidate) => candidate.id === asset.chunkId);
  if (!chunk) throw new Error(`Unknown Korean font chunk: ${asset.chunkId}`);
  return (
    `@font-face{font-family:"${cssString(asset.family)}";src:url("${cssString(asset.path)}") format("woff2");`
    + `font-style:${asset.style};font-weight:${asset.weight};font-display:optional;unicode-range:${chunk.unicodeRange};}`
  );
}

function resourcesFor(
  theme: SiteTheme,
  selectedChunks: ReadonlySet<string> | null,
): FontPairingResources | null {
  const id = theme.fontPairing?.id;
  if (!id) return null;
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

export function fontPairingResources(theme: SiteTheme): FontPairingResources | null {
  return resourcesFor(theme, null);
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
  const codePoints = new Set([...text].map((character) => character.codePointAt(0)!));
  const selectedChunks = new Set(
    FONT_CHUNKS
      .filter((chunk) => (
        chunk.priority
        || [...(CHUNK_CODE_POINTS.get(chunk.id) ?? [])].some((codePoint) => codePoints.has(codePoint))
      ))
      .map((chunk) => chunk.id),
  );
  return resourcesFor(theme, selectedChunks);
}

export function fontPairingAssetsAvailable(id: ProductionKoreanFontPairId): boolean {
  const faceIds = PAIRING_FACE_IDS[id];
  return faceIds.every((faceId) => (
    FONT_CHUNKS.every((chunk) => (
      FONT_ASSETS.some((asset) => asset.faceId === faceId && asset.chunkId === chunk.id)
    ))
  ));
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
