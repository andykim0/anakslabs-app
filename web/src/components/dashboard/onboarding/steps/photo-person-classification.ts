import type { AssetRef } from '@/lib/assets/provenance';

export interface PersonPhotoClassification {
  personPhotoAssetIds: string[];
  nonPersonPhotoAssetIds: string[];
}

/**
 * UI의 "인물이 들어간 사진" 체크 목록을 서버 계약이 요구하는 exact partition으로 투영한다.
 * 현재 등록 묶음에 없는 ID와 중복 ID는 버리고, 체크하지 않은 등록 자산은 모두 non-person이다.
 */
export function projectPersonPhotoClassification(
  registeredAssetRefs: readonly Pick<AssetRef, 'assetId'>[],
  checkedPersonAssetIds: readonly string[],
): PersonPhotoClassification {
  const registeredAssetIds = [...new Set(registeredAssetRefs.map((ref) => ref.assetId))];
  const checkedIds = new Set(checkedPersonAssetIds);

  return {
    personPhotoAssetIds: registeredAssetIds.filter((assetId) => checkedIds.has(assetId)),
    nonPersonPhotoAssetIds: registeredAssetIds.filter((assetId) => !checkedIds.has(assetId)),
  };
}
