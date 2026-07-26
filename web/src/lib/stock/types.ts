import type { AssetRef, StockAttribution } from '@/lib/assets/provenance';

export const STOCK_COLLECTION_ID = 'zmqu95c' as const;
export const STOCK_MANIFEST_VERSION = 1 as const;
export const STOCK_BUCKETS = ['HC', 'HL', 'HP', 'MP', 'ML', 'MS'] as const;
export type StockBucket = typeof STOCK_BUCKETS[number];

export type StockOrientation =
  | 'landscape-wide'
  | 'landscape-card'
  | 'portrait'
  | 'square';
export type StockMood = 'light' | 'balanced' | 'dark';

export interface FrozenStockAsset {
  assetId: string;
  stockKey: string;
  providerAssetId: string;
  collectionId: typeof STOCK_COLLECTION_ID;
  bucket: StockBucket;
  orientation: StockOrientation;
  mood: StockMood;
  width: number;
  height: number;
  renditionUrl: string;
  attribution: StockAttribution;
  /** Automated metadata guard plus the owner's curated collection boundary. */
  review: {
    algorithmVersion: 'pexels-curated-metadata-v1';
    passed: boolean;
    reasons: readonly string[];
  };
}

export interface FrozenStockManifest {
  version: typeof STOCK_MANIFEST_VERSION;
  collectionId: typeof STOCK_COLLECTION_ID;
  syncedAt: string;
  assets: readonly FrozenStockAsset[];
}

export function stockAssetRef(asset: FrozenStockAsset): AssetRef {
  return {
    assetId: asset.assetId,
    url: asset.renditionUrl,
    width: asset.width,
    height: asset.height,
    attribution: { ...asset.attribution },
  };
}
