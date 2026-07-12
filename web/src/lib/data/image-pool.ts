/**
 * [F3 #2a] 이미지 소스 우선순위 — 사용자 실사(storePhotoUrls) > AI 생성 > 큐레이션.
 * (quality-standards intentional-imagery 표준의 구현 지점)
 *
 * 규칙:
 *  - 고객이 올린 실제 사진을 히어로·섹션에 우선 사용하고, 부족분만 AI/큐레이션으로 채운다.
 *  - 히어로 배경 = 첫 사진(없으면 heroFallback). 나머지 사진 → 섹션 이미지 풀 선두 → AI가 뒤.
 *  - 배치 휴리스틱은 단순(업로드 순). '최고 해상도 → 히어로', 사진별 태깅·매칭은 백로그
 *    (URL만으론 해상도 판정 불가 — 서버 측 측정 없이 업로드 순서를 신뢰).
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
  /** 사용자 업로드 실사 (우선 사용) */
  storePhotos?: string[];
  /** AI 생성 또는 큐레이션 이미지 (부족분 충전) */
  aiImages: string[];
  /** 사진·AI가 전무할 때 히어로 폴백 (candidate.heroImageUrl) */
  heroFallback: string;
}): ImagePoolResult {
  const photos = (input.storePhotos ?? []).filter(Boolean);
  const heroImageUrl = photos[0] ?? input.heroFallback;
  // 히어로에 쓴 첫 사진 다음 사진들 → 섹션 풀 선두, 그 뒤에 AI 이미지(= 부족분만 AI 소비)
  const rest = photos.slice(1);
  const combined = [...rest, ...input.aiImages];
  const imagePool = combined.length > 0 ? combined : [heroImageUrl];
  if (photos.length > 0) {
    console.info(`[image-pool] 사용자 실사 ${photos.length}장 우선 사용 (히어로 1 + 섹션 ${rest.length}), AI ${input.aiImages.length}장 보충`);
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
