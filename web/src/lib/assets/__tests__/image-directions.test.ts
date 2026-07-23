import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  IMAGE_DIRECTIONS,
  IMAGE_DIRECTION_IDS,
  REAL_PHOTO_REQUIRED_GUIDANCE,
  canSelectRealPhoto,
  imageDirectionToLegacyCandidateStyle,
  legacyCandidateStyleToImageDirection,
  recommendedImageDirection,
} from '@/lib/assets/image-directions';

describe('asset-policy v2 image directions', () => {
  test('신규 선택 카탈로그는 정확히 네 방향이며 legacy photo 의미를 바꾸지 않는다', () => {
    assert.deepEqual(IMAGE_DIRECTION_IDS, [
      'real_photo',
      '3d_brand_world',
      'illustration_collage',
      'abstract_editorial',
    ]);
    assert.equal(Object.keys(IMAGE_DIRECTIONS).length, 4);
    assert.equal(imageDirectionToLegacyCandidateStyle('real_photo'), 'photo');
    assert.equal(imageDirectionToLegacyCandidateStyle('3d_brand_world'), '3d_render');
    assert.equal(imageDirectionToLegacyCandidateStyle('illustration_collage'), 'illustration');
    assert.equal(imageDirectionToLegacyCandidateStyle('abstract_editorial'), 'illustration');
  });

  test('업로드가 없어도 카페·뷰티·의료를 photo/real_photo로 자동 추천하지 않는다', () => {
    for (const industry of ['카페·베이커리', '뷰티 살롱', '병원·의원', '파인다이닝', '리모델링']) {
      assert.notEqual(recommendedImageDirection({ industry }), 'real_photo', industry);
    }
    assert.equal(recommendedImageDirection({ industry: 'SaaS 플랫폼' }), '3d_brand_world');
    assert.equal(recommendedImageDirection({ industry: '아동 미술 공방' }), 'illustration_collage');
    assert.equal(recommendedImageDirection({ industry: '카페' }), 'abstract_editorial');
  });

  test('legacy photo는 verified+attested upload가 없으면 신규 재생성에서 안전하게 강등한다', () => {
    assert.equal(legacyCandidateStyleToImageDirection('photo', false), 'abstract_editorial');
    assert.equal(legacyCandidateStyleToImageDirection('photo', true), 'real_photo');
    assert.equal(legacyCandidateStyleToImageDirection('3d_render', false), '3d_brand_world');
    assert.equal(legacyCandidateStyleToImageDirection('illustration', false), 'illustration_collage');
  });

  test('real_photo는 서버 등록 ref와 확인 ID를 모두 요구하며 raw URL은 증거가 아니다', () => {
    const urlOnly = {
      heroPhotoUrl: 'https://external.example/hero.jpg',
      storePhotoUrls: ['https://external.example/menu.jpg'],
      importedPhotoAssetRefs: [{
        assetId: '11111111-1111-4111-8111-111111111111',
        url: '/imports/menu.jpg',
      }],
      generalAssetAttestationId: '22222222-2222-4222-8222-222222222222',
      nonPersonPhotoAssetIds: ['11111111-1111-4111-8111-111111111111'],
    };
    assert.equal(canSelectRealPhoto(urlOnly), false);
    assert.equal(canSelectRealPhoto({
      storePhotoUrls: ['/imports/menu.jpg'],
      importedPhotoAssetRefs: [{
        assetId: '11111111-1111-4111-8111-111111111111',
        url: '/imports/menu.jpg',
      }],
      generalAssetAttestationId: '22222222-2222-4222-8222-222222222222',
      nonPersonPhotoAssetIds: ['11111111-1111-4111-8111-111111111111'],
    }), true, '서버 등록 가져오기 사진은 권리 확인 뒤 사용할 수 있다');
    assert.equal(canSelectRealPhoto({
      heroPhotoAssetRef: { assetId: '11111111-1111-4111-8111-111111111111' },
    }), false, 'attestation 없이 ref만으로는 부족');
    assert.equal(canSelectRealPhoto({
      heroPhotoUrl: '/uploads/current.webp',
      heroPhotoAssetRef: {
        assetId: '11111111-1111-4111-8111-111111111111',
        url: '/uploads/current.webp',
      },
      generalAssetAttestationId: '22222222-2222-4222-8222-222222222222',
    }), false, '모든 직접 업로드의 인물 여부 분류가 없으면 부족');
    assert.equal(canSelectRealPhoto({
      heroPhotoUrl: '/uploads/current.webp',
      heroPhotoAssetRef: {
        assetId: '11111111-1111-4111-8111-111111111111',
        url: '/uploads/current.webp',
      },
      generalAssetAttestationId: '22222222-2222-4222-8222-222222222222',
      nonPersonPhotoAssetIds: ['11111111-1111-4111-8111-111111111111'],
    }), true);
    assert.equal(canSelectRealPhoto({
      heroPhotoAssetRef: {
        assetId: '11111111-1111-4111-8111-111111111111',
        url: '/uploads/unpaired.webp',
      },
      generalAssetAttestationId: '22222222-2222-4222-8222-222222222222',
    }), false, '사용 URL과 짝이 없는 ref는 자격을 열지 않는다');
    assert.equal(canSelectRealPhoto({
      heroPhotoUrl: '/uploads/current.webp',
      heroPhotoAssetRef: {
        assetId: '11111111-1111-4111-8111-111111111111',
        url: '/uploads/stale.webp',
      },
      generalAssetAttestationId: '22222222-2222-4222-8222-222222222222',
    }), false, 'stale URL/ref pairing은 자격을 열지 않는다');
    assert.equal(canSelectRealPhoto({
      contentItems: [{
        photoUrl: '/uploads/content.webp',
        photoAssetRef: {
          assetId: '33333333-3333-4333-8333-333333333333',
          url: '/uploads/content.webp',
        },
      }],
      generalAssetAttestationId: '22222222-2222-4222-8222-222222222222',
      nonPersonPhotoAssetIds: ['33333333-3333-4333-8333-333333333333'],
    }), true);
  });

  test('실사 비적격 안내 문구는 제품 계약과 동일하다', () => {
    assert.equal(
      REAL_PHOTO_REQUIRED_GUIDANCE,
      '실사 방향은 사장님이 제공하고 사용을 확인한 실제 제품·공간·인물 사진이 필요해요. 사진이 없으면 다보임이 준비하는 추상·3D·일러스트 방향을 선택해 주세요.',
    );
  });
});
