import type { SurveyInput } from '@/lib/types/domain';
import type { GeneralAssetAttestation, PersonAssetConsent } from './attestation-contract';
import {
  isCurrentGeneralAssetAttestation,
  isCurrentPersonAssetConsent,
} from './attestation-contract';
import {
  imageDirectionToLegacyCandidateStyle,
  REAL_PHOTO_REQUIRED_GUIDANCE,
  type ImageDirectionId,
} from './image-directions';
import type { AssetRef, AssetRecord } from './provenance';
import { toAssetRef } from './provenance';

export const ASSET_TRUTH_REQUEST_ERROR_CODES = [
  'REAL_PHOTO_UPLOAD_REQUIRED',
  'FACTUAL_ASSET_REF_INVALID',
  'FACTUAL_ASSET_ATTESTATION_REQUIRED',
  'ASSET_PERSON_CLASSIFICATION_REQUIRED',
  'PERSON_ASSET_CONSENT_REQUIRED',
  'IMPORTED_ASSET_NOT_FACTUAL',
] as const;

export type AssetTruthRequestErrorCode = (typeof ASSET_TRUTH_REQUEST_ERROR_CODES)[number];

/** Stable 422 boundary used before rate limits, providers, credits, or site mutation. */
export class AssetTruthRequestError extends Error {
  readonly status = 422;
  readonly code: AssetTruthRequestErrorCode;

  constructor(code: AssetTruthRequestErrorCode, message: string) {
    super(message);
    this.name = 'AssetTruthRequestError';
    this.code = code;
  }
}

export function uniqueAssetRefs(refs: readonly AssetRef[]): AssetRef[] {
  const byId = new Map<string, AssetRef>();
  for (const ref of refs) {
    const existing = byId.get(ref.assetId);
    if (existing && existing.url !== ref.url) {
      throw new AssetTruthRequestError(
        'FACTUAL_ASSET_REF_INVALID',
        '같은 사진 자산에 서로 다른 주소가 제출되었습니다. 사진을 다시 선택해 주세요.',
      );
    }
    byId.set(ref.assetId, ref);
  }
  return [...byId.values()];
}

export function surveyDirectUploadRefs(survey: SurveyInput): AssetRef[] {
  return uniqueAssetRefs([
    ...(survey.heroPhotoAssetRef ? [survey.heroPhotoAssetRef] : []),
    ...(survey.storePhotoAssetRefs ?? []),
    ...(survey.contentItems ?? []).flatMap((item) => item.photoAssetRef ? [item.photoAssetRef] : []),
  ]);
}

function bindingIsValid(record: AssetRecord, targetSiteId?: string): boolean {
  return targetSiteId ? record.siteId === targetSiteId : record.siteId === null;
}

function assertRecordsMatch(input: {
  refs: readonly AssetRef[];
  records: readonly AssetRecord[];
  clientId: string;
  targetSiteId?: string;
  expectedOrigin: AssetRecord['origin'];
}): void {
  if (input.refs.length !== input.records.length) {
    throw new AssetTruthRequestError(
      'FACTUAL_ASSET_REF_INVALID',
      '사진 자산의 소유권을 확인할 수 없습니다. 사진을 다시 올려주세요.',
    );
  }
  for (const [index, record] of input.records.entries()) {
    const submitted = input.refs[index];
    if (!submitted
      || record.id !== submitted.assetId
      || record.ownerId !== input.clientId
      || record.origin !== input.expectedOrigin
      || record.mediaType !== 'image'
      || !bindingIsValid(record, input.targetSiteId)
      || record.canonicalUrl !== submitted.url) {
      throw new AssetTruthRequestError(
        input.expectedOrigin === 'customer_import'
          ? 'IMPORTED_ASSET_NOT_FACTUAL'
          : 'FACTUAL_ASSET_REF_INVALID',
        '사진 주소만으로는 실제 사업 사진임을 확인할 수 없습니다. 직접 업로드한 사진을 사용해 주세요.',
      );
    }
  }
}

function refForUrl(records: readonly AssetRecord[], url: string | undefined): AssetRef | undefined {
  if (!url) return undefined;
  const record = records.find((item) => item.canonicalUrl === url);
  return record ? toAssetRef(record) : undefined;
}

function normalizedSurvey(
  survey: SurveyInput,
  records: readonly AssetRecord[],
  direction: ImageDirectionId,
): SurveyInput {
  const allowedUrls = new Set(records.map((record) => record.canonicalUrl));
  const heroRef = refForUrl(records, survey.heroPhotoUrl);
  const storeUrls = (survey.storePhotoUrls ?? []).filter((url) => allowedUrls.has(url));
  const storeRefs = records
    .filter((record) => storeUrls.includes(record.canonicalUrl))
    .map(toAssetRef);
  const contentItems = survey.contentItems?.map((item) => {
    const photoRef = refForUrl(records, item.photoUrl);
    if (!photoRef) {
      const textOnly = { ...item };
      delete textOnly.photoUrl;
      delete textOnly.photoAssetRef;
      return textOnly;
    }
    return { ...item, photoUrl: photoRef.url, photoAssetRef: photoRef };
  });
  const withoutHero = { ...survey };
  delete withoutHero.heroPhotoUrl;
  delete withoutHero.heroPhotoAssetRef;

  return {
    ...withoutHero,
    imageDirectionId: direction,
    imageStyle: imageDirectionToLegacyCandidateStyle(direction),
    ...(heroRef ? { heroPhotoUrl: heroRef.url, heroPhotoAssetRef: heroRef } : {}),
    storePhotoUrls: storeUrls,
    storePhotoAssetRefs: storeRefs,
    personPhotoAssetIds: (survey.personPhotoAssetIds ?? []).filter((assetId) =>
      records.some((record) => record.id === assetId)),
    nonPersonPhotoAssetIds: (survey.nonPersonPhotoAssetIds ?? []).filter((assetId) =>
      records.some((record) => record.id === assetId)),
    ...(contentItems ? { contentItems } : {}),
  };
}

export interface VerifiedSurveyTruth {
  survey: SurveyInput;
  directUploadAssetRefs: AssetRef[];
  direction: ImageDirectionId | null;
}

/** Pure policy seam. Registry/attestation rows must already be server-resolved. */
export function verifySurveyAssetTruthRecords(input: {
  survey: SurveyInput;
  clientId: string;
  targetSiteId?: string;
  directRecords: readonly AssetRecord[];
  importedRecords: readonly AssetRecord[];
  attestation: GeneralAssetAttestation | null;
  personConsentsByAssetId?: ReadonlyMap<string, PersonAssetConsent>;
}): VerifiedSurveyTruth {
  const direction = input.survey.imageDirectionId ?? null;
  if (!direction) return { survey: input.survey, directUploadAssetRefs: [], direction: null };

  const directRefs = surveyDirectUploadRefs(input.survey);
  const importedRefs = uniqueAssetRefs(input.survey.importedPhotoAssetRefs ?? []);
  assertRecordsMatch({
    refs: directRefs,
    records: input.directRecords,
    clientId: input.clientId,
    targetSiteId: input.targetSiteId,
    expectedOrigin: 'customer_upload',
  });

  const directIds = new Set(directRefs.map((ref) => ref.assetId));
  const personAssetIds = [...new Set(input.survey.personPhotoAssetIds ?? [])];
  const nonPersonAssetIds = [...new Set(input.survey.nonPersonPhotoAssetIds ?? [])];
  if (personAssetIds.some((assetId) => !directIds.has(assetId))
    || nonPersonAssetIds.some((assetId) => !directIds.has(assetId))) {
    throw new AssetTruthRequestError(
      'FACTUAL_ASSET_REF_INVALID',
      '인물 여부 분류는 현재 직접 업로드한 사진에만 연결할 수 있습니다.',
    );
  }
  assertRecordsMatch({
    refs: importedRefs,
    records: input.importedRecords,
    clientId: input.clientId,
    targetSiteId: input.targetSiteId,
    expectedOrigin: 'customer_import',
  });

  const directIdSet = new Set(input.directRecords.map((record) => record.id));
  const attestationCoversExactSet = Boolean(input.attestation)
    && input.attestation?.assetIds.length === directIdSet.size
    && input.attestation.assetIds.every((assetId) => directIdSet.has(assetId));
  if (input.attestation && !attestationCoversExactSet) {
    throw new AssetTruthRequestError(
      'FACTUAL_ASSET_ATTESTATION_REQUIRED',
      '현재 사진 전체를 다시 확인해 주세요. 이전 사진 구성의 확인 기록은 사용할 수 없습니다.',
    );
  }
  if (input.attestation && attestationCoversExactSet) {
    const personSet = new Set(personAssetIds);
    const nonPersonSet = new Set(nonPersonAssetIds);
    const classificationIsExact = personSet.size === personAssetIds.length
      && nonPersonSet.size === nonPersonAssetIds.length
      && personAssetIds.every((assetId) => !nonPersonSet.has(assetId))
      && personSet.size + nonPersonSet.size === directIdSet.size
      && [...directIdSet].every((assetId) => personSet.has(assetId) || nonPersonSet.has(assetId));
    const declarationMatchesSnapshot = classificationIsExact
      && input.attestation.personAssetIds.length === personSet.size
      && input.attestation.personAssetIds.every((assetId) => personSet.has(assetId))
      && input.attestation.nonPersonAssetIds.length === nonPersonSet.size
      && input.attestation.nonPersonAssetIds.every((assetId) => nonPersonSet.has(assetId));
    if (!declarationMatchesSnapshot) {
      throw new AssetTruthRequestError(
        'ASSET_PERSON_CLASSIFICATION_REQUIRED',
        '모든 직접 업로드 사진에서 식별 가능한 인물 여부를 하나씩 확인해 주세요.',
      );
    }
  }
  const verifiedRecords = attestationCoversExactSet
    ? input.directRecords.filter((record) =>
      isCurrentGeneralAssetAttestation(input.attestation, {
        clientId: input.clientId,
        siteId: input.targetSiteId ?? null,
        assetId: record.id,
      }))
    : [];
  if (direction === 'real_photo' && input.directRecords.length === 0) {
    throw new AssetTruthRequestError('REAL_PHOTO_UPLOAD_REQUIRED', REAL_PHOTO_REQUIRED_GUIDANCE);
  }
  if (direction === 'real_photo' && verifiedRecords.length !== input.directRecords.length) {
    throw new AssetTruthRequestError(
      'FACTUAL_ASSET_ATTESTATION_REQUIRED',
      '실제 사진 사용 확인을 완료해야 실사 사진 방향으로 만들 수 있습니다.',
    );
  }
  for (const assetId of input.attestation?.personAssetIds ?? []) {
    if (!isCurrentPersonAssetConsent(input.personConsentsByAssetId?.get(assetId), {
      clientId: input.clientId,
      assetId,
    })) {
      throw new AssetTruthRequestError(
        'PERSON_ASSET_CONSENT_REQUIRED',
        '인물이 주로 나오는 사진은 사진별 공개·홍보 사용 확인이 필요합니다.',
      );
    }
  }

  const normalized = normalizedSurvey(input.survey, verifiedRecords, direction);
  const pairedUrls = new Set([
    normalized.heroPhotoUrl,
    ...(normalized.storePhotoUrls ?? []),
    ...(normalized.contentItems ?? []).map((item) => item.photoUrl),
  ].filter((url): url is string => Boolean(url)));
  if (direction === 'real_photo' && pairedUrls.size === 0) {
    throw new AssetTruthRequestError(
      'FACTUAL_ASSET_REF_INVALID',
      '확인된 사진 자산과 실제 사용할 사진 주소가 일치하지 않습니다. 사진을 다시 선택해 주세요.',
    );
  }

  return {
    survey: normalized,
    // Artistic hero media may coexist with verified factual gallery/content
    // photos. Every retained customer URL therefore travels with its canonical
    // ref and is atomically bound; no URL-only factual use is persisted.
    directUploadAssetRefs: verifiedRecords.map(toAssetRef),
    direction,
  };
}

export function mergeCanonicalAssetRefs(
  existing: readonly AssetRef[] | undefined,
  additional: readonly AssetRef[],
): AssetRef[] | undefined {
  const refs = uniqueAssetRefs([...(existing ?? []), ...additional]);
  return refs.length ? refs : undefined;
}
