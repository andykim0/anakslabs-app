import {
  AssetProvenanceError,
  type AssetRef,
} from './provenance';

export interface AssetIngressProjection {
  url: string;
  assetRef?: AssetRef;
}

/** Exact legacy response when WRITE is off; additive AssetRef only when on. */
export function projectAssetIngressResponse(
  asset: AssetIngressProjection,
  write: boolean,
): { url: string } | { url: string; assetRef: AssetRef } {
  if (!write) return { url: asset.url };
  if (!asset.assetRef || asset.assetRef.url !== asset.url) {
    throw new AssetProvenanceError(
      'ASSET_REGISTRATION_INVALID',
      'WRITE mode requires a registry AssetRef matching the returned URL.',
    );
  }
  return { url: asset.url, assetRef: asset.assetRef };
}

/** Exact legacy collection shape when WRITE is off; never emit partial refs when on. */
export function projectAssetImportResponse(
  assets: readonly AssetIngressProjection[],
  write: boolean,
): { imageUrls: string[] } | { imageUrls: string[]; assetRefs: AssetRef[] } {
  const imageUrls = assets.map((asset) => asset.url);
  if (!write) return { imageUrls };
  const assetRefs = assets.map((asset) => {
    if (!asset.assetRef || asset.assetRef.url !== asset.url) {
      throw new AssetProvenanceError(
        'ASSET_REGISTRATION_INVALID',
        'WRITE mode requires a registry AssetRef for every imported URL.',
      );
    }
    return asset.assetRef;
  });
  return { imageUrls, assetRefs };
}
