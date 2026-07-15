import type { CustomerAssetProvenance } from '@/lib/uploads/asset-provenance';
import {
  AssetProvenanceError,
  assertCompatibleAssetRecords,
  type AssetRecord,
} from './provenance';

/** Trusted read-only projection of the preserved 0009 evidence ledger. */
export function adaptBeforeAfterAssetRecord(asset: CustomerAssetProvenance): AssetRecord {
  if (asset.source !== 'customer-upload' || asset.aiGenerated || asset.generativeEdited) {
    throw new AssetProvenanceError(
      'ASSET_PROVENANCE_CONFLICT',
      `Before/after ledger contains non-customer provenance for ${asset.id}`,
    );
  }
  return {
    id: asset.id,
    origin: 'customer_upload',
    mediaType: 'image',
    storageBucket: 'client-assets',
    storageKey: asset.objectPath,
    canonicalUrl: asset.publicUrl,
    createdAt: asset.createdAt,
    ownerId: asset.clientId,
    siteId: asset.siteId,
  };
}

/**
 * The registries are independent authorities. Exact duplicate evidence may be
 * read, but neither row silently wins when identity or claims conflict.
 */
export function reconcileGenericAndBeforeAfterRecords(input: {
  genericById: AssetRecord | null;
  genericByStorage: AssetRecord | null;
  beforeAfter: AssetRecord | null;
}): AssetRecord | null {
  if (input.beforeAfter && input.genericByStorage) {
    if (input.genericByStorage.id !== input.beforeAfter.id) {
      throw new AssetProvenanceError(
        'ASSET_PROVENANCE_CONFLICT',
        'Generic and before/after registries claim the same storage object with different IDs',
      );
    }
    // Storage identity is authoritative. Even a matching ID must not mask a
    // contradictory owner/origin/site/URL claim from either trusted ledger.
    assertCompatibleAssetRecords(input.genericByStorage, input.beforeAfter);
  }
  if (input.genericById && input.beforeAfter) {
    assertCompatibleAssetRecords(input.genericById, input.beforeAfter);
  }
  return input.genericById ?? input.beforeAfter;
}
