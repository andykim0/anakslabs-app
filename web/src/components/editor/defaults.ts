/**
 * 요소/섹션 기본값 팩토리 + 한국어 라벨.
 */
import type {
  CanvasElement,
  ElementKind,
  Section,
  SectionType,
  SiteTheme,
} from '@/lib/types/site';

export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  hero: '히어로',
  about: '소개',
  features: '특징',
  menu: '메뉴',
  gallery: '갤러리',
  testimonials: '후기',
  pricing: '가격',
  contact: '문의',
  cta: 'CTA',
  custom: '커스텀',
  team: '구성원',
  cases: '실적·사례',
  faq: '자주 묻는 질문',
};

export const ELEMENT_KIND_LABELS: Record<ElementKind, string> = {
  text: '텍스트',
  image: '이미지',
  button: '버튼',
  shape: '도형',
  divider: '구분선',
  video: '영상',
  form: '문의 폼',
  map: '지도',
  socialLinks: 'SNS 링크',
};

const SECTION_DEFAULT_HEIGHT: Partial<Record<SectionType, number>> = {
  hero: 720,
  cta: 400,
  contact: 560,
};

export function createDefaultSection(type: SectionType): Section {
  return {
    id: uid(),
    type,
    name: SECTION_TYPE_LABELS[type],
    height: SECTION_DEFAULT_HEIGHT[type] ?? 600,
    background: {},
    elements: [],
  };
}

export function createDefaultElement(kind: ElementKind, theme: SiteTheme, z: number): CanvasElement {
  const id = uid();
  switch (kind) {
    case 'text':
      return {
        id,
        kind,
        z,
        frame: { x: 420, y: 80, w: 600, h: 88 },
        text: '새 텍스트를 입력하세요',
        style: { fontSize: 28, fontWeight: 500, fontFamily: 'body', align: 'left', lineHeight: 1.4 },
      };
    case 'image':
      return {
        id,
        kind,
        z,
        frame: { x: 480, y: 80, w: 480, h: 320 },
        src: `https://picsum.photos/seed/${id.slice(0, 8)}/960/640`,
        alt: '이미지',
        style: { objectFit: 'cover', borderRadius: theme.radius ?? 8 },
      };
    case 'button':
      return {
        id,
        kind,
        z,
        frame: { x: 620, y: 100, w: 200, h: 56 },
        label: '자세히 보기',
        href: '#',
        style: { variant: 'solid', fontSize: 16 },
      };
    case 'shape':
      return {
        id,
        kind,
        z,
        frame: { x: 570, y: 80, w: 300, h: 200 },
        shape: 'rect',
        style: { fill: theme.palette.surface, borderRadius: theme.radius ?? 8 },
      };
    case 'divider':
      return {
        id,
        kind,
        z,
        frame: { x: 320, y: 120, w: 800, h: 12 },
        style: { thickness: 2 },
      };
    case 'video':
      return {
        id,
        kind,
        z,
        frame: { x: 400, y: 80, w: 640, h: 360 },
        // 주의: draftConfig zod 검증이 src min(1)을 요구 — 빈 문자열이면 자동저장이 400으로 실패한다.
        src: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
        style: { objectFit: 'cover', borderRadius: theme.radius ?? 8, muted: true, loop: true, autoplay: false },
      };
    case 'form':
      return {
        id,
        kind,
        z,
        frame: { x: 520, y: 80, w: 400, h: 360 },
        formType: 'contact',
        fields: ['name', 'phone', 'message'],
        submitLabel: '문의 보내기',
        style: { variant: 'card', borderRadius: theme.radius ?? 8 },
      };
    case 'map':
      return {
        id,
        kind,
        z,
        frame: { x: 420, y: 80, w: 600, h: 360 },
        embedUrl: '',
        style: { borderRadius: theme.radius ?? 8 },
      };
    case 'socialLinks':
      return {
        id,
        kind,
        z,
        frame: { x: 570, y: 120, w: 300, h: 56 },
        links: [
          { kind: 'instagram', url: '' },
          { kind: 'kakao_channel', url: '' },
        ],
        style: { direction: 'row', size: 40 },
      };
  }
}
