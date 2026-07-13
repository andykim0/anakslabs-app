/**
 * [D3] 생성 후 페이지별 보강 스텝 — "페이지마다 정보 받기"를 설문 확장 없이 생성 후로 미룬다.
 *
 * 각 페이지의 '비어 보이는' 신호(사진 부족·항목 적음·소개 얇음·밀도 미달)를 감지해 페이지별 보강
 * 카드를 만든다. 카드는 에디터의 해당 페이지/영역으로 딥링크(?focus=, 미해석 시 무해)한다 —
 * 신규 백엔드 없음(입력·보강은 기존 에디터로). 입력한 사실만 반영(지어내지 않음).
 *
 * 순수 함수 — node:test로 직접 검증. PageEnrichmentCards가 소비. 강제 아님(스킵 가능) —
 * 발행 최소 밀도는 D2 생성이 이미 보장하고, 이 스텝은 '꽉 채우기' 코칭이다.
 */
import type { CanvasElement, Section, SiteConfig, SitePage } from '@/lib/types/site';
import { SECTION_DENSITY, contentElementCount } from '@/lib/design/section-density';

export interface EnrichmentSignal {
  /** 페이지+종류로 안정적 — localStorage dismiss 키 */
  id: string;
  kind: 'photos' | 'items' | 'story' | 'density';
  /** 코칭 제목(질문형) */
  title: string;
  /** 코칭 설명 — 현재 상태 + 채우면 좋아지는 점(G4 진단 톤) */
  description: string;
  /** 에디터 딥링크 focus 토큰(미해석 무해) */
  focus: string;
}

export interface PageEnrichment {
  pageSlug: string;
  pageTitle: string;
  signals: EnrichmentSignal[];
}

/** 레퍼런스 밀도 목표(‘꽉 참’ 기준) — 밀도 최소치(SECTION_DENSITY)보다 위. */
const RICH_TARGET = { galleryImages: 6, menuItems: 4, aboutContent: 8 } as const;

const isContentImage = (el: CanvasElement) => el.kind === 'image';
const galleryImageCount = (s: Section) => s.elements.filter(isContentImage).length;

/** 메뉴 항목 수 추정 — 이름/가격 텍스트 행(장식 제외). 카드 구성과 무관하게 콘텐츠 밀도로 근사. */
function menuItemCount(s: Section): number {
  return s.elements.filter((el) => el.kind === 'text' && !/kicker|title|subtitle/.test(el.id)).length;
}

/** 페이지의 '가장 얇은' 섹션 1개에 대한 보강 신호(있으면). 페이지당 최대 1 신호로 절제. */
function signalForPage(page: SitePage): EnrichmentSignal | null {
  const slug = page.slug;
  for (const s of page.sections) {
    if (s.type === 'gallery') {
      const n = galleryImageCount(s);
      if (n < RICH_TARGET.galleryImages) {
        return {
          id: `${slug || 'home'}:photos`,
          kind: 'photos',
          title: '사진을 더 올릴까요?',
          description: `지금 갤러리에 사진이 ${n}장이에요. 직접 찍은 사진을 더 올리면 이 페이지가 꽉 차고 신뢰도가 올라가요.`,
          focus: 'images',
        };
      }
    }
    if (s.type === 'menu' || s.type === 'pricing') {
      const n = menuItemCount(s);
      if (n < RICH_TARGET.menuItems) {
        return {
          id: `${slug || 'home'}:items`,
          kind: 'items',
          title: '대표 항목을 더 알려줄까요?',
          description: `인기 메뉴·상품 3개만 더 알려주시면 강조 카드로 만들어 이 페이지를 채워드려요.`,
          focus: 'menu',
        };
      }
    }
    if (s.type === 'about') {
      if (contentElementCount(s) < RICH_TARGET.aboutContent) {
        return {
          id: `${slug || 'home'}:story`,
          kind: 'story',
          title: '대표 스토리를 더 넣을까요?',
          description: '어떻게 시작했는지·무엇을 지키는지 한 문단만 더 알려주시면 소개가 풍성해져요.',
          focus: 'text',
        };
      }
    }
  }
  // 위 특정 신호가 없으면, DENSE 섹션 중 밀도 미달이 있으면 일반 밀도 신호
  const thin = page.sections.find(
    (s) => s.type in SECTION_DENSITY && contentElementCount(s) < SECTION_DENSITY[s.type].minElements,
  );
  if (thin) {
    return {
      id: `${slug || 'home'}:density`,
      kind: 'density',
      title: '이 페이지를 더 채울까요?',
      description: '내용이 조금 비어 보여요. 문구나 항목을 더하면 완성도가 올라가요.',
      focus: 'layout',
    };
  }
  return null;
}

/**
 * 발행본/초안 SiteConfig → 페이지별 보강 카드. 신호 없는 페이지는 제외.
 * 페이지당 최대 1 신호(절제) — 홈부터 순서 유지.
 */
export function detectPageEnrichments(config: SiteConfig): PageEnrichment[] {
  const out: PageEnrichment[] = [];
  for (const page of config.pages) {
    const signal = signalForPage(page);
    if (signal) {
      out.push({ pageSlug: page.slug, pageTitle: page.title || '홈', signals: [signal] });
    }
  }
  return out;
}

/** [D3] 페이지 보강 dismiss 상태 localStorage 키 */
export function pageEnrichmentStorageKey(siteId: string): string {
  return `anaks:onboarding:page-enrich:${siteId}`;
}
