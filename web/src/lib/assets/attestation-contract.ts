/**
 * Versioned, server-stamped asset attestation contracts.
 *
 * These records are evidence inputs for the asset truth policy. They are not a
 * legal-compliance guarantee, and a client boolean or URL is never equivalent
 * to one of these server records.
 */

export const GENERAL_ASSET_ATTESTATION_VERSION = 'general-assets-2026-07-v1' as const;
export const GENERAL_ASSET_ATTESTATION_TEXT =
  '이 사이트에 사용하는 실사 사진이 실제 사업·제품·공간과 관련된 자료이며, 공개에 필요한 권한을 확인했습니다.' as const;

export const PERSON_ASSET_CONSENT_VERSION = 'person-assets-2026-07-v1' as const;
export const PERSON_ASSET_CONSENT_TEXT =
  '이 사진 속 인물에게 홈페이지 공개와 홍보 사용에 필요한 동의를 확인했습니다.' as const;

export type AssetAttestationScope = 'onboarding' | 'site';

export interface GeneralAssetAttestation {
  id: string;
  clientId: string;
  siteId: string | null;
  scope: AssetAttestationScope;
  statementVersion: string;
  /** Assets explicitly covered when this statement was accepted. */
  assetIds: readonly string[];
  /** Covered assets explicitly classified as containing an identifiable person. */
  personAssetIds: readonly string[];
  /** Covered assets explicitly classified as containing no identifiable person. */
  nonPersonAssetIds: readonly string[];
  actorId: string;
  attestedAt: string;
  revokedAt: string | null;
  idempotencyKey: string;
}

export interface PersonAssetConsent {
  id: string;
  assetId: string;
  clientId: string;
  statementVersion: string;
  actorId: string;
  attestedAt: string;
  revokedAt: string | null;
}

export const ASSET_ATTESTATION_ERROR_CODES = [
  'ATTESTATION_INPUT_INVALID',
  'ATTESTATION_VERSION_MISMATCH',
  'ATTESTATION_NOT_FOUND',
  'ATTESTATION_OWNER_MISMATCH',
  'ATTESTATION_SITE_MISMATCH',
  'ATTESTATION_ASSET_MISMATCH',
  'ATTESTATION_ASSET_ORIGIN_INVALID',
  'ATTESTATION_IDEMPOTENCY_CONFLICT',
  'ATTESTATION_BINDING_CONFLICT',
  'ATTESTATION_REVOKED',
] as const;

export type AssetAttestationErrorCode = (typeof ASSET_ATTESTATION_ERROR_CODES)[number];

export class AssetAttestationError extends Error {
  readonly code: AssetAttestationErrorCode;

  constructor(code: AssetAttestationErrorCode, message: string) {
    super(message);
    this.name = 'AssetAttestationError';
    this.code = code;
  }
}

export function assertCurrentGeneralAssetAttestationVersion(statementVersion: string): void {
  if (statementVersion !== GENERAL_ASSET_ATTESTATION_VERSION) {
    throw new AssetAttestationError(
      'ATTESTATION_VERSION_MISMATCH',
      'The general asset attestation statement is missing or out of date.',
    );
  }
}

export function assertCurrentPersonAssetConsentVersion(statementVersion: string): void {
  if (statementVersion !== PERSON_ASSET_CONSENT_VERSION) {
    throw new AssetAttestationError(
      'ATTESTATION_VERSION_MISMATCH',
      'The person asset consent statement is missing or out of date.',
    );
  }
}

export function isCurrentGeneralAssetAttestation(
  attestation: GeneralAssetAttestation | null | undefined,
  input: { clientId: string; siteId?: string | null; assetId: string },
): attestation is GeneralAssetAttestation {
  const assetIds = new Set(attestation?.assetIds ?? []);
  const personAssetIds = new Set(attestation?.personAssetIds ?? []);
  const nonPersonAssetIds = new Set(attestation?.nonPersonAssetIds ?? []);
  const classificationIsExact = Boolean(attestation)
    && assetIds.size === attestation?.assetIds.length
    && personAssetIds.size === attestation?.personAssetIds.length
    && nonPersonAssetIds.size === attestation?.nonPersonAssetIds.length
    && [...personAssetIds].every((assetId) => assetIds.has(assetId) && !nonPersonAssetIds.has(assetId))
    && [...nonPersonAssetIds].every((assetId) => assetIds.has(assetId))
    && personAssetIds.size + nonPersonAssetIds.size === assetIds.size;
  if (!attestation
    || !classificationIsExact
    || attestation.revokedAt !== null
    || attestation.statementVersion !== GENERAL_ASSET_ATTESTATION_VERSION
    || attestation.clientId !== input.clientId
    || attestation.actorId !== input.clientId
    || !attestation.assetIds.includes(input.assetId)) {
    return false;
  }
  if (input.siteId === undefined) return true;
  return attestation.siteId === input.siteId
    && attestation.scope === (input.siteId === null ? 'onboarding' : 'site');
}

export function isCurrentPersonAssetConsent(
  consent: PersonAssetConsent | null | undefined,
  input: { clientId: string; assetId: string },
): consent is PersonAssetConsent {
  return Boolean(consent
    && consent.revokedAt === null
    && consent.statementVersion === PERSON_ASSET_CONSENT_VERSION
    && consent.clientId === input.clientId
    && consent.actorId === input.clientId
    && consent.assetId === input.assetId);
}
