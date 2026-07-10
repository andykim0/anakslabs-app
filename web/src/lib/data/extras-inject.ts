/**
 * [v3 Phase 3] 부가기능(문의 폼·지도·SNS) 요소를 생성된 SiteConfig에 주입하는 후처리.
 *
 * 설계: AiService.generateSiteConfig 계약(동결)을 건드리지 않고, 생성 라우트가
 * 생성 직후 이 순수 함수를 호출한다 — mock/실모드 공통 경로.
 *
 * 배치 규칙: 대상 섹션의 기존 요소 아래(콘텐츠 폭 1200 그리드 내) 빈 y를 계산해 배치하고,
 * 필요하면 섹션 height를 늘린다. 대상 섹션이 없으면 contact 섹션을 자동 추가한다.
 */
import type { ExtraFeatureSelection } from '@/lib/types/domain';
import type {
  ButtonElement,
  CanvasElement,
  FormElement,
  MapElement,
  Section,
  SectionType,
  SiteConfig,
  SocialLinksElement,
} from '@/lib/types/site';
import { isHttpsUrl, isSafeMapEmbedUrl } from '@/lib/safe-url';

export interface ExtrasOptions {
  /** SNS 표현: 묶음 바(socialLinks) vs 개별 버튼(ButtonElement). 기본 bar */
  snsStyle?: 'bar' | 'buttons';
  /** 문의 폼에 받을 필드. 기본 name/phone/message */
  formFields?: FormElement['fields'];
}

const CONTENT_X = 120; // 1440 - 1200 그리드 여백
const CONTENT_W = 1200;
const GAP = 48;

/** 섹션 내 기존 요소들의 최하단 y */
function bottomOf(section: Section): number {
  return section.elements.reduce((max, el) => Math.max(max, el.frame.y + el.frame.h), 96);
}

/** 요소를 섹션 하단에 배치하고 필요 시 섹션 height 확장 */
function placeAtBottom(section: Section, el: CanvasElement): void {
  const y = bottomOf(section) + GAP;
  el.frame = { ...el.frame, y };
  section.elements.push(el);
  const needed = y + el.frame.h + 96;
  if (section.height < needed) section.height = needed;
}

function maxZ(section: Section): number {
  return section.elements.reduce((m, el) => Math.max(m, el.z), 0) + 1;
}

/**
 * 대상 섹션 선택: 같은 type이 여러 개면 id 접미(form/map 등 variant 유래)가
 * prefer와 일치하는 것을 우선, 없으면 그 type의 마지막 섹션.
 */
function findTarget(config: SiteConfig, type: SectionType, prefer?: 'form' | 'map'): Section | undefined {
  const candidates = config.sections.filter((s) => s.type === type);
  if (candidates.length === 0) return undefined;
  if (prefer) {
    const preferred = candidates.find((s) => s.id.includes(prefer));
    if (preferred) return preferred;
  }
  return candidates[candidates.length - 1];
}

/** contact 섹션이 아예 없을 때 최소 문의 섹션을 만들어 맨 뒤(footer 앞)에 추가 */
function ensureContactSection(config: SiteConfig): Section {
  const existing = findTarget(config, 'contact');
  if (existing) return existing;

  const theme = config.theme;
  const usedIds = new Set(config.sections.map((s) => s.id));
  let id = 'sec-contact';
  let n = 2;
  while (usedIds.has(id)) id = `sec-contact-${n++}`;

  const section: Section = {
    id,
    type: 'contact',
    name: '문의',
    height: 360,
    background: { color: theme.palette.surface },
    elements: [
      {
        id: `${id}-title`,
        kind: 'text',
        frame: { x: CONTENT_X, y: 96, w: CONTENT_W, h: 56 },
        z: 2,
        text: '문의',
        style: { fontSize: 40, fontWeight: 400, fontFamily: 'heading', color: theme.palette.text, align: 'left' },
      },
    ],
  };
  config.sections.push(section);
  return section;
}

/**
 * 부가기능 선택을 생성된 config(사본)에 주입해 반환.
 * 유효하지 않은 입력(화이트리스트 밖 지도 URL, http SNS 링크)은 조용히 건너뛴다
 * (API 계층 zod가 1차 방어 — 여기는 심층 방어).
 */
export function applyExtraFeatures(
  input: SiteConfig,
  extras: ExtraFeatureSelection | undefined,
  opts: ExtrasOptions = {},
): SiteConfig {
  if (!extras || (!extras.contactForm && !extras.mapEmbed && !extras.snsLinks?.length)) return input;
  const config = structuredClone(input);
  const theme = config.theme;
  const radius = theme.radius ?? 8;

  // 지도 — contact:map 섹션 우선
  if (extras.mapEmbed && isSafeMapEmbedUrl(extras.mapEmbed.embedUrl)) {
    const target =
      findTarget(config, extras.mapEmbed.targetSection, 'map') ?? ensureContactSection(config);
    const el: MapElement = {
      id: `el-extra-map-${target.id}`,
      kind: 'map',
      frame: { x: CONTENT_X, y: 0, w: CONTENT_W, h: 400 },
      z: maxZ(target),
      embedUrl: extras.mapEmbed.embedUrl,
      style: { borderRadius: radius },
    };
    placeAtBottom(target, el);
  }

  // 문의 폼 — contact:form 섹션 우선
  if (extras.contactForm) {
    const target =
      findTarget(config, extras.contactForm.targetSection, 'form') ?? ensureContactSection(config);
    const fields: FormElement['fields'] =
      opts.formFields && opts.formFields.length > 0 ? opts.formFields : ['name', 'phone', 'message'];
    const height = 96 + fields.length * 76 + (fields.includes('message') ? 60 : 0);
    const el: FormElement = {
      id: `el-extra-form-${target.id}`,
      kind: 'form',
      frame: { x: 360, y: 0, w: 720, h: height },
      z: maxZ(target),
      formType: 'contact',
      fields,
      submitLabel: '문의 보내기',
      style: { variant: 'card', borderRadius: radius },
    };
    placeAtBottom(target, el);
  }

  // SNS — contact류 마지막 섹션(없으면 마지막 섹션)에 배치
  const validSns = (extras.snsLinks ?? []).filter((l) => isHttpsUrl(l.url));
  if (validSns.length > 0) {
    const target =
      findTarget(config, 'contact') ?? config.sections[config.sections.length - 1] ?? ensureContactSection(config);
    if (opts.snsStyle === 'buttons') {
      // 개별 버튼 — 에디터에서 자유 이동·URL 수정 가능
      const w = 220;
      const gap = 24;
      const total = validSns.length * w + (validSns.length - 1) * gap;
      const startX = Math.max(CONTENT_X, Math.round((1440 - total) / 2));
      const y = bottomOf(target) + GAP;
      validSns.forEach((link, i) => {
        const btn: ButtonElement = {
          id: `el-extra-sns-${target.id}-${i}`,
          kind: 'button',
          frame: { x: startX + i * (w + gap), y, w, h: 52 },
          z: maxZ(target),
          label: link.label || SNS_LABELS[link.kind] || '링크',
          href: link.url,
          style: { variant: 'outline', fontSize: 15, borderRadius: radius },
        };
        target.elements.push(btn);
      });
      const needed = y + 52 + 96;
      if (target.height < needed) target.height = needed;
    } else {
      const el: SocialLinksElement = {
        id: `el-extra-sns-${target.id}`,
        kind: 'socialLinks',
        frame: { x: 360, y: 0, w: 720, h: 56 },
        z: maxZ(target),
        links: validSns.map((l) => ({ kind: l.kind, url: l.url, label: l.label })),
        style: { direction: 'row', size: 44 },
      };
      placeAtBottom(target, el);
    }
  }

  return config;
}

const SNS_LABELS: Record<string, string> = {
  instagram: '인스타그램',
  kakao_channel: '카카오 채널',
  naver_blog: '네이버 블로그',
  youtube: '유튜브',
  x: 'X',
  custom: '링크',
};
