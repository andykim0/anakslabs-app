/**
 * [v3 Phase 1.1] 목적 택소노미 — 단일 진실 데이터 모듈.
 *
 * 설문 UI(2단 선택)·design-candidates·site-templates가 모두 이걸 참조한다.
 * 섹션 구성은 템플릿(site-blueprints.ts SITE_TEMPLATES)이 담당하므로 이 모듈에는
 * recommendedSections 필드가 없다(템플릿이 대체).
 *
 * 순수 데이터 모듈 — server-only 아님(클라이언트 번들 가능).
 */
import type { LivePurposeId, SitePurposeId } from '@/lib/types/domain';

export type PurposeGroup = 'serve' | 'promote';
export type PurposeGroupLabel = 'Serve customers' | 'Build awareness';
export type RecommendedFeature = 'contactForm' | 'mapEmbed' | 'snsLinks';

export interface PurposeDef {
  id: SitePurposeId;
  label: string;
  /** 첫 화면 4묶음 레이어 */
  group: PurposeGroup;
  groupLabel: PurposeGroupLabel;
  /** 업종 칩 */
  industries: string[];
  /** 부가기능 기본 추천 (Phase 3에서 pre-check) */
  recommendedFeatures: RecommendedFeature[];
}

export const PURPOSES: PurposeDef[] = [
  {
    id: 'local_store',
    label: 'Restaurants and local shops',
    group: 'serve',
    groupLabel: 'Serve customers',
    industries: [
      'Barbecue restaurant',
      'Korean restaurant',
      'Cafe and desserts',
      'Bakery',
      'Casual dining',
      'Bar, izakaya, or pub',
      'Fine dining or omakase',
      'Boutique or gift shop',
      'Florist',
      'Prepared food shop',
      'Butcher or produce market',
    ],
    recommendedFeatures: ['mapEmbed', 'snsLinks'],
  },
  {
    id: 'booking_service',
    label: 'Appointment-based services',
    group: 'serve',
    groupLabel: 'Serve customers',
    industries: [
      'Salon or barbershop',
      'Nails, waxing, or lashes',
      'Skin care, aesthetics, or massage',
      'Medical clinic',
      'Dental practice',
      'Traditional medicine clinic',
      'Veterinary clinic or pet grooming',
      'Pilates, yoga, or personal training',
      'Workshop or one-day class',
      'Photography or rental studio',
      'Auto repair or car wash',
      'Legal, tax, or counseling practice',
    ],
    recommendedFeatures: ['contactForm', 'mapEmbed'],
  },
  {
    // [제품 확정] '교육·멤버십' → '학원·교육' 소개형 개명. 멤버십/게이팅/수강관리 제거. id는 레거시 호환 유지.
    id: 'edu_membership',
    label: 'Education and training',
    group: 'serve',
    groupLabel: 'Serve customers',
    industries: [
      'Academic tutoring',
      'Language school',
      'Music, art, or dance school',
      'Coding or IT training',
      'Certification or test preparation',
      'Private tutoring',
      'Continuing education',
      'Early childhood education',
    ],
    recommendedFeatures: ['contactForm', 'mapEmbed'],
  },
  {
    id: 'company_brand',
    label: 'Company or brand',
    group: 'promote',
    groupLabel: 'Build awareness',
    industries: [
      'Startup, IT, or SaaS',
      'Manufacturing or B2B',
      'Construction or interiors',
      'Real estate',
      'Professional services firm',
      'Agency',
      'Franchise company',
      'Nonprofit, foundation, or association',
    ],
    recommendedFeatures: ['contactForm', 'mapEmbed'],
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    group: 'promote',
    groupLabel: 'Build awareness',
    industries: [
      'Graphic or product designer',
      'Illustrator',
      'Photographer or filmmaker',
      'Architect or spatial designer',
      'Developer',
      'Writer or artist',
      'Model, actor, or creator',
      'Freelancer',
      'Resume or CV',
    ],
    recommendedFeatures: ['contactForm', 'snsLinks'],
  },
  {
    id: 'one_page',
    label: 'One-page site or link hub',
    group: 'promote',
    groupLabel: 'Build awareness',
    industries: ['Creator', 'Small business landing page', 'Profile page', 'Personal link hub'],
    recommendedFeatures: ['snsLinks'],
  },
];

/**
 * [제품 확정] 설문에서 선택 가능한 소개형 목적 6종 (deprecated 4종 제외). PURPOSES에서 파생 —
 * PURPOSES가 곧 6종이지만, 타입 안전한 완전성 강제(Record<LivePurposeId>)를 위해 명시 배열도 노출.
 */
export const LIVE_PURPOSE_IDS = [
  'local_store',
  'booking_service',
  'company_brand',
  'portfolio',
  'edu_membership',
  'one_page',
] as const satisfies readonly LivePurposeId[];

/** id로 목적 정의 조회 */
export function findPurpose(id: SitePurposeId): PurposeDef | undefined {
  return PURPOSES.find((p) => p.id === id);
}

/**
 * dev 무결성 검사 — id 중복 검사.
 * (industries 중복은 사양상 정상 — 겹침은 목적 우선 플로우가 해결하므로 검사하지 않는다.)
 */
export function validatePurposeTaxonomy(): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const p of PURPOSES) {
    if (ids.has(p.id)) problems.push(`Duplicate purpose id: ${p.id}`);
    ids.add(p.id);
  }
  return problems;
}
