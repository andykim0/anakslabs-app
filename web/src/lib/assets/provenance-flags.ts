import 'server-only';
import {
  resolveAssetProvenanceConfig,
  type AssetProvenanceConfig,
} from './provenance-flags-core';

/**
 * Server-owned launch switches. All defaults are false. Invalid dependency
 * combinations throw; callers must not silently downgrade to legacy behavior.
 */
export function assetProvenanceConfig(): AssetProvenanceConfig {
  return resolveAssetProvenanceConfig(process.env);
}

export type { AssetProvenanceConfig } from './provenance-flags-core';
