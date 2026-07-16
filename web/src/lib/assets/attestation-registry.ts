import 'server-only';
import { isMockMode } from '@/lib/env';
import { getServiceRoleClient } from '@/lib/data/supabase/client';
import { resolveOwnedAssetRecords } from './registry';
import { AssetProvenanceError } from './provenance';
import {
  AssetAttestationError,
  GENERAL_ASSET_ATTESTATION_VERSION,
  assertCurrentGeneralAssetAttestationVersion,
  assertCurrentPersonAssetConsentVersion,
  isCurrentPersonAssetConsent,
  type AssetAttestationScope,
  type GeneralAssetAttestation,
  type PersonAssetConsent,
} from './attestation-contract';
import {
  createMemoryAssetAttestationRegistry,
  normalizeGeneralAttestationAssetSets,
  selectCurrentSiteAttestationForManifest,
  type AssetAttestationRegistry,
  type RecordGeneralAssetAttestationInput,
  type RecordPersonAssetConsentInput,
} from './attestation-registry-core';

interface GeneralAttestationRow {
  id: string;
  client_id: string;
  site_id: string | null;
  scope_type: AssetAttestationScope;
  statement_version: string;
  person_asset_ids: string[];
  non_person_asset_ids: string[];
  actor_id: string;
  attested_at: string;
  revoked_at: string | null;
  idempotency_key: string;
}

interface GeneralAttestationAssetRow {
  attestation_id: string;
  asset_id: string;
}

interface PersonConsentRow {
  id: string;
  asset_id: string;
  client_id: string;
  statement_version: string;
  actor_id: string;
  attested_at: string;
  revoked_at: string | null;
}

function rowToPersonConsent(row: PersonConsentRow): PersonAssetConsent {
  return {
    id: row.id,
    assetId: row.asset_id,
    clientId: row.client_id,
    statementVersion: row.statement_version,
    actorId: row.actor_id,
    attestedAt: row.attested_at,
    revokedAt: row.revoked_at,
  };
}

function rowToGeneralAttestation(
  row: GeneralAttestationRow,
  assetIds: readonly string[],
): GeneralAssetAttestation {
  return {
    id: row.id,
    clientId: row.client_id,
    siteId: row.site_id,
    scope: row.scope_type,
    statementVersion: row.statement_version,
    assetIds: [...assetIds],
    personAssetIds: [...(row.person_asset_ids ?? [])],
    nonPersonAssetIds: [...(row.non_person_asset_ids ?? [])],
    actorId: row.actor_id,
    attestedAt: row.attested_at,
    revokedAt: row.revoked_at,
    idempotencyKey: row.idempotency_key,
  };
}

async function assertOwnedSite(siteId: string, clientId: string): Promise<void> {
  const svc = getServiceRoleClient();
  const { data, error } = await svc
    .from('sites')
    .select('id')
    .eq('id', siteId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw new Error(`asset attestation site lookup failed: ${error.message}`);
  if (!data) {
    throw new AssetAttestationError(
      'ATTESTATION_SITE_MISMATCH',
      'The attestation site does not belong to the authenticated client.',
    );
  }
}

async function assertEligibleUploads(input: {
  assetIds: readonly string[];
  clientId: string;
  siteId?: string | null;
}): Promise<void> {
  const records = await resolveOwnedAssetRecords({
    assetIds: input.assetIds,
    clientId: input.clientId,
    ...(input.siteId !== undefined && input.siteId !== null ? { siteId: input.siteId } : {}),
  }).catch((error: unknown) => {
    if (error instanceof AssetProvenanceError && error.code === 'ASSET_SITE_MISMATCH') {
      throw new AssetAttestationError(
        'ATTESTATION_SITE_MISMATCH',
        'One or more assets are not bound to the requested site.',
      );
    }
    throw new AssetAttestationError(
      'ATTESTATION_ASSET_MISMATCH',
      'One or more assets are unavailable in the authenticated scope.',
    );
  });
  for (const record of records) {
    if (record.origin !== 'customer_upload') {
      throw new AssetAttestationError(
        'ATTESTATION_ASSET_ORIGIN_INVALID',
        'Only server-registered customer uploads may receive an asset attestation.',
      );
    }
    if (input.siteId === null && record.siteId !== null) {
      throw new AssetAttestationError(
        'ATTESTATION_SITE_MISMATCH',
        'An onboarding attestation cannot cover an asset already bound to a site.',
      );
    }
  }
}

function translateWriteError(
  error: { code?: string; message?: string } | null,
  operation: string,
): never {
  if (error?.code === '23505') {
    throw new AssetAttestationError(
      'ATTESTATION_IDEMPOTENCY_CONFLICT',
      'The active attestation or idempotency key conflicts with an existing record.',
    );
  }
  if (error?.code === '42501') {
    throw new AssetAttestationError(
      'ATTESTATION_OWNER_MISMATCH',
      'The attestation authority check failed.',
    );
  }
  if (error?.code === '23514') {
    throw new AssetAttestationError(
      'ATTESTATION_ASSET_MISMATCH',
      'The attestation asset or scope validation failed.',
    );
  }
  throw new Error(`${operation} failed: ${error?.message ?? 'missing database result'}`);
}

class SupabaseAssetAttestationRegistry implements AssetAttestationRegistry {
  async recordGeneral(input: RecordGeneralAssetAttestationInput): Promise<GeneralAssetAttestation> {
    assertCurrentGeneralAssetAttestationVersion(input.statementVersion);
    const classification = normalizeGeneralAttestationAssetSets(input);
    if (input.siteId) await assertOwnedSite(input.siteId, input.clientId);
    await assertEligibleUploads({
      assetIds: classification.assetIds,
      clientId: input.clientId,
      siteId: input.siteId ?? null,
    });

    const svc = getServiceRoleClient();
    const { data, error } = await svc.rpc('create_general_asset_attestation', {
      p_client_id: input.clientId,
      p_site_id: input.siteId ?? null,
      p_statement_version: input.statementVersion,
      p_asset_ids: classification.assetIds,
      p_person_asset_ids: classification.personAssetIds,
      p_non_person_asset_ids: classification.nonPersonAssetIds,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error || typeof data !== 'string') {
      translateWriteError(error, 'general asset attestation');
    }
    const record = await this.getGeneralById({ id: data, clientId: input.clientId });
    if (!record) {
      throw new Error('general asset attestation was created but could not be read');
    }
    return record;
  }

  async recordPerson(input: RecordPersonAssetConsentInput): Promise<PersonAssetConsent> {
    assertCurrentPersonAssetConsentVersion(input.statementVersion);
    if (input.siteId) await assertOwnedSite(input.siteId, input.clientId);
    await assertEligibleUploads({
      assetIds: [input.assetId],
      clientId: input.clientId,
      ...(input.siteId !== undefined ? { siteId: input.siteId } : {}),
    });

    const svc = getServiceRoleClient();
    const { data, error } = await svc
      .from('asset_person_consents')
      .insert({
        asset_id: input.assetId,
        client_id: input.clientId,
        statement_version: input.statementVersion,
        actor_id: input.clientId,
      })
      .select('*')
      .single();
    if (!error && data) return rowToPersonConsent(data as PersonConsentRow);

    if (error?.code === '23505') {
      const { data: existing, error: lookupError } = await svc
        .from('asset_person_consents')
        .select('*')
        .eq('asset_id', input.assetId)
        .eq('client_id', input.clientId)
        .eq('statement_version', input.statementVersion)
        .is('revoked_at', null)
        .maybeSingle();
      if (lookupError) throw new Error(`person consent retry lookup failed: ${lookupError.message}`);
      if (existing) return rowToPersonConsent(existing as PersonConsentRow);
    }
    translateWriteError(error, 'person asset consent');
  }

  async getGeneralById(input: {
    id: string;
    clientId: string;
  }): Promise<GeneralAssetAttestation | null> {
    const svc = getServiceRoleClient();
    const [{ data, error }, { data: assets, error: assetError }] = await Promise.all([
      svc
        .from('asset_general_attestations')
        .select('*')
        .eq('id', input.id)
        .eq('client_id', input.clientId)
        .maybeSingle(),
      svc
        .from('asset_general_attestation_assets')
        .select('attestation_id, asset_id')
        .eq('attestation_id', input.id),
    ]);
    if (error) throw new Error(`general attestation lookup failed: ${error.message}`);
    if (assetError) throw new Error(`general attestation asset lookup failed: ${assetError.message}`);
    if (!data) return null;
    const assetIds = ((assets ?? []) as GeneralAttestationAssetRow[]).map((row) => row.asset_id);
    return rowToGeneralAttestation(data as GeneralAttestationRow, assetIds);
  }

  async resolvePersonConsents(input: {
    assetIds: readonly string[];
    clientId: string;
  }): Promise<PersonAssetConsent[]> {
    const ids = [...new Set(input.assetIds)];
    if (ids.length === 0) return [];
    const svc = getServiceRoleClient();
    const { data, error } = await svc
      .from('asset_person_consents')
      .select('*')
      .in('asset_id', ids)
      .eq('client_id', input.clientId)
      .is('revoked_at', null);
    if (error) throw new Error(`person consent lookup failed: ${error.message}`);
    return ((data ?? []) as PersonConsentRow[]).map(rowToPersonConsent);
  }

  async resolveCurrentForSiteManifest(input: {
    assetIds: readonly string[];
    clientId: string;
    siteId: string;
  }): Promise<GeneralAssetAttestation | null> {
    if (input.assetIds.length === 0) return null;
    await assertOwnedSite(input.siteId, input.clientId);

    const svc = getServiceRoleClient();
    const { data, error } = await svc
      .from('asset_general_attestations')
      .select('*')
      .eq('client_id', input.clientId)
      .eq('site_id', input.siteId)
      .eq('scope_type', 'site')
      .eq('statement_version', GENERAL_ASSET_ATTESTATION_VERSION)
      .is('revoked_at', null);
    if (error) throw new Error(`site attestation lookup failed: ${error.message}`);

    const rows = (data ?? []) as GeneralAttestationRow[];
    if (rows.length === 0) return null;
    const attestationIds = rows.map((row) => row.id);
    const { data: memberships, error: membershipError } = await svc
      .from('asset_general_attestation_assets')
      .select('attestation_id, asset_id')
      .in('attestation_id', attestationIds);
    if (membershipError) {
      throw new Error(`site attestation membership lookup failed: ${membershipError.message}`);
    }
    const assetsByAttestation = new Map<string, string[]>();
    for (const membership of (memberships ?? []) as GeneralAttestationAssetRow[]) {
      const assetIds = assetsByAttestation.get(membership.attestation_id) ?? [];
      assetIds.push(membership.asset_id);
      assetsByAttestation.set(membership.attestation_id, assetIds);
    }
    return selectCurrentSiteAttestationForManifest({
      ...input,
      candidates: rows.map((row) => rowToGeneralAttestation(
        row,
        assetsByAttestation.get(row.id) ?? [],
      )),
    });
  }

  async bindGeneralToSite(input: {
    attestationId: string;
    clientId: string;
    siteId: string;
  }): Promise<GeneralAssetAttestation> {
    await assertOwnedSite(input.siteId, input.clientId);
    const current = await this.getGeneralById({ id: input.attestationId, clientId: input.clientId });
    if (!current) {
      throw new AssetAttestationError('ATTESTATION_NOT_FOUND', 'General attestation not found.');
    }
    if (current.revokedAt !== null) {
      throw new AssetAttestationError('ATTESTATION_REVOKED', 'The general attestation was revoked.');
    }
    if (current.siteId === input.siteId && current.scope === 'site') return current;
    if (current.siteId !== null || current.scope !== 'onboarding') {
      throw new AssetAttestationError(
        'ATTESTATION_BINDING_CONFLICT',
        'The general attestation is already bound to another site.',
      );
    }
    await assertEligibleUploads({
      assetIds: current.assetIds,
      clientId: input.clientId,
      siteId: input.siteId,
    });

    const svc = getServiceRoleClient();
    const { data, error } = await svc
      .from('asset_general_attestations')
      .update({ site_id: input.siteId, scope_type: 'site' })
      .eq('id', input.attestationId)
      .eq('client_id', input.clientId)
      .is('site_id', null)
      .eq('scope_type', 'onboarding')
      .is('revoked_at', null)
      .select('*')
      .maybeSingle();
    if (error) translateWriteError(error, 'general attestation site binding');
    if (!data) {
      throw new AssetAttestationError(
        'ATTESTATION_BINDING_CONFLICT',
        'The general attestation binding changed concurrently.',
      );
    }
    return rowToGeneralAttestation(data as GeneralAttestationRow, current.assetIds);
  }

  async revokeGeneral(input: {
    attestationId: string;
    clientId: string;
  }): Promise<GeneralAssetAttestation> {
    const current = await this.getGeneralById({ id: input.attestationId, clientId: input.clientId });
    if (!current) {
      throw new AssetAttestationError('ATTESTATION_NOT_FOUND', 'General attestation not found.');
    }
    if (current.revokedAt !== null) return current;
    const revokedAt = new Date().toISOString();
    const svc = getServiceRoleClient();
    const { data, error } = await svc
      .from('asset_general_attestations')
      .update({ revoked_at: revokedAt })
      .eq('id', input.attestationId)
      .eq('client_id', input.clientId)
      .is('revoked_at', null)
      .select('*')
      .maybeSingle();
    if (error) translateWriteError(error, 'general attestation revocation');
    if (!data) throw new AssetAttestationError('ATTESTATION_REVOKED', 'The attestation is already revoked.');
    return rowToGeneralAttestation(data as GeneralAttestationRow, current.assetIds);
  }

  async revokePerson(input: {
    consentId: string;
    clientId: string;
  }): Promise<PersonAssetConsent> {
    const svc = getServiceRoleClient();
    const { data: current, error: lookupError } = await svc
      .from('asset_person_consents')
      .select('*')
      .eq('id', input.consentId)
      .eq('client_id', input.clientId)
      .maybeSingle();
    if (lookupError) throw new Error(`person consent lookup failed: ${lookupError.message}`);
    if (!current) {
      throw new AssetAttestationError('ATTESTATION_NOT_FOUND', 'Person consent not found.');
    }
    if ((current as PersonConsentRow).revoked_at !== null) {
      return rowToPersonConsent(current as PersonConsentRow);
    }

    const revokedAt = new Date().toISOString();
    const { data, error } = await svc
      .from('asset_person_consents')
      .update({ revoked_at: revokedAt })
      .eq('id', input.consentId)
      .eq('client_id', input.clientId)
      .is('revoked_at', null)
      .select('*')
      .maybeSingle();
    if (error) translateWriteError(error, 'person consent revocation');
    if (!data) {
      const { data: raced, error: racedError } = await svc
        .from('asset_person_consents')
        .select('*')
        .eq('id', input.consentId)
        .eq('client_id', input.clientId)
        .maybeSingle();
      if (racedError) throw new Error(`person consent retry lookup failed: ${racedError.message}`);
      if (raced && (raced as PersonConsentRow).revoked_at !== null) {
        return rowToPersonConsent(raced as PersonConsentRow);
      }
      throw new AssetAttestationError('ATTESTATION_NOT_FOUND', 'Person consent not found.');
    }
    return rowToPersonConsent(data as PersonConsentRow);
  }
}

const GLOBAL_KEY = '__daboimAssetAttestationRegistryV2__' as const;
type GlobalWithRegistry = typeof globalThis & { [GLOBAL_KEY]?: AssetAttestationRegistry };

export function getAttestationRegistry(): AssetAttestationRegistry {
  if (!isMockMode()) return new SupabaseAssetAttestationRegistry();
  const global = globalThis as GlobalWithRegistry;
  global[GLOBAL_KEY] ??= createMemoryAssetAttestationRegistry({
    resolveOwnedAssets: resolveOwnedAssetRecords,
    ownsSite: async ({ siteId, clientId }) => {
      const { getDataServices } = await import('@/lib/data');
      const site = await getDataServices().sites.getById(siteId);
      return site?.clientId === clientId;
    },
  });
  return global[GLOBAL_KEY];
}

export function recordGeneralAssetAttestation(
  input: RecordGeneralAssetAttestationInput,
): Promise<GeneralAssetAttestation> {
  return getAttestationRegistry().recordGeneral(input);
}

export function recordPersonAssetConsent(
  input: RecordPersonAssetConsentInput,
): Promise<PersonAssetConsent> {
  return getAttestationRegistry().recordPerson(input);
}

export function bindGeneralAssetAttestationToOwnedSite(input: {
  attestationId: string;
  clientId: string;
  siteId: string;
}): Promise<GeneralAssetAttestation> {
  return getAttestationRegistry().bindGeneralToSite(input);
}

export function resolveCurrentSiteAssetAttestation(input: {
  assetIds: readonly string[];
  clientId: string;
  siteId: string;
}): Promise<GeneralAssetAttestation | null> {
  return getAttestationRegistry().resolveCurrentForSiteManifest(input);
}

export async function resolveOwnedGeneralAssetAttestation(input: {
  attestationId: string;
  clientId: string;
  siteId?: string | null;
}): Promise<GeneralAssetAttestation | null> {
  const record = await getAttestationRegistry().getGeneralById({
    id: input.attestationId,
    clientId: input.clientId,
  });
  if (!record
    || record.revokedAt !== null
    || record.statementVersion !== GENERAL_ASSET_ATTESTATION_VERSION
    || record.actorId !== input.clientId
    || (input.siteId !== undefined && record.siteId !== input.siteId)) {
    return null;
  }
  return record;
}

export interface AssetAttestationSnapshot {
  generalAttestation: GeneralAssetAttestation | null;
  personConsentsByAssetId: ReadonlyMap<string, PersonAssetConsent>;
}

/** Batch boundary for generation/publish audits; avoids per-slot database reads. */
export async function resolveAssetAttestationSnapshot(input: {
  clientId: string;
  siteId?: string | null;
  generalAttestationId?: string | null;
  assetIds: readonly string[];
}): Promise<AssetAttestationSnapshot> {
  const ids = [...new Set(input.assetIds)];
  const registry = getAttestationRegistry();
  const [generalCandidate, personCandidates] = await Promise.all([
    typeof input.siteId === 'string'
      ? registry.resolveCurrentForSiteManifest({
        assetIds: ids,
        clientId: input.clientId,
        siteId: input.siteId,
      })
      : input.generalAttestationId
        ? registry.getGeneralById({ id: input.generalAttestationId, clientId: input.clientId })
      : Promise.resolve(null),
    registry.resolvePersonConsents({ assetIds: ids, clientId: input.clientId }),
  ]);
  // Coverage is checked per factual slot by isCurrentGeneralAssetAttestation.
  // Do not invalidate a site-level snapshot merely because this batch also
  // contains decorative AI/imported assets that the statement should not cover.
  const generalAttestation = generalCandidate
    && generalCandidate.revokedAt === null
    && generalCandidate.statementVersion === GENERAL_ASSET_ATTESTATION_VERSION
    && generalCandidate.clientId === input.clientId
    && generalCandidate.actorId === input.clientId
    && (input.siteId === undefined || (
      generalCandidate.siteId === input.siteId
      && generalCandidate.scope === (input.siteId === null ? 'onboarding' : 'site')
    ))
    ? generalCandidate
    : null;
  const personConsentsByAssetId = new Map<string, PersonAssetConsent>();
  for (const consent of personCandidates) {
    if (isCurrentPersonAssetConsent(consent, {
      clientId: input.clientId,
      assetId: consent.assetId,
    })) {
      personConsentsByAssetId.set(consent.assetId, consent);
    }
  }
  return { generalAttestation, personConsentsByAssetId };
}

export type {
  AssetAttestationRegistry,
  RecordGeneralAssetAttestationInput,
  RecordPersonAssetConsentInput,
} from './attestation-registry-core';
export type { GeneralAssetAttestation, PersonAssetConsent } from './attestation-contract';
