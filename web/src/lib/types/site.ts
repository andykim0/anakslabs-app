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

export type ElementKind = 'text' | 'image' | 'button' | 'shape' | 'divider' | 'video';

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

export type CanvasElement =
  | TextElement
  | ImageElement
  | ButtonElement
  | ShapeElement
  | DividerElement
  | VideoElement;

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
  | 'custom';

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

export interface SiteConfig {
  version: 1;
  theme: SiteTheme;
  meta: SiteMeta;
  sections: Section[];
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
