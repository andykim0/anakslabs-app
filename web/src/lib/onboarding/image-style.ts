/**
 * [온보딩] 사이트 이미지 렌더 스타일(고객 선택 축) — 순수(테스트 가능).
 * 설문 imageStyle 미설정 시 업종 기반 기본값으로 폴백하고, 설문 UI는 이 기본값을 사전 선택한다.
 */
import type { CandidateStyle } from '@/lib/types/domain';

/** 설문 UI 카드 옵션 (라벨·설명). 썸네일은 컴포넌트가 미리보기로 렌더. */
export const IMAGE_STYLE_OPTIONS: { id: CandidateStyle; label: string; description: string }[] = [
  { id: 'photo', label: 'Photography', description: 'Natural photography for food, spaces, care, and people' },
  { id: '3d_render', label: '3D graphics', description: 'Dimensional rendering for technology, apps, and product brands' },
  { id: 'illustration', label: 'Illustration', description: 'Drawn or flat illustration for children, makers, and expressive brands' },
];

/** 업종 키워드 → 스타일 (photo가 기본, 3d/illustration은 매칭 시). 순서=우선순위. */
const STYLE_KEYWORDS: { style: CandidateStyle; re: RegExp }[] = [
  { style: '3d_render', re: /\uD14C\uD06C|\uC571|\uC5B4\uD50C|\uC18C\uD504\uD2B8|\uC544\uC774\uD2F0|\bit\b|\uAC1C\uBC1C|\uC2A4\uD0C0\uD2B8\uC5C5|\uAC8C\uC784|\uD50C\uB7AB\uD3FC|saas|\uD540\uD14C\uD06C|\uBE14\uB85D\uCCB4\uC778|\uB85C\uBD07|\uC778\uACF5\uC9C0\uB2A5|\bai\b|\uAC00\uC804|\uC804\uC790\uAE30\uAE30|\uD558\uB4DC\uC6E8\uC5B4/i },
  { style: 'illustration', re: /\uD0A4\uC988|\uC544\uB3D9|\uC720\uC544|\uC5B4\uB9B0\uC774|\uACF5\uBC29|\uC218\uACF5\uC608|\uD578\uB4DC\uBA54\uC774\uB4DC|\uC77C\uB7EC\uC2A4\uD2B8|\uBB38\uAD6C|\uADF8\uB9BC|\uCE90\uB9AD\uD130|\uC6F9\uD230|\uB3D9\uD654|\uB180\uC774|\uC7A5\uB09C\uAC10/i },
];

/** 업종 기반 기본 이미지 스타일 — 음식점·뷰티·병원류 등은 photo(기본). */
export function defaultImageStyle(industry: string | undefined): CandidateStyle {
  const s = (industry ?? '').toLowerCase();
  for (const { style, re } of STYLE_KEYWORDS) {
    if (re.test(s)) return style;
  }
  return 'photo';
}

/** 설문값에서 실제 사용할 이미지 스타일 — 명시 imageStyle 우선, 없으면 업종 기본값(기존 데이터 폴백). */
export function resolveImageStyle(input: { imageStyle?: CandidateStyle; industry: string }): CandidateStyle {
  return input.imageStyle ?? defaultImageStyle(input.industry);
}
