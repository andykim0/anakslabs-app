/**
 * [H3] 이미지 소스 우선순위 — 대표 실사(heroPhoto) > AI 무드 히어로,
 * 본문은 사용자 실사(storePhotoUrls) > AI 생성 > 큐레이션.
 * (quality-standards intentional-imagery 표준의 구현 지점)
 *
 * 규칙:
 *  - 히어로 배경 = 고객이 명시적으로 고른 대표 사진(없으면 AI 무드 heroFallback).
 *  - storePhotoUrls는 전부 본문·갤러리 풀 선두에 두고 AI 이미지는 그 뒤에 둔다.
 *  - 대표 사진과 storePhotoUrls의 URL이 정확히 같으면 본문 풀에서만 제거해 중복 노출을 막는다.
 *  - 슬롯이 있는 한 사진은 최소 1회 이상 소비됨(pool 선두 배치). 슬롯보다 많은 잉여분은
 *    로그로 남긴다(에디터 자산 목록 잔존 = 후속 과제).
 *
 * 순수 함수 — mock/supabase AiService.generateSiteConfig 가 소비.
 */

export interface ImagePoolResult {
  heroImageUrl: string;
  imagePool: string[];
}

export function buildImagePool(input: {
  /** 고객이 히어로용으로 명시 선택한 실제 대표 사진 1장 */
  heroPhoto?: string;
  /** 사용자 업로드 실사 (우선 사용) */
  storePhotos?: string[];
  /** AI 생성 또는 큐레이션 이미지 (부족분 충전) */
  aiImages: string[];
  /** 사진·AI가 전무할 때 히어로 폴백 (candidate.heroImageUrl) */
  heroFallback: string;
}): ImagePoolResult {
  const heroPhoto = input.heroPhoto || undefined;
  const photos = (input.storePhotos ?? []).filter((url) => Boolean(url) && url !== heroPhoto);
  const heroImageUrl = heroPhoto ?? input.heroFallback;
  // storePhotoUrls는 히어로로 암묵 승격하지 않는다. 본문 실사 선두 → AI 이미지(= 부족분만 AI 소비).
  const combined = [...photos, ...input.aiImages.filter((url) => Boolean(url) && url !== heroPhoto)];
  const imagePool = combined.length > 0 ? combined : [heroImageUrl];
  if (heroPhoto || photos.length > 0) {
    console.info(
      `[image-pool] 대표 실사 ${heroPhoto ? 1 : 0}장 + 본문 실사 ${photos.length}장 우선, AI ${input.aiImages.length}장 보충`,
    );
  }
  return { heroImageUrl, imagePool };
}

/**
 * [F3 #2a] 실모드 AI 생성 비용 절감 — 사용자 사진이 충분하면(≥ threshold) Gemini 풀 생성을 건너뛴다.
 * 사진이 히어로+섹션 초기 슬롯을 덮으면 AI 생성이 실비용만 태우므로 스킵.
 */
export function shouldSkipAiPool(storePhotos: string[] | undefined, threshold = 2): boolean {
  return (storePhotos?.filter(Boolean).length ?? 0) >= threshold;
}

/** [Q4] 섹션 타입별 이미지 슬롯 대략치 (히어로 배경은 별도라 0) */
const IMAGES_PER_TYPE: Partial<Record<string, number>> = {
  gallery: 4,
  team: 3,
  about: 1,
  menu: 2,
  cases: 1,
};

/**
 * [Q4] sectionPlan으로 필요한 이미지 슬롯 수를 추정 — AI 부족분 생성량 계산용(정확치 아닌 상한 추정).
 */
export function estimateImageSlots(sectionPlan: { type: string }[]): number {
  return sectionPlan.reduce((n, s) => n + (IMAGES_PER_TYPE[s.type] ?? 0), 0);
}

/** [Q4] 부족분 AI 생성량 = clamp(추정 슬롯 − 실사, 0, fillMax). 재사용 상한 하에 슬롯을 unique로 채운다. */
export function aiFillCount(input: {
  sectionPlan: { type: string }[];
  storePhotos?: string[];
  fillMax: number;
}): number {
  const need = estimateImageSlots(input.sectionPlan) - (input.storePhotos?.filter(Boolean).length ?? 0);
  return Math.max(0, Math.min(input.fillMax, need));
}
