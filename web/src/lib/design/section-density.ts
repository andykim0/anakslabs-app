/**
 * [Q3] 섹션 밀도 최소치 (rules as code) — "제목+한 줄+버튼 = PPT 1장" 빈약함을 잡는다.
 * 콘텐츠 요소(장식 shape/divider·kicker 제외한 text/image/button/form/map/socialLinks)의 최소 수.
 * 생성 빌더가 원문(providedContent) 파싱으로 결정적 보강한 뒤, 남은 미달은 preflight warning으로 표기.
 */
import type { CanvasElement, Section, SectionType } from '@/lib/types/site';

export const SECTION_DENSITY = {
  hero: { minElements: 3 },
  about: { minElements: 3 },
  features: { minElements: 4 },
  menu: { minElements: 4 },
  gallery: { minElements: 4 },
  testimonials: { minElements: 3 },
  pricing: { minElements: 3 },
  contact: { minElements: 4 },
  cta: { minElements: 2 },
  custom: { minElements: 1 },
  team: { minElements: 4 },
  cases: { minElements: 3 },
  faq: { minElements: 4 },
} as const satisfies Record<SectionType, { minElements: number }>;

/** 콘텐츠 요소 수 — 배경 shape(rect/ellipse)·divider·kicker성 요소 제외 */
export function contentElementCount(section: Section): number {
  return section.elements.filter((el: CanvasElement) => {
    if (el.kind === 'divider') return false;
    if (el.kind === 'shape' && el.shape !== 'line') return false; // 카드 배경 등 장식
    if (el.kind === 'text' && /kicker/.test(el.id)) return false; // 킥커는 라벨
    return true;
  }).length;
}

/** 섹션이 최소 밀도에 못 미치면 true (빈약한 "PPT 1장") */
export function isThinSection(section: Section): boolean {
  return contentElementCount(section) < SECTION_DENSITY[section.type].minElements;
}
