/**
 * [마케팅] 고객사례 데이터 소스 (/cases · /cases/[industry] 구동).
 *
 * §7 정직성: 실고객 0명 상태 — 초기 데이터는 전부 데모(isDemo:true)이며 화면에
 * "데모 사례" 배지로 명시한다. 실측 없는 성과 숫자(metrics)는 넣지 않는다
 * (필드는 optional로 준비만 — 실측 생기면 채운다). 존재하지 않는 라이브 URL 금지.
 */
export interface CaseMetric {
  /** 예: 'AI 답변 노출', '월 문의' */
  label: string;
  /** 예: '8회', '+35%' — 실측 전까지 비워둔다(데모엔 넣지 않음) */
  value: string;
}

export interface Case {
  /** 안정적 식별자 (카드 key) */
  slug: string;
  /** URL·필터 키 (ascii, 소문자) — 예: 'restaurant' */
  industryKey: string;
  /** 업종 표시 라벨 — 예: '음식점' */
  industryLabel: string;
  /** 상호 (데모는 예시명임을 배지로 구분) */
  businessName: string;
  /** 한 줄 요약 */
  summary: string;
  /** 개편 전 상태 요약 */
  before?: string;
  /** 개편 후 상태 요약 */
  after?: string;
  /** 실제 발행 사이트 URL (없으면 미표기) */
  url?: string;
  /** 사장님 한 줄 (데모는 예시) */
  ownerQuote?: string;
  /** 성과 지표 — 실측 전까지 비움(§7) */
  metrics?: CaseMetric[];
  /** 데모 여부 — true면 "데모 사례" 배지 */
  isDemo: boolean;
}

/**
 * 초기 데모 데이터. 유일한 라이브 URL은 데모 사이트 hwarodam.anakslabs.com.
 * 나머지는 업종별 검색 유입구(/cases/[industry])를 만들기 위한 데모 예시로,
 * 라이브 URL·성과 숫자 없이 개념만 보여준다.
 */
export const CASES: Case[] = [
  {
    slug: 'hwarodam',
    industryKey: 'restaurant',
    industryLabel: '음식점',
    businessName: '화로담 (데모)',
    summary: '숯불 한식 다이닝 — 검색·AI가 읽을 수 있게 태어난 사이트의 데모.',
    before: '검색에 상호만 겨우 노출, 메뉴·위치·예약 정보가 구조화되지 않음.',
    after: '제목·JSON-LD·시맨틱 아웃라인·사업자 정보를 갖춘 상태로 발행 — 검색·답변 시스템이 해석할 기반 마련.',
    url: 'https://hwarodam.anakslabs.com',
    ownerQuote: '메뉴와 오시는 길이 한 번에 정리돼 손님 문의가 줄었어요. (데모 예시 문구)',
    isDemo: true,
  },
  {
    slug: 'demo-clinic',
    industryKey: 'clinic',
    industryLabel: '병원·의원',
    businessName: '데모 · 의원 예시',
    summary: '진료 안내·의료진·오시는 길을 구조화해 검색·지도 노출 기반을 갖춘 데모.',
    before: '블로그·SNS만 있고 공식 사이트가 없어 검색 신뢰 신호 부족.',
    after: '진료 안내·FAQ·연락처가 구조화된 다중 페이지 사이트(의료광고 표현 규정 준수 구조).',
    isDemo: true,
  },
  {
    slug: 'demo-academy',
    industryKey: 'academy',
    industryLabel: '학원·교육',
    businessName: '데모 · 학원 예시',
    summary: '커리큘럼·강사·수강 문의를 페이지로 나눠 상담 전환 동선을 만든 데모.',
    before: '커리큘럼과 후기가 한 페이지에 뒤섞여 문의 전환이 약함.',
    after: '홈/소개/문의 다중 페이지 + 문의 폼으로 상담 동선 정리.',
    isDemo: true,
  },
  {
    slug: 'demo-beauty',
    industryKey: 'beauty',
    industryLabel: '뷰티·미용',
    businessName: '데모 · 미용실 예시',
    summary: '시술 메뉴·갤러리·예약 안내를 갖춘 예약 서비스형 데모.',
    before: '가격·시술 정보가 없어 방문 전 이탈.',
    after: '시술 메뉴·갤러리·예약 CTA가 정리된 사이트.',
    isDemo: true,
  },
  {
    slug: 'demo-studio',
    industryKey: 'studio',
    industryLabel: '공방·소매',
    businessName: '데모 · 공방 예시',
    summary: '브랜드 스토리·제품 갤러리·문의를 갖춘 소상공인 브랜드 데모.',
    before: 'SNS 링크만 있고 검색에서 브랜드가 잡히지 않음.',
    after: '브랜드 스토리·갤러리·연락처가 구조화된 사이트.',
    isDemo: true,
  },
];

/** 업종 필터 목록 (등장 순서 보존, 중복 제거) */
export function caseIndustries(): { key: string; label: string; count: number }[] {
  const map = new Map<string, { key: string; label: string; count: number }>();
  for (const c of CASES) {
    const cur = map.get(c.industryKey);
    if (cur) cur.count += 1;
    else map.set(c.industryKey, { key: c.industryKey, label: c.industryLabel, count: 1 });
  }
  return [...map.values()];
}

/** 업종 키 → 라벨 (없으면 null) */
export function industryLabelOf(key: string): string | null {
  return CASES.find((c) => c.industryKey === key)?.industryLabel ?? null;
}

/** 업종별 사례 */
export function casesByIndustry(key: string): Case[] {
  return CASES.filter((c) => c.industryKey === key);
}
