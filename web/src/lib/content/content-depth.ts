import type {
  BusinessFactAnswer,
  BusinessFactKey,
  GuidedFaqAnswer,
  SurveyInput,
} from '@/lib/types/domain';

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

export interface GuidedFaqQuestion {
  id: string;
  question: string;
  hint: string;
}

export interface HonestBrandingCopy {
  kicker: string;
  title: string;
  heroSub: string;
  paragraphs: readonly string[];
  principles: readonly { title: string; description: string }[];
}

export interface ContentDepthHomeModel {
  branding: HonestBrandingCopy;
  customerIntroduction: readonly string[];
  strengths: readonly { title: string; description: string }[];
  contentItems: readonly {
    name: string;
    price?: string;
    description?: string;
  }[];
  galleryImages: readonly string[];
  faq: readonly { question: string; answer: string }[];
  directions: readonly { label: string; value: string }[];
  contact: readonly { label: string; value: string }[];
}

export interface MainStorytellingModel {
  kicker: string;
  title: string;
  paragraphs: readonly string[];
  hasCustomerStory: boolean;
  valuesLead: string;
  values: readonly { title: string; description: string }[];
}

export const REQUIRED_BUSINESS_FACT_KEYS = ['phone', 'openingHours'] as const satisfies readonly BusinessFactKey[];

const FACT_LABELS: Readonly<Partial<Record<BusinessFactKey, string>>> = {
  phone: '연락처',
  openingHours: '영업시간',
  address: '주소',
  parking: '주차',
  reservation: '예약',
  paymentMethods: '결제수단',
  accessibility: '접근성',
  pets: '반려동물',
  wifi: '와이파이',
  directions: '찾아오는 길',
};

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

const COMMON_FAQ_QUESTIONS: readonly GuidedFaqQuestion[] = [
  { id: 'hours', question: '영업시간과 쉬는 날은 언제인가요?', hint: '요일별 시간과 휴무일을 답해주세요.' },
  { id: 'parking', question: '주차할 수 있나요?', hint: '가능·불가와 시간·비용 조건을 답해주세요.' },
  { id: 'reservation', question: '예약은 어떻게 하나요?', hint: '전화·메시지·예약 링크 등 실제 방법을 답해주세요.' },
  { id: 'payment', question: '어떤 결제수단을 사용할 수 있나요?', hint: '실제로 받는 결제수단만 답해주세요.' },
  { id: 'accessibility', question: '엘리베이터나 휠체어 진입이 가능한가요?', hint: '층·엘리베이터·문턱 등 실제 상태를 답해주세요.' },
  { id: 'pets', question: '반려동물과 함께 들어갈 수 있나요?', hint: '가능 여부와 이동장 같은 조건을 답해주세요.' },
];

const INDUSTRY_FAQ_QUESTIONS: Record<ContentIndustryGroup, readonly GuidedFaqQuestion[]> = {
  cafe: [
    { id: 'wifi', question: '와이파이와 콘센트를 사용할 수 있나요?', hint: '제공 여부와 이용 가능한 좌석을 답해주세요.' },
    { id: 'group', question: '단체로 이용할 수 있나요?', hint: '가능 인원과 예약 조건을 답해주세요.' },
    { id: 'takeout', question: '포장 주문이 가능한가요?', hint: '가능한 메뉴나 주문 방법을 답해주세요.' },
  ],
  food: [
    { id: 'group', question: '단체 예약이 가능한가요?', hint: '가능 인원과 예약 조건을 답해주세요.' },
    { id: 'corkage', question: '콜키지가 가능한가요?', hint: '가능 여부와 병수·비용 조건을 답해주세요.' },
    { id: 'takeout', question: '포장이나 배달이 가능한가요?', hint: '실제 운영 방식을 답해주세요.' },
  ],
  medical: [
    { id: 'appointment', question: '진료 예약이 필요한가요?', hint: '예약·당일 접수 방법을 답해주세요.' },
    { id: 'insurance', question: '보험 적용 여부는 어떻게 확인하나요?', hint: '확인 가능한 범위와 문의 방법을 답해주세요.' },
    { id: 'documents', question: '방문할 때 준비할 것이 있나요?', hint: '신분증·의뢰서 등 실제 준비물만 답해주세요.' },
  ],
  beauty: [
    { id: 'duration', question: '시술은 얼마나 걸리나요?', hint: '시술별 실제 예상 시간을 답해주세요.' },
    { id: 'appointment', question: '당일 예약도 가능한가요?', hint: '예약 가능 시점과 방법을 답해주세요.' },
    { id: 'aftercare', question: '시술 후 관리 방법이 있나요?', hint: '실제로 안내하는 관리법만 답해주세요.' },
  ],
  workshop: [
    { id: 'materials', question: '재료와 준비물이 포함되나요?', hint: '포함 품목과 직접 가져올 것을 답해주세요.' },
    { id: 'duration', question: '클래스는 얼마나 걸리나요?', hint: '클래스별 실제 시간을 답해주세요.' },
    { id: 'group', question: '단체 클래스도 가능한가요?', hint: '가능 인원과 예약 조건을 답해주세요.' },
  ],
  education: [
    { id: 'enrollment', question: '수업은 어떻게 등록하나요?', hint: '상담·레벨 확인·등록 순서를 답해주세요.' },
    { id: 'duration', question: '수업 시간과 횟수는 어떻게 되나요?', hint: '회당 시간과 주간 횟수를 답해주세요.' },
    { id: 'materials', question: '교재나 준비물이 필요한가요?', hint: '실제 사용하는 교재와 준비물을 답해주세요.' },
  ],
  legal: [
    { id: 'appointment', question: '상담은 예약해야 하나요?', hint: '예약 방법과 가능한 시간을 답해주세요.' },
    { id: 'documents', question: '상담 전에 어떤 자료를 준비해야 하나요?', hint: '업무별로 공통 준비 자료가 있다면 답해주세요.' },
    { id: 'duration', question: '첫 상담은 얼마나 걸리나요?', hint: '실제 상담 시간 단위를 답해주세요.' },
  ],
  retail: [
    { id: 'delivery', question: '택배나 매장 픽업이 가능한가요?', hint: '실제 구매·수령 방법을 답해주세요.' },
    { id: 'exchange', question: '교환이나 반품은 어떻게 하나요?', hint: '실제 적용하는 기준과 방법을 답해주세요.' },
    { id: 'stock', question: '상품 재고는 어떻게 확인하나요?', hint: '전화·메시지 등 실제 확인 방법을 답해주세요.' },
  ],
  generic: [
    { id: 'appointment', question: '상담은 어떻게 신청하나요?', hint: '실제 문의·예약 방법을 답해주세요.' },
    { id: 'duration', question: '상담이나 서비스는 얼마나 걸리나요?', hint: '실제 예상 시간을 답해주세요.' },
    { id: 'documents', question: '미리 준비할 것이 있나요?', hint: '필요한 자료나 준비물만 답해주세요.' },
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

/**
 * 네이버 FAQ 리치 결과는 2026-07-08 종료됐지만, 명시적 질문-답 구조는
 * 인덱싱·질문 매칭·AI 인용을 위한 가시 콘텐츠와 FAQPage 데이터에 계속 사용한다.
 */
export function faqQuestionsForIndustry(industry: string): GuidedFaqQuestion[] {
  const questions = [...COMMON_FAQ_QUESTIONS, ...INDUSTRY_FAQ_QUESTIONS[contentIndustryGroup(industry)]];
  return [...new Map(questions.map((question) => [question.id, question])).values()];
}

export function resolveGuidedFaqAnswers(
  industry: string,
  answers: readonly GuidedFaqAnswer[],
): { questionId: string; question: string; answer: string }[] {
  const answerById = new Map<string, string>();
  for (const item of answers) {
    const answer = item.answer.trim();
    if (answer) answerById.set(item.questionId, answer);
  }
  return faqQuestionsForIndustry(industry).flatMap((question) => {
    const answer = answerById.get(question.id);
    return answer ? [{ questionId: question.id, question: question.question, answer }] : [];
  });
}

/** 고객이 확인한 답변만 키별로 하나씩 남긴다. 마지막 답변 우선은 폼 수정 결과와 같다. */
export function resolveBusinessFacts(
  facts: readonly BusinessFactAnswer[],
): Readonly<Partial<Record<BusinessFactKey, string>>> {
  const resolved: Partial<Record<BusinessFactKey, string>> = {};
  for (const fact of facts) {
    const value = fact.value.trim();
    if (value) resolved[fact.key] = value;
  }
  return resolved;
}

const BRANDING_BY_GROUP: Record<ContentIndustryGroup, HonestBrandingCopy> = {
  cafe: {
    kicker: '머무는 시간의 기준',
    title: '한 잔을 고르는 순간부터\n편안한 경험으로',
    heroSub: '메뉴를 고르고 머무는 시간이 편안하도록, 필요한 이야기를 차분히 전합니다.',
    paragraphs: [
      '한 잔을 고르는 순간부터 머무는 시간까지, 편안한 경험을 지향합니다.',
      '메뉴와 방문 정보를 한곳에서 살펴보고 자신에게 맞는 선택을 할 수 있도록 안내합니다.',
      '가게가 중요하게 생각하는 분위기와 태도를 과장 없이 전하고자 합니다.',
    ],
    principles: [
      { title: '알기 쉬운 안내', description: '메뉴와 방문 정보를 찾기 쉬운 순서로 전하고자 합니다.' },
      { title: '편안한 선택', description: '서두르지 않고 자신에게 맞는 한 잔과 시간을 고를 수 있기를 바랍니다.' },
      { title: '한결같은 분위기', description: '가게가 지향하는 인상이 화면과 방문 경험으로 자연스럽게 이어지길 바랍니다.' },
    ],
  },
  food: {
    kicker: '한 끼를 고르는 기준',
    title: '메뉴를 만나는 순간부터\n기분 좋은 식사로',
    heroSub: '무엇을 먹을지 고르는 순간부터 방문까지, 필요한 이야기를 차분히 전합니다.',
    paragraphs: [
      '한 끼를 고르는 순간부터 식사를 마치는 시간까지, 편안한 경험을 지향합니다.',
      '메뉴와 이용 정보를 한곳에서 살펴보고 자신의 취향에 맞게 선택할 수 있도록 안내합니다.',
      '가게가 중요하게 생각하는 태도와 분위기를 과장 없이 전하고자 합니다.',
    ],
    principles: [
      { title: '분명한 메뉴 안내', description: '이름과 가격, 설명을 한눈에 살펴볼 수 있도록 전하고자 합니다.' },
      { title: '편안한 선택', description: '방문 전에 궁금한 내용을 확인하고 자신에게 맞는 식사를 고를 수 있기를 바랍니다.' },
      { title: '이어지는 분위기', description: '화면에서 느낀 인상이 실제 식사의 기대와 자연스럽게 이어지길 바랍니다.' },
    ],
  },
  medical: {
    kicker: '안심할 수 있는 안내',
    title: '궁금한 내용을 분명하게\n찾기 쉬운 안내로',
    heroSub: '필요한 진료 정보를 차분히 살펴보고 다음 행동을 정할 수 있도록 안내합니다.',
    paragraphs: [
      '의료 정보를 찾는 순간에는 화려한 표현보다 분명하고 차분한 안내가 중요합니다.',
      '진료 항목과 예약 방법, 방문 전에 확인할 내용을 찾기 쉬운 순서로 전하고자 합니다.',
      '확인된 정보만 보여주고, 판단이 필요한 내용은 직접 문의할 수 있도록 돕습니다.',
    ],
    principles: [
      { title: '확인된 정보', description: '고객이 직접 알려준 진료와 이용 정보만 분명하게 전합니다.' },
      { title: '쉬운 탐색', description: '궁금한 내용을 빠르게 찾고 다음 행동을 정할 수 있도록 구성합니다.' },
      { title: '차분한 소통', description: '과장 없이 이해하기 쉬운 말로 안내하는 태도를 지향합니다.' },
    ],
  },
  beauty: {
    kicker: '나에게 맞는 선택',
    title: '원하는 모습을 고르는 일부터\n편안한 경험으로',
    heroSub: '시술과 예약 정보를 충분히 살펴보고 자신에게 맞는 선택을 할 수 있도록 안내합니다.',
    paragraphs: [
      '변화를 고르는 일은 충분한 정보와 편안한 대화에서 시작된다고 생각합니다.',
      '시술과 소요시간, 예약 전에 궁금한 내용을 찾기 쉬운 순서로 전하고자 합니다.',
      '공간이 지향하는 분위기와 태도를 과장 없이 보여드립니다.',
    ],
    principles: [
      { title: '충분한 안내', description: '시술과 이용 정보를 미리 살펴볼 수 있도록 전하고자 합니다.' },
      { title: '편안한 선택', description: '자신에게 맞는 방향을 서두르지 않고 고를 수 있기를 바랍니다.' },
      { title: '섬세한 분위기', description: '화면의 인상부터 방문까지 편안한 흐름이 이어지길 바랍니다.' },
    ],
  },
  workshop: {
    kicker: '만드는 시간의 가치',
    title: '손으로 만드는 즐거움을\n차분히 만나는 곳',
    heroSub: '클래스와 준비 정보를 살펴보고 자신에게 맞는 만드는 시간을 고를 수 있도록 안내합니다.',
    paragraphs: [
      '직접 만드는 시간에는 결과만큼 과정의 즐거움도 중요합니다.',
      '클래스와 재료, 준비할 내용을 한곳에서 살펴보고 편안하게 선택할 수 있도록 안내합니다.',
      '공방이 지향하는 분위기와 태도를 과장 없이 전하고자 합니다.',
    ],
    principles: [
      { title: '과정의 즐거움', description: '처음부터 완성까지 만드는 시간을 편안하게 상상할 수 있도록 돕습니다.' },
      { title: '분명한 준비', description: '클래스와 재료, 준비 정보를 찾기 쉬운 순서로 전하고자 합니다.' },
      { title: '나만의 속도', description: '서두르지 않고 자신에게 맞는 경험을 고를 수 있기를 바랍니다.' },
    ],
  },
  education: {
    kicker: '배움의 다음 걸음',
    title: '배우는 과정을 이해하고\n나에게 맞는 선택으로',
    heroSub: '수업과 등록 정보를 충분히 살펴보고 다음 배움을 정할 수 있도록 안내합니다.',
    paragraphs: [
      '배움을 고르는 일은 과정과 방향을 이해하는 데서 시작됩니다.',
      '수업과 일정, 준비할 내용을 한곳에서 살펴보고 자신에게 맞는 선택을 할 수 있도록 안내합니다.',
      '교육이 지향하는 태도와 기준을 과장 없이 전하고자 합니다.',
    ],
    principles: [
      { title: '이해하기 쉬운 과정', description: '수업의 순서와 준비 정보를 찾기 쉽게 전하고자 합니다.' },
      { title: '스스로 하는 선택', description: '필요한 정보를 충분히 보고 자신에게 맞는 배움을 고를 수 있기를 바랍니다.' },
      { title: '꾸준한 방향', description: '짧은 약속보다 배움의 과정을 차분히 안내하는 태도를 지향합니다.' },
    ],
  },
  legal: {
    kicker: '복잡한 일을 분명하게',
    title: '어려운 내용을 차분하게\n다음 행동은 분명하게',
    heroSub: '상담 분야와 준비 정보를 살펴보고 필요한 다음 행동을 정할 수 있도록 안내합니다.',
    paragraphs: [
      '복잡한 문제일수록 화려한 표현보다 정확하고 이해하기 쉬운 안내가 중요합니다.',
      '상담 분야와 준비할 내용을 찾기 쉬운 순서로 전하고자 합니다.',
      '확인된 정보만 보여주고, 구체적인 판단은 상담으로 이어질 수 있도록 돕습니다.',
    ],
    principles: [
      { title: '분명한 정보', description: '고객이 직접 알려준 상담 분야와 이용 정보만 전합니다.' },
      { title: '이해하기 쉬운 말', description: '어려운 내용을 처음 보는 사람도 따라갈 수 있도록 안내하고자 합니다.' },
      { title: '차분한 다음 단계', description: '필요한 내용을 확인하고 상담 여부를 정할 수 있도록 돕습니다.' },
    ],
  },
  retail: {
    kicker: '취향을 고르는 시간',
    title: '좋아하는 것을 발견하고\n편안하게 고르는 곳',
    heroSub: '상품과 구매 정보를 충분히 살펴보고 자신의 취향에 맞게 고를 수 있도록 안내합니다.',
    paragraphs: [
      '좋아하는 물건을 발견하고 고르는 시간 자체가 편안한 경험이 되기를 바랍니다.',
      '상품과 구매 정보를 한곳에서 살펴보고 자신의 취향에 맞게 선택할 수 있도록 안내합니다.',
      '가게가 지향하는 분위기와 태도를 과장 없이 전하고자 합니다.',
    ],
    principles: [
      { title: '발견의 즐거움', description: '상품을 천천히 살펴보고 취향에 맞는 선택을 할 수 있기를 바랍니다.' },
      { title: '분명한 안내', description: '상품과 구매 정보를 찾기 쉬운 순서로 전하고자 합니다.' },
      { title: '이어지는 취향', description: '화면에서 느낀 인상이 실제 선택의 경험으로 자연스럽게 이어지길 바랍니다.' },
    ],
  },
  generic: {
    kicker: '필요한 정보를 한곳에',
    title: '무엇을 하는지 분명하게\n선택은 더 편안하게',
    heroSub: '서비스와 이용 정보를 충분히 살펴보고 자신에게 맞는 다음 행동을 정할 수 있도록 안내합니다.',
    paragraphs: [
      '처음 만나는 사람도 무엇을 하는 곳인지 편안하게 이해할 수 있기를 바랍니다.',
      '서비스와 이용 정보를 한곳에서 살펴보고 자신에게 맞는 선택을 할 수 있도록 안내합니다.',
      '브랜드가 지향하는 분위기와 태도를 과장 없이 전하고자 합니다.',
    ],
    principles: [
      { title: '알기 쉬운 안내', description: '필요한 정보를 찾기 쉬운 순서로 전하고자 합니다.' },
      { title: '편안한 선택', description: '충분히 살펴보고 자신에게 맞는 다음 행동을 고를 수 있기를 바랍니다.' },
      { title: '일관된 인상', description: '브랜드가 지향하는 분위기가 화면 전체에 자연스럽게 이어지길 바랍니다.' },
    ],
  },
};

export function honestBrandingForIndustry(industry: string): HonestBrandingCopy {
  return BRANDING_BY_GROUP[contentIndustryGroup(industry)];
}

const STORY_CONTINUATION_BY_GROUP: Record<ContentIndustryGroup, readonly string[]> = {
  cafe: [
    '한 잔을 고르고 머무는 시간이 서두르지 않아도 되는 경험이기를 바랍니다.',
    '메뉴를 만나는 순간부터 자리를 나서는 순간까지 편안한 결이 이어지길 지향합니다.',
  ],
  food: [
    '무엇을 먹을지 고르는 순간부터 식사를 마치는 순간까지 편안한 흐름을 지향합니다.',
    '메뉴의 매력은 과장된 말보다 분명한 안내와 한결같은 태도에서 전해진다고 믿습니다.',
  ],
  medical: [
    '처음 정보를 찾는 순간의 걱정을 덜고, 필요한 다음 행동을 차분히 정할 수 있기를 바랍니다.',
    '어려운 표현을 덜어내고 확인된 내용을 분명하게 전하는 태도를 중요하게 생각합니다.',
  ],
  beauty: [
    '원하는 모습을 이야기하고 자신에게 맞는 선택을 해가는 시간이 편안하기를 바랍니다.',
    '화려한 약속보다 충분히 살펴보고 결정할 수 있는 경험을 지향합니다.',
  ],
  workshop: [
    '손으로 만들며 자신의 속도에 집중하는 시간이 자연스럽게 이어지기를 바랍니다.',
    '완성된 결과뿐 아니라 재료를 만나고 과정을 익히는 순간도 소중하게 생각합니다.',
  ],
  education: [
    '배움의 시작과 과정을 이해하고 스스로 다음 단계를 고를 수 있기를 바랍니다.',
    '빠른 약속보다 꾸준히 따라갈 수 있는 분명한 안내와 태도를 지향합니다.',
  ],
  legal: [
    '복잡한 상황에서도 필요한 내용을 차근차근 이해하고 다음 행동을 정할 수 있기를 바랍니다.',
    '과장된 확신보다 확인된 정보와 이해하기 쉬운 설명을 중요하게 생각합니다.',
  ],
  retail: [
    '좋아하는 것을 발견하고 자신의 취향에 맞게 고르는 시간이 편안하기를 바랍니다.',
    '상품을 둘러보는 순간부터 선택을 마치는 순간까지 같은 분위기가 이어지길 지향합니다.',
  ],
  generic: [
    '처음 만나는 사람도 무엇을 하는 곳인지 편안하게 이해할 수 있기를 바랍니다.',
    '필요한 내용을 살펴보고 자신에게 맞는 다음 행동을 고를 수 있는 경험을 지향합니다.',
  ],
};

function narrativeParagraphs(value: string | undefined): string[] {
  return (value ?? '')
    .split(/\n\s*\n|\r?\n/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

/**
 * MAIN v1 narrative model. Customer-authored story is copied verbatim after whitespace
 * normalization; empty slots are filled only with fixed attitude/aspiration copy.
 */
export function buildMainStorytellingModel(survey: SurveyInput): MainStorytellingModel {
  const base = buildContentDepthHomeModel(survey);
  const input = survey.contentDepth?.mainStorytelling;
  const customerStory = [
    ...narrativeParagraphs(input?.brandStory),
    ...narrativeParagraphs(input?.origin),
  ];
  const customerIntroduction = base.customerIntroduction.filter(
    (paragraph) => !customerStory.includes(paragraph),
  );
  const continuations = STORY_CONTINUATION_BY_GROUP[contentIndustryGroup(survey.industry)];
  const paragraphs = customerStory.length > 0
    ? [...customerStory, ...customerIntroduction, ...base.branding.paragraphs.slice(0, 2), ...continuations]
    : [...customerIntroduction, ...base.branding.paragraphs, ...continuations];
  const valuesLead = input?.philosophy?.trim() || base.branding.paragraphs.at(-1) || base.branding.heroSub;

  return {
    kicker: customerStory.length > 0 ? '우리의 이야기' : base.branding.kicker,
    title: customerStory.length > 0 ? `${survey.businessName}의 마음이\n공간의 태도가 되기까지` : base.branding.title,
    paragraphs,
    hasCustomerStory: customerStory.length > 0,
    valuesLead,
    values: base.strengths,
  };
}

function customerIntroduction(survey: SurveyInput): string[] {
  const accepted: string[] = [];
  if (survey.tagline?.trim()) accepted.push(survey.tagline.trim());
  const sourceLines = survey.providedContent?.split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !/^\[[^\]]+\]$/u.test(line) && line !== survey.businessName) ?? [];
  for (const line of sourceLines) {
    if (accepted.includes(line) || line.length > 240) continue;
    accepted.push(line);
    if (accepted.length >= 3) break;
  }
  return accepted;
}

function uniqueCustomerGalleryImages(survey: SurveyInput): string[] {
  // URL이나 ref 단독은 권리 증거가 아니다. 신규 CONTENT 경로는 서버 검증을 거친
  // 일반 확약 ID와 URL-ref 쌍이 모두 보존된 사진만 factual 갤러리에 넣는다.
  if (!survey.generalAssetAttestationId) return [];
  const pairedUrls = new Set([
    ...(survey.storePhotoAssetRefs ?? []),
    ...(survey.importedPhotoAssetRefs ?? []),
    ...(survey.contentItems ?? []).flatMap((item) => item.photoAssetRef ? [item.photoAssetRef] : []),
  ].map((asset) => asset.url));
  const candidates = [
    ...(survey.storePhotoUrls ?? []).filter((url) => pairedUrls.has(url)),
    ...(survey.contentItems ?? []).flatMap((item) => (
      item.photoUrl && item.photoAssetRef?.url === item.photoUrl ? [item.photoUrl] : []
    )),
  ];
  return [...new Set(candidates.map((url) => url.trim()).filter(Boolean))].slice(0, 8);
}

/**
 * CONTENT v1의 홈 모델. 입력 사실과 고객 원문은 그대로 소비하고, 빈 슬롯은 만들지 않는다.
 * 나머지 문장은 검증 가능한 성과가 아니라 태도·탐색 경험만 말하는 고정 카탈로그다.
 */
export function buildContentDepthHomeModel(survey: SurveyInput): ContentDepthHomeModel {
  const facts = resolveBusinessFacts(survey.contentDepth?.facts ?? []);
  const branding = honestBrandingForIndustry(survey.industry);
  const customerStrengths = (survey.highlights ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 3);
  const strengths = customerStrengths.length > 0
    ? customerStrengths.map((title) => ({
        title,
        description: `사장님이 직접 알려주신 ‘${title}’을 중심으로 소개합니다.`,
      }))
    : [...branding.principles];
  const contentItems = (survey.contentItems ?? [])
    .map((item) => ({
      name: item.name.trim(),
      ...(item.price?.trim() ? { price: item.price.trim() } : {}),
      ...(item.description?.trim() ? { description: item.description.trim() } : {}),
    }))
    .filter((item) => item.name);
  const factRow = (key: BusinessFactKey): { label: string; value: string }[] => {
    const label = FACT_LABELS[key];
    const value = facts[key];
    return label && value ? [{ label, value }] : [];
  };
  return {
    branding,
    customerIntroduction: customerIntroduction(survey),
    strengths,
    contentItems,
    galleryImages: uniqueCustomerGalleryImages(survey),
    faq: resolveGuidedFaqAnswers(survey.industry, survey.contentDepth?.faqAnswers ?? [])
      .map(({ question, answer }) => ({ question, answer })),
    directions: [
      ...factRow('address'),
      ...factRow('directions'),
      ...factRow('parking'),
      ...factRow('accessibility'),
    ],
    contact: [
      ...factRow('phone'),
      ...factRow('openingHours'),
      ...factRow('reservation'),
      ...factRow('paymentMethods'),
      ...factRow('pets'),
      ...factRow('wifi'),
    ],
  };
}

export function missingRequiredFacts(facts: readonly BusinessFactAnswer[]): BusinessFactKey[] {
  const answered = new Set(facts.filter((fact) => fact.value.trim()).map((fact) => fact.key));
  return REQUIRED_BUSINESS_FACT_KEYS.filter((key) => !answered.has(key));
}
