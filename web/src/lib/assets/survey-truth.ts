import 'server-only';

import type { SurveyInput } from '@/lib/types/domain';
import { resolveAssetAttestationSnapshot } from './attestation-registry';
import { resolveOwnedAssetRecords } from './registry';
import {
  AssetTruthRequestError,
  surveyDirectUploadRefs,
  uniqueAssetRefs,
  verifySurveyAssetTruthRecords,
  type VerifiedSurveyTruth,
} from './survey-truth-core';

async function resolveRecords(input: {
  assetIds: readonly string[];
  clientId: string;
}) {
  if (input.assetIds.length === 0) return [];
  try {
    return await resolveOwnedAssetRecords(input);
  } catch {
    throw new AssetTruthRequestError(
      'FACTUAL_ASSET_REF_INVALID',
      '사진 자산의 소유권을 확인할 수 없습니다. 사진을 다시 올려주세요.',
    );
  }
}

/**
 * New v2 request boundary. URLs alone are never evidence. Server-registered
 * customer uploads/imports plus a current rights attestation are factual input.
 * Legacy requests without imageDirectionId remain on their compatibility path.
 */
export async function verifySurveyAssetTruth(input: {
  survey: SurveyInput;
  clientId: string;
  targetSiteId?: string;
}): Promise<VerifiedSurveyTruth> {
  if (!input.survey.imageDirectionId) {
    return { survey: input.survey, directUploadAssetRefs: [], direction: null };
  }
  const directRefs = surveyDirectUploadRefs(input.survey);
  const importedRefs = uniqueAssetRefs(input.survey.importedPhotoAssetRefs ?? []);
  const [directRecords, importedRecords, attestationSnapshot] = await Promise.all([
    resolveRecords({ assetIds: directRefs.map((ref) => ref.assetId), clientId: input.clientId }),
    resolveRecords({ assetIds: importedRefs.map((ref) => ref.assetId), clientId: input.clientId }),
    resolveAssetAttestationSnapshot({
      clientId: input.clientId,
      siteId: input.targetSiteId ?? null,
      generalAttestationId: input.survey.generalAssetAttestationId,
      assetIds: [...directRefs, ...importedRefs].map((ref) => ref.assetId),
    }),
  ]);
  return verifySurveyAssetTruthRecords({
    survey: input.survey,
    clientId: input.clientId,
    targetSiteId: input.targetSiteId,
    directRecords,
    importedRecords,
    attestation: attestationSnapshot.generalAttestation,
    personConsentsByAssetId: attestationSnapshot.personConsentsByAssetId,
  });
}

export {
  AssetTruthRequestError,
  mergeCanonicalAssetRefs,
  type AssetTruthRequestErrorCode,
  type VerifiedSurveyTruth,
} from './survey-truth-core';
