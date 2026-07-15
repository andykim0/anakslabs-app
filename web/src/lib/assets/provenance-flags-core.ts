export interface AssetProvenanceConfig {
  write: boolean;
  assign: boolean;
  enforceNewSites: boolean;
  enforceLegacy: boolean;
  beforeAfterEnabled: boolean;
}

export const ASSET_PROVENANCE_FLAG_DEPENDENCY_INVALID = 'ASSET_PROVENANCE_FLAG_DEPENDENCY_INVALID' as const;

export class AssetProvenanceFlagError extends Error {
  readonly code = ASSET_PROVENANCE_FLAG_DEPENDENCY_INVALID;

  constructor(message: string) {
    super(message);
    this.name = 'AssetProvenanceFlagError';
  }
}

type FlagEnvironment = Readonly<Record<string, string | undefined>>;

function enabled(environment: FlagEnvironment, name: string): boolean {
  return environment[name] === '1';
}

/** Pure resolver kept separate so dependency failure is deterministic in unit tests. */
export function resolveAssetProvenanceConfig(environment: FlagEnvironment): AssetProvenanceConfig {
  const config: AssetProvenanceConfig = {
    write: enabled(environment, 'ASSET_PROVENANCE_V2_WRITE'),
    assign: enabled(environment, 'ASSET_PROVENANCE_V2_ASSIGN'),
    enforceNewSites: enabled(environment, 'ASSET_PROVENANCE_V2_ENFORCE_NEW_SITES'),
    enforceLegacy: enabled(environment, 'ASSET_PROVENANCE_V2_ENFORCE_LEGACY'),
    beforeAfterEnabled: enabled(environment, 'BEFORE_AFTER_ENABLED'),
  };

  const invalid = (config.assign && !config.write)
    || (config.enforceNewSites && (!config.write || !config.assign))
    // Legacy enforcement is the final rollout step. It may never precede the
    // safer new-site cohort enforcement.
    || (config.enforceLegacy && (!config.write || !config.assign || !config.enforceNewSites));
  if (invalid) {
    throw new AssetProvenanceFlagError(
      'Asset provenance flags must be enabled in write → assign → enforce-new-sites → enforce-legacy order.',
    );
  }
  return config;
}

/**
 * New-site cohort stamping is server-derived from ASSIGN, never from a request
 * payload. WRITE is guaranteed by resolveAssetProvenanceConfig's dependency
 * validation before this helper can receive a production config.
 */
export function assetPolicyVersionForNewSite(
  config: Pick<AssetProvenanceConfig, 'assign'>,
): 2 | undefined {
  return config.assign ? 2 : undefined;
}

export type BeforeAfterFeatureDecision =
  | { allowed: true }
  | { allowed: false; code: 'MEDICAL_BEFORE_AFTER_DISABLED' | 'BEFORE_AFTER_DISABLED' };

/** Medical policy outranks the launch kill switch and can never be enabled by a flag. */
export function resolveBeforeAfterFeatureDecision(input: {
  medical: boolean;
  config: Pick<AssetProvenanceConfig, 'beforeAfterEnabled'>;
}): BeforeAfterFeatureDecision {
  if (input.medical) return { allowed: false, code: 'MEDICAL_BEFORE_AFTER_DISABLED' };
  if (!input.config.beforeAfterEnabled) return { allowed: false, code: 'BEFORE_AFTER_DISABLED' };
  return { allowed: true };
}
