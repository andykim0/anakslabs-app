import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type { SurveyInput } from '@/lib/types/domain';
import {
  GENERAL_ASSET_ATTESTATION_VERSION,
} from '../attestation-contract';
import {
  getAttestationRegistry,
  recordGeneralAssetAttestation,
} from '../attestation-registry';
import { getAssetRegistry, registerCustomerImportAsset, registerCustomerUploadAsset } from '../registry';
import {
  AssetTruthRequestError,
  verifySurveyAssetTruth,
} from '../survey-truth';

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

function hasCode(code: AssetTruthRequestError['code']) {
  return (error: unknown) => error instanceof AssetTruthRequestError
    && error.status === 422
    && error.code === code;
}

beforeEach(() => {
  const assets = getAssetRegistry() as ReturnType<typeof getAssetRegistry> & { clear?: () => void };
  const attestations = getAttestationRegistry() as ReturnType<typeof getAttestationRegistry> & { clear?: () => void };
  assets.clear?.();
  attestations.clear?.();
});

async function directUpload(key: string) {
  return registerCustomerUploadAsset({
    clientId: CLIENT_ID,
    storageBucket: 'client-assets',
    storageKey: `truth/${key}.webp`,
    canonicalUrl: `https://assets.example/truth/${key}.webp`,
    mediaType: 'image',
  });
}

test('real_photo rejects URL-only, import-only, and unattested direct uploads before generation', async () => {
  await assert.rejects(
    verifySurveyAssetTruth({
      clientId: CLIENT_ID,
      survey: survey({ heroPhotoUrl: 'https://external.example/raw.webp' }),
    }),
    hasCode('REAL_PHOTO_UPLOAD_REQUIRED'),
  );

  const imported = await registerCustomerImportAsset({
    clientId: CLIENT_ID,
    storageBucket: 'client-imports',
    storageKey: 'truth/import.webp',
    canonicalUrl: 'https://assets.example/truth/import.webp',
    mediaType: 'image',
  });
  await assert.rejects(
    verifySurveyAssetTruth({
      clientId: CLIENT_ID,
      survey: survey({
        heroPhotoUrl: imported.canonicalUrl,
        importedPhotoAssetRefs: [{ assetId: imported.id, url: imported.canonicalUrl }],
      }),
    }),
    hasCode('REAL_PHOTO_UPLOAD_REQUIRED'),
  );

  const upload = await directUpload('missing-attestation');
  await assert.rejects(
    verifySurveyAssetTruth({
      clientId: CLIENT_ID,
      survey: survey({
        heroPhotoUrl: upload.canonicalUrl,
        heroPhotoAssetRef: { assetId: upload.id, url: upload.canonicalUrl },
      }),
    }),
    hasCode('FACTUAL_ASSET_ATTESTATION_REQUIRED'),
  );
});

test('current server attestation admits canonical direct uploads and strips raw/import projections', async () => {
  const hero = await directUpload('hero');
  const content = await directUpload('content');
  const attestation = await recordGeneralAssetAttestation({
    clientId: CLIENT_ID,
    statementVersion: GENERAL_ASSET_ATTESTATION_VERSION,
    assetIds: [hero.id, content.id],
    personAssetIds: [],
    nonPersonAssetIds: [hero.id, content.id],
    idempotencyKey: crypto.randomUUID(),
  });
  const verified = await verifySurveyAssetTruth({
    clientId: CLIENT_ID,
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
      generalAssetAttestationId: attestation.id,
      nonPersonPhotoAssetIds: [hero.id, content.id],
    }),
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
});

test('artistic direction never promotes unattested uploads and keeps a non-photoreal compatibility style', async () => {
  const upload = await directUpload('unattested-artistic');
  const verified = await verifySurveyAssetTruth({
    clientId: CLIENT_ID,
    survey: survey({
      imageDirectionId: 'abstract_editorial',
      heroPhotoUrl: upload.canonicalUrl,
      heroPhotoAssetRef: { assetId: upload.id, url: upload.canonicalUrl },
      storePhotoUrls: ['https://external.example/raw.webp'],
    }),
  });
  assert.equal(verified.directUploadAssetRefs.length, 0);
  assert.equal(verified.survey.heroPhotoUrl, undefined);
  assert.deepEqual(verified.survey.storePhotoUrls, []);
  assert.equal(verified.survey.imageStyle, 'illustration');
});

test('canonical URL mismatch fails closed without trusting the submitted asset id', async () => {
  const upload = await directUpload('mismatch');
  await assert.rejects(
    verifySurveyAssetTruth({
      clientId: CLIENT_ID,
      survey: survey({
        heroPhotoUrl: upload.canonicalUrl,
        heroPhotoAssetRef: { assetId: upload.id, url: 'https://attacker.example/same-id.webp' },
      }),
    }),
    hasCode('FACTUAL_ASSET_REF_INVALID'),
  );
});
