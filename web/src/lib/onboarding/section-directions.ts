import {
  DESIGN_WIDTH,
  SECTION_DIRECTION_GUIDES,
  type CanvasElement,
  type Section,
  type SectionDirection,
  type SectionDirectionGuide,
  type SiteConfig,
  type SiteTheme,
} from '@/lib/types/site';
import { resolveScrimWithOverride } from '@/lib/design/scrim';

export interface SectionReviewTarget {
  pageSlug: string;
  pageTitle: string;
  sectionId: string;
  sectionName: string;
}

const GUIDE_SET = new Set<string>(SECTION_DIRECTION_GUIDES);

const GUIDE_PROMPTS: Record<SectionDirectionGuide, string> = {
  '더 미니멀': 'reduce decorative weight and keep the composition restrained',
  '사진 더 크게': 'increase the visual area while preserving every original image source',
  '톤 더 따뜻하게': 'add a subtle warm photographic overlay without changing factual content',
  '여백 늘리기': 'increase section breathing room and preserve the reading order',
  '카피 강조': 'strengthen the existing primary copy hierarchy without rewriting it',
  '신뢰 요소 강조': 'visually emphasize existing proof only; never invent a claim or number',
  '더 역동적으로': 'use restrained entrance movement on existing elements',
  '색상 차분하게': 'quiet the image treatment with a low-saturation overlay',
};

function normalizeDirection(direction: SectionDirection): SectionDirection | null {
  const sectionId = typeof direction.sectionId === 'string' ? direction.sectionId.trim().slice(0, 100) : '';
  if (!sectionId || !['keep', 'regenerate', 'adjust'].includes(direction.intent)) return null;
  const note = typeof direction.note === 'string' ? direction.note.trim().slice(0, 500) : undefined;
  const guided = Array.isArray(direction.guided)
    ? [...new Set(direction.guided.filter((guide): guide is SectionDirectionGuide => GUIDE_SET.has(guide)))].slice(
        0,
        SECTION_DIRECTION_GUIDES.length,
      )
    : undefined;
  return {
    sectionId,
    intent: direction.intent,
    ...(note ? { note } : {}),
    ...(guided?.length ? { guided } : {}),
  };
}

export function reviewTargets(config: SiteConfig): SectionReviewTarget[] {
  return config.pages.flatMap((page) =>
    page.sections
      .filter((section) => !section.hidden)
      .map((section) => ({
        pageSlug: page.slug,
        pageTitle: page.title,
        sectionId: section.id,
        sectionName: section.name,
      })),
  );
}

/** 실제 렌더러로 타깃 한 섹션만 보여주는 저장 불가 projection. */
export function configForSectionReview(config: SiteConfig, pageSlug: string, sectionId: string): SiteConfig {
  const page = config.pages.find((candidate) => candidate.slug === pageSlug);
  const section = page?.sections.find((candidate) => candidate.id === sectionId);
  if (!page || !section) return config;
  return {
    ...config,
    pages: [{ ...page, slug: '', sections: [section], showInNav: false }],
    nav: { enabled: false },
  };
}

function clampFrame(element: CanvasElement, scale: number): CanvasElement {
  const nextW = Math.min(DESIGN_WIDTH, Math.max(1, Math.round(element.frame.w * scale)));
  const nextH = Math.max(1, Math.round(element.frame.h * scale));
  const centerX = element.frame.x + element.frame.w / 2;
  const nextX = Math.max(0, Math.min(DESIGN_WIDTH - nextW, Math.round(centerX - nextW / 2)));
  const nextY = Math.max(0, Math.round(element.frame.y - (nextH - element.frame.h) / 2));
  return { ...element, frame: { x: nextX, y: nextY, w: nextW, h: nextH } };
}

function mirrorLayout(section: Section): Section {
  return {
    ...section,
    elements: section.elements.map((element, index) => ({
      ...element,
      frame: {
        ...element.frame,
        x: Math.max(0, Math.min(DESIGN_WIDTH - element.frame.w, DESIGN_WIDTH - element.frame.x - element.frame.w)),
      },
      entrance: {
        effect: index % 2 === 0 ? 'fade-up' : 'slide-left',
        duration: 650,
        delay: Math.min(index * 70, 350),
      },
    })),
  };
}

/** 자유 메모 중 현재 결정적 조정 엔진이 실제로 이해하는 등록 방향만 반환한다. */
export function sectionDirectionGuidesFromNote(note: string | undefined): SectionDirectionGuide[] {
  if (!note) return [];
  const matches: SectionDirectionGuide[] = [];
  if (/미니멀|단순|덜어/.test(note)) matches.push('더 미니멀');
  if (/(?:사진|이미지).{0,8}(?:크게|키워|강조)/.test(note)) matches.push('사진 더 크게');
  if (/따뜻|온기|웜/.test(note)) matches.push('톤 더 따뜻하게');
  if (/여백|숨 쉴|간격/.test(note)) matches.push('여백 늘리기');
  if (/카피|문구|헤드라인|글자/.test(note)) matches.push('카피 강조');
  if (/신뢰|후기|실적|증거/.test(note)) matches.push('신뢰 요소 강조');
  if (/역동|움직임|강하게/.test(note)) matches.push('더 역동적으로');
  if (/차분|채도|색.*줄/.test(note)) matches.push('색상 차분하게');
  return matches;
}

function applyImageTone(
  section: Section,
  palette: SiteTheme['palette'],
  overlayColor: string,
): Section {
  if (!section.background.image) return section;
  const scrim = resolveScrimWithOverride(
    palette,
    overlayColor,
    section.background.image.overlayOpacity,
  );
  return {
    ...section,
    background: {
      ...section.background,
      image: {
        ...section.background.image,
        overlayColor: scrim.overlayColor,
        overlayOpacity: scrim.overlayOpacity,
      },
    },
    elements: section.elements.map((element) =>
      element.kind === 'text'
        ? { ...element, style: { ...element.style, color: scrim.textColor } }
        : element,
    ),
  };
}

function adjustSection(
  section: Section,
  direction: SectionDirection,
  palette: SiteTheme['palette'],
): Section {
  const guides = [
    ...new Set([...(direction.guided ?? []), ...sectionDirectionGuidesFromNote(direction.note)]),
  ];
  let next = section;

  for (const guide of guides) {
    if (guide === '더 미니멀') {
      next = {
        ...next,
        elements: next.elements.map((element) =>
          element.kind === 'shape' || element.kind === 'divider'
            ? { ...element, opacity: Math.min(element.opacity ?? 1, 0.42) }
            : element,
        ),
      };
    } else if (guide === '사진 더 크게') {
      next = {
        ...next,
        elements: next.elements.map((element) => (element.kind === 'image' ? clampFrame(element, 1.14) : element)),
      };
    } else if (guide === '톤 더 따뜻하게') {
      next = applyImageTone(next, palette, '#4a2418');
    } else if (guide === '여백 늘리기') {
      next = { ...next, height: Math.min(2400, Math.round(next.height * 1.12)) };
    } else if (guide === '카피 강조') {
      const text = next.elements
        .filter((element): element is Extract<CanvasElement, { kind: 'text' }> => element.kind === 'text')
        .sort((a, b) => b.style.fontSize - a.style.fontSize)[0];
      if (text) {
        next = {
          ...next,
          elements: next.elements.map((element) =>
            element.id === text.id && element.kind === 'text'
              ? { ...element, style: { ...element.style, fontSize: Math.round(element.style.fontSize * 1.1), fontWeight: Math.max(element.style.fontWeight ?? 400, 700) } }
              : element,
          ),
        };
      }
    } else if (guide === '신뢰 요소 강조') {
      const proof = next.elements.find(
        (element) => element.kind === 'text' && (/\d/.test(element.text) || /후기|실적|인증|경력/.test(element.text)),
      );
      if (proof) {
        next = {
          ...next,
          elements: next.elements.map((element) =>
            element.id === proof.id && element.kind === 'text'
              ? { ...element, z: element.z + 1, style: { ...element.style, fontWeight: Math.max(element.style.fontWeight ?? 400, 700) } }
              : element,
          ),
        };
      }
    } else if (guide === '더 역동적으로') {
      next = {
        ...next,
        elements: next.elements.map((element, index) => ({
          ...element,
          entrance: {
            effect: index % 2 === 0 ? 'fade-up' : 'slide-right',
            duration: 650,
            delay: Math.min(index * 80, 400),
          },
        })),
      };
    } else if (guide === '색상 차분하게') {
      next = applyImageTone(next, palette, '#16233c');
    }
  }
  return next;
}

/**
 * 타깃 섹션의 시각 속성만 바꾸고 방향 이력을 append한다.
 * keep은 섹션 객체를 그대로 보존하며, 타깃 밖 page/section은 reference equality도 유지한다.
 */
export function applySectionDirection(config: SiteConfig, rawDirection: SectionDirection): SiteConfig {
  const direction = normalizeDirection(rawDirection);
  if (!direction) return config;
  let found = false;
  const pages = config.pages.map((page) => {
    if (found || !page.sections.some((section) => section.id === direction.sectionId)) return page;
    const sections = page.sections.map((section) => {
      if (found || section.id !== direction.sectionId) return section;
      found = true;
      if (direction.intent === 'keep') return section;
      const redesigned = direction.intent === 'regenerate' ? mirrorLayout(section) : section;
      return adjustSection(redesigned, direction, config.theme.palette);
    });
    return { ...page, sections };
  });
  if (!found) return config;
  return {
    ...config,
    pages,
    directions: [...(config.directions ?? []), direction],
  };
}

/**
 * 생성 파이프라인이 저장된 이력을 순서대로 재현한다. buildSiteConfigFromSurvey가 이미 원본 이력을
 * 보존하므로 시각 변형 중에는 임시 history를 비우고 마지막에 정확히 한 번 복원한다.
 */
export function applySectionDirections(
  config: SiteConfig,
  directions: readonly SectionDirection[] | undefined,
): SiteConfig {
  if (!directions?.length) return config;
  const persisted = config.directions;
  let next: SiteConfig = { ...config, directions: undefined };
  for (const direction of directions) next = applySectionDirection(next, direction);
  return { ...next, directions: persisted ?? directions.map((direction) => ({ ...direction })) };
}

/**
 * StrictMode dedup intent에 direction 이력 전체를 짧고 결정적으로 포함한다.
 * 자유 메모 원문을 모듈 캐시 key로 길게 복사하지 않고, 순서가 달라지면 반드시 다른 서명을 낸다.
 */
export function sectionDirectionsIntent(directions: readonly SectionDirection[] | undefined): string {
  const normalized = (directions ?? [])
    .map((direction) => normalizeDirection(direction))
    .filter((direction): direction is SectionDirection => direction !== null);
  const value = JSON.stringify(normalized);
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `directions:${(hash >>> 0).toString(16).padStart(8, '0')}:${value.length}`;
}

/** 생성/향후 AI 편집 경계가 소비할 결정적 방향 문자열. 고객의 사실을 새로 만들라는 지시는 넣지 않는다. */
export function sectionDirectionPrompt(direction: SectionDirection): string {
  const normalized = normalizeDirection(direction);
  if (!normalized) return '';
  const guided = (normalized.guided ?? []).map((guide) => GUIDE_PROMPTS[guide]).join('; ');
  return [
    `Target section id: ${normalized.sectionId}.`,
    `Intent: ${normalized.intent}.`,
    guided ? `Registered visual directions: ${guided}.` : '',
    normalized.note ? `Customer note: ${normalized.note}.` : '',
    'Preserve every supplied fact, number, name, media source, label, and link exactly; do not invent content.',
  ].filter(Boolean).join(' ');
}

/** facts/media/actions fingerprint — layout/style changes must leave this value byte-identical. */
export function sectionContentFingerprint(section: Section): string {
  const elementFacts = section.elements.map((element) => {
    switch (element.kind) {
      case 'text': return { id: element.id, kind: element.kind, text: element.text };
      case 'image': return { id: element.id, kind: element.kind, src: element.src, alt: element.alt };
      case 'button': return { id: element.id, kind: element.kind, label: element.label, href: element.href };
      case 'video': return { id: element.id, kind: element.kind, src: element.src, poster: element.poster };
      case 'form': return { id: element.id, kind: element.kind, fields: element.fields, submitLabel: element.submitLabel };
      case 'map': return { id: element.id, kind: element.kind, embedUrl: element.embedUrl };
      case 'socialLinks': return { id: element.id, kind: element.kind, links: element.links };
      default: return { id: element.id, kind: element.kind };
    }
  });
  return JSON.stringify({
    id: section.id,
    type: section.type,
    name: section.name,
    acts: section.acts,
    backgroundImage: section.background.image?.src,
    backgroundVideo: section.background.video
      ? { src: section.background.video.src, poster: section.background.video.poster }
      : undefined,
    elementFacts,
  });
}
