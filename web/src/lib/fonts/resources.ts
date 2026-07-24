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
  family: string;
  weight: number | string;
  style: 'normal';
  path: string;
  bytes: number;
  sha256: string;
}

const FONT_ASSETS = fontAssetManifest.assets as readonly FontAsset[];

const PAIRING_ASSET_IDS = {
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

export function fontPairingResources(theme: SiteTheme): FontPairingResources | null {
  const id = theme.fontPairing?.id;
  if (!id) return null;
  const assetIds = PAIRING_ASSET_IDS[id];
  const assets = assetIds.map((assetId) => FONT_ASSETS.find((asset) => asset.id === assetId));
  if (assets.some((asset) => !asset)) return null;
  const resolved = assets as FontAsset[];
  const faces = resolved.map((asset) => (
    `@font-face{font-family:"${cssString(asset.family)}";src:url("${cssString(asset.path)}") format("woff2");font-style:${asset.style};font-weight:${asset.weight};font-display:optional;}`
  ));
  return {
    id,
    css: `${faces.join('')}${typographyCss(id)}`,
    assets: resolved,
    familyCount: new Set(resolved.map((asset) => asset.family)).size,
    faceCount: resolved.length,
    bytes: resolved.reduce((sum, asset) => sum + asset.bytes, 0),
  };
}

export function fontPairingAssetsAvailable(id: ProductionKoreanFontPairId): boolean {
  const assetIds = PAIRING_ASSET_IDS[id];
  return assetIds.every((assetId) => FONT_ASSETS.some((asset) => asset.id === assetId));
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
