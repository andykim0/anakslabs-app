import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GENERAL_ASSET_ATTESTATION_VERSION,
  PERSON_ASSET_CONSENT_VERSION,
  type GeneralAssetAttestation,
  type PersonAssetConsent,
} from '../attestation-contract';
import {
  ASSET_SLOT_POLICY_MAP,
  ASSET_SLOT_PURPOSES,
  evaluateAssetTruthPolicy,
  resolveAssetTruthPolicyMode,
  resolveHeroAssetSlotPurpose,
  type AssetTruthPolicyInput,
} from '../truth-policy';
import type { AssetOrigin, AssetRecord, AssetSubject } from '../provenance';

const CLIENT_ID = 'client-1';
const SITE_ID = 'site-1';
const ASSET_ID = 'asset-1';

function asset(origin: AssetOrigin = 'customer_upload'): AssetRecord {
  return {
    id: ASSET_ID,
    origin,
    mediaType: 'image',
    storageBucket: origin === 'legacy_unknown' ? null : 'client-assets',
    storageKey: origin === 'legacy_unknown' ? null : 'photos/a.webp',
    canonicalUrl: 'https://assets.example/a.webp',
    createdAt: '2026-07-15T00:00:00.000Z',
    ownerId: CLIENT_ID,
    siteId: SITE_ID,
  };
}

function general(overrides: Partial<GeneralAssetAttestation> = {}): GeneralAssetAttestation {
  return {
    id: 'attestation-1',
    clientId: CLIENT_ID,
    siteId: SITE_ID,
    scope: 'site',
    statementVersion: GENERAL_ASSET_ATTESTATION_VERSION,
    assetIds: [ASSET_ID],
    personAssetIds: [],
    nonPersonAssetIds: [ASSET_ID],
    actorId: CLIENT_ID,
    attestedAt: '2026-07-15T00:00:00.000Z',
    revokedAt: null,
    idempotencyKey: 'retry-1',
    ...overrides,
  };
}

function person(overrides: Partial<PersonAssetConsent> = {}): PersonAssetConsent {
  return {
    id: 'consent-1',
    assetId: ASSET_ID,
    clientId: CLIENT_ID,
    statementVersion: PERSON_ASSET_CONSENT_VERSION,
    actorId: CLIENT_ID,
    attestedAt: '2026-07-15T00:00:00.000Z',
    revokedAt: null,
    ...overrides,
  };
}

function factualInput(overrides: Partial<AssetTruthPolicyInput> = {}): AssetTruthPolicyInput {
  return {
    clientId: CLIENT_ID,
    siteId: SITE_ID,
    purposeId: 'local_store',
    templateId: 'local_store.default',
    industryClass: 'cafe',
    classificationSource: 'server',
    assetPolicyVersion: 2,
    flags: {
      enforceNewSites: true,
      enforceLegacy: false,
      beforeAfterEnabled: false,
      beforeAfterApprovedIndustries: [],
    },
    slotKey: 'home.hero.media',
    slotPurpose: 'actual_product',
    role: 'factual',
    subject: 'product',
    asset: asset(),
    generalAttestation: general(),
    personConsent: null,
    ...overrides,
  };
}

function reason(input: AssetTruthPolicyInput): string | null {
  const decision = evaluateAssetTruthPolicy(input);
  return decision.allowed ? null : decision.reason;
}

test('slot truth registry is exhaustive and separates factual from non-factual origins', () => {
  assert.deepEqual(Object.keys(ASSET_SLOT_POLICY_MAP), [...ASSET_SLOT_PURPOSES]);
  for (const purpose of ASSET_SLOT_PURPOSES) {
    assert.equal(ASSET_SLOT_POLICY_MAP[purpose].purpose, purpose);
  }
  assert.deepEqual(ASSET_SLOT_POLICY_MAP.actual_product.allowedOrigins, ['customer_upload']);
  assert.ok(ASSET_SLOT_POLICY_MAP.brand_atmosphere.allowedOrigins.includes('ai_generated'));
  assert.ok(ASSET_SLOT_POLICY_MAP.decorative_art.allowedOrigins.includes('customer_import'));
});

test('general customer upload with current scoped attestation is factual; missing or stale evidence is denied', () => {
  assert.equal(reason(factualInput()), null);
  assert.equal(reason(factualInput({ generalAttestation: null })), 'MISSING_GENERAL_ATTESTATION');
  assert.equal(reason(factualInput({
    generalAttestation: general({ statementVersion: 'stale-v0' }),
  })), 'MISSING_GENERAL_ATTESTATION');
  assert.equal(reason(factualInput({
    generalAttestation: general({ assetIds: ['another-asset'] }),
  })), 'MISSING_GENERAL_ATTESTATION');
});

test('URL equality never promotes AI, import, or legacy origin into a factual slot', () => {
  const canonicalUrl = asset().canonicalUrl;
  for (const [origin, expected] of [
    ['ai_generated', 'AI_NOT_ALLOWED_IN_FACTUAL_SLOT'],
    ['customer_import', 'IMPORT_NOT_VERIFIED_FOR_FACTUAL_SLOT'],
    ['legacy_unknown', 'LEGACY_ORIGIN_NOT_FACTUAL'],
  ] as const) {
    assert.equal(reason(factualInput({
      asset: { ...asset(origin), canonicalUrl },
      // Deliberately includes the same asset id/URL-shaped evidence. Origin remains authoritative.
      generalAttestation: general(),
    })), expected);
  }
});

test('missing, cross-owner, cross-site, and mismatched slot records fail closed', () => {
  assert.equal(reason(factualInput({ asset: null })), 'MISSING_ASSET_RECORD');
  assert.equal(reason(factualInput({
    asset: { ...asset(), ownerId: 'client-2' },
  })), 'ASSET_OWNER_MISMATCH');
  assert.equal(reason(factualInput({
    asset: { ...asset(), siteId: 'site-2' },
  })), 'ASSET_SITE_MISMATCH');
  assert.equal(reason(factualInput({ role: 'decorative' })), 'SLOT_POLICY_MISMATCH');
  assert.equal(reason(factualInput({ subject: 'place' })), 'SLOT_POLICY_MISMATCH');
});

test('person factual slots require both general statement and current per-asset consent', () => {
  const base = factualInput({
    slotPurpose: 'actual_person',
    subject: 'person',
    generalAttestation: general({ personAssetIds: [ASSET_ID], nonPersonAssetIds: [] }),
    personConsent: null,
  });
  assert.equal(reason({
    ...base,
    generalAttestation: general(),
  }), 'PERSON_CLASSIFICATION_MISMATCH');
  assert.equal(reason(base), 'MISSING_PERSON_CONSENT');
  assert.equal(reason({ ...base, personConsent: person() }), null);
  assert.equal(reason({
    ...base,
    personConsent: person({ revokedAt: '2026-07-16T00:00:00.000Z' }),
  }), 'MISSING_PERSON_CONSENT');
  const productPhotoWithPerson = factualInput({
    generalAttestation: general({ personAssetIds: [ASSET_ID], nonPersonAssetIds: [] }),
  });
  assert.equal(reason(productPhotoWithPerson), 'MISSING_PERSON_CONSENT');
  assert.equal(reason({ ...productPhotoWithPerson, personConsent: person() }), null);
});

test('before/after is default-off, exact-approved-industry only, evidence-bound, and medical always blocked', () => {
  const beforeAfter = factualInput({
    industryClass: 'beauty',
    slotPurpose: 'before_after',
    subject: 'before_after',
    generalAttestation: null,
    beforeAfterEvidenceValid: true,
  });
  assert.equal(reason(beforeAfter), 'BEFORE_AFTER_DISABLED', 'launch kill switch defaults off');
  assert.equal(reason({
    ...beforeAfter,
    flags: { ...beforeAfter.flags, beforeAfterEnabled: true },
  }), 'BEFORE_AFTER_INDUSTRY_BLOCKED', 'empty approval allowlist must still deny');
  assert.equal(reason({
    ...beforeAfter,
    flags: {
      ...beforeAfter.flags,
      beforeAfterEnabled: true,
      beforeAfterApprovedIndustries: ['beauty'],
    },
    beforeAfterEvidenceValid: false,
  }), 'BEFORE_AFTER_EVIDENCE_INVALID');
  assert.equal(reason({
    ...beforeAfter,
    flags: {
      ...beforeAfter.flags,
      beforeAfterEnabled: true,
      beforeAfterApprovedIndustries: ['beauty'],
    },
  }), null);
  assert.equal(reason({
    ...beforeAfter,
    industryClass: 'medical',
    flags: {
      ...beforeAfter.flags,
      beforeAfterEnabled: true,
      beforeAfterApprovedIndustries: ['beauty', 'remodeling'],
    },
  }), 'BEFORE_AFTER_INDUSTRY_BLOCKED');
  assert.equal(reason({ ...beforeAfter, classificationSource: 'legacy-unknown' }),
    'BEFORE_AFTER_INDUSTRY_BLOCKED');
});

test('AI and imported assets remain allowed only for abstract atmospheric/decorative slots', () => {
  for (const origin of ['ai_generated', 'customer_import'] as const) {
    assert.equal(reason(factualInput({
      slotPurpose: 'brand_atmosphere',
      role: 'atmospheric',
      subject: 'abstract',
      asset: asset(origin),
      generalAttestation: null,
    })), null);
  }
  assert.equal(reason(factualInput({
    slotPurpose: 'brand_atmosphere',
    role: 'atmospheric',
    subject: 'product' as AssetSubject,
    asset: asset('ai_generated'),
    generalAttestation: null,
  })), 'SLOT_POLICY_MISMATCH');
});

test('hero duality treats actual claims and ambiguity as factual, while clear art directions stay abstract', () => {
  assert.equal(resolveHeroAssetSlotPurpose({
    imageDirectionId: 'real_photo', claimedSubject: 'place',
  }), 'actual_place');
  assert.equal(resolveHeroAssetSlotPurpose({ imageDirectionId: 'real_photo' }), 'actual_ambiguous');
  assert.equal(resolveHeroAssetSlotPurpose({
    imageDirectionId: '3d_brand_world', claimedSubject: 'product', representsActualBusiness: true,
  }), 'actual_product');
  assert.equal(resolveHeroAssetSlotPurpose({ imageDirectionId: '3d_brand_world' }), 'brand_atmosphere');
  assert.equal(resolveHeroAssetSlotPurpose({ imageDirectionId: 'illustration_collage' }), 'decorative_art');
  assert.equal(resolveHeroAssetSlotPurpose({ imageDirectionId: 'abstract_editorial' }), 'brand_atmosphere');
  assert.equal(resolveHeroAssetSlotPurpose({}), 'actual_ambiguous');
});

test('rollout mode never conflates observation or legacy bypass with factual eligibility', () => {
  assert.equal(resolveAssetTruthPolicyMode({
    assetPolicyVersion: 2,
    flags: { enforceNewSites: false, enforceLegacy: false },
  }), 'observe');
  assert.equal(resolveAssetTruthPolicyMode({
    assetPolicyVersion: 2,
    flags: { enforceNewSites: true, enforceLegacy: false },
  }), 'enforce');
  assert.equal(resolveAssetTruthPolicyMode({
    assetPolicyVersion: null,
    flags: { enforceNewSites: true, enforceLegacy: false },
  }), 'legacy-bypass');
  assert.equal(reason(factualInput({
    assetPolicyVersion: null,
    flags: { ...factualInput().flags, enforceNewSites: false },
    asset: asset('customer_import'),
  })), 'IMPORT_NOT_VERIFIED_FOR_FACTUAL_SLOT');
});
