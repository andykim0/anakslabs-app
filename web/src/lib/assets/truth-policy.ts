import type { SitePurposeId } from '@/lib/types/domain';
import type { MotionIndustryClass } from '@/lib/types/site';
import type { ImageDirectionId } from './image-directions';
import type { AssetProvenanceConfig } from './provenance-flags-core';
import type {
  AssetOrigin,
  AssetRecord,
  AssetRole,
  AssetSubject,
} from './provenance';
import {
  isCurrentGeneralAssetAttestation,
  isCurrentPersonAssetConsent,
  type GeneralAssetAttestation,
  type PersonAssetConsent,
} from './attestation-contract';

export const ASSET_SLOT_PURPOSES = [
  'actual_product',
  'actual_place',
  'actual_person',
  'actual_portfolio',
  'actual_ambiguous',
  'before_after',
  'brand_atmosphere',
  'decorative_art',
] as const;

export type AssetSlotPurpose = (typeof ASSET_SLOT_PURPOSES)[number];

export interface AssetSlotTruthPolicySpec {
  purpose: AssetSlotPurpose;
  role: AssetRole;
  subjects: readonly AssetSubject[];
  allowedOrigins: readonly AssetOrigin[];
  requiresGeneralAttestation: boolean;
  requiresPersonConsent: boolean;
  requiresBeforeAfterEvidence: boolean;
}

const FACTUAL_ORIGIN = ['customer_upload', 'customer_import'] as const satisfies readonly AssetOrigin[];
const NON_FACTUAL_ORIGINS = [
  'customer_upload',
  'customer_import',
  'ai_generated',
  'licensed_stock',
  'legacy_unknown',
] as const satisfies readonly AssetOrigin[];

/** Canonical slot policy; section names and free-form industry text are not authorization inputs. */
export const ASSET_SLOT_POLICY_MAP = {
  actual_product: {
    purpose: 'actual_product', role: 'factual', subjects: ['product'],
    allowedOrigins: FACTUAL_ORIGIN, requiresGeneralAttestation: true,
    requiresPersonConsent: false, requiresBeforeAfterEvidence: false,
  },
  actual_place: {
    purpose: 'actual_place', role: 'factual', subjects: ['place'],
    allowedOrigins: FACTUAL_ORIGIN, requiresGeneralAttestation: true,
    requiresPersonConsent: false, requiresBeforeAfterEvidence: false,
  },
  actual_person: {
    purpose: 'actual_person', role: 'factual', subjects: ['person'],
    allowedOrigins: FACTUAL_ORIGIN, requiresGeneralAttestation: true,
    requiresPersonConsent: true, requiresBeforeAfterEvidence: false,
  },
  actual_portfolio: {
    purpose: 'actual_portfolio', role: 'factual', subjects: ['portfolio'],
    allowedOrigins: FACTUAL_ORIGIN, requiresGeneralAttestation: true,
    requiresPersonConsent: false, requiresBeforeAfterEvidence: false,
  },
  actual_ambiguous: {
    purpose: 'actual_ambiguous', role: 'factual',
    subjects: ['product', 'place', 'person', 'portfolio'],
    allowedOrigins: FACTUAL_ORIGIN, requiresGeneralAttestation: true,
    requiresPersonConsent: false, requiresBeforeAfterEvidence: false,
  },
  before_after: {
    purpose: 'before_after', role: 'factual', subjects: ['before_after'],
    allowedOrigins: FACTUAL_ORIGIN, requiresGeneralAttestation: false,
    requiresPersonConsent: false, requiresBeforeAfterEvidence: true,
  },
  brand_atmosphere: {
    purpose: 'brand_atmosphere', role: 'atmospheric', subjects: ['abstract'],
    allowedOrigins: NON_FACTUAL_ORIGINS, requiresGeneralAttestation: false,
    requiresPersonConsent: false, requiresBeforeAfterEvidence: false,
  },
  decorative_art: {
    purpose: 'decorative_art', role: 'decorative', subjects: ['abstract'],
    allowedOrigins: NON_FACTUAL_ORIGINS, requiresGeneralAttestation: false,
    requiresPersonConsent: false, requiresBeforeAfterEvidence: false,
  },
} as const satisfies Record<AssetSlotPurpose, AssetSlotTruthPolicySpec>;

export const ASSET_TRUTH_POLICY_DENIAL_REASONS = [
  'MISSING_ASSET_RECORD',
  'LEGACY_ORIGIN_NOT_FACTUAL',
  'AI_NOT_ALLOWED_IN_FACTUAL_SLOT',
  'IMPORT_NOT_VERIFIED_FOR_FACTUAL_SLOT',
  'MISSING_GENERAL_ATTESTATION',
  'PERSON_CLASSIFICATION_MISMATCH',
  'MISSING_PERSON_CONSENT',
  'BEFORE_AFTER_DISABLED',
  'BEFORE_AFTER_INDUSTRY_BLOCKED',
  'BEFORE_AFTER_EVIDENCE_INVALID',
  'ASSET_OWNER_MISMATCH',
  'ASSET_SITE_MISMATCH',
  'SLOT_POLICY_MISMATCH',
] as const;

export type AssetTruthPolicyDenialReason = (typeof ASSET_TRUTH_POLICY_DENIAL_REASONS)[number];

export type AssetPolicyDecision =
  | { allowed: true }
  | { allowed: false; reason: AssetTruthPolicyDenialReason };

export type AssetTruthPolicyMode = 'enforce' | 'observe' | 'legacy-bypass';

/** Rollout mode is separate from truth evaluation; bypass never turns an asset factual. */
export function resolveAssetTruthPolicyMode(input: {
  assetPolicyVersion: 2 | null | undefined;
  flags: Pick<AssetProvenanceConfig, 'enforceNewSites' | 'enforceLegacy'>;
}): AssetTruthPolicyMode {
  if (input.assetPolicyVersion === 2) {
    return input.flags.enforceNewSites ? 'enforce' : 'observe';
  }
  return input.flags.enforceLegacy ? 'enforce' : 'legacy-bypass';
}

export interface AssetTruthPolicyInput {
  clientId: string;
  siteId?: string | null;
  purposeId?: SitePurposeId;
  templateId?: string;
  /** Must be derived by the server taxonomy. */
  industryClass: MotionIndustryClass;
  classificationSource: 'server' | 'legacy-unknown';
  assetPolicyVersion: 2 | null | undefined;
  flags: Pick<
    AssetProvenanceConfig,
    'enforceNewSites' | 'enforceLegacy' | 'beforeAfterEnabled' | 'beforeAfterApprovedIndustries'
  >;
  slotKey: string;
  slotPurpose: AssetSlotPurpose;
  role: AssetRole;
  subject: AssetSubject;
  asset: AssetRecord | null;
  generalAttestation?: GeneralAssetAttestation | null;
  personConsent?: PersonAssetConsent | null;
  beforeAfterEvidenceValid?: boolean;
}

function denied(reason: AssetTruthPolicyDenialReason): AssetPolicyDecision {
  return { allowed: false, reason };
}

/**
 * Evaluate eligibility independently of rollout mode. Assignment/publish
 * callers decide whether a denial blocks or is observation-only by consulting
 * resolveAssetTruthPolicyMode().
 */
export function evaluateAssetTruthPolicy(input: AssetTruthPolicyInput): AssetPolicyDecision {
  const asset = input.asset;
  if (!asset) return denied('MISSING_ASSET_RECORD');
  const globalLicensedStock = asset.origin === 'licensed_stock'
    && asset.ownerId === null
    && asset.siteId === null;
  if (!globalLicensedStock && asset.ownerId !== input.clientId) {
    return denied('ASSET_OWNER_MISMATCH');
  }
  if (!globalLicensedStock && input.siteId !== undefined && asset.siteId !== input.siteId) {
    return denied('ASSET_SITE_MISMATCH');
  }

  const spec = ASSET_SLOT_POLICY_MAP[input.slotPurpose];
  if (input.role !== spec.role
    || !(spec.subjects as readonly AssetSubject[]).includes(input.subject)) {
    return denied('SLOT_POLICY_MISMATCH');
  }

  if (input.slotPurpose === 'before_after') {
    // Canonical medical classification wins over every launch flag.
    if (input.classificationSource !== 'server'
      || (input.industryClass !== 'beauty' && input.industryClass !== 'remodeling')) {
      return denied('BEFORE_AFTER_INDUSTRY_BLOCKED');
    }
    if (!input.flags.beforeAfterEnabled) return denied('BEFORE_AFTER_DISABLED');
    if (!(input.flags.beforeAfterApprovedIndustries as readonly string[])
      .includes(input.industryClass)) {
      return denied('BEFORE_AFTER_INDUSTRY_BLOCKED');
    }
    if (!input.beforeAfterEvidenceValid) return denied('BEFORE_AFTER_EVIDENCE_INVALID');
  }

  if (spec.role === 'factual') {
    if (asset.origin === 'legacy_unknown') return denied('LEGACY_ORIGIN_NOT_FACTUAL');
    if (asset.origin === 'ai_generated') return denied('AI_NOT_ALLOWED_IN_FACTUAL_SLOT');
  } else if (!(spec.allowedOrigins as readonly AssetOrigin[]).includes(asset.origin)) {
    return denied('SLOT_POLICY_MISMATCH');
  }

  if (spec.requiresGeneralAttestation
    && !isCurrentGeneralAssetAttestation(input.generalAttestation, {
      clientId: input.clientId,
      ...(input.siteId !== undefined ? { siteId: input.siteId } : {}),
      assetId: asset.id,
    })) {
    return denied('MISSING_GENERAL_ATTESTATION');
  }

  const classifiedAsPerson = input.generalAttestation?.personAssetIds.includes(asset.id) === true;
  if (input.subject === 'person' && !classifiedAsPerson) {
    return denied('PERSON_CLASSIFICATION_MISMATCH');
  }
  const requiresPersonConsent = classifiedAsPerson
    || spec.requiresPersonConsent
    || (input.slotPurpose === 'actual_ambiguous' && input.subject === 'person');
  if (requiresPersonConsent
    && !isCurrentPersonAssetConsent(input.personConsent, {
      clientId: input.clientId,
      assetId: asset.id,
    })) {
    return denied('MISSING_PERSON_CONSENT');
  }
  return { allowed: true };
}

export type HeroActualSubject = 'product' | 'place' | 'person' | 'portfolio';

const HERO_FACTUAL_SLOT: Record<HeroActualSubject, AssetSlotPurpose> = {
  product: 'actual_product',
  place: 'actual_place',
  person: 'actual_person',
  portfolio: 'actual_portfolio',
};

/**
 * Hero art direction is not itself an origin claim. Copy or intent that
 * represents a real business subject wins; unknown/legacy intent fails closed
 * to a factual slot. Only clearly synthetic directions without a factual claim
 * resolve to atmospheric/decorative treatment.
 */
export function resolveHeroAssetSlotPurpose(input: {
  imageDirectionId?: ImageDirectionId | null;
  claimedSubject?: HeroActualSubject | null;
  representsActualBusiness?: boolean;
}): AssetSlotPurpose {
  if (input.claimedSubject && input.representsActualBusiness !== false) {
    return HERO_FACTUAL_SLOT[input.claimedSubject];
  }
  if (input.imageDirectionId === 'real_photo') {
    return input.claimedSubject ? HERO_FACTUAL_SLOT[input.claimedSubject] : 'actual_ambiguous';
  }
  if (input.imageDirectionId === 'realistic') return 'brand_atmosphere';
  if (input.representsActualBusiness === true) {
    return input.claimedSubject ? HERO_FACTUAL_SLOT[input.claimedSubject] : 'actual_ambiguous';
  }
  if (input.imageDirectionId === 'illustration_collage') return 'decorative_art';
  if (input.imageDirectionId === '3d_brand_world'
    || input.imageDirectionId === 'abstract_editorial') {
    return 'brand_atmosphere';
  }
  return 'actual_ambiguous';
}
