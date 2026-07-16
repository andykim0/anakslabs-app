import type { ImageDirectionId } from '@/lib/assets/image-directions';
import type { AssetRecord, AssetRole, AssetSubject } from '@/lib/assets/provenance';

export const ASSET_TRUTH_GENERATION_ERROR_CODES = [
  'REAL_PHOTO_UPLOAD_REQUIRED',
  'REAL_PHOTO_ATTESTATION_REQUIRED',
  'REAL_PHOTO_ASSET_INVALID',
  'AI_FACTUAL_CONTENT_FORBIDDEN',
  'AI_FACTUAL_PRODUCT_FORBIDDEN',
  'AI_FACTUAL_PLACE_FORBIDDEN',
  'AI_FACTUAL_PERSON_FORBIDDEN',
  'AI_FACTUAL_PORTFOLIO_FORBIDDEN',
  'AI_BEFORE_AFTER_FORBIDDEN',
  'AI_HYPERREAL_REQUEST_FORBIDDEN',
] as const;

export type AssetTruthGenerationErrorCode =
  (typeof ASSET_TRUTH_GENERATION_ERROR_CODES)[number];

const ERROR_GUIDANCE: Record<AssetTruthGenerationErrorCode, string> = {
  REAL_PHOTO_UPLOAD_REQUIRED:
    '실사 방향은 서버에 등록된 고객 업로드 사진이 필요합니다. 사진을 올리거나 추상·3D·일러스트 방향을 선택해 주세요.',
  REAL_PHOTO_ATTESTATION_REQUIRED:
    '실사 사진의 공개 권한과 실제 사업 관련성을 확인한 뒤 다시 시도해 주세요.',
  REAL_PHOTO_ASSET_INVALID:
    '선택한 사진의 소유권 또는 원본 기록을 확인할 수 없습니다. 사진을 다시 선택해 주세요.',
  AI_FACTUAL_CONTENT_FORBIDDEN:
    'AI 이미지는 분위기·빛·재질·추상 장식에만 사용할 수 있습니다. 실제 사실을 나타내는 사진은 고객 업로드를 사용해 주세요.',
  AI_FACTUAL_PRODUCT_FORBIDDEN:
    'AI로 실제 제품·메뉴를 대신 만들 수 없습니다. 실제 사진을 올리거나 분위기 중심으로 요청해 주세요.',
  AI_FACTUAL_PLACE_FORBIDDEN:
    'AI로 실제 매장·사업장을 대신 만들 수 없습니다. 실제 사진을 올리거나 추상적인 분위기로 요청해 주세요.',
  AI_FACTUAL_PERSON_FORBIDDEN:
    'AI로 실제 직원·고객·전문가처럼 보이는 인물을 만들 수 없습니다. 인물 없는 분위기로 요청해 주세요.',
  AI_FACTUAL_PORTFOLIO_FORBIDDEN:
    'AI 생성물을 실제 작업·시공·실적 사례처럼 제시할 수 없습니다. 검증된 실제 사진을 사용해 주세요.',
  AI_BEFORE_AFTER_FORBIDDEN:
    '전후 비교 이미지는 AI로 만들거나 편집할 수 없습니다. 검증된 동일 실제 사례 사진만 사용할 수 있습니다.',
  AI_HYPERREAL_REQUEST_FORBIDDEN:
    '실제 촬영물로 오인될 수 있는 하이퍼리얼 이미지는 만들 수 없습니다. 명백한 3D·일러스트·추상 방향을 선택해 주세요.',
};

export class AssetTruthGenerationError extends Error {
  readonly status = 422 as const;
  readonly code: AssetTruthGenerationErrorCode;
  readonly guidance: string;

  constructor(code: AssetTruthGenerationErrorCode, message = ERROR_GUIDANCE[code]) {
    super(message);
    this.name = 'AssetTruthGenerationError';
    this.code = code;
    this.guidance = ERROR_GUIDANCE[code];
  }
}

export function isAssetTruthGenerationError(
  error: unknown,
): error is AssetTruthGenerationError {
  return error instanceof AssetTruthGenerationError;
}

export type AiImageDirection = Exclude<ImageDirectionId, 'real_photo'>;

export type V2ImageGenerationPlan =
  | {
      kind: 'reuse_customer_upload';
      direction: 'real_photo';
      usesAi: false;
      role: 'factual';
      subject: Exclude<AssetSubject, 'abstract'>;
      asset: AssetRecord;
    }
  | {
      kind: 'generate_atmospheric_ai';
      direction: AiImageDirection;
      usesAi: true;
      role: 'atmospheric' | 'decorative';
      subject: 'abstract';
    };

export const DEFAULT_V2_IMAGE_DIRECTION = 'abstract_editorial' as const;

export function selectRealPhotoAssetRef(input: {
  heroPhotoAssetRef?: { assetId: string; url: string } | null;
  storePhotoAssetRefs?: readonly { assetId: string; url: string }[] | null;
  contentItems?: readonly { photoAssetRef?: { assetId: string; url: string } | null }[] | null;
}): { ref: { assetId: string; url: string } | null; subject: 'place' | 'product' } {
  if (input.heroPhotoAssetRef) return { ref: input.heroPhotoAssetRef, subject: 'place' };
  const storeRef = input.storePhotoAssetRefs?.[0];
  if (storeRef) return { ref: storeRef, subject: 'product' };
  const contentRef = input.contentItems?.find((item) => item.photoAssetRef)?.photoAssetRef;
  return { ref: contentRef ?? null, subject: 'product' };
}

type ForbiddenAiRequest =
  | 'product'
  | 'place'
  | 'person'
  | 'portfolio'
  | 'before_after'
  | 'hyperreal';

const FORBIDDEN_REQUEST_PATTERNS: readonly {
  kind: ForbiddenAiRequest;
  pattern: RegExp;
}[] = [
  {
    kind: 'before_after',
    pattern: /before[\s-]*(?:and|&|\/)?[\s-]*after|before[\s-]*after|전후(?:\s*비교|\s*사진|\s*이미지)?|비포\s*애프터/i,
  },
  {
    kind: 'hyperreal',
    pattern: /hyper[\s-]*real(?:istic)?|photo[\s-]*real(?:istic)?|indistinguishable from (?:a )?(?:real )?photo|실사처럼|사진처럼|실제\s*촬영(?:한)?\s*(?:것처럼|느낌)|진짜\s*사진(?:처럼)?|하이퍼\s*리얼/i,
  },
  {
    kind: 'person',
    pattern: /(?:그려|만들|생성|보여|추가|합성).{0,18}(?:직원|고객|대표|원장|의사|변호사|모델|사람|인물)|(?:직원|고객|대표|원장|의사|변호사|모델|사람|인물).{0,18}(?:그려|만들|생성|보여|추가|합성)|(?:employee|customer|owner|doctor|lawyer|model|person|people|staff).{0,24}(?:create|generate|show|depict|add)/i,
  },
  {
    kind: 'portfolio',
    pattern: /(?:그려|만들|생성|보여|추가|합성).{0,20}(?:포트폴리오|작업물|시공\s*사례|완공\s*사례|실적|고객\s*사례)|(?:포트폴리오|작업물|시공\s*사례|완공\s*사례|실적|고객\s*사례).{0,20}(?:그려|만들|생성|보여|추가|합성)|(?:portfolio work|case study|completed project|client result).{0,24}(?:create|generate|show|depict|add)|(?:create|generate|show|depict|add).{0,24}(?:portfolio work|case study|completed project|client result)/i,
  },
  {
    kind: 'product',
    pattern: /(?:그려|만들|생성|보여|추가|합성).{0,20}(?:제품|상품|메뉴|음식|요리|디저트|음료|시술\s*결과)|(?:제품|상품|메뉴|음식|요리|디저트|음료|시술\s*결과).{0,20}(?:그려|만들|생성|보여|추가|합성)|(?:product|menu item|finished dish|meal|drink|dessert|service result).{0,24}(?:create|generate|show|depict|add)|(?:create|generate|show|depict|add).{0,24}(?:product|menu item|finished dish|meal|drink|dessert|service result)/i,
  },
  {
    kind: 'place',
    pattern: /(?:그려|만들|생성|보여|추가|합성).{0,20}(?:실제\s*)?(?:매장|사업장|가게|사무실|병원|클리닉|카페|식당|인테리어|외관)|(?:실제\s*)?(?:매장|사업장|가게|사무실|병원|클리닉|카페|식당|인테리어|외관).{0,20}(?:그려|만들|생성|보여|추가|합성)|(?:actual|real|our|my)\s+(?:store|shop|office|clinic|cafe|restaurant|interior|exterior)|(?:create|generate|show|depict|add).{0,24}(?:store|shop|office|clinic|cafe|restaurant|interior|exterior)/i,
  },
];

const REQUEST_ERROR_CODE: Record<ForbiddenAiRequest, AssetTruthGenerationErrorCode> = {
  product: 'AI_FACTUAL_PRODUCT_FORBIDDEN',
  place: 'AI_FACTUAL_PLACE_FORBIDDEN',
  person: 'AI_FACTUAL_PERSON_FORBIDDEN',
  portfolio: 'AI_FACTUAL_PORTFOLIO_FORBIDDEN',
  before_after: 'AI_BEFORE_AFTER_FORBIDDEN',
  hyperreal: 'AI_HYPERREAL_REQUEST_FORBIDDEN',
};

const SUBJECT_ERROR_CODE: Record<Exclude<AssetSubject, 'abstract'>, AssetTruthGenerationErrorCode> = {
  product: 'AI_FACTUAL_PRODUCT_FORBIDDEN',
  place: 'AI_FACTUAL_PLACE_FORBIDDEN',
  person: 'AI_FACTUAL_PERSON_FORBIDDEN',
  portfolio: 'AI_FACTUAL_PORTFOLIO_FORBIDDEN',
  before_after: 'AI_BEFORE_AFTER_FORBIDDEN',
};

/** Returns only a policy category; the original free text must never reach an image provider. */
export function forbiddenAiImageRequest(text: string | undefined): ForbiddenAiRequest | null {
  const normalized = text?.trim();
  if (!normalized) return null;
  return FORBIDDEN_REQUEST_PATTERNS.find(({ pattern }) => pattern.test(normalized))?.kind ?? null;
}

export function assertSafeAiImageRequest(text: string | undefined): void {
  const forbidden = forbiddenAiImageRequest(text);
  if (forbidden) throw new AssetTruthGenerationError(REQUEST_ERROR_CODE[forbidden]);
}

function isTrustedCustomerImage(input: {
  asset: AssetRecord | null | undefined;
  clientId: string;
  siteId?: string | null;
  requestedAssetRef?: { assetId: string; url: string } | null;
}): input is typeof input & { asset: AssetRecord } {
  const { asset } = input;
  if (!asset
    || asset.origin !== 'customer_upload'
    || asset.mediaType !== 'image'
    || !asset.storageBucket
    || !asset.storageKey
    || !asset.canonicalUrl.trim()
    || asset.ownerId !== input.clientId
    || (input.siteId === null && asset.siteId !== null)
    || (input.siteId !== undefined && input.siteId !== null && asset.siteId !== input.siteId)) {
    return false;
  }
  if (input.requestedAssetRef
    && (input.requestedAssetRef.assetId !== asset.id
      || input.requestedAssetRef.url !== asset.canonicalUrl)) {
    return false;
  }
  return true;
}

/**
 * Asset-policy v2 decision point. Missing direction is deliberately abstract;
 * legacy callers must not enter this function unless their server cohort is v2.
 */
export function resolveV2ImageGenerationPlan(input: {
  direction?: ImageDirectionId;
  requestedText?: string;
  trustedCustomerUpload?: AssetRecord | null;
  requestedAssetRef?: { assetId: string; url: string } | null;
  generalAttestationValid?: boolean;
  clientId: string;
  siteId?: string | null;
  factualSubject?: Exclude<AssetSubject, 'abstract'>;
  role?: 'atmospheric' | 'decorative';
}): V2ImageGenerationPlan {
  const direction = input.direction ?? DEFAULT_V2_IMAGE_DIRECTION;
  if (direction === 'real_photo') {
    if (!input.trustedCustomerUpload) {
      throw new AssetTruthGenerationError('REAL_PHOTO_UPLOAD_REQUIRED');
    }
    if (!isTrustedCustomerImage({
      asset: input.trustedCustomerUpload,
      clientId: input.clientId,
      siteId: input.siteId,
      requestedAssetRef: input.requestedAssetRef,
    })) {
      throw new AssetTruthGenerationError('REAL_PHOTO_ASSET_INVALID');
    }
    if (!input.generalAttestationValid) {
      throw new AssetTruthGenerationError('REAL_PHOTO_ATTESTATION_REQUIRED');
    }
    return {
      kind: 'reuse_customer_upload',
      direction,
      usesAi: false,
      role: 'factual',
      subject: input.factualSubject ?? 'place',
      asset: input.trustedCustomerUpload,
    };
  }

  assertSafeAiImageRequest(input.requestedText);
  return {
    kind: 'generate_atmospheric_ai',
    direction,
    usesAi: true,
    role: input.role ?? 'atmospheric',
    subject: 'abstract',
  };
}

/**
 * Reusable server-boundary assertion. It returns the only generation/reuse
 * plan the caller may execute; callers must not reinterpret a direction ID.
 */
export function assertAiImageGenerationPolicy(input: {
  imageDirectionId?: ImageDirectionId;
  role?: AssetRole;
  subject?: AssetSubject;
  requestedContent?: string;
  trustedCustomerUpload?: AssetRecord | null;
  requestedAssetRef?: { assetId: string; url: string } | null;
  generalAttestationValid?: boolean;
  clientId?: string;
  siteId?: string | null;
}): V2ImageGenerationPlan {
  const direction = input.imageDirectionId ?? DEFAULT_V2_IMAGE_DIRECTION;
  if (direction !== 'real_photo') {
    if (input.role === 'factual') {
      throw new AssetTruthGenerationError('AI_FACTUAL_CONTENT_FORBIDDEN');
    }
    if (input.subject && input.subject !== 'abstract') {
      throw new AssetTruthGenerationError(SUBJECT_ERROR_CODE[input.subject]);
    }
  }
  return resolveV2ImageGenerationPlan({
    direction,
    requestedText: input.requestedContent,
    trustedCustomerUpload: input.trustedCustomerUpload,
    requestedAssetRef: input.requestedAssetRef,
    generalAttestationValid: input.generalAttestationValid,
    clientId: input.clientId ?? '',
    siteId: input.siteId,
    factualSubject: input.subject && input.subject !== 'abstract' ? input.subject : undefined,
    role: input.role === 'decorative' ? 'decorative' : 'atmospheric',
  });
}
