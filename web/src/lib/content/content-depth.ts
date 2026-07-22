import type { BusinessFactAnswer, BusinessFactKey } from '@/lib/types/domain';

export type ContentIndustryGroup =
  | 'cafe'
  | 'food'
  | 'medical'
  | 'beauty'
  | 'workshop'
  | 'education'
  | 'legal'
  | 'retail'
  | 'generic';

export interface BusinessFactQuestion {
  key: BusinessFactKey;
  label: string;
  hint: string;
  placeholder: string;
  required?: boolean;
}

export const REQUIRED_BUSINESS_FACT_KEYS = ['phone', 'openingHours'] as const satisfies readonly BusinessFactKey[];

const COMMON_FACT_QUESTIONS: readonly BusinessFactQuestion[] = [
  { key: 'phone', label: '연락처', hint: '손님에게 공개할 전화번호나 문의 채널', placeholder: '예: 02-123-4567', required: true },
  { key: 'openingHours', label: '영업시간', hint: '요일별 운영시간과 쉬는 날', placeholder: '예: 화–일 10:00–20:00, 월요일 휴무', required: true },
  { key: 'address', label: '정확한 주소', hint: '건물명·층까지 알려주면 찾아오기 쉬워요', placeholder: '예: 서울 성동구 연무장길 00, 2층' },
  { key: 'parking', label: '주차', hint: '가능·불가와 이용 조건을 사실대로', placeholder: '예: 주차 불가 / 건물 주차 1시간 가능' },
  { key: 'reservation', label: '예약 방법', hint: '전화·메시지·예약 링크 등 실제 방법', placeholder: '예: 전화 또는 네이버 예약' },
  { key: 'paymentMethods', label: '결제수단', hint: '실제로 받는 결제수단만', placeholder: '예: 카드·현금·지역화폐' },
  { key: 'accessibility', label: '접근성', hint: '층·엘리베이터·휠체어 진입 여부', placeholder: '예: 2층, 엘리베이터 있음' },
  { key: 'pets', label: '반려동물', hint: '동반 가능 여부와 조건', placeholder: '예: 이동장 사용 시 가능' },
  { key: 'wifi', label: '와이파이', hint: '손님용 와이파이 제공 여부', placeholder: '예: 무료 와이파이 제공' },
  { key: 'directions', label: '오시는 길 특징', hint: '역·정류장·눈에 띄는 건물에서 오는 방법', placeholder: '예: 성수역 3번 출구에서 도보 5분' },
];

const INDUSTRY_FACT_QUESTIONS: Record<ContentIndustryGroup, readonly BusinessFactQuestion[]> = {
  cafe: [
    { key: 'signature', label: '시그니처 메뉴', hint: '대표로 소개할 실제 메뉴', placeholder: '예: 흑임자 크림 라테' },
    { key: 'seating', label: '좌석', hint: '실제 좌석 수나 좌석 형태', placeholder: '예: 바 좌석 6석, 테이블 5개' },
    { key: 'outlets', label: '콘센트', hint: '콘센트 좌석 여부', placeholder: '예: 창가 좌석 4곳에 있음' },
    { key: 'groupSeating', label: '단체석', hint: '가능 인원과 예약 조건', placeholder: '예: 6인 테이블 1개, 예약 권장' },
  ],
  food: [
    { key: 'signature', label: '대표 메뉴', hint: '가장 먼저 보여줄 실제 메뉴', placeholder: '예: 들기름 메밀면' },
    { key: 'groupSeating', label: '단체 이용', hint: '가능 인원과 예약 조건', placeholder: '예: 8인까지 한 테이블 가능' },
    { key: 'services', label: '포장·배달', hint: '실제로 제공하는 방식', placeholder: '예: 포장 가능, 배달 미운영' },
  ],
  medical: [
    { key: 'specialties', label: '진료과목', hint: '실제 신고·운영 중인 진료과목', placeholder: '예: 내과·가정의학과' },
    { key: 'credentials', label: '의료진 약력', hint: '고객이 제공한 검증 가능한 경력·자격만', placeholder: '예: 전문의 자격과 소속 학회' },
    { key: 'insurance', label: '보험·비급여 안내', hint: '실제 적용 범위나 확인 방법', placeholder: '예: 항목별 상담 후 안내' },
  ],
  beauty: [
    { key: 'services', label: '주요 시술', hint: '실제 제공하는 시술', placeholder: '예: 커트·펌·컬러' },
    { key: 'duration', label: '예상 소요시간', hint: '시술별 실제 범위', placeholder: '예: 커트 약 40분, 펌 2시간 내외' },
    { key: 'specialties', label: '전문 분야', hint: '실제로 집중하는 시술이나 스타일', placeholder: '예: 단발 디자인·레이어드 컷' },
  ],
  workshop: [
    { key: 'classes', label: '클래스 종류', hint: '현재 운영하는 수업', placeholder: '예: 도자기 원데이·정규반' },
    { key: 'duration', label: '수업 시간', hint: '클래스별 실제 소요시간', placeholder: '예: 원데이 클래스 약 2시간' },
    { key: 'materials', label: '재료·준비물', hint: '포함 재료와 손님 준비물', placeholder: '예: 재료 포함, 앞치마 제공' },
  ],
  education: [
    { key: 'classes', label: '수업·과정', hint: '현재 모집하거나 운영하는 과정', placeholder: '예: 중등 수학 정규반' },
    { key: 'duration', label: '수업 시간', hint: '회차와 실제 소요시간', placeholder: '예: 주 2회, 회당 90분' },
    { key: 'specialties', label: '지도 분야', hint: '실제 지도 범위', placeholder: '예: 중등 내신·고등 수능' },
  ],
  legal: [
    { key: 'services', label: '상담 분야', hint: '실제 다루는 업무 분야', placeholder: '예: 민사·상속·부동산' },
    { key: 'credentials', label: '자격·약력', hint: '고객이 제공한 검증 가능한 자격·경력만', placeholder: '예: 등록 자격과 실제 경력' },
    { key: 'duration', label: '상담 시간', hint: '실제 상담 단위', placeholder: '예: 첫 상담 50분' },
  ],
  retail: [
    { key: 'signature', label: '대표 상품', hint: '가장 먼저 보여줄 실제 상품', placeholder: '예: 수제 가죽 카드지갑' },
    { key: 'services', label: '구매·배송', hint: '매장 구매·택배·픽업 등 실제 방식', placeholder: '예: 매장 픽업과 택배 가능' },
    { key: 'materials', label: '소재·관리법', hint: '상품에 실제 쓰는 소재나 관리법', placeholder: '예: 천연가죽, 마른 천으로 관리' },
  ],
  generic: [
    { key: 'services', label: '주요 서비스', hint: '실제로 제공하는 일', placeholder: '예: 브랜드 상담·제작' },
    { key: 'duration', label: '진행 시간', hint: '상담·서비스에 걸리는 실제 시간', placeholder: '예: 첫 상담 약 1시간' },
    { key: 'specialties', label: '집중 분야', hint: '실제로 집중하는 분야', placeholder: '예: 소규모 매장 브랜딩' },
  ],
};

export function contentIndustryGroup(industry: string): ContentIndustryGroup {
  const value = industry.trim();
  if (/카페|커피|베이커리|디저트|제과|제빵/u.test(value)) return 'cafe';
  if (/식당|음식|다이닝|한식|중식|일식|양식|주점|바\b/u.test(value)) return 'food';
  if (/병원|의원|의료|치과|한의|약국|클리닉/u.test(value)) return 'medical';
  if (/미용|헤어|네일|피부|뷰티|살롱|마사지|필라테스|요가/u.test(value)) return 'beauty';
  if (/공방|도예|도자|목공|수공예|핸드메이드|원데이/u.test(value)) return 'workshop';
  if (/학원|교육|교습|과외|학교|스터디/u.test(value)) return 'education';
  if (/법률|법무|변호|세무|노무|회계/u.test(value)) return 'legal';
  if (/소매|리테일|상점|편집숍|쇼핑|꽃집|서점|의류|잡화/u.test(value)) return 'retail';
  return 'generic';
}

export function factQuestionsForIndustry(industry: string): BusinessFactQuestion[] {
  const questions = [...COMMON_FACT_QUESTIONS, ...INDUSTRY_FACT_QUESTIONS[contentIndustryGroup(industry)]];
  return [...new Map(questions.map((question) => [question.key, question])).values()];
}

export function missingRequiredFacts(facts: readonly BusinessFactAnswer[]): BusinessFactKey[] {
  const answered = new Set(facts.filter((fact) => fact.value.trim()).map((fact) => fact.key));
  return REQUIRED_BUSINESS_FACT_KEYS.filter((key) => !answered.has(key));
}
