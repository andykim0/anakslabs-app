import 'server-only';
import { assetProvenanceConfig } from './provenance-flags';
import {
  bindAssetToOwnedSite,
  resolveOwnedAssetRecords,
  validateOwnedAssetRefs,
} from './registry';
import {
  AssetProvenanceError,
  toAssetRef,
  type AssetRef,
} from './provenance';
import type { DesignCandidate } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';

function rejectWhenWriteOff(refs: readonly AssetRef[] | undefined): void {
  if (refs?.length) {
    throw new AssetProvenanceError(
      'CLIENT_PROVENANCE_FORBIDDEN',
      'Asset references are unavailable while provenance WRITE is disabled.',
    );
  }
}

/** candidates 응답을 client가 왕복한 뒤 owner+canonical URL을 재검증한다. */
export async function validateCandidateAssetRef(input: {
  candidate: DesignCandidate;
  clientId: string;
  /** 미지정=신규 사이트(반드시 provisional), 지정=해당 owned site 또는 provisional만 허용. */
  targetSiteId?: string;
}): Promise<DesignCandidate> {
  const config = assetProvenanceConfig();
  const supplied = input.candidate.heroAssetRef;
  if (!config.write) {
    rejectWhenWriteOff(supplied ? [supplied] : undefined);
    return input.candidate;
  }
  if (!supplied) return input.candidate;

  const [record] = await resolveOwnedAssetRecords({
    assetIds: [supplied.assetId],
    clientId: input.clientId,
  });
  if (!record) {
    throw new AssetProvenanceError('ASSET_NOT_FOUND', 'Candidate hero asset was not found.');
  }
  const canonical = toAssetRef(record);
  const validBinding = input.targetSiteId
    ? record.siteId === null || record.siteId === input.targetSiteId
    : record.siteId === null;
  if (
    record.origin !== 'ai_generated' ||
    record.mediaType !== 'image' ||
    !validBinding ||
    canonical.url !== supplied.url ||
    canonical.url !== input.candidate.heroImageUrl
  ) {
    throw new AssetProvenanceError(
      'ASSET_PROVENANCE_CONFLICT',
      'Candidate hero URL does not match its server asset record.',
    );
  }
  return { ...input.candidate, heroAssetRef: canonical };
}

/** 사이트 생성/재생성 산출 manifest를 해당 owned site에 one-time bind한 뒤 canonicalize한다. */
export async function bindGeneratedConfigAssetRefs(input: {
  config: SiteConfig;
  clientId: string;
  siteId: string;
}): Promise<SiteConfig> {
  const flags = assetProvenanceConfig();
  if (!flags.write) {
    rejectWhenWriteOff(input.config.assetRefs);
    return input.config;
  }
  if (!input.config.assetRefs?.length) return input.config;

  const provisional = await validateOwnedAssetRefs({
    refs: input.config.assetRefs,
    clientId: input.clientId,
  });
  await Promise.all(provisional.map((ref) => bindAssetToOwnedSite({
    assetId: ref.assetId,
    clientId: input.clientId,
    siteId: input.siteId,
  })));
  const canonical = await validateOwnedAssetRefs({
    refs: provisional,
    clientId: input.clientId,
    siteId: input.siteId,
  });
  return { ...input.config, assetRefs: canonical };
}

/** editor/API에서 되돌아온 manifest는 이미 site-bound인 registry 레코드와 전부 일치해야 한다. */
export async function validateConfigAssetRefsForSave(input: {
  config: SiteConfig;
  persistedConfig: SiteConfig | null | undefined;
  clientId: string;
  siteId: string;
}): Promise<SiteConfig> {
  const flags = assetProvenanceConfig();
  const submittedHasManifest = Object.hasOwn(input.config, 'assetRefs');
  const submitted = input.config.assetRefs;
  const persisted = input.persistedConfig?.assetRefs;
  if (!flags.write) {
    if (!persisted?.length) {
      if (!submittedHasManifest) return input.config;
      throw new AssetProvenanceError(
        'CLIENT_PROVENANCE_FORBIDDEN',
        'Asset references cannot be submitted while provenance WRITE is disabled.',
      );
    }
    if (submittedHasManifest) {
      const unchanged = submitted?.length === persisted.length && submitted.every((ref, index) =>
        ref.assetId === persisted[index]?.assetId && ref.url === persisted[index]?.url);
      if (!unchanged) {
        throw new AssetProvenanceError(
          'ASSET_PROVENANCE_CONFLICT',
          'A client cannot add, change, or remove persisted asset references.',
        );
      }
    }
    // Feature-flag rollback must not strand already dual-written sites. The persisted
    // server manifest remains authoritative even when a legacy editor omits the field.
    return { ...input.config, assetRefs: persisted };
  }
  if (!persisted?.length) {
    if (submittedHasManifest) {
      throw new AssetProvenanceError(
        'CLIENT_PROVENANCE_FORBIDDEN',
        'A client cannot introduce a new asset manifest.',
      );
    }
    return input.config;
  }
  if (submittedHasManifest) {
    const unchanged = submitted?.length === persisted.length && submitted.every((ref, index) =>
      ref.assetId === persisted[index]?.assetId && ref.url === persisted[index]?.url);
    if (!unchanged) {
      throw new AssetProvenanceError(
        'ASSET_PROVENANCE_CONFLICT',
        'A client cannot add, change, or remove persisted asset references.',
      );
    }
  }
  const canonical = await validateOwnedAssetRefs({
    refs: persisted,
    clientId: input.clientId,
    siteId: input.siteId,
  });
  return { ...input.config, assetRefs: canonical };
}
