import type { AssetRef, StockAttribution } from '@/lib/assets/provenance';

export const DENTAL_STOCK_CATEGORIES = [
  'implant',
  'orthodontic',
  'preventive-general',
  'cosmetic-restorative',
  'bright-interior',
] as const;
export type DentalStockCategory = typeof DENTAL_STOCK_CATEGORIES[number];

export const DENTAL_STOCK_SLOTS = ['hero', 'atmosphere'] as const;
export type DentalStockSlot = typeof DENTAL_STOCK_SLOTS[number];

export interface FrozenDentalStockAsset {
  assetId: string;
  stockKey: string;
  origin: 'licensed_stock';
  providerAssetId: string;
  category: DentalStockCategory;
  width: number;
  height: number;
  renditionUrl: string;
  alt: string;
  attribution: StockAttribution;
  review: {
    algorithmVersion: 'clinic-dental-atmosphere-v1';
    passed: true;
    metadataSha256: string;
  };
}

export interface DentalStockManifest {
  version: 1;
  syncedAt: string;
  assets: readonly FrozenDentalStockAsset[];
}

export function dentalStockAssetRef(asset: FrozenDentalStockAsset): AssetRef {
  return {
    assetId: asset.assetId,
    url: asset.renditionUrl,
    width: asset.width,
    height: asset.height,
    attribution: { ...asset.attribution },
  };
}
