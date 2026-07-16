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
import { preserveServerAssetUsagesForSave } from './assignment-core';
import type { DesignCandidate } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';
import type { ImageDirectionId } from './image-directions';

export const CANDIDATE_ASSET_TRUTH_ERROR_CODES = [
  'CANDIDATE_ASSET_REF_REQUIRED',
  'CANDIDATE_ASSET_INVALID',
  'CANDIDATE_IMAGE_DIRECTION_MISMATCH',
] as const;

export type CandidateAssetTruthErrorCode =
  (typeof CANDIDATE_ASSET_TRUTH_ERROR_CODES)[number];

export class CandidateAssetTruthError extends Error {
  readonly status = 422 as const;
  readonly code: CandidateAssetTruthErrorCode;

  constructor(code: CandidateAssetTruthErrorCode, message: string) {
    super(message);
    this.name = 'CandidateAssetTruthError';
    this.code = code;
  }
}

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
  /** 미지정=신규 사이트(반드시 provisional), 지정=해당 owned site에 이미 exact-bind된 자산만 허용. */
  targetSiteId?: string;
  /** Server-resolved v2 direction. Omit only for the unchanged legacy path. */
  expectedImageDirectionId?: ImageDirectionId;
  /** v2 truth boundary가 이미 owner·origin·attestation을 검증한 직접 업로드 ID만 허용한다. */
  allowedCustomerUploadAssetIds?: readonly string[];
}): Promise<DesignCandidate> {
  const config = assetProvenanceConfig();
  const supplied = input.candidate.heroAssetRef;
  if (!config.write) {
    rejectWhenWriteOff(supplied ? [supplied] : undefined);
    return input.candidate;
  }
  if (input.expectedImageDirectionId
    && input.candidate.imageDirectionId !== input.expectedImageDirectionId) {
    throw new CandidateAssetTruthError(
      'CANDIDATE_IMAGE_DIRECTION_MISMATCH',
      '선택한 이미지 방향과 디자인 후보의 이미지 방향이 일치하지 않습니다. 후보를 다시 골라주세요.',
    );
  }
  if (!supplied) {
    if (input.expectedImageDirectionId) {
      throw new CandidateAssetTruthError(
        'CANDIDATE_ASSET_REF_REQUIRED',
        '디자인 후보의 히어로 이미지 출처를 서버에서 확인할 수 없습니다. 후보를 다시 만들어주세요.',
      );
    }
    return input.candidate;
  }

  let record;
  try {
    [record] = await resolveOwnedAssetRecords({
      assetIds: [supplied.assetId],
      clientId: input.clientId,
    });
  } catch (error) {
    if (!(error instanceof AssetProvenanceError)) throw error;
    throw new CandidateAssetTruthError(
      'CANDIDATE_ASSET_INVALID',
      '디자인 후보의 히어로 이미지 소유권을 확인할 수 없습니다. 후보를 다시 만들어주세요.',
    );
  }
  if (!record) {
    throw new CandidateAssetTruthError(
      'CANDIDATE_ASSET_INVALID',
      '디자인 후보의 히어로 이미지 기록을 찾을 수 없습니다. 후보를 다시 만들어주세요.',
    );
  }
  const canonical = toAssetRef(record);
  const validBinding = input.targetSiteId
    ? record.siteId === input.targetSiteId
    : record.siteId === null;
  const verifiedCustomerUpload = record.origin === 'customer_upload'
    && Boolean(input.allowedCustomerUploadAssetIds?.includes(record.id));
  const validOrigin = input.expectedImageDirectionId === 'real_photo'
    ? verifiedCustomerUpload
    : input.expectedImageDirectionId
      ? record.origin === 'ai_generated' || verifiedCustomerUpload
      // Legacy/WRITE-only compatibility: registry ownership and canonical URL
      // are still checked, but v2 attestation policy is not assigned yet.
      : record.origin === 'ai_generated' || record.origin === 'customer_upload';
  if (
    !validOrigin ||
    record.mediaType !== 'image' ||
    !validBinding ||
    canonical.url !== supplied.url ||
    canonical.url !== input.candidate.heroImageUrl
  ) {
    throw new CandidateAssetTruthError(
      'CANDIDATE_ASSET_INVALID',
      '디자인 후보의 히어로 이미지가 서버 자산 기록과 일치하지 않습니다. 후보를 다시 만들어주세요.',
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
  const protectedConfig = preserveServerAssetUsagesForSave({
    config: input.config,
    persistedConfig: input.persistedConfig,
  });
  const submittedHasManifest = Object.hasOwn(protectedConfig, 'assetRefs');
  const submitted = protectedConfig.assetRefs;
  const persisted = input.persistedConfig?.assetRefs;
  if (!flags.write) {
    if (!persisted?.length) {
      if (!submittedHasManifest) return protectedConfig;
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
    return { ...protectedConfig, assetRefs: persisted };
  }
  if (!persisted?.length) {
    if (submittedHasManifest) {
      throw new AssetProvenanceError(
        'CLIENT_PROVENANCE_FORBIDDEN',
        'A client cannot introduce a new asset manifest.',
      );
    }
    return protectedConfig;
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
  return { ...protectedConfig, assetRefs: canonical };
}
