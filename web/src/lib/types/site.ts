/**
 * [계약 — Architect 소유. 에이전트 수정 금지, 변경 필요 시 보고]
 * 사이트 표현 모델: 하이브리드(섹션 스택 + 섹션 내 자유배치 캔버스).
 * 에디터(components/editor)와 렌더러(components/site-renderer)가 공유하는 단일 진실.
 */

/** 캔버스 좌표계 기준 폭(px). 에디터·렌더러 공통. 렌더 시 뷰포트 폭에 비례 스케일. */
export const DESIGN_WIDTH = 1440;

/** 모바일 자동 스택 전환 기준(px). 미만이면 요소를 y좌표 순으로 세로 스택. */
export const MOBILE_BREAKPOINT = 768;

export interface SiteTheme {
  fonts: {
    /** CSS font-family 값 (예: "'Noto Serif KR', serif") */
    heading: string;
    body: string;
    /** 로드할 Google Fonts 패밀리명 목록 (예: ['Noto Serif KR', 'Pretendard']) */
    googleFonts?: string[];
  };
  palette: {
    background: string;
    surface: string;
    text: string;
    muted: string;
    primary: string;
    accent: string;
  };
  /** 기본 radius(px) */
  radius?: number;
  /** 사이트 스코프 커스텀 CSS (AI 생성). 렌더 시 <style>로 주입 */
  customCss?: string;
}

/** DESIGN_WIDTH 기준 절대좌표 프레임 */
export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 등장 애니메이션 효과 (뷰포트 진입 시 1회 재생) */
export type EntranceEffect =
  | 'none'
  | 'fade'
  | 'fade-up'
  | 'fade-down'
  | 'slide-left'
  | 'slide-right'
  | 'zoom-in';

/**
 * 요소 등장 애니메이션. 미지정이면 렌더러가 기본 연출(fade-up + 섹션 내 y순서
 * 순차 지연)을 적용하고, effect 'none'을 명시하면 해당 요소는 끈다.
 * SSR/정적 Export 마크업은 항상 보이는 상태 — JS 하이드레이션 후에만 재생
 * (site-renderer/Reveal.tsx).
 */
export interface Entrance {
  effect: EntranceEffect;
  /** 재생 시간 ms (기본 700) */
  duration?: number;
  /** 시작 지연 ms (기본: 섹션 내 순차 지연) */
  delay?: number;
}

export type ElementKind =
  | 'text'
  | 'image'
  | 'button'
  | 'shape'
  | 'divider'
  | 'video'
  // [v3 Phase 0.1] 부가기능 요소 3종
  | 'form'
  | 'map'
  | 'socialLinks';

/** [v3] SNS·채널 종류 — SocialLinksElement가 소비 (domain.ts에서 re-export) */
export type SnsKind = 'instagram' | 'kakao_channel' | 'naver_blog' | 'youtube' | 'x' | 'custom';

interface ElementBase {
  id: string;
  kind: ElementKind;
  frame: Frame;
  /** 쌓임 순서. 클수록 위 */
  z: number;
  /** 회전(deg) */
  rotation?: number;
  /** 0~1 */
  opacity?: number;
  /** 에디터에서 선택/이동 잠금 */
  locked?: boolean;
  /** 모바일 자동 스택에서 제외 */
  hiddenOnMobile?: boolean;
  /** 등장 애니메이션 — 미지정 = 렌더러 기본 연출, 'none' = 끔 */
  entrance?: Entrance;
}

export interface TextElement extends ElementBase {
  kind: 'text';
  /** 플레인 텍스트, 줄바꿈은 \n */
  text: string;
  style: {
    fontSize: number;
    fontWeight?: number;
    /** theme.fonts 참조 키 */
    fontFamily?: 'heading' | 'body';
    color?: string;
    align?: 'left' | 'center' | 'right';
    lineHeight?: number;
    letterSpacing?: number;
    italic?: boolean;
  };
}

export interface ImageElement extends ElementBase {
  kind: 'image';
  src: string;
  alt?: string;
  style: {
    objectFit?: 'cover' | 'contain';
    borderRadius?: number;
    shadow?: boolean;
  };
}

export interface ButtonElement extends ElementBase {
  kind: 'button';
  label: string;
  href: string;
  style: {
    variant: 'solid' | 'outline' | 'ghost';
    /** 배경/보더 색. 미지정 시 theme.palette.primary */
    color?: string;
    textColor?: string;
    fontSize?: number;
    borderRadius?: number;
  };
}

export interface ShapeElement extends ElementBase {
  kind: 'shape';
  shape: 'rect' | 'ellipse' | 'line';
  style: {
    fill?: string;
    borderColor?: string;
    borderWidth?: number;
    borderRadius?: number;
  };
}

export interface DividerElement extends ElementBase {
  kind: 'divider';
  style: {
    color?: string;
    thickness?: number;
  };
}

export interface VideoElement extends ElementBase {
  kind: 'video';
  src: string;
  poster?: string;
  style: {
    objectFit?: 'cover' | 'contain';
    borderRadius?: number;
    autoplay?: boolean;
    loop?: boolean;
    muted?: boolean;
  };
}

/** [v3 Phase 0.1] 문의 폼 — 테넌트 사이트 수신 폼 (POST /api/forms/[siteId]) */
export interface FormElement extends ElementBase {
  kind: 'form';
  formType: 'contact';
  fields: ('name' | 'phone' | 'email' | 'message')[];
  /** 기본 '문의 보내기' */
  submitLabel: string;
  style: { variant: 'card' | 'plain'; color?: string; borderRadius?: number };
}

/** [v3 Phase 0.1] 지도 임베드 — embedUrl은 화이트리스트 도메인만 (safe-url 확장) */
export interface MapElement extends ElementBase {
  kind: 'map';
  /** 네이버/카카오/구글 지도 embed URL */
  embedUrl: string;
  style: { borderRadius?: number };
}

/** [v3 Phase 0.1] SNS·채널 링크 묶음 바 */
export interface SocialLinksElement extends ElementBase {
  kind: 'socialLinks';
  links: { kind: SnsKind; url: string; label?: string }[];
  style: { direction: 'row' | 'column'; size?: number; color?: string };
}

export type CanvasElement =
  | TextElement
  | ImageElement
  | ButtonElement
  | ShapeElement
  | DividerElement
  | VideoElement
  | FormElement
  | MapElement
  | SocialLinksElement;

export type SectionType =
  | 'hero'
  | 'about'
  | 'features'
  | 'menu'
  | 'gallery'
  | 'testimonials'
  | 'pricing'
  | 'contact'
  | 'cta'
  | 'custom'
  // [v3 Phase 0.1] 구성원 소개 / 실적·사례 / FAQ (나머지 뉘앙스는 variant로 처리)
  | 'team'
  | 'cases'
  | 'faq';

export interface SectionBackground {
  color?: string;
  /** CSS gradient 전체 문자열 */
  gradient?: string;
  image?: {
    src: string;
    overlayColor?: string;
    /** 0~1 */
    overlayOpacity?: number;
  };
  /**
   * [motion 3단계] video-hero 배경 영상 소스. 렌더러는 플랜이 video-hero인 히어로에만 방출한다.
   * poster는 운영상 필수 — 없으면 렌더러가 ken-burns로 폴백(빈 화면 리스크 원천 차단).
   * (폴백 체인: video 없음 → ken-burns / src 有·poster 無 → ken-burns / 로드실패 → poster / 모바일·reduced-motion → poster)
   * [motion 4단계] bytes: 원본 파일 크기(있으면). 발행 게이트(preflight)가 VIDEO_TARGET/HARD_MAX와 대조.
   * 현재 미설정(후처리 파이프라인 도입 시 측정값 기록 → 게이트 활성).
   */
  video?: { src: string; poster?: string; bytes?: number };
}

export interface Section {
  id: string;
  type: SectionType;
  /** 에디터 표시명 (예: '히어로', '메뉴') */
  name: string;
  /** DESIGN_WIDTH 기준 섹션 높이(px) */
  height: number;
  background: SectionBackground;
  elements: CanvasElement[];
  /**
   * [motion 3단계] 렌더 레이아웃. 'marquee'면 요소의 frame(x/y)을 삭제·변경하지 않고 렌더 시점에만
   * 무시하여 x좌표 오름차순 흐름 띠로 나열(비파괴 — 'canvas' 복귀 시 원배치 복원). 기본 'canvas'.
   * 실제 흐름 동작은 프리셋에 marquee 포함 AND 이 필드 'marquee'일 때만 resolveMotionPlan이 방출.
   */
  layout?: 'canvas' | 'marquee';
  hidden?: boolean;
}

export interface SiteMeta {
  title: string;
  description?: string;
  ogImage?: string;
  /**
   * [제품 확정] 생성 시점의 목적(SitePurposeId 값) — 서빙 시 JSON-LD @type을 목적으로 결정한다
   * (PURPOSE_SCHEMA_MAP). 계약이 데이터 모듈을 역참조하지 않도록 motion.presetId처럼 string으로 둔다.
   * 레거시 config는 미설정 → buildJsonLd가 섹션 휴리스틱으로 폴백(무회귀).
   */
  purposeId?: string;
  /** [제품 확정] 지역(regionOf 결과) — JSON-LD addressLocality/areaServed에 반영(지역 검색 해자) */
  region?: string;
}

/**
 * [v3 Phase 0.1] 사업자 정보 — 캔버스 요소가 아니라 사이트 레벨 구조화 데이터.
 * 법적 표기는 자유배치로 지워지면 안 되고 JSON-LD(Phase 7) 원천으로도 재사용하므로
 * 렌더러가 항상 맨 아래 고정 푸터로 렌더한다. 캔버스 undo/redo 대상 제외(에디터 별도 폼).
 * (v2의 clients.business_info 및 domain.ts BusinessInfo는 이 계약으로 통일 — 사이트 단위)
 *
 * [v3 Phase 4 승인] isPersonal: 사업자가 아닌 개인 운영 사이트 — 상호/사업자번호/주소 생략.
 * 사업자 경로(isPersonal !== true)의 필수 강제는 zod(businessInfoSchema superRefine)가 담당.
 */
export interface BusinessInfo {
  /** 개인(비사업자) 운영 사이트 — 상호·사업자번호·주소 생략 가능 */
  isPersonal?: boolean;
  /** 상호 — 사업자면 필수(zod 강제) */
  businessName?: string;
  /** 대표자/운영자명 — 항상 필수 */
  ownerName: string;
  /** 사업자등록번호 (000-00-00000) — 사업자면 필수(zod 강제) */
  businessNumber?: string;
  /** 사업장 주소 — 사업자면 필수(zod 강제) */
  address?: string;
  /** 연락처 전화 — 항상 필수 */
  phone: string;
  email?: string;
  /** 통신판매업 신고번호 (쇼핑몰 purpose일 때 노출) */
  mailOrderNumber?: string;
}

/**
 * [v4] 사이트의 한 페이지 — 자유배치 캔버스 섹션들의 수직 스택.
 * 페이지 1개면 기존(단일 페이지) 동작과 동일. header 내비는 페이지 목록에서 자동 생성.
 */
export interface SitePage {
  id: string;
  /** 에디터/내비 표시명 (예: '홈', '회사소개') */
  title: string;
  /** URL 경로 조각. ''(빈 문자열) = 홈. 규칙: /^[a-z0-9-]{1,40}$/ 또는 '' */
  slug: string;
  sections: Section[];
  /** header 내비 노출 (기본 true) */
  showInNav?: boolean;
  /** 내비 표시명 오버라이드 (기본 title) */
  navLabel?: string;
}

/** [motion-system] 요금제 티어 — 모션 기법 접근 범위 결정 (registry가 기법별 tier 보유) */
export type MotionTier = 'basic' | 'premium';

/** [motion-system] 사이트 모션 강도 — 계약 필드(프리셋과 별개로 항상 조절 가능, "off"는 전 프리셋 허용) */
export type MotionIntensity = 'off' | 'subtle' | 'normal';

/**
 * [v4] SiteConfig v2 — 페이지>섹션 2계층.
 * (v1: version:1 + sections 는 SiteConfigV1 — 데이터 계층 read 경계에서 normalizeSiteConfig로
 *  v2 승격한다. 데이터 계층 밖의 앱 코드는 항상 v2만 본다.)
 */
export interface SiteConfig {
  version: 2;
  theme: SiteTheme;
  meta: SiteMeta;
  pages: SitePage[];
  /** [v3] 없으면 발행 게이트에서 입력 요구. 렌더러가 맨 아래 고정 푸터로 렌더 */
  businessInfo?: BusinessInfo;
  /** [v4] header 내비. 미지정 = 자동(내비 노출 페이지 ≥ 2일 때만 표시) */
  nav?: { enabled?: boolean };
  /**
   * [motion-system] 사이트 모션 프리셋 + 강도. presetId 는 MOTION_PRESETS(lib/motion/presets.ts)
   * 키만 유효하며 서버(sanitizeMotion·zod)에서 검증된다 — 계약이 데이터 모듈을 역참조하지
   * 않도록 여기선 string 으로 둔다. optional: 기존(v4 이전) config 호환 — 데이터 계층 read
   * 시점(mappers/normalize)에서 업종 매핑 기본값 주입.
   *
   * [Q7] heroTechnique: 고객이 온보딩 '움직임 고르기'에서 고른 히어로 기법 오버라이드
   * ('none'=히어로 움직임 최소). HERO_MOTION_CHOICES(lib/motion/hero-choice.ts) id만 유효 —
   * 미등록·티어 초과는 sanitizeMotion이 강등(changes[]). 미설정 = 프리셋 기본 히어로.
   * videoConceptId: Premium video-hero 선택 시 고른 영상 컨셉(VIDEO_CONCEPTS id) —
   * Veo 프롬프트 빌더(heroVideoContext)가 promptSeed로 소비. 이 필드는 생성 트리거가 아니다.
   */
  motion?: { presetId: string; intensity: MotionIntensity; heroTechnique?: string; videoConceptId?: string };
}

/** 빈 사이트 기본값 생성 헬퍼 */
export function emptySiteConfig(title: string): SiteConfig {
  return {
    version: 2,
    theme: {
      fonts: { heading: "'Noto Serif KR', serif", body: "'Pretendard', sans-serif", googleFonts: ['Noto Serif KR'] },
      palette: {
        background: '#0f0e0c',
        surface: '#1a1815',
        text: '#f5f1e8',
        muted: '#9a917f',
        primary: '#b08d57',
        accent: '#7a2e2e',
      },
      radius: 8,
    },
    meta: { title },
    pages: [{ id: 'home', title: '홈', slug: '', sections: [] }],
  };
}

/** [v4 legacy] v1 config (version:1 + sections) — normalizeSiteConfig 입력으로만 존재 */
export interface SiteConfigV1 {
  version: 1;
  theme: SiteTheme;
  meta: SiteMeta;
  sections: Section[];
  businessInfo?: BusinessInfo;
}

/**
 * [v4] v1 → v2 무손실·결정적 정규화. 데이터 계층 read 경계(supabase rowToSite / mock 시드 주입)에서
 * 단일 적용 — 데이터 계층 밖의 앱 코드는 항상 v2만 본다. DB 일괄 마이그레이션은 하지 않는다.
 */
export function normalizeSiteConfig(raw: SiteConfigV1 | SiteConfig): SiteConfig {
  if ((raw as SiteConfig).version === 2 && Array.isArray((raw as SiteConfig).pages)) {
    return raw as SiteConfig;
  }
  const v1 = raw as SiteConfigV1;
  return {
    version: 2,
    theme: v1.theme,
    meta: v1.meta,
    pages: [{ id: 'home', title: '홈', slug: '', sections: v1.sections ?? [] }],
    ...(v1.businessInfo ? { businessInfo: v1.businessInfo } : {}),
  };
}

/** [v4] slug로 페이지 찾기 ('' = 홈) */
export function findPage(config: SiteConfig, slug: string): SitePage | undefined {
  return config.pages.find((p) => p.slug === slug);
}

/** [v4] 홈 페이지 — 항상 존재(slug '', 없으면 첫 페이지) */
export function homePage(config: SiteConfig): SitePage {
  return config.pages.find((p) => p.slug === '') ?? config.pages[0];
}

/** [v4] 전 페이지 섹션 평탄화 (export·collect-assets 등 전체 스캔용) */
export function allSections(config: SiteConfig): Section[] {
  return config.pages.flatMap((p) => p.sections);
}

/** [v4] 예약 슬러그 — 페이지 slug로 쓸 수 없음 (테넌트 라우트/앱 경로 충돌 방지) */
export const RESERVED_PAGE_SLUGS = [
  'privacy',
  'terms',
  'robots.txt',
  'sitemap.xml',
  'llms.txt',
  'api',
  's',
  'dashboard',
] as const;

/** [v4] 페이지 slug 유효성 (''=홈, 또는 ^[a-z0-9-]{1,40}$ 이고 비예약) */
export function isValidPageSlug(slug: string): boolean {
  if (slug === '') return true;
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) return false;
  return !(RESERVED_PAGE_SLUGS as readonly string[]).includes(slug);
}
