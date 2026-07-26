import 'server-only';
import { registerLicensedStockAsset } from '@/lib/assets/registry';
import type { AssetRef } from '@/lib/assets/provenance';
import { workshopStockManifest } from './manifest';

const STORAGE_BUCKET = 'public-assets';

/** Registers only refs already selected by the pure frozen-manifest seam. */
export async function ensureLicensedStockAssetRefs(
  refs: readonly AssetRef[] | undefined,
): Promise<void> {
  if (!refs?.length) return;
  const manifest = workshopStockManifest();
  const byId = new Map(manifest.assets.map((asset) => [asset.assetId, asset] as const));
  const selected = refs.flatMap((ref) => {
    const asset = byId.get(ref.assetId);
    return asset ? [asset] : [];
  });
  await Promise.all(selected.map((asset) => registerLicensedStockAsset({
    assetId: asset.assetId,
    mediaType: 'image',
    storageBucket: STORAGE_BUCKET,
    storageKey: asset.renditionUrl.replace(/^\//u, ''),
    canonicalUrl: asset.renditionUrl,
    width: asset.width,
    height: asset.height,
    stockKey: asset.stockKey,
    provider: 'pexels',
    providerAssetId: asset.providerAssetId,
    attribution: asset.attribution,
  })));
}
