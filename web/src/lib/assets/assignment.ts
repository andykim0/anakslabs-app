import 'server-only';
import { resolveAssetAttestationSnapshot } from './attestation-registry';
import { createSiteAssetPolicyResolver } from './assignment-core';
import { assetProvenanceConfig } from './provenance-flags';
import { resolveAvailableOwnedAssetRecords } from './registry';

export const resolveSiteAssetPolicy = createSiteAssetPolicyResolver({
  flags: assetProvenanceConfig,
  resolveRecords: resolveAvailableOwnedAssetRecords,
  resolveAttestations: resolveAssetAttestationSnapshot,
});

export {
  preservePersistedAssetUsagesInPreview,
  preserveServerAssetUsagesForSave,
} from './assignment-core';

export type {
  AssetFallbackIntent,
  ResolveSiteAssetPolicyInput,
  ResolveSiteAssetPolicyResult,
  SiteAssetPolicyOperation,
  SiteAssetPolicyPhase,
  SiteAssetPolicyViolation,
} from './assignment-core';
