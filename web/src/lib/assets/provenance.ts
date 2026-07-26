/**
 * Canonical server-owned asset provenance contract.
 *
 * Public URLs are display projections, not identity or ownership evidence. The
 * authoritative identity of a stored asset is its (storageBucket, storageKey)
 * pair and its server registry row.
 */
import type { HeroVideoSource } from '@/lib/ai/video-pipeline-core';
import type { MotionAssetProvenance } from '@/lib/motion/signatures';
import type { HeroImageSelection, HeroImageChoiceId } from '@/lib/onboarding/hero-image-options';
import type { MotionMediaProvenance, HeroImageChoice } from '@/lib/types/site';
import type { CustomerAssetSource } from '@/lib/uploads/asset-provenance';
import type { HeroPhotoQualityStamp } from './hero-photo-quality';

export const ASSET_ORIGINS = [
  'customer_upload',
  'customer_import',
  'ai_generated',
  'licensed_stock',
  'legacy_unknown',
] as const;

export type AssetOrigin = (typeof ASSET_ORIGINS)[number];
export type AssetMediaType = 'image' | 'video';
export type AssetRole = 'factual' | 'atmospheric' | 'decorative';
export type AssetSubject = 'product' | 'place' | 'person' | 'portfolio' | 'before_after' | 'abstract';

export interface AssetRecord {
  id: string;
  origin: AssetOrigin;
  mediaType: AssetMediaType;
  /** Null is reserved for read-only legacy_unknown adapters. New writes always use storage identity. */
  storageBucket: string | null;
  /** Authoritative only together with storageBucket. */
  storageKey: string | null;
  /** Display projection. Never use this value to prove ownership or origin. */
  canonicalUrl: string;
  createdAt: string;
  /**
   * Customer assets always have an owner. Only licensed_stock may be global
   * (ownerId/siteId both null) and it is resolved exclusively by server code.
   */
  ownerId: string | null;
  /** Provisional assets may be bound to one owned site exactly once. */
  siteId: string | null;
  /** Server-computed immutable assessment for customer raster uploads only. */
  imageQuality?: HeroPhotoQualityStamp;
  /** Immutable raster dimensions. Unknown/legacy/SVG/video records remain unset. */
  width?: number;
  height?: number;
  /** Stable provider-neutral key; separate from the UUID registry identity. */
  stockKey?: string;
  provider?: 'pexels';
  providerAssetId?: string;
  attribution?: StockAttribution;
}

export interface AssetUsage {
  assetId: string;
  role: AssetRole;
  subject: AssetSubject;
  slotKey: string;
}

export interface AssetRef {
  assetId: string;
  url: string;
  width?: number;
  height?: number;
  attribution?: StockAttribution;
}

export interface StockAttribution {
  provider: 'pexels';
  photographer: string;
  photographerUrl: string;
  sourceUrl: string;
  licenseUrl: 'https://www.pexels.com/license/';
}

export const ASSET_PROVENANCE_ERROR_CODES = [
  'CLIENT_PROVENANCE_FORBIDDEN',
  'UNMAPPED_LEGACY_PROVENANCE',
  'ASSET_PROVENANCE_CONFLICT',
  'ASSET_REGISTRATION_INVALID',
  'ASSET_STORAGE_IDENTITY_REQUIRED',
  'ASSET_OWNER_MISMATCH',
  'ASSET_SITE_MISMATCH',
  'ASSET_SITE_OWNER_MISMATCH',
  'ASSET_SITE_BINDING_CONFLICT',
  'ASSET_NOT_FOUND',
] as const;

export type AssetProvenanceErrorCode = (typeof ASSET_PROVENANCE_ERROR_CODES)[number];

export class AssetProvenanceError extends Error {
  readonly code: AssetProvenanceErrorCode;

  constructor(code: AssetProvenanceErrorCode, message: string) {
    super(message);
    this.name = 'AssetProvenanceError';
    this.code = code;
  }
}

/** Compile-time exhaustive fixture helper: a new union member cannot bypass the adapter table. */
function exhaustiveValues<Union extends string>() {
  return <const Values extends readonly Union[]>(
    values: Values & (Exclude<Union, Values[number]> extends never ? unknown : never),
  ): Values => values;
}

const customerAssetSourceValues = exhaustiveValues<CustomerAssetSource>()(
  ['customer-upload', 'ai-generated', 'synthetic'] as const,
);
const renderProvenanceValues = exhaustiveValues<MotionMediaProvenance>()(
  ['customer-provided', 'ai-generated', 'curated', 'unknown'] as const,
);
const motionAssetSourceValues = exhaustiveValues<MotionAssetProvenance['source']>()(
  ['customer-upload', 'ai-generated', 'external', 'curated'] as const,
);
const heroVideoSourceValues = exhaustiveValues<HeroVideoSource>()(
  ['ambient-ai', 'uploaded-photo'] as const,
);
const heroImageChoiceValues = exhaustiveValues<HeroImageChoice>()(
  exhaustiveValues<HeroImageChoiceId>()(['system', 'upload', 'ai-1', 'ai-2', 'ai-3'] as const),
);
const heroImageSelectionSourceValues = exhaustiveValues<HeroImageSelection['source']>()(
  ['system', 'upload', 'ai'] as const,
);

/** Every provenance-like legacy vocabulary remains explicit and compile-time exhaustive. */
export const LEGACY_ASSET_PROVENANCE_VALUES = {
  customerAssetSource: customerAssetSourceValues,
  renderProvenance: renderProvenanceValues,
  motionAssetSource: motionAssetSourceValues,
  heroVideoSource: heroVideoSourceValues,
  heroImageChoice: heroImageChoiceValues,
  heroImageSelectionSource: heroImageSelectionSourceValues,
} as const;

export type LegacyAssetProvenanceFamily = keyof typeof LEGACY_ASSET_PROVENANCE_VALUES;
export type LegacyAssetProvenanceValue<F extends LegacyAssetProvenanceFamily> =
  (typeof LEGACY_ASSET_PROVENANCE_VALUES)[F][number];

const CLAIMED_ORIGINS = {
  customerAssetSource: {
    'customer-upload': ['customer_upload'],
    'ai-generated': ['ai_generated'],
    synthetic: ['ai_generated'],
  },
  renderProvenance: {
    'customer-provided': ['customer_upload'],
    'ai-generated': ['ai_generated'],
    curated: ASSET_ORIGINS,
    unknown: ASSET_ORIGINS,
  },
  motionAssetSource: {
    'customer-upload': ['customer_upload'],
    'ai-generated': ['ai_generated'],
    external: ['customer_import'],
    curated: ASSET_ORIGINS,
  },
  // These are treatment/selection axes, not origin claims.
  heroVideoSource: {
    'ambient-ai': ASSET_ORIGINS,
    'uploaded-photo': ASSET_ORIGINS,
  },
  heroImageChoice: {
    system: ASSET_ORIGINS,
    upload: ASSET_ORIGINS,
    'ai-1': ASSET_ORIGINS,
    'ai-2': ASSET_ORIGINS,
    'ai-3': ASSET_ORIGINS,
  },
  heroImageSelectionSource: {
    system: ASSET_ORIGINS,
    upload: ASSET_ORIGINS,
    ai: ASSET_ORIGINS,
  },
} as const satisfies {
  [F in LegacyAssetProvenanceFamily]: Record<LegacyAssetProvenanceValue<F>, readonly AssetOrigin[]>;
};

export interface ReadLegacyAssetOriginInput<F extends LegacyAssetProvenanceFamily> {
  family: F;
  value: string;
  /** A server registry (generic or trusted 0009 adapter) is the only authority. */
  authoritativeOrigin?: AssetOrigin;
}

/**
 * Legacy strings alone never grant factual eligibility. An authoritative
 * registry origin may be projected through a compatible legacy value; a
 * contradictory dual claim is rejected rather than resolved by precedence.
 */
export function readLegacyAssetOrigin<F extends LegacyAssetProvenanceFamily>(
  input: ReadLegacyAssetOriginInput<F>,
): AssetOrigin {
  const familyValues = LEGACY_ASSET_PROVENANCE_VALUES[input.family] as readonly string[];
  if (!familyValues.includes(input.value)) {
    throw new AssetProvenanceError(
      'UNMAPPED_LEGACY_PROVENANCE',
      `Unmapped legacy provenance: ${input.family}:${input.value}`,
    );
  }
  if (!input.authoritativeOrigin) return 'legacy_unknown';

  const claims = CLAIMED_ORIGINS[input.family] as Record<string, readonly AssetOrigin[]>;
  if (!claims[input.value].includes(input.authoritativeOrigin)) {
    throw new AssetProvenanceError(
      'ASSET_PROVENANCE_CONFLICT',
      `Registry origin ${input.authoritativeOrigin} conflicts with ${input.family}:${input.value}`,
    );
  }
  return input.authoritativeOrigin;
}

export type LegacyRenderProvenance = (typeof LEGACY_ASSET_PROVENANCE_VALUES.renderProvenance)[number];
export type LegacyMotionAssetSource = (typeof LEGACY_ASSET_PROVENANCE_VALUES.motionAssetSource)[number];

/** Lossy compatibility projection; customer_import is not customer-provided. */
export function toLegacyRenderProvenance(origin: AssetOrigin): LegacyRenderProvenance {
  if (origin === 'customer_upload') return 'customer-provided';
  if (origin === 'ai_generated') return 'ai-generated';
  return 'unknown';
}

/** `null` means the legacy motion source cannot safely represent the canonical value. */
export function toLegacyMotionAssetSource(origin: AssetOrigin): LegacyMotionAssetSource | null {
  if (origin === 'customer_upload') return 'customer-upload';
  if (origin === 'customer_import') return 'external';
  if (origin === 'ai_generated') return 'ai-generated';
  return null;
}

export function toAssetRef(record: AssetRecord): AssetRef {
  return {
    assetId: record.id,
    url: record.canonicalUrl,
    ...(record.width ? { width: record.width } : {}),
    ...(record.height ? { height: record.height } : {}),
    ...(record.attribution ? { attribution: { ...record.attribution } } : {}),
  };
}

/** Call at API boundaries before extracting allowed fields from a client payload. */
export function assertNoClientProvenanceClaims(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if ('origin' in record || 'role' in record || 'factual' in record) {
    throw new AssetProvenanceError(
      'CLIENT_PROVENANCE_FORBIDDEN',
      'Asset origin, role, and factual eligibility are server-owned fields.',
    );
  }
}

export function assertCompatibleAssetRecords(primary: AssetRecord, secondary: AssetRecord): void {
  const compatible = primary.id === secondary.id
    && primary.origin === secondary.origin
    && primary.mediaType === secondary.mediaType
    && primary.storageBucket === secondary.storageBucket
    && primary.storageKey === secondary.storageKey
    && primary.canonicalUrl === secondary.canonicalUrl
    && primary.ownerId === secondary.ownerId
    && primary.siteId === secondary.siteId;
  if (!compatible) {
    throw new AssetProvenanceError(
      'ASSET_PROVENANCE_CONFLICT',
      `Conflicting provenance authorities for asset ${primary.id}`,
    );
  }
}
