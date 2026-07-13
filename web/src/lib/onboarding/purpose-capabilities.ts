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
    summary: '메뉴판과 가게 이야기, 찾아오는 길까지 한 번에 보여드려요',
    features: ['메뉴판(사진·가격)', '가게 소개·갤러리', '영업시간·오시는 길·전화 버튼'],
  },
  booking_service: {
    summary: '서비스를 소개하고 상담·예약 문의를 받아요',
    features: ['시술·서비스 메뉴', '담당 전문가 소개', '상담·예약 문의(전화·카톡)'],
  },
  company_brand: {
    summary: '회사와 서비스를 신뢰감 있게 소개해요',
    features: ['서비스·제품 소개', '회사 소개·주요 실적', '문의(카톡·메일 연결)'],
  },
  portfolio: {
    summary: '작업물을 보기 좋게 정리하고 의뢰로 이어드려요',
    features: ['작업 갤러리', '프로젝트 상세(개요·과정·결과)', '이력 소개·의뢰 문의'],
  },
  edu_membership: {
    summary: '커리큘럼과 수강 안내를 보여주고 상담 신청을 받아요',
    features: ['커리큘럼·수업 소개', '수강 안내(가격·일정)', '후기·상담 신청'],
  },
  one_page: {
    summary: '프로필과 링크를 한 페이지에 깔끔하게 모아드려요',
    features: ['프로필·한 줄 소개', '링크 모음 버튼', 'SNS 연결'],
  },
} as const satisfies Record<LivePurposeId, PurposeCapability>;

/** 카드 노출용 — summary + 상위 features. 소개형 6종(LivePurposeId)만 대상 */
export function capabilityOf(id: LivePurposeId): PurposeCapability {
  return PURPOSE_CAPABILITIES[id];
}
