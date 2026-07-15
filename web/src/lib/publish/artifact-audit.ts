/**
 * [Q$6] 발행 산출물 하드 게이트.
 *
 * 실제 브라우저 계측이 필요한 CLS 점수나 외부 URL 생존 여부를 과장하지 않는다. 여기서 증명하는 것은
 * 정적 HTML/구조 불변식뿐이다: LCP hero poster, 예약된 미디어 레이아웃, 동기 외부 script 부재,
 * 정적 본문·schema.org, 내부 링크 타깃, 비어 있지 않은 페이지/섹션.
 */
import { parse } from 'node-html-parser';
import type { MotionTier, Section, SiteConfig, SitePage } from '@/lib/types/site';
import { findPage } from '@/lib/types/site';
import { resolveMotionPlan } from '@/lib/motion/apply';
import { schemaSpecFor } from '@/lib/seo/structured-data';
import { isHttpsUrl, isSafeHref } from '@/lib/safe-url';

export type PublishArtifactCode =
  | 'lcp_hero_poster'
  | 'lcp_hero_preload'
  | 'hero_video_lazy'
  | 'reserved_layout'
  | 'blocking_external_script'
  | 'static_main'
  | 'static_h1'
  | 'static_text'
  | 'schema_json'
  | 'schema_context'
  | 'schema_type'
  | 'broken_internal_link'
  | 'empty_page'
  | 'empty_section';

export interface PublishArtifactBlocker {
  code: PublishArtifactCode;
  message: string;
  pageSlug?: string;
  sectionId?: string;
}

export interface PublishArtifactAudit {
  blockers: PublishArtifactBlocker[];
}

export interface RenderedPublishPage {
  pageSlug: string;
  html: string;
}

// 200자 미만은 기존 GEO 점수/경고가 담당한다. 하드 게이트는 JS 없이 읽을 본문이 사실상 없는 경우만 막는다.
const STATIC_TEXT_HARD_MIN = 20;
const LEGAL_PATHS = new Set(['/privacy', '/terms']);

function pageLabel(page: SitePage): string {
  return page.slug === '' ? '홈' : page.title;
}

function push(
  blockers: PublishArtifactBlocker[],
  code: PublishArtifactCode,
  message: string,
  detail?: Pick<PublishArtifactBlocker, 'pageSlug' | 'sectionId'>,
): void {
  blockers.push({ code, message, ...detail });
}

function visibleSections(page: SitePage): Section[] {
  return page.sections.filter((section) => !section.hidden);
}

/** 장식이 아니라 방문자가 실제로 읽거나 사용할 수 있는 내용이 하나라도 있는가. */
export function sectionHasMeaningfulContent(section: Section): boolean {
  if (section.acts?.some((act) => act.heading.trim() || act.body.trim())) return true;
  if (section.background.image?.src.trim() || section.background.video?.src.trim()) return true;
  return section.elements.some((element) => {
    if (element.kind === 'text') return element.text.trim().length > 0;
    if (element.kind === 'image' || element.kind === 'video') return element.src.trim().length > 0;
    if (element.kind === 'button') return element.label.trim().length > 0 && element.href.trim().length > 0 && element.href.trim() !== '#';
    if (element.kind === 'form') return element.fields.length > 0 && element.submitLabel.trim().length > 0;
    if (element.kind === 'map') return element.embedUrl.trim().length > 0;
    if (element.kind === 'socialLinks') return element.links.some((link) => link.url.trim().length > 0);
    return false;
  });
}

function auditReservedLayout(config: SiteConfig, blockers: PublishArtifactBlocker[]): void {
  for (const page of config.pages) {
    for (const section of visibleSections(page)) {
      if (!Number.isFinite(section.height) || section.height <= 0) {
        push(
          blockers,
          'reserved_layout',
          `${pageLabel(page)}의 섹션 '${section.name}' 높이가 예약되지 않아 화면이 움직일 수 있습니다.`,
          { pageSlug: page.slug, sectionId: section.id },
        );
      }
      for (const element of section.elements) {
        if (element.kind !== 'image' && element.kind !== 'video' && element.kind !== 'map') continue;
        if (
          !Number.isFinite(element.frame.w) ||
          !Number.isFinite(element.frame.h) ||
          element.frame.w <= 0 ||
          element.frame.h <= 0
        ) {
          push(
            blockers,
            'reserved_layout',
            `${pageLabel(page)}의 미디어 요소(${element.id})에 유효한 폭·높이가 없습니다.`,
            { pageSlug: page.slug, sectionId: section.id },
          );
        }
      }
    }
  }
}

function targetPageForPath(config: SiteConfig, path: string): SitePage | undefined {
  if (path === '' || path === '/') return findPage(config, '');
  const slug = path.replace(/^\/+|\/+$/g, '');
  return findPage(config, slug);
}

function structurallyValidContactHref(href: string): boolean {
  if (href.toLowerCase().startsWith('mailto:')) {
    const value = href.slice(href.indexOf(':') + 1).trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }
  if (href.toLowerCase().startsWith('tel:')) {
    const digits = href.slice(href.indexOf(':') + 1).replace(/\D/g, '');
    return digits.length >= 7;
  }
  return true;
}

function auditLinks(config: SiteConfig, blockers: PublishArtifactBlocker[]): void {
  const sectionIds = new Map(config.pages.map((page) => [
    page.slug,
    new Set(visibleSections(page).map((section) => section.id)),
  ]));

  for (const page of config.pages) {
    for (const section of visibleSections(page)) {
      for (const element of section.elements) {
        if (element.kind === 'socialLinks') {
          for (const link of element.links) {
            if (!link.url.trim() || !isHttpsUrl(link.url)) {
              push(
                blockers,
                'broken_internal_link',
                `${pageLabel(page)}의 SNS 링크(${link.label || link.kind})가 비어 있거나 올바른 https 주소가 아닙니다.`,
                { pageSlug: page.slug, sectionId: section.id },
              );
            }
          }
          continue;
        }
        if (element.kind !== 'button') continue;
        const href = element.href.trim();
        const detail = { pageSlug: page.slug, sectionId: section.id };
        if (!href || href === '#' || !isSafeHref(href) || !structurallyValidContactHref(href)) {
          push(blockers, 'broken_internal_link', `${pageLabel(page)}의 버튼 '${element.label}' 링크가 연결되지 않았습니다.`, detail);
          continue;
        }
        if (/^(?:mailto:|tel:)/i.test(href)) continue;
        if (/^https?:\/\//i.test(href)) {
          try {
            const url = new URL(href);
            if (!url.hostname) throw new Error('hostname missing');
          } catch {
            push(blockers, 'broken_internal_link', `${pageLabel(page)}의 버튼 '${element.label}' 외부 주소 형식이 올바르지 않습니다.`, detail);
          }
          continue;
        }

        const hashOnly = href.startsWith('#');
        let url: URL;
        try {
          url = new URL(href, 'https://publish.local');
        } catch {
          push(blockers, 'broken_internal_link', `${pageLabel(page)}의 버튼 '${element.label}' 내부 주소 형식이 올바르지 않습니다.`, detail);
          continue;
        }
        if (LEGAL_PATHS.has(url.pathname) && !url.hash) continue;
        const targetPage = hashOnly ? page : targetPageForPath(config, url.pathname);
        if (!targetPage) {
          push(blockers, 'broken_internal_link', `${pageLabel(page)}의 버튼 '${element.label}'이 없는 페이지를 가리킵니다.`, detail);
          continue;
        }
        if (url.hash) {
          let targetId = '';
          try {
            targetId = decodeURIComponent(url.hash.slice(1));
          } catch {
            targetId = '';
          }
          if (!targetId || !sectionIds.get(targetPage.slug)?.has(targetId)) {
            push(blockers, 'broken_internal_link', `${pageLabel(page)}의 버튼 '${element.label}'이 없는 섹션을 가리킵니다.`, detail);
          }
        }
      }
    }
  }
}

function auditEmptyContent(config: SiteConfig, blockers: PublishArtifactBlocker[]): void {
  for (const page of config.pages) {
    const sections = visibleSections(page);
    if (sections.length === 0) {
      push(blockers, 'empty_page', `${pageLabel(page)} 페이지에 발행할 섹션이 없습니다.`, { pageSlug: page.slug });
      continue;
    }
    for (const section of sections) {
      if (sectionHasMeaningfulContent(section)) continue;
      push(
        blockers,
        'empty_section',
        `${pageLabel(page)}의 섹션 '${section.name}'에 발행할 내용이 없습니다.`,
        { pageSlug: page.slug, sectionId: section.id },
      );
    }
  }
}

function nodeTypes(node: Record<string, unknown>): string[] {
  const value = node['@type'];
  if (typeof value === 'string') return [value];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function expectedOrganizationTypes(config: SiteConfig): string[] {
  const spec = schemaSpecFor(config.meta.purposeId);
  if (spec) {
    const { orgType } = spec;
    return typeof orgType === 'string' ? [orgType] : [...orgType];
  }
  const hasMenu = config.pages.some((page) => page.sections.some((section) => section.type === 'menu'));
  return [hasMenu ? 'LocalBusiness' : 'Organization'];
}

function auditSchema(
  config: SiteConfig,
  page: SitePage,
  root: ReturnType<typeof parse>,
  blockers: PublishArtifactBlocker[],
): void {
  const scripts = root.querySelectorAll('script[type="application/ld+json"]');
  const nodes: Record<string, unknown>[] = [];
  let malformed = scripts.length === 0;
  for (const script of scripts) {
    try {
      const value = JSON.parse(script.text) as unknown;
      const candidates = Array.isArray(value) ? value : [value];
      for (const candidate of candidates) {
        if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
          nodes.push(candidate as Record<string, unknown>);
        }
      }
    } catch {
      malformed = true;
    }
  }
  if (malformed || nodes.length === 0) {
    push(blockers, 'schema_json', `${pageLabel(page)}의 schema.org JSON-LD가 없거나 파싱할 수 없습니다.`, { pageSlug: page.slug });
    return;
  }
  if (nodes.some((node) => node['@context'] !== 'https://schema.org')) {
    push(blockers, 'schema_context', `${pageLabel(page)}의 구조화 데이터 schema.org 문맥이 올바르지 않습니다.`, { pageSlug: page.slug });
  }
  const types = new Set(nodes.flatMap(nodeTypes));
  const expected = expectedOrganizationTypes(config);
  if (!types.has('WebSite') || expected.some((type) => !types.has(type))) {
    push(
      blockers,
      'schema_type',
      `${pageLabel(page)}의 구조화 데이터에 필요한 타입(WebSite·${expected.join('·')})이 없습니다.`,
      { pageSlug: page.slug },
    );
  }
}

function auditStaticDocument(
  config: SiteConfig,
  page: SitePage,
  html: string,
  blockers: PublishArtifactBlocker[],
): ReturnType<typeof parse> {
  const root = parse(html);
  const mains = root.querySelectorAll('main');
  if (mains.length !== 1) {
    push(blockers, 'static_main', `${pageLabel(page)}의 정적 HTML에 본문(<main>)이 정확히 하나 있어야 합니다.`, { pageSlug: page.slug });
  }
  const h1s = root.querySelectorAll('h1');
  if (h1s.length !== 1 || !(h1s[0]?.text ?? '').trim()) {
    push(blockers, 'static_h1', `${pageLabel(page)}의 정적 HTML에 유효한 대표 제목(H1)이 정확히 하나 있어야 합니다.`, { pageSlug: page.slug });
  }
  const main = mains[0];
  const semanticCount = main?.querySelectorAll('p, li, h1, h2, h3, td, dd').length ?? 0;
  let text = '';
  if (main) {
    const clone = parse(main.toString());
    for (const element of clone.querySelectorAll('script, style, noscript, template')) element.remove();
    text = clone.text.replace(/\s+/g, '').trim();
  }
  if (text.length < STATIC_TEXT_HARD_MIN || semanticCount < 3) {
    push(
      blockers,
      'static_text',
      `${pageLabel(page)}의 정적 본문이 너무 적어 검색·답변 엔진이 읽을 근거가 없습니다.`,
      { pageSlug: page.slug },
    );
  }

  for (const script of root.querySelectorAll('script[src]')) {
    const type = (script.getAttribute('type') ?? '').trim().toLowerCase();
    if (script.hasAttribute('async') || script.hasAttribute('defer') || type === 'module') continue;
    push(
      blockers,
      'blocking_external_script',
      `${pageLabel(page)}의 정적 HTML에 동기 외부 스크립트(${script.getAttribute('src') ?? ''})가 있습니다.`,
      { pageSlug: page.slug },
    );
  }

  auditSchema(config, page, root, blockers);
  return root;
}

function auditHeroMedia(
  config: SiteConfig,
  tier: MotionTier,
  page: SitePage,
  root: ReturnType<typeof parse>,
  blockers: PublishArtifactBlocker[],
): void {
  const sections = visibleSections(page);
  const hero = sections.find((section) => section.type === 'hero');
  if (!hero?.background.video?.src) return;

  const plan = resolveMotionPlan(config, { tier });
  const active =
    plan.videoHeroSections.has(hero.id) ||
    plan.cinematicHeroSections.has(hero.id) ||
    plan.scrollScrubSections.has(hero.id) ||
    plan.scrollytellingSections.has(hero.id);
  if (!active) return;

  const poster = hero.background.video.poster?.trim();
  const detail = { pageSlug: page.slug, sectionId: hero.id };
  if (!poster) {
    push(blockers, 'lcp_hero_poster', `${pageLabel(page)}의 활성 히어로 영상에 정적 poster가 없습니다.`, detail);
    return;
  }

  const heroVideos = root.querySelectorAll(
    'video[data-m="videohero"], video[data-m="cinematicvideo"], video[data-ss-video]',
  );
  if (heroVideos.length === 0) {
    push(blockers, 'lcp_hero_poster', `${pageLabel(page)}의 활성 히어로 영상이 정적 산출물에 렌더되지 않았습니다.`, detail);
  }
  if (heroVideos.some((video) => (video.getAttribute('preload') ?? '').toLowerCase() !== 'none')) {
    push(blockers, 'hero_video_lazy', `${pageLabel(page)}의 히어로 영상이 지연 로드(preload=none)되지 않습니다.`, detail);
  }

  const posterImages = root.querySelectorAll('img').filter((image) => image.getAttribute('src') === poster);
  if (posterImages.length === 0) {
    push(blockers, 'lcp_hero_poster', `${pageLabel(page)}의 히어로 poster가 정적 HTML에 없습니다.`, detail);
  }

  // 첫 섹션의 히어로만 LCP 후보다. 후속 hero는 poster만 확인하고 불필요한 preload를 강제하지 않는다.
  if (sections[0]?.id !== hero.id) return;
  const preloads = root.querySelectorAll('link[rel="preload"]').filter((link) =>
    (link.getAttribute('as') ?? '').toLowerCase() === 'image' &&
    link.getAttribute('href') === poster &&
    (link.getAttribute('fetchpriority') ?? '').toLowerCase() === 'high',
  );
  if (preloads.length !== 1) {
    push(blockers, 'lcp_hero_preload', `${pageLabel(page)}의 히어로 poster preload가 head에 정확히 한 번 있어야 합니다.`, detail);
  }
  const eagerPoster = posterImages.some((image) =>
    (image.getAttribute('loading') ?? '').toLowerCase() === 'eager' &&
    (image.getAttribute('fetchpriority') ?? '').toLowerCase() === 'high',
  );
  if (!eagerPoster) {
    push(blockers, 'lcp_hero_preload', `${pageLabel(page)}의 첫 히어로 poster가 eager/high 우선순위가 아닙니다.`, detail);
  }
}

/** 렌더된 전 페이지와 원 config를 함께 검사한다. 외부 네트워크 호출은 하지 않는다. */
export function auditPublishArtifacts(
  config: SiteConfig,
  tier: MotionTier,
  renderedPages: readonly RenderedPublishPage[],
): PublishArtifactAudit {
  const blockers: PublishArtifactBlocker[] = [];
  auditReservedLayout(config, blockers);
  auditLinks(config, blockers);
  auditEmptyContent(config, blockers);

  const documents = new Map(renderedPages.map((document) => [document.pageSlug, document.html]));
  for (const page of config.pages) {
    const html = documents.get(page.slug);
    if (!html) {
      push(blockers, 'static_main', `${pageLabel(page)}의 정적 발행 문서를 만들지 못했습니다.`, { pageSlug: page.slug });
      continue;
    }
    const root = auditStaticDocument(config, page, html, blockers);
    auditHeroMedia(config, tier, page, root, blockers);
  }

  const deduped = new Map<string, PublishArtifactBlocker>();
  for (const blocker of blockers) {
    const key = `${blocker.code}:${blocker.pageSlug ?? ''}:${blocker.sectionId ?? ''}:${blocker.message}`;
    deduped.set(key, blocker);
  }
  return { blockers: [...deduped.values()] };
}
