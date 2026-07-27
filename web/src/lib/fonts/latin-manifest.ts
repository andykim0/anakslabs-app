import latinFontAssetManifest from '../../../public/fonts/latin/font-assets.json';
import {
  LATIN_FONT_PAIRING_CATALOG_VERSION,
  LATIN_FONT_PAIRING_SLOT_IDS,
  type LatinFontPairingSlotId,
} from './types';
import { LATIN_FONT_PERFORMANCE_BUDGETS } from './performance';

export interface LatinFontAsset {
  id: string;
  faceId: string;
  chunkId: string;
  family: string;
  weight: number | string;
  style: 'normal' | 'italic';
  path: string;
  bytes: number;
  sha256: string;
  unicodeRange: string;
}

export interface LatinFontAssetManifest {
  version: 1;
  catalogVersion: typeof LATIN_FONT_PAIRING_CATALOG_VERSION;
  locale: 'en-US';
  pairingId: LatinFontPairingSlotId;
  assetVersion: number;
  status: 'asset-pending' | 'production-ready';
  characterSet: {
    strategy: string;
    codePoints: number;
    sha256: string | null;
  };
  budgets: typeof LATIN_FONT_PERFORMANCE_BUDGETS;
  chunks: readonly {
    id: string;
    priority: boolean;
    unicodeRange: string;
    codePoints: number;
    sha256: string;
  }[];
  assets: readonly LatinFontAsset[];
  licenseNotices: readonly {
    name: string;
    sourceUrl: string;
    licenseId: string;
    noticePath: string;
  }[];
}

export function latinFontManifest(): LatinFontAssetManifest {
  const manifest = latinFontAssetManifest as LatinFontAssetManifest;
  if (!LATIN_FONT_PAIRING_SLOT_IDS.includes(manifest.pairingId)) {
    throw new Error(`Unknown Latin pairing manifest id: ${manifest.pairingId}`);
  }
  if (manifest.catalogVersion !== LATIN_FONT_PAIRING_CATALOG_VERSION) {
    throw new Error('Latin font manifest catalog version does not match the pin contract.');
  }
  return manifest;
}

export function latinFontManifestIsProductionReady(): boolean {
  const manifest = latinFontManifest();
  if (manifest.status !== 'production-ready') return false;
  return (
    manifest.assetVersion >= 1
    && manifest.assets.length > 0
    && manifest.licenseNotices.length > 0
    && manifest.assets.every((asset) => (
      asset.path.startsWith('/fonts/latin/')
      && asset.bytes > 0
      && /^[a-f0-9]{64}$/u.test(asset.sha256)
    ))
  );
}
