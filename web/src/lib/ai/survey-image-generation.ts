import 'server-only';
import type { SurveyInput } from '@/lib/types/domain';
import type { AiAssetOwnerContext } from '@/lib/data/types';
import { assetProvenanceConfig } from '@/lib/assets/provenance-flags';
import { resolveOwnedAssetRecords } from '@/lib/assets/registry';
import { resolveAssetAttestationSnapshot } from '@/lib/assets/attestation-registry';
import { isCurrentGeneralAssetAttestation } from '@/lib/assets/attestation-contract';
import { surveyDirectUploadRefs } from '@/lib/assets/survey-truth-core';
import {
  DEFAULT_V2_IMAGE_DIRECTION,
  resolveV2ImageGenerationPlan,
  selectRealPhotoAssetRef,
  type V2ImageGenerationPlan,
} from './image-generation-policy';

export function usesV2ImageGenerationPolicy(survey: SurveyInput): boolean {
  return Boolean(survey.imageDirectionId) || assetProvenanceConfig().assign;
}

export function surveyWithResolvedV2ImageDirection(survey: SurveyInput): SurveyInput {
  if (!usesV2ImageGenerationPolicy(survey)) return survey;
  return survey.imageDirectionId
    ? survey
    : { ...survey, imageDirectionId: DEFAULT_V2_IMAGE_DIRECTION };
}

/**
 * Resolves client projections through both server registries. A URL, checkbox,
 * or direction string alone never makes an upload factual.
 */
export async function resolveSurveyV2ImageGenerationPlan(
  survey: SurveyInput,
  owner: AiAssetOwnerContext,
): Promise<V2ImageGenerationPlan | null> {
  if (!usesV2ImageGenerationPolicy(survey)) return null;
  const direction = survey.imageDirectionId ?? DEFAULT_V2_IMAGE_DIRECTION;
  if (direction !== 'real_photo') {
    return resolveV2ImageGenerationPlan({ direction, clientId: owner.clientId, siteId: owner.siteId });
  }

  const selected = selectRealPhotoAssetRef(survey);
  if (!selected.ref) {
    return resolveV2ImageGenerationPlan({ direction, clientId: owner.clientId, siteId: owner.siteId });
  }
  // A site attestation is an immutable snapshot of the complete direct-upload
  // manifest, not merely the one photo selected for the hero. Resolving only
  // the selected ref makes an otherwise valid multi-photo site fail on
  // regeneration and could let a partial onboarding snapshot look sufficient.
  const directRefs = surveyDirectUploadRefs(survey);
  const directAssetIds = directRefs.map((ref) => ref.assetId);
  const scopeSiteId = owner.siteId ?? null;
  const records = await resolveOwnedAssetRecords({
    assetIds: [selected.ref.assetId],
    clientId: owner.clientId,
    siteId: scopeSiteId,
  });
  const asset = records[0] ?? null;
  const attestation = await resolveAssetAttestationSnapshot({
    clientId: owner.clientId,
    siteId: scopeSiteId,
    generalAttestationId: survey.generalAssetAttestationId,
    assetIds: directAssetIds,
  });
  const attestedIds = new Set(attestation.generalAttestation?.assetIds ?? []);
  const exactManifest = attestedIds.size === directAssetIds.length
    && directAssetIds.every((assetId) => attestedIds.has(assetId));
  const generalAttestationValid = exactManifest && isCurrentGeneralAssetAttestation(
    attestation.generalAttestation,
    { clientId: owner.clientId, siteId: scopeSiteId, assetId: selected.ref.assetId },
  );

  return resolveV2ImageGenerationPlan({
    direction,
    trustedCustomerUpload: asset,
    requestedAssetRef: selected.ref,
    generalAttestationValid,
    clientId: owner.clientId,
    siteId: scopeSiteId,
    factualSubject: selected.subject,
  });
}
