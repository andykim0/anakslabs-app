import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SurveyInput } from '@/lib/types/domain';
import {
  GENERAL_ASSET_ATTESTATION_VERSION,
  PERSON_ASSET_CONSENT_VERSION,
  type GeneralAssetAttestation,
  type PersonAssetConsent,
} from '../attestation-contract';
import type { AssetRecord } from '../provenance';
import {
  AssetTruthRequestError,
  verifySurveyAssetTruthRecords,
} from '../survey-truth-core';

const CLIENT_ID = 'client-truth-test';

function survey(overrides: Partial<SurveyInput> = {}): SurveyInput {
  return {
    businessName: '테스트 브랜드',
    purposeId: 'local_store',
    purpose: '오프라인 매장',
    industry: '카페',
    tone: ['차분한'],
    colorPreference: '파랑',
    referenceImageUrls: [],
    sectionPlan: [],
    templateId: 'local_store.default',
    imageDirectionId: 'real_photo',
    ...overrides,
  };
}

function asset(id: string, origin: AssetRecord['origin'] = 'customer_upload'): AssetRecord {
  return {
    id,
    origin,
    mediaType: 'image',
    storageBucket: 'client-assets',
    storageKey: `truth/${id}.webp`,
    canonicalUrl: `https://assets.example/truth/${id}.webp`,
    createdAt: '2026-07-15T00:00:00.000Z',
    ownerId: CLIENT_ID,
    siteId: null,
  };
}

function attestation(
  assetIds: readonly string[],
  personAssetIds: readonly string[] = [],
): GeneralAssetAttestation {
  return {
    id: 'attestation-truth',
    clientId: CLIENT_ID,
    siteId: null,
    scope: 'onboarding',
    statementVersion: GENERAL_ASSET_ATTESTATION_VERSION,
    assetIds,
    personAssetIds,
    nonPersonAssetIds: assetIds.filter((assetId) => !personAssetIds.includes(assetId)),
    actorId: CLIENT_ID,
    attestedAt: '2026-07-15T00:00:00.000Z',
    revokedAt: null,
    idempotencyKey: 'truth-retry',
  };
}

function verify(input: {
  survey: SurveyInput;
  directRecords?: readonly AssetRecord[];
  importedRecords?: readonly AssetRecord[];
  attestation?: GeneralAssetAttestation | null;
  personConsentsByAssetId?: ReadonlyMap<string, PersonAssetConsent>;
}) {
  return verifySurveyAssetTruthRecords({
    survey: input.survey,
    clientId: CLIENT_ID,
    directRecords: input.directRecords ?? [],
    importedRecords: input.importedRecords ?? [],
    attestation: input.attestation ?? null,
    personConsentsByAssetId: input.personConsentsByAssetId,
  });
}

function hasCode(code: AssetTruthRequestError['code']) {
  return (error: unknown) => error instanceof AssetTruthRequestError
    && error.status === 422
    && error.code === code;
}

test('real_photo rejects URL-only, import-only, and unattested direct uploads before generation', () => {
  assert.throws(
    () => verify({ survey: survey({ heroPhotoUrl: 'https://external.example/raw.webp' }) }),
    hasCode('REAL_PHOTO_UPLOAD_REQUIRED'),
  );

  const imported = asset('import', 'customer_import');
  assert.throws(
    () => verify({
      survey: survey({
        heroPhotoUrl: imported.canonicalUrl,
        importedPhotoAssetRefs: [{ assetId: imported.id, url: imported.canonicalUrl }],
      }),
      importedRecords: [imported],
    }),
    hasCode('REAL_PHOTO_UPLOAD_REQUIRED'),
  );

  const upload = asset('missing-attestation');
  assert.throws(
    () => verify({
      survey: survey({
        heroPhotoUrl: upload.canonicalUrl,
        heroPhotoAssetRef: { assetId: upload.id, url: upload.canonicalUrl },
      }),
      directRecords: [upload],
    }),
    hasCode('FACTUAL_ASSET_ATTESTATION_REQUIRED'),
  );
});

test('current server attestation admits canonical direct uploads and strips raw/import projections', () => {
  const hero = asset('hero');
  const content = asset('content');
  const verified = verify({
    survey: survey({
      heroPhotoUrl: hero.canonicalUrl,
      heroPhotoAssetRef: { assetId: hero.id, url: hero.canonicalUrl },
      storePhotoUrls: [hero.canonicalUrl, 'https://external.example/copied.webp'],
      storePhotoAssetRefs: [{ assetId: hero.id, url: hero.canonicalUrl }],
      contentItems: [
        {
          name: '실제 메뉴',
          photoUrl: content.canonicalUrl,
          photoAssetRef: { assetId: content.id, url: content.canonicalUrl },
        },
        { name: '외부 메뉴', photoUrl: 'https://external.example/menu.webp' },
      ],
      generalAssetAttestationId: 'attestation-truth',
      nonPersonPhotoAssetIds: [hero.id, content.id],
    }),
    directRecords: [hero, content],
    attestation: attestation([hero.id, content.id]),
  });

  assert.deepEqual(
    new Set(verified.directUploadAssetRefs.map((ref) => ref.assetId)),
    new Set([hero.id, content.id]),
  );
  assert.equal(verified.survey.heroPhotoUrl, hero.canonicalUrl);
  assert.deepEqual(verified.survey.storePhotoUrls, [hero.canonicalUrl]);
  assert.equal(verified.survey.contentItems?.[0]?.photoUrl, content.canonicalUrl);
  assert.equal(verified.survey.contentItems?.[1]?.photoUrl, undefined);
  assert.equal(verified.survey.imageStyle, 'photo');
  assert.deepEqual(new Set(verified.survey.nonPersonPhotoAssetIds), new Set([hero.id, content.id]));
});

test('survey classification must be disjoint, exhaustive, and equal the server snapshot', () => {
  const first = asset('classification-first');
  const second = asset('classification-second');
  const base = survey({
    heroPhotoUrl: first.canonicalUrl,
    heroPhotoAssetRef: { assetId: first.id, url: first.canonicalUrl },
    storePhotoUrls: [second.canonicalUrl],
    storePhotoAssetRefs: [{ assetId: second.id, url: second.canonicalUrl }],
    generalAssetAttestationId: 'attestation-truth',
  });
  for (const declarations of [
    { personPhotoAssetIds: [], nonPersonPhotoAssetIds: [first.id] },
    { personPhotoAssetIds: [first.id], nonPersonPhotoAssetIds: [first.id, second.id] },
    { personPhotoAssetIds: [second.id], nonPersonPhotoAssetIds: [first.id] },
  ]) {
    assert.throws(
      () => verify({
        survey: survey({ ...base, ...declarations }),
        directRecords: [first, second],
        attestation: attestation([first.id, second.id], [first.id]),
      }),
      hasCode('ASSET_PERSON_CLASSIFICATION_REQUIRED'),
    );
  }
});

test('artistic direction never promotes unattested uploads and keeps a non-photoreal compatibility style', () => {
  const upload = asset('unattested-artistic');
  const verified = verify({
    survey: survey({
      imageDirectionId: 'abstract_editorial',
      heroPhotoUrl: upload.canonicalUrl,
      heroPhotoAssetRef: { assetId: upload.id, url: upload.canonicalUrl },
      storePhotoUrls: ['https://external.example/raw.webp'],
    }),
    directRecords: [upload],
  });
  assert.equal(verified.directUploadAssetRefs.length, 0);
  assert.equal(verified.survey.heroPhotoUrl, undefined);
  assert.deepEqual(verified.survey.storePhotoUrls, []);
  assert.equal(verified.survey.imageStyle, 'illustration');
});

test('canonical URL, origin, owner, and provisional-site binding mismatches fail closed', () => {
  const upload = asset('mismatch');
  const base = survey({
    heroPhotoUrl: upload.canonicalUrl,
    heroPhotoAssetRef: { assetId: upload.id, url: upload.canonicalUrl },
  });
  for (const invalid of [
    { ...upload, canonicalUrl: 'https://attacker.example/same-id.webp' },
    { ...upload, origin: 'ai_generated' as const },
    { ...upload, ownerId: 'another-client' },
    { ...upload, siteId: 'already-bound-site' },
  ]) {
    assert.throws(
      () => verify({ survey: base, directRecords: [invalid], attestation: attestation([upload.id]) }),
      hasCode('FACTUAL_ASSET_REF_INVALID'),
    );
  }
});

test('attested but unpaired refs cannot open real_photo', () => {
  const upload = asset('unpaired');
  assert.throws(
    () => verify({
      survey: survey({
        heroPhotoUrl: 'https://external.example/not-the-record.webp',
        heroPhotoAssetRef: { assetId: upload.id, url: upload.canonicalUrl },
        generalAssetAttestationId: 'attestation-truth',
        nonPersonPhotoAssetIds: [upload.id],
      }),
      directRecords: [upload],
      attestation: attestation([upload.id]),
    }),
    hasCode('FACTUAL_ASSET_REF_INVALID'),
  );
});

test('a declared person photo requires current per-asset consent in addition to general attestation', () => {
  const upload = asset('person');
  const inputSurvey = survey({
    heroPhotoUrl: upload.canonicalUrl,
    heroPhotoAssetRef: { assetId: upload.id, url: upload.canonicalUrl },
    generalAssetAttestationId: 'attestation-truth',
    personPhotoAssetIds: [upload.id],
  });
  assert.throws(
    () => verify({
      survey: inputSurvey,
      directRecords: [upload],
      attestation: attestation([upload.id], [upload.id]),
    }),
    hasCode('PERSON_ASSET_CONSENT_REQUIRED'),
  );

  const consent: PersonAssetConsent = {
    id: 'person-consent',
    assetId: upload.id,
    clientId: CLIENT_ID,
    statementVersion: PERSON_ASSET_CONSENT_VERSION,
    actorId: CLIENT_ID,
    attestedAt: '2026-07-15T00:00:00.000Z',
    revokedAt: null,
  };
  const verified = verify({
    survey: inputSurvey,
    directRecords: [upload],
    attestation: attestation([upload.id], [upload.id]),
    personConsentsByAssetId: new Map([[upload.id, consent]]),
  });
  assert.deepEqual(verified.survey.personPhotoAssetIds, [upload.id]);
});
