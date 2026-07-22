import { AssetProvenanceError, type AssetRecord } from './provenance';
import {
  AssetAttestationError,
  GENERAL_ASSET_ATTESTATION_VERSION,
  assertCurrentGeneralAssetAttestationVersion,
  assertCurrentPersonAssetConsentVersion,
  type GeneralAssetAttestation,
  type PersonAssetConsent,
} from './attestation-contract';

export interface RecordGeneralAssetAttestationInput {
  /** Authenticated server context. Never accept this from a request body. */
  clientId: string;
  /** Optional only while onboarding has not created the site. */
  siteId?: string | null;
  statementVersion: string;
  assetIds: readonly string[];
  personAssetIds: readonly string[];
  nonPersonAssetIds: readonly string[];
  idempotencyKey: string;
}

export interface RecordPersonAssetConsentInput {
  /** Authenticated server context. Never accept this from a request body. */
  clientId: string;
  /** Optional only while onboarding has not created the site. */
  siteId?: string | null;
  statementVersion: string;
  assetId: string;
}

export interface AssetAttestationRegistry {
  recordGeneral(input: RecordGeneralAssetAttestationInput): Promise<GeneralAssetAttestation>;
  recordPerson(input: RecordPersonAssetConsentInput): Promise<PersonAssetConsent>;
  getGeneralById(input: { id: string; clientId: string }): Promise<GeneralAssetAttestation | null>;
  resolvePersonConsents(input: {
    assetIds: readonly string[];
    clientId: string;
  }): Promise<PersonAssetConsent[]>;
  resolveCurrentForSiteManifest(input: {
    assetIds: readonly string[];
    clientId: string;
    siteId: string;
  }): Promise<GeneralAssetAttestation | null>;
  bindGeneralToSite(input: {
    attestationId: string;
    clientId: string;
    siteId: string;
  }): Promise<GeneralAssetAttestation>;
  revokeGeneral(input: { attestationId: string; clientId: string }): Promise<GeneralAssetAttestation>;
  revokePerson(input: { consentId: string; clientId: string }): Promise<PersonAssetConsent>;
}

export interface MemoryAssetAttestationRegistry extends AssetAttestationRegistry {
  clear(): void;
}

type ResolveOwnedAssets = (input: {
  assetIds: readonly string[];
  clientId: string;
  siteId?: string | null;
}) => Promise<AssetRecord[]>;

type OwnsSite = (input: { siteId: string; clientId: string }) => boolean | Promise<boolean>;

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new AssetAttestationError('ATTESTATION_INPUT_INVALID', `${label} is required`);
  }
  return normalized;
}

function uniqueAssetIds(assetIds: readonly string[]): string[] {
  const normalized = assetIds.map((id) => required(id, 'assetId'));
  if (normalized.length === 0 || new Set(normalized).size !== normalized.length) {
    throw new AssetAttestationError(
      'ATTESTATION_INPUT_INVALID',
      'At least one unique asset id is required.',
    );
  }
  return normalized;
}

export function normalizeGeneralAttestationAssetSets(input: {
  assetIds: readonly string[];
  personAssetIds: readonly string[];
  nonPersonAssetIds: readonly string[];
}): { assetIds: string[]; personAssetIds: string[]; nonPersonAssetIds: string[] } {
  const assetIds = uniqueAssetIds(input.assetIds);
  const personAssetIds = input.personAssetIds;
  const nonPersonAssetIds = input.nonPersonAssetIds;
  const person = personAssetIds.map((id) => required(id, 'personAssetId'));
  const nonPerson = nonPersonAssetIds.map((id) => required(id, 'nonPersonAssetId'));
  const assets = new Set(assetIds);
  const personSet = new Set(person);
  const nonPersonSet = new Set(nonPerson);
  const invalid = personSet.size !== person.length
    || nonPersonSet.size !== nonPerson.length
    || person.some((id) => !assets.has(id) || nonPersonSet.has(id))
    || nonPerson.some((id) => !assets.has(id))
    || personSet.size + nonPersonSet.size !== assets.size;
  if (invalid) {
    throw new AssetAttestationError(
      'ATTESTATION_INPUT_INVALID',
      'Every covered asset must be classified exactly once as person or no-identifiable-person.',
    );
  }
  return { assetIds, personAssetIds: person, nonPersonAssetIds: nonPerson };
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
}

function hasExactPartition(record: GeneralAssetAttestation): boolean {
  const assetIds = new Set(record.assetIds);
  const personIds = new Set(record.personAssetIds);
  const nonPersonIds = new Set(record.nonPersonAssetIds);
  return assetIds.size === record.assetIds.length
    && personIds.size === record.personAssetIds.length
    && nonPersonIds.size === record.nonPersonAssetIds.length
    && record.personAssetIds.every((id) => assetIds.has(id) && !nonPersonIds.has(id))
    && record.nonPersonAssetIds.every((id) => assetIds.has(id))
    && personIds.size + nonPersonIds.size === assetIds.size;
}

/**
 * Select the current server snapshot for a site's exact customer-upload
 * manifest. Equivalent duplicate confirmations are harmless; conflicting
 * person classifications fail closed instead of relying on row order.
 */
export function selectCurrentSiteAttestationForManifest(input: {
  assetIds: readonly string[];
  clientId: string;
  siteId: string;
  candidates: readonly GeneralAssetAttestation[];
}): GeneralAssetAttestation | null {
  const clientId = required(input.clientId, 'clientId');
  const siteId = required(input.siteId, 'siteId');
  const assetIds = input.assetIds.map((id) => required(id, 'assetId'));
  if (new Set(assetIds).size !== assetIds.length) {
    throw new AssetAttestationError(
      'ATTESTATION_INPUT_INVALID',
      'The site customer-upload manifest must contain unique asset ids.',
    );
  }
  if (assetIds.length === 0) return null;

  const expected = new Set(assetIds);
  const matches = input.candidates.filter((record) =>
    record.clientId === clientId
    && record.actorId === clientId
    && record.siteId === siteId
    && record.scope === 'site'
    && record.statementVersion === GENERAL_ASSET_ATTESTATION_VERSION
    && record.revokedAt === null
    && record.assetIds.length === expected.size
    && record.assetIds.every((assetId) => expected.has(assetId)));
  if (matches.length === 0) return null;

  for (const record of matches) {
    if (!hasExactPartition(record)) {
      throw new AssetAttestationError(
        'ATTESTATION_ASSET_MISMATCH',
        'A current site attestation has an invalid asset classification partition.',
      );
    }
  }

  const classificationKey = (record: GeneralAssetAttestation) => [
    [...record.personAssetIds].sort().join(','),
    [...record.nonPersonAssetIds].sort().join(','),
  ].join('\u0000');
  if (new Set(matches.map(classificationKey)).size !== 1) {
    throw new AssetAttestationError(
      'ATTESTATION_BINDING_CONFLICT',
      'Current site attestations disagree about person classification.',
    );
  }

  const selected = [...matches].sort((left, right) =>
    right.attestedAt.localeCompare(left.attestedAt) || right.id.localeCompare(left.id))[0];
  return selected ? cloneGeneral(selected) : null;
}

function cloneGeneral(record: GeneralAssetAttestation): GeneralAssetAttestation {
  return {
    ...record,
    assetIds: [...record.assetIds],
    personAssetIds: [...record.personAssetIds],
    nonPersonAssetIds: [...record.nonPersonAssetIds],
  };
}

function clonePerson(record: PersonAssetConsent): PersonAssetConsent {
  return { ...record };
}

async function assertSiteOwner(
  ownsSite: OwnsSite | undefined,
  siteId: string,
  clientId: string,
): Promise<void> {
  if (!ownsSite || !(await ownsSite({ siteId, clientId }))) {
    throw new AssetAttestationError(
      'ATTESTATION_SITE_MISMATCH',
      'The attestation site does not belong to the authenticated client.',
    );
  }
}

async function resolveEligibleUploads(
  resolveOwnedAssets: ResolveOwnedAssets,
  input: { assetIds: readonly string[]; clientId: string; siteId?: string | null },
): Promise<AssetRecord[]> {
  let records: AssetRecord[];
  try {
    records = await resolveOwnedAssets(input);
  } catch (error) {
    if (error instanceof AssetProvenanceError && error.code === 'ASSET_SITE_MISMATCH') {
      throw new AssetAttestationError(
        'ATTESTATION_SITE_MISMATCH',
        'One or more assets are not bound to the requested site.',
      );
    }
    // Do not disclose whether a cross-tenant identifier exists.
    throw new AssetAttestationError(
      'ATTESTATION_ASSET_MISMATCH',
      'One or more assets are unavailable in the authenticated scope.',
    );
  }
  if (records.length !== input.assetIds.length) {
    throw new AssetAttestationError(
      'ATTESTATION_ASSET_MISMATCH',
      'The complete asset set could not be resolved.',
    );
  }
  const expected = new Set(input.assetIds);
  for (const record of records) {
    if (!expected.has(record.id) || record.ownerId !== input.clientId) {
      throw new AssetAttestationError(
        'ATTESTATION_ASSET_MISMATCH',
        'An asset does not belong to the authenticated client.',
      );
    }
    if (record.origin !== 'customer_upload' && record.origin !== 'customer_import') {
      throw new AssetAttestationError(
        'ATTESTATION_ASSET_ORIGIN_INVALID',
        'Only server-registered customer uploads or imports may receive an asset attestation.',
      );
    }
    if (input.siteId === null && record.siteId !== null) {
      throw new AssetAttestationError(
        'ATTESTATION_SITE_MISMATCH',
        'An onboarding attestation cannot cover an asset already bound to a site.',
      );
    }
    if (typeof input.siteId === 'string' && record.siteId !== input.siteId) {
      throw new AssetAttestationError(
        'ATTESTATION_SITE_MISMATCH',
        'A site attestation can only cover assets bound to that site.',
      );
    }
  }
  return records;
}

/**
 * Deterministic MOCK_MODE seam mirroring database authority rules. Actor,
 * timestamps, scope, and revocation state are created here, never accepted
 * from a client DTO.
 */
export function createMemoryAssetAttestationRegistry(options: {
  resolveOwnedAssets: ResolveOwnedAssets;
  ownsSite?: OwnsSite;
  idFactory?: () => string;
  now?: () => string;
}): MemoryAssetAttestationRegistry {
  const generalById = new Map<string, GeneralAssetAttestation>();
  const generalByIdempotency = new Map<string, string>();
  const personById = new Map<string, PersonAssetConsent>();
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date().toISOString());

  return {
    async recordGeneral(rawInput) {
      const classification = normalizeGeneralAttestationAssetSets(rawInput);
      const input = {
        clientId: required(rawInput.clientId, 'clientId'),
        siteId: rawInput.siteId === undefined ? null : rawInput.siteId,
        statementVersion: required(rawInput.statementVersion, 'statementVersion'),
        ...classification,
        idempotencyKey: required(rawInput.idempotencyKey, 'idempotencyKey'),
      };
      assertCurrentGeneralAssetAttestationVersion(input.statementVersion);
      if (input.siteId) await assertSiteOwner(options.ownsSite, input.siteId, input.clientId);
      await resolveEligibleUploads(options.resolveOwnedAssets, {
        assetIds: input.assetIds,
        clientId: input.clientId,
        siteId: input.siteId,
      });

      const retryKey = `${input.clientId}\u0000${input.idempotencyKey}`;
      const retryId = generalByIdempotency.get(retryKey);
      if (retryId) {
        const existing = generalById.get(retryId);
        if (!existing) {
          throw new AssetAttestationError(
            'ATTESTATION_IDEMPOTENCY_CONFLICT',
            'The attestation retry index is inconsistent.',
          );
        }
        if (existing.siteId !== input.siteId
          || existing.statementVersion !== input.statementVersion
          || !sameIds(existing.assetIds, input.assetIds)
          || !sameIds(existing.personAssetIds, input.personAssetIds)
          || !sameIds(existing.nonPersonAssetIds, input.nonPersonAssetIds)
          || existing.revokedAt !== null) {
          throw new AssetAttestationError(
            'ATTESTATION_IDEMPOTENCY_CONFLICT',
            'The idempotency key was already used for a different attestation.',
          );
        }
        return cloneGeneral(existing);
      }

      const timestamp = now();
      const record: GeneralAssetAttestation = {
        id: idFactory(),
        clientId: input.clientId,
        siteId: input.siteId,
        scope: input.siteId ? 'site' : 'onboarding',
        statementVersion: input.statementVersion,
        assetIds: input.assetIds,
        personAssetIds: input.personAssetIds,
        nonPersonAssetIds: input.nonPersonAssetIds,
        actorId: input.clientId,
        attestedAt: timestamp,
        revokedAt: null,
        idempotencyKey: input.idempotencyKey,
      };
      generalById.set(record.id, record);
      generalByIdempotency.set(retryKey, record.id);
      return cloneGeneral(record);
    },

    async recordPerson(rawInput) {
      const input = {
        clientId: required(rawInput.clientId, 'clientId'),
        siteId: rawInput.siteId === undefined ? undefined : rawInput.siteId,
        statementVersion: required(rawInput.statementVersion, 'statementVersion'),
        assetId: required(rawInput.assetId, 'assetId'),
      };
      assertCurrentPersonAssetConsentVersion(input.statementVersion);
      if (input.siteId) await assertSiteOwner(options.ownsSite, input.siteId, input.clientId);
      await resolveEligibleUploads(options.resolveOwnedAssets, {
        assetIds: [input.assetId],
        clientId: input.clientId,
        ...(input.siteId !== undefined ? { siteId: input.siteId } : {}),
      });

      for (const record of personById.values()) {
        if (record.assetId === input.assetId
          && record.statementVersion === input.statementVersion
          && record.clientId === input.clientId
          && record.revokedAt === null) {
          return clonePerson(record);
        }
      }
      const record: PersonAssetConsent = {
        id: idFactory(),
        assetId: input.assetId,
        clientId: input.clientId,
        statementVersion: input.statementVersion,
        actorId: input.clientId,
        attestedAt: now(),
        revokedAt: null,
      };
      personById.set(record.id, record);
      return clonePerson(record);
    },

    async getGeneralById({ id, clientId }) {
      const record = generalById.get(id);
      return record?.clientId === clientId ? cloneGeneral(record) : null;
    },

    async resolvePersonConsents({ assetIds, clientId }) {
      const wanted = new Set(assetIds);
      const result: PersonAssetConsent[] = [];
      for (const record of personById.values()) {
        if (wanted.has(record.assetId)
          && record.clientId === clientId
          && record.revokedAt === null) {
          result.push(clonePerson(record));
        }
      }
      return result;
    },

    async resolveCurrentForSiteManifest({ assetIds, clientId, siteId }) {
      return selectCurrentSiteAttestationForManifest({
        assetIds,
        clientId,
        siteId,
        candidates: [...generalById.values()],
      });
    },

    async bindGeneralToSite({ attestationId, clientId, siteId }) {
      const record = generalById.get(attestationId);
      if (!record || record.clientId !== clientId) {
        throw new AssetAttestationError('ATTESTATION_NOT_FOUND', 'General attestation not found.');
      }
      if (record.revokedAt !== null) {
        throw new AssetAttestationError('ATTESTATION_REVOKED', 'The general attestation was revoked.');
      }
      if (record.siteId === siteId) return cloneGeneral(record);
      if (record.siteId !== null || record.scope !== 'onboarding') {
        throw new AssetAttestationError(
          'ATTESTATION_BINDING_CONFLICT',
          'The general attestation is already bound to another site.',
        );
      }
      await assertSiteOwner(options.ownsSite, siteId, clientId);
      await resolveEligibleUploads(options.resolveOwnedAssets, {
        assetIds: record.assetIds,
        clientId,
        siteId,
      });
      const bound: GeneralAssetAttestation = { ...record, siteId, scope: 'site' };
      generalById.set(record.id, bound);
      return cloneGeneral(bound);
    },

    async revokeGeneral({ attestationId, clientId }) {
      const record = generalById.get(attestationId);
      if (!record || record.clientId !== clientId) {
        throw new AssetAttestationError('ATTESTATION_NOT_FOUND', 'General attestation not found.');
      }
      if (record.revokedAt !== null) return cloneGeneral(record);
      const revoked = { ...record, revokedAt: now() };
      generalById.set(record.id, revoked);
      return cloneGeneral(revoked);
    },

    async revokePerson({ consentId, clientId }) {
      const record = personById.get(consentId);
      if (!record || record.clientId !== clientId) {
        throw new AssetAttestationError('ATTESTATION_NOT_FOUND', 'Person consent not found.');
      }
      if (record.revokedAt !== null) return clonePerson(record);
      const revoked = { ...record, revokedAt: now() };
      personById.set(record.id, revoked);
      return clonePerson(revoked);
    },

    clear() {
      generalById.clear();
      generalByIdempotency.clear();
      personById.clear();
    },
  };
}
