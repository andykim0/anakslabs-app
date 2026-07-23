import 'server-only';
import { isMockMode } from '@/lib/env';
import { getServiceRoleClient } from '@/lib/data/supabase/client';
import {
  AssetProvenanceError,
  toAssetRef,
  type AssetRef,
  type AssetRecord,
} from './provenance';
import {
  assertAssetRegistrationRetryCompatible,
  createMemoryAssetRegistry,
  createServerAssetOriginStamper,
  type AssetRegistry,
  type RegisterStoredAssetInput,
  type ServerAssetRegistration,
} from './registry-core';
import {
  adaptBeforeAfterAssetRecord,
  reconcileGenericAndBeforeAfterRecords,
} from './before-after-adapter';
import { isHeroPhotoQualityStamp } from './hero-photo-quality';

interface AssetRecordRow {
  id: string;
  client_id: string;
  site_id: string | null;
  origin: AssetRecord['origin'];
  media_type: AssetRecord['mediaType'];
  storage_bucket: string | null;
  storage_key: string | null;
  canonical_url: string;
  created_at: string;
  image_quality: unknown;
}

function rowToAssetRecord(row: AssetRecordRow): AssetRecord {
  return {
    id: row.id,
    origin: row.origin,
    mediaType: row.media_type,
    storageBucket: row.storage_bucket,
    storageKey: row.storage_key,
    canonicalUrl: row.canonical_url,
    createdAt: row.created_at,
    ownerId: row.client_id,
    siteId: row.site_id,
    ...(isHeroPhotoQualityStamp(row.image_quality) ? { imageQuality: row.image_quality } : {}),
  };
}

function requireStoredIdentity(input: ServerAssetRegistration): void {
  if (!input.clientId.trim() || !input.storageBucket.trim() || !input.storageKey.trim()
    || !input.canonicalUrl.trim()) {
    throw new AssetProvenanceError(
      'ASSET_STORAGE_IDENTITY_REQUIRED',
      'A clientId and complete storage identity are required to register an asset.',
    );
  }
}

async function assertOwnedSite(siteId: string, clientId: string): Promise<void> {
  const svc = getServiceRoleClient();
  const { data, error } = await svc
    .from('sites')
    .select('id')
    .eq('id', siteId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw new Error(`asset site ownership lookup failed: ${error.message}`);
  if (!data) {
    throw new AssetProvenanceError(
      'ASSET_SITE_OWNER_MISMATCH',
      `Site ${siteId} does not belong to client ${clientId}`,
    );
  }
}

class SupabaseAssetRegistry implements AssetRegistry {
  async register(input: ServerAssetRegistration): Promise<AssetRecord> {
    requireStoredIdentity(input);
    if (input.siteId) await assertOwnedSite(input.siteId, input.clientId);

    const svc = getServiceRoleClient();
    const { data, error } = await svc
      .from('asset_records')
      .insert({
        client_id: input.clientId,
        site_id: input.siteId ?? null,
        origin: input.origin,
        media_type: input.mediaType,
        storage_bucket: input.storageBucket,
        storage_key: input.storageKey,
        canonical_url: input.canonicalUrl,
        image_quality: input.imageQuality ?? null,
      })
      .select('*')
      .single();
    if (!error && data) return rowToAssetRecord(data as AssetRecordRow);

    if (error?.code !== '23505') {
      throw new Error(`asset provenance registration failed: ${error?.message ?? 'missing row'}`);
    }

    const existing = await this.getByStorageIdentity(input.storageBucket, input.storageKey);
    if (!existing) {
      throw new Error('asset provenance registration conflicted but the existing record was not readable');
    }
    assertAssetRegistrationRetryCompatible(existing, input);
    if (!existing.siteId && input.siteId) {
      return this.bindToSite({ assetId: existing.id, clientId: input.clientId, siteId: input.siteId });
    }
    return existing;
  }

  async getById(assetId: string): Promise<AssetRecord | null> {
    const svc = getServiceRoleClient();
    const { data, error } = await svc
      .from('asset_records')
      .select('*')
      .eq('id', assetId)
      .maybeSingle();
    if (error) throw new Error(`asset provenance lookup failed: ${error.message}`);
    return data ? rowToAssetRecord(data as AssetRecordRow) : null;
  }

  async getByStorageIdentity(storageBucket: string, storageKey: string): Promise<AssetRecord | null> {
    const svc = getServiceRoleClient();
    const { data, error } = await svc
      .from('asset_records')
      .select('*')
      .eq('storage_bucket', storageBucket)
      .eq('storage_key', storageKey)
      .maybeSingle();
    if (error) throw new Error(`asset storage identity lookup failed: ${error.message}`);
    return data ? rowToAssetRecord(data as AssetRecordRow) : null;
  }

  async resolveOwned(input: {
    assetIds: readonly string[];
    clientId: string;
    siteId?: string | null;
  }): Promise<AssetRecord[]> {
    const ids = [...new Set(input.assetIds)];
    if (ids.length === 0) return [];
    const available = await this.resolveOwnedAvailable({
      assetIds: ids,
      clientId: input.clientId,
    });
    const byId = new Map(available.map((record) => [record.id, record] as const));
    return ids.map((id) => {
      const record = byId.get(id);
      if (!record) throw new AssetProvenanceError('ASSET_NOT_FOUND', `Asset not found: ${id}`);
      if (input.siteId !== undefined && input.siteId !== null && record.siteId !== input.siteId) {
        throw new AssetProvenanceError('ASSET_SITE_MISMATCH', `Asset is not bound to site ${input.siteId}`);
      }
      return record;
    });
  }

  async resolveOwnedAvailable(input: {
    assetIds: readonly string[];
    clientId: string;
  }): Promise<AssetRecord[]> {
    const ids = [...new Set(input.assetIds)];
    if (ids.length === 0) return [];
    const svc = getServiceRoleClient();
    const { data, error } = await svc
      .from('asset_records')
      .select('*')
      .in('id', ids)
      .eq('client_id', input.clientId);
    if (error) throw new Error(`asset provenance batch lookup failed: ${error.message}`);
    const byId = new Map(
      ((data ?? []) as AssetRecordRow[]).map((row) => {
        const record = rowToAssetRecord(row);
        return [record.id, record] as const;
      }),
    );
    return ids.flatMap((id) => {
      const record = byId.get(id);
      return record ? [record] : [];
    });
  }

  async bindToSite(input: { assetId: string; clientId: string; siteId: string }): Promise<AssetRecord> {
    const current = await this.getById(input.assetId);
    if (!current) throw new AssetProvenanceError('ASSET_NOT_FOUND', `Asset not found: ${input.assetId}`);
    if (current.ownerId !== input.clientId) {
      throw new AssetProvenanceError('ASSET_OWNER_MISMATCH', 'Asset belongs to another client');
    }
    if (current.siteId && current.siteId !== input.siteId) {
      throw new AssetProvenanceError('ASSET_SITE_BINDING_CONFLICT', 'Asset is already bound to another site');
    }
    await assertOwnedSite(input.siteId, input.clientId);
    if (current.siteId === input.siteId) return current;

    const svc = getServiceRoleClient();
    const { data, error } = await svc
      .from('asset_records')
      .update({ site_id: input.siteId })
      .eq('id', input.assetId)
      .eq('client_id', input.clientId)
      .is('site_id', null)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`asset site binding failed: ${error.message}`);
    if (data) return rowToAssetRecord(data as AssetRecordRow);

    const raced = await this.getById(input.assetId);
    if (raced?.siteId === input.siteId && raced.ownerId === input.clientId) return raced;
    throw new AssetProvenanceError('ASSET_SITE_BINDING_CONFLICT', 'Asset binding changed concurrently');
  }
}

const GLOBAL_KEY = '__daboimAssetRegistryV2__' as const;
type GlobalWithAssetRegistry = typeof globalThis & { [GLOBAL_KEY]?: AssetRegistry };

export function getAssetRegistry(): AssetRegistry {
  if (!isMockMode()) return new SupabaseAssetRegistry();
  const global = globalThis as GlobalWithAssetRegistry;
  global[GLOBAL_KEY] ??= createMemoryAssetRegistry({
    ownsSite: async ({ siteId, clientId }) => {
      // Dynamic boundary avoids data → AI service → asset registry import cycles.
      const { getDataServices } = await import('@/lib/data');
      const site = await getDataServices().sites.getById(siteId);
      return site?.clientId === clientId;
    },
  });
  return global[GLOBAL_KEY];
}

export function registerCustomerUploadAsset(input: RegisterStoredAssetInput): Promise<AssetRecord> {
  return createServerAssetOriginStamper(getAssetRegistry()).registerCustomerUploadAsset(input);
}

export function registerCustomerImportAsset(input: RegisterStoredAssetInput): Promise<AssetRecord> {
  return createServerAssetOriginStamper(getAssetRegistry()).registerCustomerImportAsset(input);
}

export function registerAiGeneratedAsset(input: RegisterStoredAssetInput): Promise<AssetRecord> {
  return createServerAssetOriginStamper(getAssetRegistry()).registerAiGeneratedAsset(input);
}

export function bindAssetToOwnedSite(input: {
  assetId: string;
  clientId: string;
  siteId: string;
}): Promise<AssetRecord> {
  return getAssetRegistry().bindToSite(input);
}

export function resolveOwnedAssetRecords(input: {
  assetIds: readonly string[];
  clientId: string;
  siteId?: string | null;
}): Promise<AssetRecord[]> {
  return getAssetRegistry().resolveOwned(input);
}

export function resolveAvailableOwnedAssetRecords(input: {
  assetIds: readonly string[];
  clientId: string;
}): Promise<AssetRecord[]> {
  return getAssetRegistry().resolveOwnedAvailable(input);
}

/**
 * Client를 왕복한 AssetRef를 registry 레코드로 다시 권위화한다.
 * URL만으로 레코드를 찾거나 출처를 승격하지 않으며, 중복 ID와 canonical URL 불일치는 거부한다.
 */
export async function validateOwnedAssetRefs(input: {
  refs: readonly { assetId: string; url: string }[];
  clientId: string;
  siteId?: string | null;
}): Promise<AssetRef[]> {
  const ids = input.refs.map((ref) => ref.assetId);
  if (new Set(ids).size !== ids.length) {
    throw new AssetProvenanceError('ASSET_PROVENANCE_CONFLICT', 'Duplicate asset references are not allowed');
  }
  const records = await resolveOwnedAssetRecords({
    assetIds: ids,
    clientId: input.clientId,
    ...(input.siteId !== undefined ? { siteId: input.siteId } : {}),
  });
  return records.map((record, index) => {
    const canonical = toAssetRef(record);
    if (canonical.url !== input.refs[index]?.url) {
      throw new AssetProvenanceError(
        'ASSET_PROVENANCE_CONFLICT',
        `Asset URL does not match its canonical registry record: ${canonical.assetId}`,
      );
    }
    return canonical;
  });
}

/**
 * Resolve one id across generic and specialized ledgers. Matching duplicate
 * evidence is tolerated; contradictory dual authority is always rejected.
 */
export async function resolveRegisteredAssetWithBeforeAfterAdapter(input: {
  assetId: string;
  clientId: string;
  siteId?: string | null;
}): Promise<AssetRecord | null> {
  const registry = getAssetRegistry();
  const { getCustomerAssetRegistry } = await import('@/lib/uploads/asset-registry');
  const customerRegistry = getCustomerAssetRegistry();
  const [generic, specializedById] = await Promise.all([
    registry.getById(input.assetId),
    customerRegistry.getById(input.assetId),
  ]);
  const reverseStorageKey = !specializedById
    && generic?.storageBucket === 'client-assets'
    ? generic.storageKey
    : null;
  if (reverseStorageKey && typeof customerRegistry.getByObjectPath !== 'function') {
    throw new AssetProvenanceError(
      'ASSET_PROVENANCE_CONFLICT',
      'Before/after registry cannot verify the authoritative storage identity.',
    );
  }
  const specializedByStorage = reverseStorageKey
    ? await customerRegistry.getByObjectPath(reverseStorageKey)
    : null;
  const specialized = specializedById ?? specializedByStorage;
  const adapted = specialized ? adaptBeforeAfterAssetRecord(specialized) : null;
  const storageMatch = adapted?.storageBucket && adapted.storageKey
    ? await registry.getByStorageIdentity(adapted.storageBucket, adapted.storageKey)
    : null;
  const record = reconcileGenericAndBeforeAfterRecords({
    genericById: generic,
    genericByStorage: storageMatch,
    beforeAfter: adapted,
  });
  if (!record) return null;
  if (record.ownerId !== input.clientId) {
    throw new AssetProvenanceError('ASSET_OWNER_MISMATCH', 'Asset belongs to another client');
  }
  if (input.siteId !== undefined && input.siteId !== null && record.siteId !== input.siteId) {
    throw new AssetProvenanceError('ASSET_SITE_MISMATCH', `Asset is not bound to site ${input.siteId}`);
  }
  return record;
}

export { toAssetRef } from './provenance';
export { adaptBeforeAfterAssetRecord } from './before-after-adapter';
export type { AssetRef, AssetRecord } from './provenance';
export type { RegisterStoredAssetInput } from './registry-core';
