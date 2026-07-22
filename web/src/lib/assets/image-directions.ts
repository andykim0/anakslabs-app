/**
 * Asset-policy v2 image directions.
 *
 * This is intentionally separate from the legacy CandidateStyle vocabulary.
 * In particular, legacy `photo` must never be interpreted as permission to
 * fabricate a photorealistic business, product, person, or result.
 */

export const IMAGE_DIRECTION_IDS = [
  'real_photo',
  '3d_brand_world',
  'illustration_collage',
  'abstract_editorial',
] as const;

export type ImageDirectionId = (typeof IMAGE_DIRECTION_IDS)[number];

export type LegacyCandidateStyle = 'photo' | '3d_render' | 'illustration';

export interface ImageDirectionOption {
  id: ImageDirectionId;
  label: string;
  description: string;
  detail: string;
  requiresVerifiedCustomerUpload: boolean;
  usesAiGeneration: boolean;
  legacyStyle: LegacyCandidateStyle;
}

export const REAL_PHOTO_REQUIRED_GUIDANCE =
  '사실적인 이미지는 실제 사업장을 보여줘야 합니다. 실제 사진을 올리거나, 명백히 예술적인 AI 방향을 선택하세요.';

export const IMAGE_DIRECTIONS = {
  real_photo: {
    id: 'real_photo',
    label: '실사 사진 — 실제 사진 필요',
    description: '고객님이 직접 올리고 확인한 실제 사진만 사용해요.',
    detail: 'AI로 제품·장소·사람을 새로 만들지 않고 크롭, 배치, 색감과 기본 모션만 연출합니다.',
    requiresVerifiedCustomerUpload: true,
    usesAiGeneration: false,
    legacyStyle: 'photo',
  },
  '3d_brand_world': {
    id: '3d_brand_world',
    label: '3D 브랜드 월드',
    description: '브랜드 색과 형태로 명백히 합성된 프리미엄 3D 세계를 만들어요.',
    detail: '실제 판매 제품·매장·사람·결과처럼 보이지 않는 스타일드 브랜드 장면입니다.',
    requiresVerifiedCustomerUpload: false,
    usesAiGeneration: true,
    legacyStyle: '3d_render',
  },
  illustration_collage: {
    id: 'illustration_collage',
    label: '일러스트·콜라주',
    description: '의도적으로 비사진적인 그림과 편집 콜라주로 표현해요.',
    detail: '실제 사업을 기록한 사진인 척하지 않고 가짜 인물·상품·실적을 만들지 않습니다.',
    requiresVerifiedCustomerUpload: false,
    usesAiGeneration: true,
    legacyStyle: 'illustration',
  },
  abstract_editorial: {
    id: 'abstract_editorial',
    label: '추상 에디토리얼',
    description: '색, 빛, 재질, 기하와 타이포를 중심으로 세련되게 연출해요.',
    detail: '실제 제품·사람·장소·결과를 만들지 않는 안전한 기본 방향입니다.',
    requiresVerifiedCustomerUpload: false,
    usesAiGeneration: true,
    // Legacy generation has no abstract vocabulary. Illustration is the
    // conservative, visibly non-photographic compatibility projection.
    legacyStyle: 'illustration',
  },
} as const satisfies Record<ImageDirectionId, ImageDirectionOption>;

export const IMAGE_DIRECTION_OPTIONS = IMAGE_DIRECTION_IDS.map((id) => IMAGE_DIRECTIONS[id]);

/**
 * A recommendation is never an authorization decision. It intentionally
 * returns only an artistic direction; `real_photo` requires an explicit user
 * choice plus server-verified upload/attestation evidence.
 */
export function recommendedImageDirection(input: {
  industry?: string;
  tone?: readonly string[];
}): Exclude<ImageDirectionId, 'real_photo'> {
  const context = `${input.industry ?? ''} ${(input.tone ?? []).join(' ')}`.toLowerCase();
  if (/saas|테크|기술|소프트웨어|앱|플랫폼|it|스타트업|미래|대담/.test(context)) {
    return '3d_brand_world';
  }
  if (/키즈|아동|공방|수공예|일러스트|친근|따뜻|유쾌|놀이/.test(context)) {
    return 'illustration_collage';
  }
  return 'abstract_editorial';
}

export function imageDirectionToLegacyCandidateStyle(
  direction: ImageDirectionId,
): LegacyCandidateStyle {
  return IMAGE_DIRECTIONS[direction].legacyStyle;
}

/**
 * Read-time compatibility projection only. Existing published artifacts are
 * not rewritten. A legacy `photo` without verified, attested upload evidence
 * is explicitly downgraded for a new v2 regeneration.
 */
export function legacyCandidateStyleToImageDirection(
  style: LegacyCandidateStyle | undefined,
  hasVerifiedAttestedCustomerUpload: boolean,
): ImageDirectionId {
  if (style === 'photo') {
    return hasVerifiedAttestedCustomerUpload ? 'real_photo' : 'abstract_editorial';
  }
  if (style === '3d_render') return '3d_brand_world';
  if (style === 'illustration') return 'illustration_collage';
  return 'abstract_editorial';
}

export function canSelectRealPhoto(input: {
  heroPhotoUrl?: string | null;
  heroPhotoAssetRef?: { assetId: string; url?: string } | null;
  storePhotoUrls?: readonly string[] | null;
  storePhotoAssetRefs?: readonly { assetId: string; url?: string }[] | null;
  importedPhotoAssetRefs?: readonly { assetId: string; url?: string }[] | null;
  contentItems?: readonly {
    photoUrl?: string | null;
    photoAssetRef?: { assetId: string; url?: string } | null;
  }[] | null;
  generalAssetAttestationId?: string | null;
  personPhotoAssetIds?: readonly string[] | null;
  nonPersonPhotoAssetIds?: readonly string[] | null;
}): boolean {
  // URL matching can only reject a stale projection; it never proves origin.
  const heroRefMatchesProjection = Boolean(input.heroPhotoAssetRef?.assetId)
    && Boolean(input.heroPhotoUrl?.trim())
    && input.heroPhotoAssetRef?.url === input.heroPhotoUrl?.trim();
  const hasUploadRef = heroRefMatchesProjection
    || Boolean(input.storePhotoAssetRefs?.some((ref) =>
      Boolean(ref.assetId && ref.url && input.storePhotoUrls?.includes(ref.url))))
    || Boolean(input.importedPhotoAssetRefs?.some((ref) =>
      Boolean(ref.assetId && ref.url && input.storePhotoUrls?.includes(ref.url))))
    || Boolean(input.contentItems?.some((item) =>
      Boolean(item.photoAssetRef?.assetId
        && item.photoAssetRef.url
        && item.photoAssetRef.url === item.photoUrl?.trim())));
  const directAssetIds = new Set([
    ...(input.heroPhotoAssetRef?.assetId ? [input.heroPhotoAssetRef.assetId] : []),
    ...(input.storePhotoAssetRefs ?? []).map((ref) => ref.assetId),
    ...(input.importedPhotoAssetRefs ?? []).map((ref) => ref.assetId),
    ...(input.contentItems ?? []).flatMap((item) =>
      item.photoAssetRef?.assetId ? [item.photoAssetRef.assetId] : []),
  ]);
  const personIds = new Set(input.personPhotoAssetIds ?? []);
  const nonPersonIds = new Set(input.nonPersonPhotoAssetIds ?? []);
  const classificationIsExact = personIds.size === (input.personPhotoAssetIds?.length ?? 0)
    && nonPersonIds.size === (input.nonPersonPhotoAssetIds?.length ?? 0)
    && [...personIds].every((assetId) => directAssetIds.has(assetId) && !nonPersonIds.has(assetId))
    && [...nonPersonIds].every((assetId) => directAssetIds.has(assetId))
    && personIds.size + nonPersonIds.size === directAssetIds.size;
  return hasUploadRef
    && classificationIsExact
    && Boolean(input.generalAssetAttestationId?.trim());
}
