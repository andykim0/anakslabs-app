/**
 * [T3] 목적별 지원 범위 레지스트리 — "약속 = 배선된 것"의 단일 소스.
 * 설문 S1 목적 카드 문구는 여기서만 파생(하드코딩·taxonomy.features 노출 금지).
 * features에는 실제로 생성·배선되는 것만 적는다. 아직인 것은 roadmap으로 —
 * 노출 시 반드시 '준비 중'을 명시한다. 금칙어(장바구니·재고·게이팅·게시판 등 미배선
 * 단어)는 불변식 테스트가 차단한다. (쇼핑몰 v1 = 상품 진열 + 외부 결제 연동 — 확정)
 */
import type { SitePurposeId } from '@/lib/types/domain';

export interface PurposeCapability {
  /** 설문 카드에 노출되는 한 줄 설명 — v1 지원 범위만 */
  summary: string;
  /** 배선된 기능만 열거 (카드에 상위 3개 노출) */
  features: readonly string[];
  /** 준비 중 — 노출 시 '준비 중' 명시로만 */
  roadmap?: readonly string[];
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
  ecommerce: {
    summary: '상품을 진열하고 구매는 쓰시는 판매 채널로 연결해요',
    features: ['상품 진열(사진·이름·가격)', '브랜드 스토리·이용안내', '구매 버튼(스마트스토어·카페24·카카오톡 주문 연결)'],
    roadmap: ['자체 장바구니·결제(준비 중)', '재고 관리(준비 중)'],
  },
  edu_membership: {
    summary: '커리큘럼과 수강 안내를 보여주고 상담 신청을 받아요',
    features: ['커리큘럼 소개(단계별)', '수강 안내(가격·일정)', '수강 후기·상담 신청'],
    roadmap: ['콘텐츠 게이팅(준비 중)', '회원 등급(준비 중)'],
  },
  company_brand: {
    summary: '회사와 서비스를 신뢰감 있게 소개해요',
    features: ['서비스·제품 소개', '회사 소개·주요 실적', '문의(카톡·메일 연결)'],
  },
  portfolio: {
    summary: '작업물을 보기 좋게 정리하고 의뢰로 이어드려요',
    features: ['작업 갤러리', '프로젝트 상세(개요·과정·결과)', '이력 소개·의뢰 문의'],
  },
  blog_media: {
    summary: '콘텐츠와 채널을 소개하고 구독으로 연결해요',
    features: ['콘텐츠·카테고리 소개', '운영자 소개', '구독 채널 연결'],
    roadmap: ['자체 글 발행(CMS, 준비 중)'],
  },
  community: {
    summary: '모임을 소개하고 가입은 쓰시는 채널로 연결해요',
    features: ['모임 소개·운영 원칙', '활동 갤러리', '가입 안내(카페·밴드 연결)'],
    roadmap: ['게시판(준비 중)', '포인트·등급(준비 중)'],
  },
  event: {
    summary: '행사 정보를 알리고 참가 신청으로 연결해요',
    features: ['행사 소개·일정', '장소·오시는 길(지도)', '참가 신청(외부 폼·카톡 연결)'],
  },
  one_page: {
    summary: '프로필과 링크를 한 페이지에 깔끔하게 모아드려요',
    features: ['프로필·한 줄 소개', '링크 모음 버튼', 'SNS 연결'],
  },
} as const satisfies Record<SitePurposeId, PurposeCapability>;

/** 카드 노출용 — summary + 상위 features */
export function capabilityOf(id: SitePurposeId): PurposeCapability {
  return PURPOSE_CAPABILITIES[id];
}
