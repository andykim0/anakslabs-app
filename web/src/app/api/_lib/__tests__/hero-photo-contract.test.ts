import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SurveyInput } from '@/lib/types/domain';
import { surveySchema } from '@/app/api/_lib/schemas';

function survey(over: Partial<SurveyInput> = {}): SurveyInput {
  return {
    businessName: 'Anaks Labs 테스트',
    purposeId: 'local_store',
    purpose: '방문·매장',
    industry: '카페',
    tone: ['차분한'],
    colorPreference: '#2764e7',
    referenceImageUrls: [],
    sectionPlan: [
      {
        type: 'hero',
        name: '첫 화면',
        brief: '대표 메시지',
        required: true,
        source: 'template',
      },
    ],
    templateId: 'local-store.default',
    ...over,
  };
}

describe('SurveyInput.heroPhotoUrl contract', () => {
  test('대표 사진은 선택 필드라 없어도 검증을 통과한다', () => {
    const parsed = surveySchema.safeParse(survey());
    assert.equal(parsed.success, true);
  });

  test('안전한 미디어 URL을 수용하고 출력에 그대로 보존한다', () => {
    const heroPhotoUrl = 'https://assets.example.com/customer/hero.webp';
    const parsed = surveySchema.safeParse(survey({ heroPhotoUrl }));
    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.equal(parsed.data.heroPhotoUrl, heroPhotoUrl);
  });

  test('위험한 스킴의 대표 사진 URL을 거부한다', () => {
    const parsed = surveySchema.safeParse(survey({ heroPhotoUrl: 'javascript:alert(1)' }));
    assert.equal(parsed.success, false);
  });
});

describe('SurveyInput asset-policy v2 additive contract', () => {
  const uploadRef = {
    assetId: '11111111-1111-4111-8111-111111111111',
    url: '/uploads/customer/hero.webp',
  } as const;
  const importRef = {
    assetId: '22222222-2222-4222-8222-222222222222',
    url: '/imports/customer/gallery.webp',
  } as const;

  test('신규 방향·직접 upload refs·import refs·일반 확인·항목 ref를 additive로 보존한다', () => {
    const parsed = surveySchema.parse(survey({
      imageDirectionId: 'real_photo',
      heroPhotoUrl: uploadRef.url,
      heroPhotoAssetRef: uploadRef,
      storePhotoAssetRefs: [uploadRef],
      importedPhotoAssetRefs: [importRef],
      generalAssetAttestationId: '33333333-3333-4333-8333-333333333333',
      personPhotoAssetIds: [uploadRef.assetId],
      nonPersonPhotoAssetIds: [importRef.assetId],
      contentItems: [{ name: '대표 메뉴', photoUrl: uploadRef.url, photoAssetRef: uploadRef }],
    }));
    assert.equal(parsed.imageDirectionId, 'real_photo');
    assert.deepEqual(parsed.heroPhotoAssetRef, uploadRef);
    assert.deepEqual(parsed.importedPhotoAssetRefs, [importRef]);
    assert.deepEqual(parsed.personPhotoAssetIds, [uploadRef.assetId]);
    assert.deepEqual(parsed.nonPersonPhotoAssetIds, [importRef.assetId]);
    assert.deepEqual(parsed.contentItems?.[0]?.photoAssetRef, uploadRef);
  });

  test('legacy 설문은 신규 필드 없이 계속 통과하고 임의 direction/asset UUID는 거부한다', () => {
    assert.equal(surveySchema.safeParse(survey({ imageStyle: 'photo' })).success, true);
    assert.equal(surveySchema.safeParse(survey({ imageDirectionId: 'realistic' })).success, true);
    assert.equal(surveySchema.safeParse(survey({ imageDirectionId: 'illustration_collage' })).success, true);
    assert.equal(surveySchema.safeParse({ ...survey(), imageDirectionId: 'photorealistic' }).success, false);
    assert.equal(surveySchema.safeParse({
      ...survey(),
      heroPhotoAssetRef: { assetId: 'not-a-uuid', url: '/uploads/hero.webp' },
    }).success, false);
  });
});
