/**
 * 디자인 지식 큐레이션 데이터 — 파생·큐레이션본 (원본 그대로의 복제가 아님).
 *
 * 출처 및 라이선스:
 * - frontend-design 스킬 (Apache-2.0, © Anthropic):
 *   디자인 원칙(관점·타이포·절제·위계·카피)의 정신을 design-knowledge.ts 에서 우리말로 재서술.
 * - ui-ux-pro-max 스킬 데이터 (MIT, © NextLevelBuilder):
 *   styles.csv / colors.csv / typography.csv / products.csv / landing.csv 에서
 *   한국 소상공인 업종(레스토랑·카페·뷰티·세탁·의료·피트니스·부동산·법률·교육 등)에
 *   맞게 발췌하고, 우리 SiteTheme 6키 팔레트·한글 폰트 폴백 체인·SectionType 으로 손질했다.
 *
 * 이 파일은 순수 데이터만 담는다. 런타임 의존성 0 (계약 타입 import type 만 사용).
 * 선택 로직·프롬프트는 design-knowledge.ts 참조.
 */
import type { SiteTheme, SectionType } from '@/lib/types/site';
import type { CandidateStyle } from '@/lib/types/domain';
import {
  KOREAN_FONT_PAIRING_CATALOG_VERSION,
  LATIN_FONT_PAIRING_CATALOG_VERSION,
  US_LATIN_FONT_SELECTION_POLICY,
  type LatinFontPairingSlotManifest,
  type ProductionKoreanFontManifest,
} from '@/lib/fonts/types';

// ---------- 타입 ----------

/** 큐레이션된 컬러 팔레트 — palette 는 SiteTheme.palette 6키에 그대로 매핑된다. */
export interface CuratedPalette {
  id: string;
  /** 한국어 표시명 */
  name: string;
  /** 업종 매칭 어휘 (한국어 어간 위주 — '세탁소'의 '세탁'처럼 부분일치로 잡는다) */
  industries: string[];
  /** 무드 어휘 (설문 톤·컬러 선호와 부분일치, StyleDirection.paletteMood 와 정확히 일치하는 어휘 사용) */
  mood: string[];
  /** 다크 배경 여부 — 3안 다양성 보장(다크/라이트 혼합)에 사용 */
  dark: boolean;
  palette: SiteTheme['palette'];
}

/** 한국어 렌더링을 보장하는 폰트 페어링 (라틴 디스플레이 + 한글 폴백 체인) */
export interface FontPairing {
  id: string;
  /**
   * 기존 미지정 항목은 legacy 생성·에디터에서 계속 소비한다. FNT 신규 세트는 명시적 opt-in
   * 경로에서만 발급하며 기존 자유 pair enum에 섞지 않는다.
   */
  availability?: 'new-opt-in' | 'locale-opt-in';
  /** 한국어 표시명 */
  name: string;
  /** 무드 어휘 — StyleDirection.fontMood 와 정확히 일치하는 어휘 사용 */
  mood: string[];
  /** 어울리는 업종/용도 */
  bestFor: string[];
  /** CSS font-family 전체 체인 (헤딩) */
  heading: string;
  /** CSS font-family 전체 체인 (본문) */
  body: string;
  /**
   * 로드할 Google Fonts 패밀리명.
   * 주의: Pretendard 는 Google Fonts 에 없다 — 렌더러가 CDN 에서 자동 로드하므로 여기 넣지 않는다.
   */
  googleFonts: string[];
  /** FNT 역할·조판·라이선스 계약. legacy 항목에는 없으며 기존 동작을 바꾸지 않는다. */
  productionManifest?: ProductionKoreanFontManifest;
  /** US-DEMO locale slot. Asset-pending entries are not issued without an approved fallback. */
  latinProductionManifest?: LatinFontPairingSlotManifest;
}

/** 스타일 방향 — 1차 가공(AI 디자인 후보)의 비주얼 방향성 */
export interface StyleDirection {
  id: string;
  /** 한국어 표시명 */
  name: string;
  /** 설문 매칭 어휘 (한국어 어간 + 영어) */
  keywords: string[];
  /** 우리 계약 CandidateStyle 과 일치 ('photo' | '3d_render' | 'illustration') */
  candidateStyle: CandidateStyle;
  /** 히어로 이미지 생성 프롬프트에 붙일 영어 스타일 조각 */
  heroImageFragment: string;
  /** 섹션 이미지 생성 프롬프트에 붙일 영어 스타일 조각 */
  sectionImageFragment: string;
  /** CURATED_PALETTES.mood 와 매칭 가능한 어휘 */
  paletteMood: string[];
  /** FONT_PAIRINGS.mood 와 매칭 가능한 어휘 */
  fontMood: string[];
  /** 시각 효과 방향 설명 (customCss 힌트가 아님 — 사람/AI가 읽는 가이드) */
  effectsNote: string;
  bestFor: string[];
  avoid: string[];
}

/** 랜딩 섹션 구성 패턴 — landing.csv 의 섹션 순서를 우리 SectionType 으로 매핑 */
export interface LandingPattern {
  id: string;
  /** 한국어 표시명 */
  name: string;
  keywords: string[];
  sections: SectionType[];
}

// ---------- 팔레트 (colors.csv 큐레이션: Background→background, Card→surface,
//            Foreground→text, Muted Foreground→muted, Primary→primary, Accent→accent) ----------

export const CURATED_PALETTES: CuratedPalette[] = [
  {
    id: 'charcoal-amber',
    name: '차콜 앰버',
    industries: ['숯불', '구이', '고깃집', '바베큐', '그릴', '스테이크', '다이닝', '레스토랑', '식당', '와인바', '오마카세'],
    mood: ['고급', '럭셔리', '무디', '다크', '아늑', '따뜻', '골드', '블랙', 'luxury', 'moody'],
    dark: true,
    palette: {
      background: '#141210',
      surface: '#1f1b17',
      text: '#f3ede2',
      muted: '#9c907c',
      primary: '#c89b5f',
      accent: '#8a3324',
    },
  },
  {
    id: 'midnight-spotlight',
    name: '미드나잇 스포트라이트',
    industries: ['공연', '이벤트', '클럽', '라운지', '칵테일', '극장', '재즈'],
    mood: ['드라마틱', '고급', '다크', '시크', '골드', '네이비'],
    dark: true,
    palette: {
      background: '#0f0f23',
      surface: '#1b1b30',
      text: '#f8fafc',
      muted: '#94a3b8',
      primary: '#d4a017',
      accent: '#4338ca',
    },
  },
  {
    id: 'burgundy-craft',
    name: '버건디 크래프트',
    industries: ['와인', '브루어리', '양조', '전통주', '정육', '비스트로', '위스키'],
    mood: ['빈티지', '클래식', '따뜻', '헤리티지', '전통', '버건디', '레드'],
    dark: false,
    palette: {
      background: '#fdf4f2',
      surface: '#ffffff',
      text: '#450a0a',
      muted: '#8f7a70',
      primary: '#7c2d12',
      accent: '#a16207',
    },
  },
  {
    id: 'warm-bakery',
    name: '웜 베이커리 크림',
    industries: ['베이커리', '빵', '디저트', '브런치', '카페', '케이크', '도넛'],
    mood: ['따뜻', '아늑', '수제', '코지', '내추럴', '브라운', '크림'],
    dark: false,
    palette: {
      background: '#fdf6ec',
      surface: '#ffffff',
      text: '#4e3419',
      muted: '#a08a6e',
      primary: '#92400e',
      accent: '#d97706',
    },
  },
  {
    id: 'espresso-dark',
    name: '에스프레소 다크',
    industries: ['카페', '커피', '로스터리', '디저트', '라운지'],
    mood: ['무디', '아늑', '다크', '수제', '따뜻', '브라운'],
    dark: true,
    palette: {
      background: '#1c1613',
      surface: '#292019',
      text: '#f0e6d8',
      muted: '#a3927e',
      primary: '#c08552',
      accent: '#a3552e',
    },
  },
  {
    id: 'fresh-mint',
    name: '프레시 민트',
    industries: ['세탁', '크리닝', '청소', '정리', '생활서비스', '빨래', '홈케어'],
    mood: ['클린', '깔끔', '프레시', '상쾌', '위생', '민트', '그린', 'clean', 'fresh'],
    dark: false,
    palette: {
      background: '#f0fdfa',
      surface: '#ffffff',
      text: '#134e4a',
      muted: '#6b7f7c',
      primary: '#0d9488',
      accent: '#ea580c',
    },
  },
  {
    id: 'sky-clean',
    name: '스카이 클린',
    industries: ['수리', '설비', '인테리어', '이사', '시공', '전기', '배관', '방충'],
    mood: ['신뢰', '깔끔', '프로페셔널', '클린', '블루'],
    dark: false,
    palette: {
      background: '#eff6ff',
      surface: '#ffffff',
      text: '#1e3a8a',
      muted: '#64748b',
      primary: '#1e40af',
      accent: '#ea580c',
    },
  },
  {
    id: 'soft-blush',
    name: '소프트 블러시',
    industries: ['뷰티', '네일', '스킨', '에스테틱', '왁싱', '메이크업', '속눈썹', '피부관리'],
    mood: ['부드러움', '부드러운', '로맨틱', '화사', '우아', '핑크', '파스텔'],
    dark: false,
    palette: {
      background: '#fdf2f8',
      surface: '#ffffff',
      text: '#831843',
      muted: '#9d8290',
      primary: '#ec4899',
      accent: '#8b5cf6',
    },
  },
  {
    id: 'salon-noir',
    name: '살롱 느와르',
    industries: ['헤어', '살롱', '바버', '미용실', '스타일링'],
    mood: ['시크', '고급', '모던', '다크', '세련', '골드', '샴페인'],
    dark: true,
    palette: {
      background: '#171314',
      surface: '#231c1e',
      text: '#f5eff1',
      muted: '#a08e94',
      primary: '#d4af7a',
      accent: '#b06478',
    },
  },
  {
    id: 'clinic-teal',
    name: '클리닉 틸',
    industries: ['병원', '의원', '클리닉', '치과', '한의원', '약국', '피부과', '정형', '검진'],
    mood: ['신뢰', '차분', '클린', '전문', '안심', '틸'],
    dark: false,
    palette: {
      background: '#f0fdfa',
      surface: '#ffffff',
      text: '#134e4a',
      muted: '#647f7b',
      primary: '#0891b2',
      accent: '#16a34a',
    },
  },
  {
    id: 'fit-ember',
    name: '피트 엠버',
    industries: ['피트니스', '헬스', '크로스핏', '복싱', '주짓수', '퍼스널트레이닝', '수영'],
    mood: ['에너지', '강렬', '다크', '다이내믹', '파워', '오렌지'],
    dark: true,
    palette: {
      background: '#1f2937',
      surface: '#2b3442',
      text: '#f8fafc',
      muted: '#94a3b8',
      primary: '#f97316',
      accent: '#22c55e',
    },
  },
  {
    id: 'hotel-navy',
    name: '호텔 네이비 골드',
    industries: ['호텔', '펜션', '숙박', '스테이', '리조트', '공간대여', '레지던스'],
    mood: ['고급', '신뢰', '클래식', '품격', '네이비', '골드'],
    dark: false,
    palette: {
      background: '#f8fafc',
      surface: '#ffffff',
      text: '#172554',
      muted: '#64748b',
      primary: '#1e3a8a',
      accent: '#a16207',
    },
  },
  {
    id: 'trust-teal',
    name: '트러스트 틸',
    industries: ['부동산', '중개', '자산', '컨설팅', '재무', '분양'],
    mood: ['신뢰', '안정', '전문', '모던', '틸', '그린'],
    dark: false,
    palette: {
      background: '#f4faf9',
      surface: '#ffffff',
      text: '#134e4a',
      muted: '#6a7f7a',
      primary: '#0f766e',
      accent: '#0369a1',
    },
  },
  {
    id: 'law-navy',
    name: '로펌 네이비',
    industries: ['법률', '변호사', '법무', '회계', '세무', '노무', '특허', '행정사'],
    mood: ['권위', '신뢰', '전문', '포멀', '클래식', '네이비'],
    dark: false,
    palette: {
      background: '#f8fafc',
      surface: '#ffffff',
      text: '#0f172a',
      muted: '#64748b',
      primary: '#1e3a8a',
      accent: '#b45309',
    },
  },
  {
    id: 'edu-indigo',
    name: '러닝 인디고',
    industries: ['학원', '교육', '과외', '스터디', '코칭', '입시', '어학', '독서실'],
    mood: ['활기', '명료', '성장', '플레이풀', '모던', '인디고', '블루'],
    dark: false,
    palette: {
      background: '#eef2ff',
      surface: '#ffffff',
      text: '#1e1b4b',
      muted: '#6f7290',
      primary: '#4f46e5',
      accent: '#ea580c',
    },
  },
  {
    id: 'kids-sunny',
    name: '키즈 서니',
    industries: ['키즈', '유치원', '어린이', '놀이', '체험', '돌봄', '유아'],
    mood: ['플레이풀', '밝음', '밝은', '친근', '명랑', '옐로'],
    dark: false,
    palette: {
      background: '#fef9ec',
      surface: '#ffffff',
      text: '#292524',
      muted: '#8d8577',
      primary: '#f59e0b',
      accent: '#2563eb',
    },
  },
  {
    id: 'market-green',
    name: '마켓 그린',
    industries: ['마켓', '식료품', '청과', '반찬', '정육점', '로컬푸드', '리테일', '편집숍'],
    mood: ['프레시', '활기', '신선', '클린', '그린'],
    dark: false,
    palette: {
      background: '#ecfdf5',
      surface: '#ffffff',
      text: '#064e3b',
      muted: '#6b8078',
      primary: '#059669',
      accent: '#ea580c',
    },
  },
  {
    id: 'pet-tangerine',
    name: '펫 탠저린',
    industries: ['펫', '애견', '반려', '동물', '펫호텔', '펫미용', '고양이', '강아지'],
    mood: ['플레이풀', '따뜻', '친근', '명랑', '오렌지'],
    dark: false,
    palette: {
      background: '#fff7ed',
      surface: '#ffffff',
      text: '#7c2d12',
      muted: '#9a8578',
      primary: '#f97316',
      accent: '#2563eb',
    },
  },
  {
    id: 'botanic-green',
    name: '보태닉 그린',
    industries: ['플라워', '꽃', '플랜테리어', '원예', '가드닝', '화원', '식물'],
    mood: ['내추럴', '싱그러움', '프레시', '보태니컬', '그린', '핑크'],
    dark: false,
    palette: {
      background: '#f0fdf4',
      surface: '#ffffff',
      text: '#14532d',
      muted: '#71836f',
      primary: '#15803d',
      accent: '#ec4899',
    },
  },
  {
    id: 'terra-clay',
    name: '테라코타 클레이',
    industries: ['공방', '도자기', '수공예', '소품', '아틀리에', '가죽', '목공', '캔들'],
    mood: ['어스', '내추럴', '수제', '따뜻', '오가닉', '아르티장', '테라코타', '베이지'],
    dark: false,
    palette: {
      background: '#f5f0e6',
      surface: '#fdfaf3',
      text: '#3d2f24',
      muted: '#9b8a75',
      primary: '#b05c3a',
      accent: '#7d8c5c',
    },
  },
  {
    id: 'sage-calm',
    name: '세이지 카밍',
    industries: ['요가', '명상', '웰니스', '스파', '마사지', '테라피', '필라테스'],
    mood: ['차분', '휴식', '내추럴', '부드러움', '미니멀', '세이지', '그린'],
    dark: false,
    palette: {
      background: '#f4f5f0',
      surface: '#ffffff',
      text: '#2f3630',
      muted: '#8b948a',
      primary: '#5f7161',
      accent: '#b08d57',
    },
  },
  {
    id: 'mono-gallery',
    name: '모노 갤러리',
    industries: ['사진', '스튜디오', '갤러리', '포트폴리오', '건축', '전시'],
    mood: ['미니멀', '모노크롬', '모던', '시크', '드라마틱', '블랙'],
    dark: true,
    palette: {
      background: '#0a0a0a',
      surface: '#161616',
      text: '#fafafa',
      muted: '#9ca3af',
      primary: '#f5f5f5',
      accent: '#d4d4d4',
    },
  },
  {
    id: 'paper-editorial',
    name: '페이퍼 에디토리얼',
    industries: ['매거진', '블로그', '에이전시', '작가', '디자인', '출판', '브랜딩'],
    mood: ['에디토리얼', '미니멀', '모던', '타이포', '모노크롬', '화이트'],
    dark: false,
    palette: {
      background: '#fafafa',
      surface: '#ffffff',
      text: '#09090b',
      muted: '#71717a',
      primary: '#18181b',
      accent: '#ec4899',
    },
  },
  {
    id: 'hanok-ink',
    name: '한옥 먹빛',
    industries: ['한식', '한정식', '찻집', '전통', '한복', '국악', '다도', '한과'],
    mood: ['전통', '고요', '내추럴', '헤리티지', '차분', '먹색', '그린'],
    dark: false,
    palette: {
      background: '#f7f3ea',
      surface: '#fffdf6',
      text: '#26221c',
      muted: '#8e8474',
      primary: '#2f4a43',
      accent: '#b0492f',
    },
  },
  {
    id: 'ocean-breeze',
    name: '오션 브리즈',
    industries: ['여행', '리조트', '서핑', '레저', '다이빙', '요트', '게스트하우스'],
    mood: ['프레시', '활기', '청량', '밝음', '블루', '스카이'],
    dark: false,
    palette: {
      background: '#f0f9ff',
      surface: '#ffffff',
      text: '#0c4a6e',
      muted: '#64748b',
      primary: '#0ea5e9',
      accent: '#ea580c',
    },
  },
  {
    id: 'wedding-blush',
    name: '웨딩 블러시 골드',
    industries: ['웨딩', '스냅', '스드메', '파티', '플래너', '돌잔치', '청첩'],
    mood: ['로맨틱', '우아', '화사', '부드러움', '핑크', '골드'],
    dark: false,
    palette: {
      background: '#fbf3f0',
      surface: '#ffffff',
      text: '#831843',
      muted: '#9d8290',
      primary: '#db2777',
      accent: '#a16207',
    },
  },
  {
    id: 'barber-slate',
    name: '바버 슬레이트',
    industries: ['바버', '타투', '오토', '바이크', '정비', '펍', '당구'],
    mood: ['강렬', '빈티지', '다크', '마스큘린', '레트로', '레드'],
    dark: true,
    palette: {
      background: '#141821',
      surface: '#1e242f',
      text: '#f1f5f9',
      muted: '#94a3b8',
      primary: '#d64545',
      accent: '#8b98a8',
    },
  },
  {
    id: 'retro-cream',
    name: '레트로 크림 틸',
    industries: ['수제버거', '레코드', '빈티지', '경양식', '호프', '분식', '떡볶이'],
    mood: ['레트로', '빈티지', '아날로그', '따뜻', '노스탤지어', '크림', '틸'],
    dark: false,
    palette: {
      background: '#f5e9cf',
      surface: '#fdf6e3',
      text: '#3f3428',
      muted: '#94815f',
      primary: '#4a7b7c',
      accent: '#c96f52',
    },
  },
  {
    id: 'aurora-lavender',
    name: '오로라 라벤더',
    industries: ['스튜디오', '디자인', '키즈', '문화센터', '공연', '앱'],
    mood: ['플레이풀', '파스텔', '부드러움', '크리에이티브', '몽환', '퍼플', '라벤더'],
    dark: false,
    palette: {
      background: '#faf5ff',
      surface: '#ffffff',
      text: '#3b2e58',
      muted: '#8f87a8',
      primary: '#8b5cf6',
      accent: '#f59e0b',
    },
  },
  {
    id: 'deep-forest',
    name: '딥 포레스트',
    industries: ['캠핑', '글램핑', '팜', '오가닉', '비건', '수목원', '농장'],
    mood: ['내추럴', '다크', '오가닉', '고요', '어스', '그린'],
    dark: true,
    palette: {
      background: '#0f1712',
      surface: '#18221a',
      text: '#eef2e9',
      muted: '#93a08e',
      primary: '#a3b18a',
      accent: '#d4a373',
    },
  },
];

// ---------- 폰트 페어링 (typography.csv 큐레이션 + 한글 폴백 체인 필수) ----------

export const FONT_PAIRINGS: FontPairing[] = [
  {
    id: 'us-clinical-neutral',
    availability: 'locale-opt-in',
    name: 'US Clinical Neutral',
    mood: ['clinical', 'neutral', 'professional', 'legible'],
    bestFor: ['US medical demo'],
    heading: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    body: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    googleFonts: [],
    latinProductionManifest: {
      catalogVersion: LATIN_FONT_PAIRING_CATALOG_VERSION,
      locale: 'en-US',
      status: 'asset-pending',
      selectionPolicy: US_LATIN_FONT_SELECTION_POLICY,
      assetVersion: 0,
      description: 'August MVP slot for a designer-curated clinical neutral Latin pairing.',
      heading: {
        family: 'system-ui',
        fallbackChain: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      body: {
        family: 'system-ui',
        fallbackChain: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      control: {
        family: 'system-ui',
        fallbackChain: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      dnaAffinity: {
        'cafe-warm-editorial': 'deferred',
        'dining-refined-contrast': 'deferred',
        'beauty-soft-wellness': 'deferred',
        'medical-clinical-clarity': 'recommended',
        'legal-authoritative-editorial': 'deferred',
        'workshop-tactile-heritage': 'deferred',
        'academy-structured-friendly': 'deferred',
        'retail-bold-geometric': 'deferred',
      },
      performanceBudget: {
        firstScreenTargetBytes: 122880,
        firstScreenMaxBytes: 204800,
        exportTargetBytes: 307200,
        exportMaxBytes: 614400,
        familyMax: 2,
        faceMax: 4,
      },
    },
  },
  {
    id: 'playfair-classic',
    name: '플레이페어 클래식',
    mood: ['고급', '우아', '클래식', '에디토리얼', '럭셔리'],
    bestFor: ['레스토랑', '호텔', '웨딩', '뷰티', '다이닝'],
    heading: "'Playfair Display', 'Noto Serif KR', serif",
    body: "'Pretendard', 'Noto Sans KR', sans-serif",
    googleFonts: ['Playfair Display', 'Noto Serif KR', 'Noto Sans KR'],
  },
  {
    id: 'cormorant-luxe',
    name: '코모란트 럭스',
    mood: ['럭셔리', '우아', '하이엔드', '섬세'],
    bestFor: ['부티크', '주얼리', '스파', '파인다이닝', '오마카세'],
    heading: "'Cormorant Garamond', 'Nanum Myeongjo', serif",
    body: "'Pretendard', 'Noto Sans KR', sans-serif",
    googleFonts: ['Cormorant Garamond', 'Nanum Myeongjo', 'Noto Sans KR'],
  },
  {
    id: 'song-myung-heritage',
    name: '송명 헤리티지',
    mood: ['전통', '헤리티지', '고요', '문학', '세리프'],
    bestFor: ['한식', '찻집', '공방', '전통주', '한복'],
    heading: "'Song Myung', 'Nanum Myeongjo', serif",
    body: "'Gowun Dodum', 'Noto Sans KR', sans-serif",
    googleFonts: ['Song Myung', 'Nanum Myeongjo', 'Gowun Dodum', 'Noto Sans KR'],
  },
  {
    id: 'gowun-batang-literary',
    name: '고운바탕 리터러리',
    mood: ['차분', '문학', '내추럴', '부드러움'],
    bestFor: ['서점', '갤러리', '에세이', '웰니스', '요가'],
    heading: "'Gowun Batang', 'Noto Serif KR', serif",
    body: "'Gowun Dodum', 'Noto Sans KR', sans-serif",
    googleFonts: ['Gowun Batang', 'Noto Serif KR', 'Gowun Dodum', 'Noto Sans KR'],
  },
  {
    id: 'bodoni-mode',
    name: '보도니 모드',
    mood: ['하이패션', '미니멀', '시크', '모노크롬', '에디토리얼'],
    bestFor: ['패션', '사진', '포트폴리오', '살롱', '스튜디오'],
    heading: "'Bodoni Moda', 'Noto Serif KR', serif",
    body: "'Pretendard', 'IBM Plex Sans KR', sans-serif",
    googleFonts: ['Bodoni Moda', 'Noto Serif KR', 'IBM Plex Sans KR'],
  },
  {
    id: 'abril-retro',
    name: '아브릴 레트로',
    mood: ['레트로', '빈티지', '드라마틱', '볼드'],
    bestFor: ['브루어리', '수제버거', '레코드', '카페', '펍'],
    heading: "'Abril Fatface', 'Black Han Sans', serif",
    body: "'Gowun Dodum', 'Noto Sans KR', sans-serif",
    googleFonts: ['Abril Fatface', 'Black Han Sans', 'Gowun Dodum', 'Noto Sans KR'],
  },
  {
    id: 'space-grotesk-tech',
    name: '스페이스 그로테스크',
    mood: ['모던', '테크', '미니멀', '기하학'],
    bestFor: ['스타트업', '스튜디오', '에이전시', 'IT', '제품'],
    heading: "'Space Grotesk', 'IBM Plex Sans KR', sans-serif",
    body: "'Pretendard', 'IBM Plex Sans KR', sans-serif",
    googleFonts: ['Space Grotesk', 'IBM Plex Sans KR'],
  },
  {
    id: 'outfit-geometric',
    name: '아웃핏 지오메트릭',
    mood: ['모던', '깔끔', '신뢰', '범용', '미니멀'],
    bestFor: ['리테일', '서비스', '부동산', '교육', '컨설팅'],
    heading: "'Outfit', 'Gothic A1', sans-serif",
    body: "'Pretendard', 'Noto Sans KR', sans-serif",
    googleFonts: ['Outfit', 'Gothic A1', 'Noto Sans KR'],
  },
  {
    id: 'bebas-impact',
    name: '베바스 임팩트',
    mood: ['강렬', '볼드', '에너지', '스포티'],
    bestFor: ['피트니스', '스포츠', '이벤트', '바버'],
    heading: "'Bebas Neue', 'Black Han Sans', sans-serif",
    body: "'Pretendard', 'Noto Sans KR', sans-serif",
    googleFonts: ['Bebas Neue', 'Black Han Sans', 'Noto Sans KR'],
  },
  {
    id: 'fredoka-playful',
    name: '프레도카 플레이풀',
    mood: ['플레이풀', '친근', '명랑', '귀여움'],
    bestFor: ['키즈', '펫', '디저트', '놀이', '체험'],
    heading: "'Fredoka', 'Jua', sans-serif",
    body: "'Gowun Dodum', 'Noto Sans KR', sans-serif",
    googleFonts: ['Fredoka', 'Jua', 'Gowun Dodum', 'Noto Sans KR'],
  },
  {
    id: 'lora-wellness',
    name: '로라 웰니스',
    mood: ['차분', '내추럴', '휴식', '오가닉', '우아'],
    bestFor: ['요가', '스파', '웰니스', '플라워', '명상'],
    heading: "'Lora', 'Gowun Batang', serif",
    body: "'Pretendard', 'Noto Sans KR', sans-serif",
    googleFonts: ['Lora', 'Gowun Batang', 'Noto Sans KR'],
  },
  {
    id: 'ibm-plex-trust',
    name: 'IBM 플렉스 트러스트',
    mood: ['신뢰', '전문', '포멀', '안정', '깔끔'],
    bestFor: ['법률', '회계', '의료', '컨설팅', '금융'],
    heading: "'IBM Plex Sans KR', 'Noto Sans KR', sans-serif",
    body: "'IBM Plex Sans KR', 'Noto Sans KR', sans-serif",
    googleFonts: ['IBM Plex Sans KR', 'Noto Sans KR'],
  },
  {
    id: 'garamond-counsel',
    name: '가라몬드 카운슬',
    mood: ['권위', '클래식', '포멀', '신뢰', '문학'],
    bestFor: ['법률', '로펌', '학술', '금융', '세무'],
    heading: "'EB Garamond', 'Nanum Myeongjo', serif",
    body: "'Pretendard', 'Noto Sans KR', sans-serif",
    googleFonts: ['EB Garamond', 'Nanum Myeongjo', 'Noto Sans KR'],
  },
  {
    id: 'cinzel-estate',
    name: '친젤 에스테이트',
    mood: ['품격', '럭셔리', '클래식', '건축', '고급'],
    bestFor: ['부동산', '호텔', '건축', '갤러리', '리조트'],
    heading: "'Cinzel', 'Song Myung', serif",
    body: "'Pretendard', 'Noto Sans KR', sans-serif",
    googleFonts: ['Cinzel', 'Song Myung', 'Noto Sans KR'],
  },
  {
    id: 'syne-avantgarde',
    name: '신 아방가르드',
    mood: ['아방가르드', '크리에이티브', '엣지', '모던', '타이포'],
    bestFor: ['에이전시', '갤러리', '디자인', '패션', '전시'],
    heading: "'Syne', 'Gothic A1', sans-serif",
    body: "'Pretendard', 'IBM Plex Sans KR', sans-serif",
    googleFonts: ['Syne', 'Gothic A1', 'IBM Plex Sans KR'],
  },
  {
    id: 'caveat-handmade',
    name: '카베아트 핸드메이드',
    mood: ['수제', '손글씨', '따뜻', '퍼스널', '친근'],
    bestFor: ['공방', '베이커리', '소품', '브런치', '캔들'],
    heading: "'Caveat', 'Nanum Pen Script', cursive",
    body: "'Gowun Dodum', 'Noto Sans KR', sans-serif",
    googleFonts: ['Caveat', 'Nanum Pen Script', 'Gowun Dodum', 'Noto Sans KR'],
  },
  {
    id: 'barlow-athletic',
    name: '발로우 애슬레틱',
    mood: ['스포티', '다이내믹', '콘덴스드', '에너지', '강렬'],
    bestFor: ['피트니스', '크로스핏', '러닝', '아웃도어', '복싱'],
    heading: "'Barlow Condensed', 'Gothic A1', sans-serif",
    body: "'Pretendard', 'Noto Sans KR', sans-serif",
    googleFonts: ['Barlow Condensed', 'Gothic A1', 'Noto Sans KR'],
  },
  {
    id: 'hahmlet-editorial',
    name: '함렛 에디토리얼',
    mood: ['에디토리얼', '모던', '세리프', '타이포', '차분'],
    bestFor: ['매거진', '스튜디오', '카페', '브랜딩', '출판'],
    heading: "'Hahmlet', 'Noto Serif KR', serif",
    body: "'Pretendard', 'Noto Sans KR', sans-serif",
    googleFonts: ['Hahmlet', 'Noto Serif KR', 'Noto Sans KR'],
  },
  {
    id: 'kr-pretendard-neutral',
    availability: 'new-opt-in',
    name: '프리텐다드 뉴트럴',
    mood: ['중립', '명료', '현대적', '빠른 판독'],
    bestFor: ['의료', '법률', '컨설팅', '교육', '리테일', '포트폴리오'],
    heading: "'Pretendard Variable', Pretendard, 'Noto Sans KR', system-ui, sans-serif",
    body: "'Pretendard Variable', Pretendard, 'Noto Sans KR', system-ui, sans-serif",
    googleFonts: [],
    productionManifest: {
      catalogVersion: KOREAN_FONT_PAIRING_CATALOG_VERSION,
      status: 'production-ready',
      description: '한 가족의 굵기 대비만으로 빠르고 중립적인 정보 위계를 만드는 범용 기본값.',
      heading: {
        family: 'Pretendard Variable',
        weights: [700, 800],
        source: 'pretendard-v1.3.9-official',
        fallbackChain: ['Pretendard', 'Noto Sans KR', 'system-ui', 'sans-serif'],
      },
      body: {
        family: 'Pretendard Variable',
        weights: [400, 500],
        source: 'pretendard-v1.3.9-official',
        fallbackChain: ['Pretendard', 'Noto Sans KR', 'system-ui', 'sans-serif'],
      },
      control: {
        family: 'Pretendard Variable',
        weights: [600],
        source: 'pretendard-v1.3.9-official',
        fallbackChain: ['Pretendard', 'Noto Sans KR', 'system-ui', 'sans-serif'],
      },
      typography: {
        display: { tracking: 'tracking.kr-tight-2', leading: 'leading.display-compact' },
        heading: { tracking: 'tracking.kr-tight-1', leading: 'leading.heading-compact' },
        lead: { tracking: 'tracking.kr-body-snug', leading: 'leading.lead-readable' },
        body: { tracking: 'tracking.kr-body-snug', leading: 'leading.body-readable' },
        control: { tracking: 'tracking.control-snug', leading: 'leading.control-single' },
      },
      dnaAffinity: {
        'cafe-warm-editorial': 'allowed',
        'dining-refined-contrast': 'blocked',
        'beauty-soft-wellness': 'allowed',
        'medical-clinical-clarity': 'recommended',
        'legal-authoritative-editorial': 'recommended',
        'workshop-tactile-heritage': 'blocked',
        'academy-structured-friendly': 'recommended',
        'retail-bold-geometric': 'allowed',
      },
      industryRouting: {
        primary: ['medical', 'legal', 'consulting', 'academy'],
        secondary: ['beauty', 'retail', 'portfolio'],
        blocked: ['fine_dining', 'workshop'],
      },
      // Official license: https://github.com/orioncactus/pretendard/blob/main/LICENSE
      licenseAssetIds: ['license-pretendard-ofl-1.1'],
    },
  },
  {
    id: 'kr-nanum-myeongjo-readable',
    availability: 'new-opt-in',
    name: '나눔명조 리더블',
    mood: ['차분', '인문적', '신뢰', '따뜻한 편집감'],
    bestFor: ['카페', '파인다이닝', '법률', '공방', '컨설팅', '뷰티'],
    heading: "'Nanum Myeongjo', 'Noto Serif KR', serif",
    body: "'Pretendard Variable', Pretendard, 'Noto Sans KR', system-ui, sans-serif",
    googleFonts: [],
    productionManifest: {
      catalogVersion: KOREAN_FONT_PAIRING_CATALOG_VERSION,
      status: 'production-ready',
      description: '한국어 명조 제목의 신뢰와 온기를 Pretendard 본문의 현대적 판독성으로 받친다.',
      heading: {
        family: 'Nanum Myeongjo',
        weights: [700, 800],
        source: 'nanum-myeongjo-official',
        fallbackChain: ['Noto Serif KR', 'serif'],
      },
      body: {
        family: 'Pretendard Variable',
        weights: [400, 500],
        source: 'pretendard-v1.3.9-official',
        fallbackChain: ['Pretendard', 'Noto Sans KR', 'system-ui', 'sans-serif'],
      },
      control: {
        family: 'Pretendard Variable',
        weights: [600],
        source: 'pretendard-v1.3.9-official',
        fallbackChain: ['Pretendard', 'Noto Sans KR', 'system-ui', 'sans-serif'],
      },
      typography: {
        display: { tracking: 'tracking.kr-tight-1', leading: 'leading.heading-comfort' },
        heading: { tracking: 'tracking.kr-tight-1', leading: 'leading.heading-comfort' },
        lead: { tracking: 'tracking.kr-neutral', leading: 'leading.lead-readable' },
        body: { tracking: 'tracking.kr-body-snug', leading: 'leading.body-editorial' },
        control: { tracking: 'tracking.control-snug', leading: 'leading.control-single' },
      },
      dnaAffinity: {
        'cafe-warm-editorial': 'recommended',
        'dining-refined-contrast': 'recommended',
        'beauty-soft-wellness': 'allowed',
        'medical-clinical-clarity': 'blocked',
        'legal-authoritative-editorial': 'recommended',
        'workshop-tactile-heritage': 'recommended',
        'academy-structured-friendly': 'blocked',
        'retail-bold-geometric': 'blocked',
      },
      industryRouting: {
        primary: ['cafe', 'fine_dining', 'legal', 'workshop'],
        secondary: ['consulting', 'beauty', 'portfolio'],
        blocked: ['medical', 'retail', 'academy'],
      },
      // Official licenses:
      // https://hangeul.naver.com/font
      // https://github.com/orioncactus/pretendard/blob/main/LICENSE
      licenseAssetIds: ['license-naver-nanum', 'license-pretendard-ofl-1.1'],
    },
  },
  {
    id: 'kr-gmarket-noto-structured',
    availability: 'new-opt-in',
    name: 'G마켓 구조형',
    mood: ['구조적', '기하학적', '밝음', '선명한 상업성'],
    bestFor: ['리테일', '교육', '카페', '포트폴리오', '컨설팅'],
    heading: "'Gmarket Sans', 'Noto Sans KR', system-ui, sans-serif",
    body: "'Noto Sans KR', system-ui, sans-serif",
    googleFonts: [],
    productionManifest: {
      catalogVersion: KOREAN_FONT_PAIRING_CATALOG_VERSION,
      status: 'production-ready',
      description: '직선적인 Gmarket Sans 제목과 Noto Sans KR 본문으로 선택지를 빠르게 스캔하게 한다.',
      heading: {
        family: 'Gmarket Sans',
        weights: [500, 700],
        source: 'gmarket-sans-official',
        fallbackChain: ['Noto Sans KR', 'system-ui', 'sans-serif'],
      },
      body: {
        family: 'Noto Sans KR',
        weights: [400, 500],
        source: 'noto-sans-kr-official',
        fallbackChain: ['system-ui', 'sans-serif'],
      },
      control: {
        family: 'Gmarket Sans',
        weights: [500],
        source: 'gmarket-sans-official',
        fallbackChain: ['Noto Sans KR', 'system-ui', 'sans-serif'],
      },
      typography: {
        display: { tracking: 'tracking.kr-tight-1', leading: 'leading.heading-compact' },
        heading: { tracking: 'tracking.kr-tight-1', leading: 'leading.heading-compact' },
        lead: { tracking: 'tracking.kr-neutral', leading: 'leading.body-readable' },
        body: { tracking: 'tracking.kr-neutral', leading: 'leading.body-readable' },
        control: { tracking: 'tracking.control-snug', leading: 'leading.control-single' },
      },
      dnaAffinity: {
        'cafe-warm-editorial': 'allowed',
        'dining-refined-contrast': 'blocked',
        'beauty-soft-wellness': 'blocked',
        'medical-clinical-clarity': 'allowed',
        'legal-authoritative-editorial': 'blocked',
        'workshop-tactile-heritage': 'blocked',
        'academy-structured-friendly': 'recommended',
        'retail-bold-geometric': 'recommended',
      },
      industryRouting: {
        primary: ['retail', 'academy'],
        secondary: ['portfolio', 'consulting'],
        blocked: ['cafe', 'fine_dining', 'beauty', 'legal', 'workshop'],
      },
      // Official licenses:
      // https://corp.gmarket.com/fonts/
      // https://github.com/notofonts/noto-cjk/blob/main/Sans/LICENSE
      licenseAssetIds: ['license-gmarket-sans-ofl-1.1', 'license-noto-cjk-ofl-1.1'],
    },
  },
  {
    id: 'kr-nanum-square-round-friendly',
    availability: 'new-opt-in',
    name: '나눔스퀘어라운드 프렌들리',
    mood: ['친근', '구조적', '부드러운 현대성', '안정'],
    bestFor: ['교육', '뷰티', '카페', '의료', '리테일', '컨설팅'],
    heading: "'NanumSquareRound', 'NanumSquare', 'Noto Sans KR', system-ui, sans-serif",
    body: "'Pretendard Variable', Pretendard, 'Noto Sans KR', system-ui, sans-serif",
    googleFonts: [],
    productionManifest: {
      catalogVersion: KOREAN_FONT_PAIRING_CATALOG_VERSION,
      status: 'production-ready',
      description: '둥근 모서리와 반듯한 골격으로 서비스 정보를 친근하지만 유아적이지 않게 구조화한다.',
      heading: {
        family: 'NanumSquareRound',
        weights: [700, 800],
        source: 'nanum-square-round-official',
        fallbackChain: ['NanumSquare', 'Noto Sans KR', 'system-ui', 'sans-serif'],
      },
      body: {
        family: 'Pretendard Variable',
        weights: [400, 500],
        source: 'pretendard-v1.3.9-official',
        fallbackChain: ['Pretendard', 'Noto Sans KR', 'system-ui', 'sans-serif'],
      },
      control: {
        family: 'Pretendard Variable',
        weights: [600],
        source: 'pretendard-v1.3.9-official',
        fallbackChain: ['Pretendard', 'Noto Sans KR', 'system-ui', 'sans-serif'],
      },
      typography: {
        display: { tracking: 'tracking.kr-tight-1', leading: 'leading.heading-comfort' },
        heading: { tracking: 'tracking.kr-tight-1', leading: 'leading.heading-comfort' },
        lead: { tracking: 'tracking.kr-body-snug', leading: 'leading.lead-readable' },
        body: { tracking: 'tracking.kr-body-snug', leading: 'leading.body-readable' },
        control: { tracking: 'tracking.control-snug', leading: 'leading.control-single' },
      },
      dnaAffinity: {
        'cafe-warm-editorial': 'allowed',
        'dining-refined-contrast': 'blocked',
        'beauty-soft-wellness': 'recommended',
        'medical-clinical-clarity': 'allowed',
        'legal-authoritative-editorial': 'blocked',
        'workshop-tactile-heritage': 'blocked',
        'academy-structured-friendly': 'recommended',
        'retail-bold-geometric': 'allowed',
      },
      industryRouting: {
        primary: ['academy', 'beauty'],
        secondary: ['cafe', 'medical', 'retail', 'consulting'],
        blocked: ['fine_dining', 'legal', 'workshop'],
      },
      // Official licenses:
      // https://hangeul.naver.com/font
      // https://github.com/orioncactus/pretendard/blob/main/LICENSE
      licenseAssetIds: ['license-naver-nanum', 'license-pretendard-ofl-1.1'],
    },
  },
];

/** 기존 AI·에디터·DNA pair enum이 소비하는 완전 격리 view. 순서와 객체 값은 종전과 동일하다. */
export const LEGACY_FONT_PAIRINGS = FONT_PAIRINGS.filter(
  (pairing) => pairing.availability === undefined,
);

/**
 * 에스코어드림은 공식 파일 수정 금지 조건이 WOFF2 변환·서브셋과 충돌한다.
 * 웹 임베딩·재배포에 대한 사람·법무 승인 전에는 enum·카탈로그·UI에 식별자를 만들지 않는다.
 */

// ---------- 스타일 방향 (styles.csv 큐레이션 — 소상공인 웹사이트에 유효한 방향만) ----------

export const STYLE_DIRECTIONS: StyleDirection[] = [
  {
    id: 'dark-luxury',
    name: '다크 럭셔리',
    keywords: ['고급', '럭셔리', '무디', '다크', '어두운', '어둡', '프리미엄', '시크', '숯불', '구이', '다이닝', '오마카세', 'luxury', 'moody', 'premium', 'dark'],
    candidateStyle: 'photo',
    heroImageFragment:
      'dark moody editorial photography, dramatic chiaroscuro lighting, warm amber accent light, glowing embers, shallow depth of field, rich charcoal backdrop',
    sectionImageFragment:
      'dark editorial still-life photography, warm rim lighting, deep shadows, subtle film grain',
    paletteMood: ['고급', '럭셔리', '무디', '다크', '드라마틱'],
    fontMood: ['고급', '우아', '클래식', '럭셔리'],
    effectsNote:
      '섹션 배경은 짙은 단색에 미세한 그레인. 카드에는 얇은 골드 보더 하나만. 호버는 밝기 5% 상승 수준으로 절제한다.',
    bestFor: ['숯불구이', '파인다이닝', '와인바', '호텔', '살롱', '스테이크'],
    avoid: ['키즈', '유치원', '병원', '세탁'],
  },
  {
    id: 'minimal-swiss',
    name: '미니멀 스위스',
    keywords: ['미니멀', '깔끔', '정돈', '심플', '그리드', '여백', '단정', '신뢰', '전문', 'clean', 'minimal', 'swiss', '모던'],
    candidateStyle: 'photo',
    heroImageFragment:
      'clean minimal photography, bright even natural light, generous negative space, single subject composition, soft neutral backdrop',
    sectionImageFragment:
      'minimal product photography, white seamless background, soft diffused shadow',
    paletteMood: ['클린', '미니멀', '깔끔', '프레시', '신뢰'],
    fontMood: ['모던', '깔끔', '미니멀', '신뢰'],
    effectsNote:
      '장식 없음. 위계는 크기와 여백으로만 만든다. 구분선은 1px 헤어라인, 그림자 최소화.',
    bestFor: ['세탁', '클리닉', '컨설팅', '리테일', '서비스', '치과', '병원', '의원', '법률', '회계', '세무', '사무소'],
    avoid: ['키즈', '레트로', '펍'],
  },
  {
    id: 'editorial-magazine',
    name: '에디토리얼 매거진',
    keywords: ['에디토리얼', '매거진', '잡지', '인쇄', '타이포', '세련', '아트', 'editorial'],
    candidateStyle: 'photo',
    heroImageFragment:
      'high-fashion editorial photography, bold off-center composition, crisp daylight, magazine cover aesthetic',
    sectionImageFragment:
      'editorial documentary photography, candid framing, natural window light',
    paletteMood: ['에디토리얼', '모노크롬', '미니멀', '모던'],
    fontMood: ['에디토리얼', '하이패션', '세리프', '타이포'],
    effectsNote:
      '비대칭 그리드와 큰 풀쿼트. 넘버링 대신 러닝헤드 같은 소제목 라벨. 이미지는 풀블리드 1장에 힘을 준다.',
    bestFor: ['사진', '패션', '매거진', '에이전시', '건축', '갤러리'],
    avoid: ['병원', '키즈', '세탁'],
  },
  {
    id: 'soft-clay-3d',
    name: '소프트 클레이 3D',
    keywords: ['플레이풀', '귀여움', '귀여운', '파스텔', '토이', '클레이', '친근', '재미', '아기자기', '3d'],
    candidateStyle: '3d_render',
    heroImageFragment:
      'soft clay 3D render, rounded chunky shapes, pastel colors, matte plasticine texture, gentle studio lighting, isometric composition',
    sectionImageFragment:
      'cute claymorphism 3D icon render, single object, pastel background, soft double shadow',
    paletteMood: ['플레이풀', '파스텔', '부드러움', '밝음'],
    fontMood: ['플레이풀', '친근', '귀여움', '명랑'],
    effectsNote:
      '큰 라운드(16~24px)와 이중 그림자 느낌의 카드. 컬러는 파스텔 5색 이내로 절제한다.',
    bestFor: ['키즈', '펫', '애견', '반려', '디저트', '교육', '이벤트', '체험'],
    avoid: ['법률', '장례', '금융', '로펌'],
  },
  {
    id: 'premium-3d-product',
    name: '프리미엄 3D 쇼케이스',
    keywords: ['하이엔드', '테크', '제품', '미래', '모던', '스튜디오', '프리미엄', '기기', '3d'],
    candidateStyle: '3d_render',
    heroImageFragment:
      'premium 3D product render, studio lighting with soft reflections, floating composition, realistic materials, cinematic depth of field, octane render quality',
    sectionImageFragment:
      'detailed 3D material close-up render, macro view, physically based lighting',
    paletteMood: ['다크', '모던', '시크', '드라마틱', '고급'],
    fontMood: ['모던', '테크', '미니멀', '기하학'],
    effectsNote:
      '히어로 3D 비주얼이 주인공. 나머지 섹션은 어두운 무채색으로 조용히 받쳐준다.',
    bestFor: ['제품', '테크', '뷰티디바이스', '자동차', '스튜디오', '전자'],
    avoid: ['전통', '한식', '공방'],
  },
  {
    id: 'organic-natural',
    name: '오가닉 내추럴',
    keywords: ['내추럴', '자연', '오가닉', '어스', '편안', '싱그러', '지속가능', '친환경', 'nature', 'organic'],
    candidateStyle: 'photo',
    heroImageFragment:
      'organic lifestyle photography, warm morning sunlight through leaves, earthy textures, linen and wood materials, soft natural tones',
    sectionImageFragment:
      'natural material still-life, dried botanicals, handmade ceramics, warm daylight',
    paletteMood: ['내추럴', '어스', '오가닉', '따뜻', '차분'],
    fontMood: ['내추럴', '차분', '부드러움', '문학'],
    effectsNote:
      '곡선 모서리와 미세한 종이 질감. 채도 높은 색은 쓰지 않는다.',
    bestFor: ['플라워', '요가', '공방', '오가닉식품', '스파', '웰니스'],
    avoid: ['테크', '게임', '전자'],
  },
  {
    id: 'warm-cozy',
    name: '웜 코지',
    keywords: ['아늑', '따뜻', '포근', '코지', '수제', '정감', '홈메이드', '동네', 'cozy', 'warm'],
    candidateStyle: 'photo',
    heroImageFragment:
      'cozy warm interior photography, golden hour light, steam rising, wooden textures, inviting atmosphere, soft bokeh',
    sectionImageFragment:
      'warm food photography, rustic wooden table, natural side light, homemade feel',
    paletteMood: ['따뜻', '아늑', '수제', '코지'],
    fontMood: ['수제', '따뜻', '손글씨', '친근'],
    effectsNote:
      '크림 배경에 브라운 계열. 그림자는 부드럽고 넓게, 모서리는 중간 라운드.',
    bestFor: ['베이커리', '카페', '브런치', '게스트하우스', '디저트'],
    avoid: ['법률', '금융', '로펌'],
  },
  {
    id: 'retro-analog',
    name: '레트로 아날로그',
    keywords: ['레트로', '빈티지', '아날로그', '필름', '노스탤지어', '뉴트로', '옛날', 'retro', 'vintage'],
    candidateStyle: 'photo',
    heroImageFragment:
      'vintage analog film photography, warm faded colors, film grain, light leaks, 1970s Kodak aesthetic',
    sectionImageFragment:
      'retro polaroid style photography, muted sepia tones, nostalgic mood',
    paletteMood: ['레트로', '빈티지', '아날로그', '헤리티지'],
    fontMood: ['레트로', '볼드', '드라마틱', '빈티지'],
    effectsNote:
      '필름 그레인 오버레이 느낌과 바랜 색감. 모서리 라운드는 작게, 배지·스탬프 같은 포인트 하나.',
    bestFor: ['레코드', '수제버거', '빈티지', '카페', '펍', '경양식'],
    avoid: ['병원', '금융', '테크', '클리닉'],
  },
  {
    id: 'glass-modern',
    name: '글래스 모던',
    keywords: ['글래스', '투명', '미래', '모던', '세련', '기술', '유리', '신뢰', 'glass', '프리미엄'],
    candidateStyle: '3d_render',
    heroImageFragment:
      'abstract 3D render of frosted glass panels, translucent layers, soft volumetric light, subtle color gradient backdrop, elegant depth',
    sectionImageFragment:
      'frosted glass texture 3D render, translucent material study, soft studio light',
    paletteMood: ['모던', '시크', '클린', '신뢰'],
    fontMood: ['모던', '테크', '미니멀'],
    effectsNote:
      '반투명 카드와 블러 배경 느낌. 배경 그라디언트는 은은하게 1개만 쓴다.',
    bestFor: ['부동산', '금융', '뷰티테크', '스타트업', '분양', '법무', '컨설팅'],
    avoid: ['전통', '한식', '공방', '수제'],
  },
  {
    id: 'bold-energy',
    name: '볼드 에너지',
    keywords: ['에너지', '강렬', '다이내믹', '파워', '스포티', '운동', '열정', '강한'],
    candidateStyle: 'photo',
    heroImageFragment:
      'high-contrast dynamic sports photography, dramatic gym lighting, motion blur, chalk dust in air, low-angle heroic composition',
    sectionImageFragment:
      'gritty athletic detail photography, hard directional light, dark background',
    paletteMood: ['에너지', '강렬', '다크', '다이내믹'],
    fontMood: ['강렬', '볼드', '스포티', '콘덴스드'],
    effectsNote:
      '대각선 컷과 큰 숫자 타이포. 배경 다크 + 고채도 포인트 1색만.',
    bestFor: ['피트니스', '크로스핏', '복싱', '스포츠', '헬스'],
    avoid: ['스파', '병원', '명상', '웨딩'],
  },
  {
    id: 'botanical-illust',
    name: '보태니컬 일러스트',
    keywords: ['일러스트', '보태니컬', '드로잉', '손그림', '섬세', '감성', '수채'],
    candidateStyle: 'illustration',
    heroImageFragment:
      'delicate botanical line illustration, hand-drawn flowers and leaves, muted watercolor washes, cream paper texture',
    sectionImageFragment:
      'minimal botanical spot illustration, single stem, soft watercolor accent',
    paletteMood: ['내추럴', '보태니컬', '부드러움', '싱그러움'],
    fontMood: ['차분', '문학', '내추럴', '우아'],
    effectsNote:
      '일러스트는 라인+수채 두 단계까지만. 배경은 종이 질감의 크림 톤.',
    bestFor: ['플라워', '찻집', '웨딩', '소품', '화원'],
    avoid: ['테크', '스포츠', '전자', '법률', '세무', '회계'],
  },
  {
    id: 'flat-friendly-illust',
    name: '플랫 프렌들리 일러스트',
    keywords: ['친근', '일러스트', '캐릭터', '밝음', '밝은', '명랑', '쉬운', '동네', '이웃'],
    candidateStyle: 'illustration',
    heroImageFragment:
      'friendly flat vector illustration, simple geometric characters, cheerful limited color palette, clean shapes, subtle texture',
    sectionImageFragment:
      'flat illustration scene, everyday life moment, warm limited palette',
    paletteMood: ['플레이풀', '밝음', '친근', '명랑'],
    fontMood: ['친근', '플레이풀', '명랑'],
    effectsNote:
      '일러스트 팔레트를 브랜드 팔레트와 동일하게 5색 이내로 제한한다.',
    bestFor: ['키즈', '학원', '펫', '애견', '반려', '동네가게', '서비스', '돌봄'],
    avoid: ['럭셔리', '파인다이닝', '로펌'],
  },
  {
    id: 'heritage-korean',
    name: '코리안 헤리티지',
    keywords: ['전통', '한옥', '한국', '헤리티지', '고요', '단아', '정갈', '한식', '우리'],
    candidateStyle: 'photo',
    heroImageFragment:
      'serene Korean traditional aesthetic photography, hanok wooden beams and dancheong details, soft diffused morning light, minimal composition, quiet elegance',
    sectionImageFragment:
      'Korean craft still-life photography, ceramic and linen textures, muted natural light',
    paletteMood: ['전통', '헤리티지', '고요', '차분', '내추럴'],
    fontMood: ['전통', '헤리티지', '문학', '세리프'],
    effectsNote:
      '여백을 한옥 창호처럼 넓게 쓴다. 장식은 1px 가는 선과 낙관 같은 포인트 하나만.',
    bestFor: ['한식', '찻집', '한복', '전통주', '공방', '한정식'],
    avoid: ['테크', '스포츠', '전자'],
  },
];

// ---------- 랜딩 패턴 (landing.csv 섹션 순서 → 우리 SectionType 매핑) ----------

export const LANDING_PATTERNS: LandingPattern[] = [
  {
    id: 'hero-features-cta',
    name: '히어로·특징·전환',
    keywords: ['소개', '서비스', '특징', '강점', '기본'],
    sections: ['hero', 'about', 'features', 'cta', 'contact'],
  },
  {
    id: 'social-proof',
    name: '후기 신뢰형',
    keywords: ['후기', '리뷰', '신뢰', '추천', '입소문', '고객'],
    sections: ['hero', 'about', 'features', 'testimonials', 'cta', 'contact'],
  },
  {
    id: 'menu-showcase',
    name: '메뉴 쇼케이스',
    keywords: ['메뉴', '음식', '주문', '예약', '레스토랑', '카페', '식당', '베이커리', '맛'],
    sections: ['hero', 'menu', 'about', 'gallery', 'testimonials', 'contact'],
  },
  {
    id: 'portfolio-grid',
    name: '포트폴리오 그리드',
    keywords: ['포트폴리오', '갤러리', '작업', '작품', '쇼케이스', '사진', '시공사례'],
    sections: ['hero', 'gallery', 'about', 'contact'],
  },
  {
    id: 'storytelling',
    name: '브랜드 스토리텔링',
    keywords: ['스토리', '브랜드', '철학', '여정', '역사', '가치'],
    sections: ['hero', 'about', 'features', 'gallery', 'cta', 'contact'],
  },
  {
    id: 'pricing-focused',
    name: '가격 중심 전환',
    keywords: ['가격', '요금', '플랜', '수강료', '멤버십', '회원권', '이용권'],
    sections: ['hero', 'features', 'pricing', 'testimonials', 'cta', 'contact'],
  },
  {
    id: 'trust-authority',
    name: '신뢰와 권위',
    keywords: ['전문', '상담', '자격', '경력', '권위', '법률', '의료', '세무'],
    sections: ['hero', 'about', 'features', 'testimonials', 'contact'],
  },
  {
    id: 'minimal-direct',
    name: '미니멀 원페이지',
    keywords: ['미니멀', '심플', '단순', '원페이지', '간결'],
    sections: ['hero', 'about', 'cta', 'contact'],
  },
  {
    id: 'visual-booking',
    name: '비주얼 예약형',
    keywords: ['예약', '시술', '살롱', '뷰티', '스타일', '헤어', '네일'],
    sections: ['hero', 'gallery', 'features', 'pricing', 'contact'],
  },
];
