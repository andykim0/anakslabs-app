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
  hidden?: boolean;
}

export interface SiteMeta {
  title: string;
  description?: string;
  ogImage?: string;
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

export interface SiteConfig {
  version: 1;
  theme: SiteTheme;
  meta: SiteMeta;
  sections: Section[];
  /** [v3] 없으면 발행 게이트에서 입력 요구. 렌더러가 맨 아래 고정 푸터로 렌더 */
  businessInfo?: BusinessInfo;
}

/** 빈 사이트 기본값 생성 헬퍼 */
export function emptySiteConfig(title: string): SiteConfig {
  return {
    version: 1,
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
    sections: [],
  };
}
