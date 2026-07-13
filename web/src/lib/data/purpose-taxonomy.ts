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

export type PurposeGroup = 'sell' | 'serve' | 'promote' | 'content';
export type PurposeGroupLabel = '팔기' | '손님 받기' | '알리기' | '콘텐츠·멤버십';
export type RecommendedFeature = 'contactForm' | 'mapEmbed' | 'snsLinks';

export interface PurposeDef {
  id: SitePurposeId;
  label: string;
  /** 첫 화면 4묶음 레이어 */
  group: PurposeGroup;
  groupLabel: PurposeGroupLabel;
  /** 카드에 표시할 핵심 기능 요약 */
  features: string[];
  /** 업종 칩 */
  industries: string[];
  /** 부가기능 기본 추천 (Phase 3에서 pre-check) */
  recommendedFeatures: RecommendedFeature[];
}

export const PURPOSES: PurposeDef[] = [
  {
    id: 'local_store',
    label: '음식점·로컬 매장',
    group: 'serve',
    groupLabel: '손님 받기',
    features: ['메뉴판·영업정보(시간/휴무)', '지도', '예약 또는 전화', '주문/배달앱 링크'],
    industries: [
      '고깃집·바베큐',
      '한식·백반',
      '카페·디저트',
      '베이커리',
      '분식',
      '바·이자카야·펍',
      '파인다이닝·오마카세',
      '편집숍·소품샵',
      '꽃집',
      '반찬가게',
      '정육·청과',
    ],
    recommendedFeatures: ['mapEmbed', 'snsLinks'],
  },
  {
    id: 'booking_service',
    label: '예약·서비스업',
    group: 'serve',
    groupLabel: '손님 받기',
    features: ['예약 캘린더·타임슬롯', '시술/서비스 메뉴', '직원 지정', '예약금/노쇼·자동 리마인더'],
    industries: [
      '미용실·바버샵',
      '네일·왁싱·속눈썹',
      '피부·에스테틱·마사지',
      '병원·의원',
      '치과',
      '한의원',
      '동물병원·펫미용',
      '필라테스·요가·PT',
      '공방·원데이클래스',
      '사진/대여 스튜디오',
      '자동차 정비·세차',
      '상담(법률·세무·심리)',
    ],
    recommendedFeatures: ['contactForm', 'mapEmbed'],
  },
  {
    // [제품 확정] '교육·멤버십' → '학원·교육' 소개형 개명. 멤버십/게이팅/수강관리 제거. id는 레거시 호환 유지.
    id: 'edu_membership',
    label: '학원·교육',
    group: 'serve',
    groupLabel: '손님 받기',
    features: ['커리큘럼·수업 소개', '수강 안내(가격·일정)', '후기·상담 신청'],
    industries: [
      '입시·보습학원',
      '어학원·외국어',
      '예체능 학원(음악·미술·무용)',
      '코딩·IT 교육',
      '자격증·시험대비',
      '과외·교습소',
      '평생교육·문화센터',
      '유아·아동 교육',
    ],
    recommendedFeatures: ['contactForm', 'mapEmbed'],
  },
  {
    id: 'company_brand',
    label: '회사·브랜드',
    group: 'promote',
    groupLabel: '알리기',
    features: ['회사/서비스/제품 소개', '문의/견적 폼', '채용', 'SEO'],
    industries: [
      '스타트업·IT/SaaS',
      '제조·B2B',
      '건설·인테리어 시공',
      '부동산·중개',
      '전문서비스 법인(법무·회계)',
      '대행사·에이전시',
      '프랜차이즈 본사(가맹모집)',
      '비영리·재단·협회',
    ],
    recommendedFeatures: ['contactForm', 'mapEmbed'],
  },
  {
    id: 'portfolio',
    label: '포트폴리오',
    group: 'promote',
    groupLabel: '알리기',
    features: ['작업 갤러리', '프로젝트 상세·케이스스터디', '이력', '의뢰 폼'],
    industries: [
      '그래픽·UXUI 디자이너',
      '일러스트레이터',
      '사진·영상 작가',
      '건축·공간 디자이너',
      '개발자',
      '작가·아티스트',
      '모델·배우·인플루언서',
      '프리랜서',
      '개인 이력서/CV',
    ],
    recommendedFeatures: ['contactForm', 'snsLinks'],
  },
  {
    id: 'one_page',
    label: '원페이지·링크인바이오',
    group: 'promote',
    groupLabel: '알리기',
    features: ['초간단 1페이지', '링크 허브', '프로필'],
    industries: ['인플루언서·크리에이터', '소상공인 간이 홈', '명함형 프로필', '개인 링크 모음'],
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
    if (ids.has(p.id)) problems.push(`중복 목적 id: ${p.id}`);
    ids.add(p.id);
  }
  return problems;
}
