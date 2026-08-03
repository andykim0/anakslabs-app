/**
 * [T3 · 제품 확정] 목적별 지원 범위 레지스트리 — "약속 = 배선된 것"의 단일 소스.
 * 이 제품은 "홈페이지 전문 최적화 AI" — 소개형(presentation) 홈페이지만 만든다.
 * 설문 S1 목적 카드 문구는 여기서만 파생(하드코딩·taxonomy.features 노출 금지).
 * 백엔드 기능(자체 장바구니·결제, 회원·콘텐츠 게이팅, 게시판, CMS형 발행)은 제품에서 완전 제거 —
 * roadmap 필드에도 넣지 않는다. 판매·발행·커뮤니티가 필요한 고객은 외부 채널로 '연결'한다.
 * 금칙어(장바구니·결제·게이팅·게시판·회원 등급 등)는 불변식 테스트가 차단한다.
 */
import type { LivePurposeId } from '@/lib/types/domain';

export interface PurposeCapability {
  /** 설문 카드에 노출되는 한 줄 설명 — 소개형 범위만 */
  summary: string;
  /** 배선된 기능만 열거 (카드에 상위 3개 노출) */
  features: readonly string[];
}

export const PURPOSE_CAPABILITIES = {
  local_store: {
    summary: 'Show the menu, business story, and directions in one place',
    features: ['Menu with photos and prices', 'Business introduction and gallery', 'Hours, directions, and call button'],
  },
  booking_service: {
    summary: 'Explain services and receive appointment or consultation requests',
    features: ['Treatments and services', 'Provider profiles', 'Appointment and contact actions'],
  },
  company_brand: {
    summary: 'Present the company and its services with clear proof',
    features: ['Services and products', 'Company overview and verified results', 'Email and contact actions'],
  },
  portfolio: {
    summary: 'Organize selected work and turn interest into inquiries',
    features: ['Work gallery', 'Project details: overview, process, and outcome', 'Experience and project inquiry'],
  },
  edu_membership: {
    summary: 'Present the curriculum and enrollment details, then accept inquiries',
    features: ['Curriculum and classes', 'Pricing and schedule', 'Reviews and enrollment inquiry'],
  },
  one_page: {
    summary: 'Put the profile and essential links on one clear page',
    features: ['Profile and short introduction', 'Link buttons', 'Social profiles'],
  },
} as const satisfies Record<LivePurposeId, PurposeCapability>;

/** 카드 노출용 — summary + 상위 features. 소개형 6종(LivePurposeId)만 대상 */
export function capabilityOf(id: LivePurposeId): PurposeCapability {
  return PURPOSE_CAPABILITIES[id];
}
