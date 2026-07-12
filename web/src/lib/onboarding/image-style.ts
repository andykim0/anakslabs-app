/**
 * [온보딩] 사이트 이미지 렌더 스타일(고객 선택 축) — 순수(테스트 가능).
 * 설문 imageStyle 미설정 시 업종 기반 기본값으로 폴백하고, 설문 UI는 이 기본값을 사전 선택한다.
 */
import type { CandidateStyle } from '@/lib/types/domain';

/** 설문 UI 카드 옵션 (라벨·설명). 썸네일은 컴포넌트가 미리보기로 렌더. */
export const IMAGE_STYLE_OPTIONS: { id: CandidateStyle; label: string; description: string }[] = [
  { id: 'photo', label: '실사 사진', description: '실제 촬영한 듯한 사진 — 음식·공간·시술·인물에 잘 어울려요' },
  { id: '3d_render', label: '3D 그래픽', description: '입체적인 3D 렌더 — 테크·앱·제품 브랜드에 잘 어울려요' },
  { id: 'illustration', label: '일러스트', description: '손그림·플랫 일러스트 — 키즈·공방·감성 브랜드에 잘 어울려요' },
];

/** 업종 키워드 → 스타일 (photo가 기본, 3d/illustration은 매칭 시). 순서=우선순위. */
const STYLE_KEYWORDS: { style: CandidateStyle; re: RegExp }[] = [
  { style: '3d_render', re: /테크|앱|어플|소프트|아이티|\bit\b|개발|스타트업|게임|플랫폼|saas|핀테크|블록체인|로봇|인공지능|\bai\b|가전|전자기기|하드웨어/i },
  { style: 'illustration', re: /키즈|아동|유아|어린이|공방|수공예|핸드메이드|일러스트|문구|그림|캐릭터|웹툰|동화|놀이|장난감/i },
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
