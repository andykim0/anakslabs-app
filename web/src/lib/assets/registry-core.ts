import {
  AssetProvenanceError,
  assertNoClientProvenanceClaims,
  type AssetMediaType,
  type AssetOrigin,
  type AssetRecord,
  type StockAttribution,
} from './provenance';
import type { HeroPhotoQualityStamp } from './hero-photo-quality';

export interface RegisterStoredAssetInput {
  /** Must come from an authenticated server guard, never from a form/survey URL. */
  clientId: string;
  /** Optional only before a site exists. */
  siteId?: string | null;
  storageBucket: string;
  storageKey: string;
  canonicalUrl: string;
  mediaType: AssetMediaType;
  /** Server-computed only; client forms cannot submit this object. */
  imageQuality?: HeroPhotoQualityStamp;
  /** Server-decoded immutable raster dimensions. */
  width?: number;
  height?: number;
}

export interface ServerAssetRegistration extends RegisterStoredAssetInput {
  /** Set only by fixed server boundary helpers. */
  origin: AssetOrigin;
}

export interface RegisterLicensedStockInput {
  /** Deterministic UUID stored separately from the provider key. */
  assetId: string;
  storageBucket: string;
  storageKey: string;
  canonicalUrl: string;
  mediaType: 'image';
  width: number;
  height: number;
  stockKey: string;
  provider: 'pexels';
  providerAssetId: string;
  attribution: StockAttribution;
}

export interface AssetRegistry {
  register(input: ServerAssetRegistration): Promise<AssetRecord>;
  getById(assetId: string): Promise<AssetRecord | null>;
  getByStorageIdentity(storageBucket: string, storageKey: string): Promise<AssetRecord | null>;
  resolveOwned(input: {
    assetIds: readonly string[];
    clientId: string;
    siteId?: string | null;
  }): Promise<AssetRecord[]>;
  /**
   * One batch query that returns only records visible to the authenticated
   * owner. Missing/cross-tenant ids are omitted so policy audits can emit a
   * per-slot fail-closed result without disclosing another tenant's record.
   */
  resolveOwnedAvailable(input: {
    assetIds: readonly string[];
    clientId: string;
  }): Promise<AssetRecord[]>;
  /** Server-only union resolver: owned customer rows plus global licensed stock. */
  resolveAvailable(input: {
    assetIds: readonly string[];
    clientId: string;
    siteId?: string | null;
  }): Promise<AssetRecord[]>;
  bindToSite(input: { assetId: string; clientId: string; siteId: string }): Promise<AssetRecord>;
  registerLicensedStock(input: RegisterLicensedStockInput): Promise<AssetRecord>;
}

type OwnsSite = (input: { siteId: string; clientId: string }) => boolean | Promise<boolean>;

export interface MemoryAssetRegistry extends AssetRegistry {
  clear(): void;
}

export interface ServerAssetOriginStamper {
  registerCustomerUploadAsset(input: RegisterStoredAssetInput): Promise<AssetRecord>;
  registerCustomerImportAsset(input: RegisterStoredAssetInput): Promise<AssetRecord>;
  registerAiGeneratedAsset(input: RegisterStoredAssetInput): Promise<AssetRecord>;
  registerLicensedStockAsset(input: RegisterLicensedStockInput): Promise<AssetRecord>;
}

/** Injectable pure seam proving that callers cannot choose canonical origin. */
export function createServerAssetOriginStamper(registry: AssetRegistry): ServerAssetOriginStamper {
  const stamp = (origin: AssetOrigin, input: RegisterStoredAssetInput) => {
    assertNoClientProvenanceClaims(input);
    if (input.imageQuality && origin !== 'customer_upload') {
      throw new AssetProvenanceError(
        'ASSET_REGISTRATION_INVALID',
        'Image quality stamps are reserved for server-verified customer uploads.',
      );
    }
    return registry.register({ ...input, origin });
  };
  return {
    registerCustomerUploadAsset: (input) => stamp('customer_upload', input),
    registerCustomerImportAsset: (input) => stamp('customer_import', input),
    registerAiGeneratedAsset: (input) => stamp('ai_generated', input),
    registerLicensedStockAsset: (input) => registry.registerLicensedStock(input),
  };
}

function clone(record: AssetRecord): AssetRecord {
  return {
    ...record,
    ...(record.imageQuality
      ? {
          imageQuality: {
            ...record.imageQuality,
            reasons: [...record.imageQuality.reasons],
            metrics: { ...record.imageQuality.metrics },
            ...(record.imageQuality.viewportCrops
              ? {
                  viewportCrops: Object.fromEntries(
                    Object.entries(record.imageQuality.viewportCrops).map(([band, crops]) => [
                      band,
                      crops.map((crop) => ({
                        ...crop,
                        focalPoint: { ...crop.focalPoint },
                        reasons: [...crop.reasons],
                        metrics: { ...crop.metrics },
                      })),
                    ]),
                  ) as NonNullable<typeof record.imageQuality.viewportCrops>,
                }
              : {}),
          },
        }
      : {}),
    ...(record.attribution ? { attribution: { ...record.attribution } } : {}),
  };
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new AssetProvenanceError('ASSET_REGISTRATION_INVALID', `${label} is required`);
  }
  return normalized;
}

function storageIdentity(bucket: string, key: string): string {
  return `${bucket}\u0000${key}`;
}

async function assertSiteOwner(
  ownsSite: OwnsSite | undefined,
  siteId: string,
  clientId: string,
): Promise<void> {
  if (!ownsSite || !(await ownsSite({ siteId, clientId }))) {
    throw new AssetProvenanceError(
      'ASSET_SITE_OWNER_MISMATCH',
      `Site ${siteId} does not belong to asset owner ${clientId}`,
    );
  }
}

export function assertAssetRegistrationRetryCompatible(
  existing: AssetRecord,
  input: ServerAssetRegistration,
): void {
  if (existing.ownerId !== input.clientId) {
    throw new AssetProvenanceError('ASSET_OWNER_MISMATCH', 'Storage identity belongs to another client');
  }
  if (existing.origin !== input.origin
    || existing.mediaType !== input.mediaType
    || existing.canonicalUrl !== input.canonicalUrl
    || existing.imageQuality?.stampSha256 !== input.imageQuality?.stampSha256
    || existing.width !== input.width
    || existing.height !== input.height) {
    throw new AssetProvenanceError(
      'ASSET_PROVENANCE_CONFLICT',
      'Storage identity was already registered with conflicting immutable provenance',
    );
  }
  if (existing.siteId && input.siteId && existing.siteId !== input.siteId) {
    throw new AssetProvenanceError(
      'ASSET_SITE_BINDING_CONFLICT',
      'Asset is already bound to a different site',
    );
  }
}

/** Deterministic MOCK_MODE registry with the same ownership/idempotency rules as Supabase. */
export function createMemoryAssetRegistry(options: {
  ownsSite?: OwnsSite;
  idFactory?: () => string;
  now?: () => string;
} = {}): MemoryAssetRegistry {
  const byId = new Map<string, AssetRecord>();
  const byStorage = new Map<string, string>();
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date().toISOString());

  return {
    async register(rawInput) {
      const input: ServerAssetRegistration = {
        ...rawInput,
        clientId: required(rawInput.clientId, 'clientId'),
        siteId: rawInput.siteId ? required(rawInput.siteId, 'siteId') : null,
        storageBucket: required(rawInput.storageBucket, 'storageBucket'),
        storageKey: required(rawInput.storageKey, 'storageKey'),
        canonicalUrl: required(rawInput.canonicalUrl, 'canonicalUrl'),
      };
      if (input.siteId) await assertSiteOwner(options.ownsSite, input.siteId, input.clientId);

      const identity = storageIdentity(input.storageBucket, input.storageKey);
      const existingId = byStorage.get(identity);
      if (existingId) {
        const existing = byId.get(existingId);
        if (!existing) {
          throw new AssetProvenanceError(
            'ASSET_PROVENANCE_CONFLICT',
            'Storage identity index points to a missing asset record',
          );
        }
        assertAssetRegistrationRetryCompatible(existing, input);
        if (!existing.siteId && input.siteId) {
          const bound = { ...existing, siteId: input.siteId };
          byId.set(existing.id, bound);
          return clone(bound);
        }
        return clone(existing);
      }

      const record: AssetRecord = {
        id: idFactory(),
        origin: input.origin,
        mediaType: input.mediaType,
        storageBucket: input.storageBucket,
        storageKey: input.storageKey,
        canonicalUrl: input.canonicalUrl,
        createdAt: now(),
        ownerId: input.clientId,
        siteId: input.siteId ?? null,
        ...(input.imageQuality ? { imageQuality: input.imageQuality } : {}),
        ...(input.width ? { width: input.width } : {}),
        ...(input.height ? { height: input.height } : {}),
      };
      byId.set(record.id, record);
      byStorage.set(identity, record.id);
      return clone(record);
    },

    async getById(assetId) {
      const record = byId.get(assetId);
      return record ? clone(record) : null;
    },

    async getByStorageIdentity(storageBucket, storageKey) {
      const id = byStorage.get(storageIdentity(storageBucket.trim(), storageKey.trim()));
      const record = id ? byId.get(id) : null;
      return record ? clone(record) : null;
    },

    async resolveOwned({ assetIds, clientId, siteId }) {
      const ids = [...new Set(assetIds)];
      const available = await this.resolveOwnedAvailable({ assetIds: ids, clientId });
      const byId = new Map(available.map((record) => [record.id, record] as const));
      const result: AssetRecord[] = [];
      for (const id of ids) {
        const record = byId.get(id);
        if (!record) throw new AssetProvenanceError('ASSET_NOT_FOUND', `Asset not found: ${id}`);
        if (siteId !== undefined && siteId !== null && record.siteId !== siteId) {
          throw new AssetProvenanceError('ASSET_SITE_MISMATCH', `Asset is not bound to site ${siteId}`);
        }
        result.push(clone(record));
      }
      return result;
    },

    async resolveOwnedAvailable({ assetIds, clientId }) {
      const result: AssetRecord[] = [];
      for (const id of [...new Set(assetIds)]) {
        const record = byId.get(id);
        if (record?.ownerId === clientId) result.push(clone(record));
      }
      return result;
    },

    async resolveAvailable({ assetIds, clientId, siteId }) {
      const result: AssetRecord[] = [];
      for (const id of [...new Set(assetIds)]) {
        const record = byId.get(id);
        if (!record) continue;
        if (record.origin === 'licensed_stock') {
          if (record.ownerId === null && record.siteId === null) result.push(clone(record));
          continue;
        }
        if (record.ownerId !== clientId) continue;
        if (siteId !== undefined && siteId !== null && record.siteId !== siteId) continue;
        result.push(clone(record));
      }
      return result;
    },

    async registerLicensedStock(rawInput) {
      const input: RegisterLicensedStockInput = {
        ...rawInput,
        assetId: required(rawInput.assetId, 'assetId'),
        storageBucket: required(rawInput.storageBucket, 'storageBucket'),
        storageKey: required(rawInput.storageKey, 'storageKey'),
        canonicalUrl: required(rawInput.canonicalUrl, 'canonicalUrl'),
        stockKey: required(rawInput.stockKey, 'stockKey'),
        providerAssetId: required(rawInput.providerAssetId, 'providerAssetId'),
      };
      const identity = storageIdentity(input.storageBucket, input.storageKey);
      const existingId = byStorage.get(identity);
      const existing = existingId ? byId.get(existingId) : byId.get(input.assetId);
      if (existing) {
        if (existing.origin !== 'licensed_stock'
          || existing.ownerId !== null
          || existing.siteId !== null
          || existing.stockKey !== input.stockKey
          || existing.provider !== input.provider
          || existing.providerAssetId !== input.providerAssetId
          || existing.width !== input.width
          || existing.height !== input.height
          || existing.canonicalUrl !== input.canonicalUrl) {
          throw new AssetProvenanceError(
            'ASSET_PROVENANCE_CONFLICT',
            'Licensed stock identity conflicts with an existing immutable record',
          );
        }
        return clone(existing);
      }
      const record: AssetRecord = {
        id: input.assetId,
        origin: 'licensed_stock',
        mediaType: input.mediaType,
        storageBucket: input.storageBucket,
        storageKey: input.storageKey,
        canonicalUrl: input.canonicalUrl,
        createdAt: now(),
        ownerId: null,
        siteId: null,
        width: input.width,
        height: input.height,
        stockKey: input.stockKey,
        provider: input.provider,
        providerAssetId: input.providerAssetId,
        attribution: { ...input.attribution },
      };
      byId.set(record.id, record);
      byStorage.set(identity, record.id);
      return clone(record);
    },

    async bindToSite({ assetId, clientId, siteId }) {
      const record = byId.get(assetId);
      if (!record) throw new AssetProvenanceError('ASSET_NOT_FOUND', `Asset not found: ${assetId}`);
      if (record.ownerId !== clientId) {
        throw new AssetProvenanceError('ASSET_OWNER_MISMATCH', 'Asset belongs to another client');
      }
      if (record.siteId && record.siteId !== siteId) {
        throw new AssetProvenanceError('ASSET_SITE_BINDING_CONFLICT', 'Asset is already bound to another site');
      }
      await assertSiteOwner(options.ownsSite, siteId, clientId);
      if (record.siteId === siteId) return clone(record);
      const bound = { ...record, siteId };
      byId.set(assetId, bound);
      return clone(bound);
    },

    clear() {
      byId.clear();
      byStorage.clear();
    },
  };
}
