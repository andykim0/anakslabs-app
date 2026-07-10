/**
 * [v3 Phase 3, 5-a] 커스텀 섹션 제안 공용 규칙 — mock·실모드(폴백)가 동일 규칙을 공유한다.
 */
import type { SectionType } from '@/lib/types/site';

/** SectionType 전수 목록 (Claude 응답 검증용) */
export const KNOWN_SECTION_TYPES: SectionType[] = [
  'hero',
  'about',
  'features',
  'menu',
  'gallery',
  'testimonials',
  'pricing',
  'contact',
  'cta',
  'custom',
  'team',
  'cases',
  'faq',
];

/** 커스텀 섹션 이름/설명 → known SectionType 결정적 매핑 (미매칭은 custom) */
export function mapCustomSectionType(text: string): SectionType {
  if (/후기|리뷰/.test(text)) return 'testimonials';
  if (/지도|위치|오시는/.test(text)) return 'contact';
  if (/가격|요금/.test(text)) return 'pricing';
  if (/팀|직원|강사/.test(text)) return 'team';
  if (/실적|사례|프로젝트/.test(text)) return 'cases';
  if (/질문|안내/.test(text)) return 'faq';
  return 'custom';
}
