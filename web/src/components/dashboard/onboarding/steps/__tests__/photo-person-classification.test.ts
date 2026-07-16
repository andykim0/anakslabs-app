import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { projectPersonPhotoClassification } from '../photo-person-classification';

const refs = [
  { assetId: 'asset-hero' },
  { assetId: 'asset-store' },
  { assetId: 'asset-content' },
] as const;

describe('Step04 person photo classification projection', () => {
  test('체크하지 않은 직접 업로드는 모두 non-person으로 투영한다', () => {
    assert.deepEqual(projectPersonPhotoClassification(refs, []), {
      personPhotoAssetIds: [],
      nonPersonPhotoAssetIds: ['asset-hero', 'asset-store', 'asset-content'],
    });
  });

  test('체크한 직접 업로드만 person이고 나머지는 exact complement다', () => {
    assert.deepEqual(projectPersonPhotoClassification(refs, ['asset-store']), {
      personPhotoAssetIds: ['asset-store'],
      nonPersonPhotoAssetIds: ['asset-hero', 'asset-content'],
    });
  });

  test('중복·stale 체크 ID와 중복 ref를 제거하고 등록 순서를 보존한다', () => {
    const projection = projectPersonPhotoClassification(
      [...refs, { assetId: 'asset-store' }],
      ['stale-asset', 'asset-content', 'asset-content', 'asset-hero'],
    );

    assert.deepEqual(projection, {
      personPhotoAssetIds: ['asset-hero', 'asset-content'],
      nonPersonPhotoAssetIds: ['asset-store'],
    });
    assert.equal(
      new Set([
        ...projection.personPhotoAssetIds,
        ...projection.nonPersonPhotoAssetIds,
      ]).size,
      refs.length,
    );
  });
});
