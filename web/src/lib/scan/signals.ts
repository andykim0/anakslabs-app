import type { HTMLElement } from 'node-html-parser';

export type JsonLdNode = Record<string, unknown>;

export interface JsonLdReport {
  blocks: number;
  validBlocks: number;
  invalidBlocks: number;
  nodes: JsonLdNode[];
  types: Set<string>;
}

const LOCAL_TYPES = new Set([
  'LocalBusiness',
  'Restaurant',
  'CafeOrCoffeeShop',
  'Store',
  'BeautySalon',
  'HairSalon',
  'HealthAndBeautyBusiness',
  'MedicalBusiness',
  'MedicalClinic',
  'Dentist',
  'Hospital',
  'Pharmacy',
  'LegalService',
  'ProfessionalService',
  'HomeAndConstructionBusiness',
  'RealEstateAgent',
  'EducationalOrganization',
  'ChildCare',
  'SportsActivityLocation',
  'ExerciseGym',
  'LodgingBusiness',
]);

export const KOREAN_CHANNEL_HOSTS = [
  'blog.naver.com',
  'm.blog.naver.com',
  'smartstore.naver.com',
  'shopping.naver.com',
  'tv.naver.com',
  'chzzk.naver.com',
  'kin.naver.com',
  'pf.kakao.com',
  'story.kakao.com',
  'instagram.com',
  'www.instagram.com',
  'youtube.com',
  'www.youtube.com',
  'x.com',
  'twitter.com',
  'www.facebook.com',
  'facebook.com',
  'threads.net',
  'www.threads.net',
  'tiktok.com',
  'www.tiktok.com',
  'tistory.com',
  'www.daangn.com',
] as const;

const PHONE_RE = /(?:\+82[-.\s]?)?(?:0\d{1,2})[-.\s)]?\d{3,4}[-.\s]?\d{4}/;
const BIZ_RE = /\d{3}-\d{2}-\d{5}/;
const ADDRESS_RE =
  /(서울(?:특별시)?|부산(?:광역시)?|대구(?:광역시)?|인천(?:광역시)?|광주(?:광역시)?|대전(?:광역시)?|울산(?:광역시)?|세종(?:특별자치시)?|경기(?:도)?|강원(?:특별자치도)?|충북|충남|전북|전남|경북|경남|제주(?:특별자치도)?)[^\n<]{0,70}(?:로|길|동|가|읍|면|리)(?:\s|\d)/;

function flattenJsonLd(value: unknown, out: JsonLdNode[]) {
  if (Array.isArray(value)) {
    for (const item of value) flattenJsonLd(item, out);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const node = value as JsonLdNode;
  out.push(node);
  for (const nested of Object.values(node)) {
    if (nested && typeof nested === 'object') flattenJsonLd(nested, out);
  }
}

export function jsonLdReport(root: HTMLElement): JsonLdReport {
  const nodes: JsonLdNode[] = [];
  let validBlocks = 0;
  let invalidBlocks = 0;
  const scripts = root.querySelectorAll('script[type="application/ld+json"]');

  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script.text);
      validBlocks++;
      flattenJsonLd(parsed, nodes);
    } catch {
      invalidBlocks++;
    }
  }

  const types = new Set<string>();
  for (const node of nodes) {
    const type = node['@type'];
    if (typeof type === 'string') types.add(type);
    if (Array.isArray(type)) {
      for (const item of type) if (typeof item === 'string') types.add(item);
    }
  }

  return { blocks: scripts.length, validBlocks, invalidBlocks, nodes, types };
}

export function nodeTypes(node: JsonLdNode): string[] {
  const type = node['@type'];
  if (typeof type === 'string') return [type];
  return Array.isArray(type) ? type.filter((item): item is string => typeof item === 'string') : [];
}

export function nodesOfType(report: JsonLdReport, types: readonly string[]): JsonLdNode[] {
  const wanted = new Set(types);
  return report.nodes.filter((node) => nodeTypes(node).some((type) => wanted.has(type)));
}

export function hasLocalBusinessType(report: JsonLdReport): boolean {
  return [...report.types].some(isLocalBusinessType);
}

export function isLocalBusinessType(type: string): boolean {
  return LOCAL_TYPES.has(type);
}

export function metaContents(root: HTMLElement, names: readonly string[]): string[] {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  return root
    .querySelectorAll('meta[name]')
    .filter((meta) => wanted.has((meta.getAttribute('name') ?? '').toLowerCase()))
    .map((meta) => meta.getAttribute('content')?.trim() ?? '')
    .filter(Boolean);
}

export function robotsDirectives(root: HTMLElement, xRobotsTag = ''): Set<string> {
  const values = [...metaContents(root, ['robots', 'googlebot']), xRobotsTag];
  const directives = new Set<string>();
  for (const value of values) {
    for (const directive of value.toLowerCase().split(/[,\s]+/)) {
      if (directive) directives.add(directive);
    }
  }
  return directives;
}

export function hasNoIndex(root: HTMLElement, xRobotsTag = ''): boolean {
  const directives = robotsDirectives(root, xRobotsTag);
  return directives.has('noindex') || directives.has('none');
}

export function hasSnippetRestriction(root: HTMLElement, xRobotsTag = ''): boolean {
  const directives = robotsDirectives(root, xRobotsTag);
  return (
    directives.has('nosnippet') ||
    directives.has('max-snippet:0') ||
    directives.has('noindex') ||
    directives.has('none')
  );
}

export function hasNaverSourceInfoRestriction(root: HTMLElement): boolean {
  return metaContents(root, ['robots']).some((value) =>
    value.toLowerCase().split(/[,\s]+/).includes('nosourceinfo'),
  );
}

export function canonicalHref(root: HTMLElement): string {
  return root.querySelector('link[rel="canonical"]')?.getAttribute('href')?.trim() ?? '';
}

export function hasKoreanText(text: string): boolean {
  return /[가-힣]/.test(text);
}

export function hasPhone(text: string): boolean {
  return PHONE_RE.test(text);
}

export function hasBusinessNumber(text: string): boolean {
  return BIZ_RE.test(text);
}

export function hasKoreanAddress(text: string): boolean {
  return ADDRESS_RE.test(text);
}

export function supportedChannelUrls(root: HTMLElement): string[] {
  const urls: string[] = [];
  for (const anchor of root.querySelectorAll('a[href]')) {
    const raw = anchor.getAttribute('href')?.trim();
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      if (KOREAN_CHANNEL_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
        urls.push(url.toString());
      }
    } catch {
      // Relative and malformed links are not external channel identities.
    }
  }
  return [...new Set(urls)];
}

export function jsonLdSameAs(report: JsonLdReport): string[] {
  const urls: string[] = [];
  for (const node of report.nodes) {
    const sameAs = node.sameAs;
    if (typeof sameAs === 'string') urls.push(sameAs);
    if (Array.isArray(sameAs)) {
      urls.push(...sameAs.filter((item): item is string => typeof item === 'string'));
    }
  }
  return [...new Set(urls)];
}

export function isArticleLike(
  root: HTMLElement,
  report = jsonLdReport(root),
  url?: URL,
): boolean {
  const ogType =
    root.querySelector('meta[property="og:type"]')?.getAttribute('content')?.trim().toLowerCase() ?? '';
  const editorialArticle = root.querySelector(
    'article[itemtype*="schema.org/Article"], article[class*="article" i], article[class*="post" i], article[class*="news" i], article[id*="article" i], article[id*="post" i]',
  );
  const editorialPath = url
    ? /\/(?:blog|news|articles?|posts?|insights?|guides?)(?:\/|$)/i.test(url.pathname)
    : false;
  return (
    report.types.has('Article') ||
    report.types.has('NewsArticle') ||
    report.types.has('BlogPosting') ||
    ogType === 'article' ||
    Boolean(editorialArticle) ||
    (editorialPath && Boolean(root.querySelector('article')))
  );
}

export function isFaqLike(root: HTMLElement, visibleText: string): boolean {
  if (jsonLdReport(root).types.has('FAQPage')) return true;
  if (/자주\s*묻는\s*질문|faq/i.test(visibleText)) return true;
  const questions = visibleText.match(/[^.!?\n]{2,80}(?:\?|？|인가요|하나요|되나요|있나요)/g) ?? [];
  return questions.length >= 2;
}

export function isListWorthy(text: string): boolean {
  return /(메뉴|가격|요금|비용|절차|순서|준비물|비교|장점|단점|서비스\s*항목|커리큘럼|프로그램)/i.test(text);
}

export function hasUnlabelledControls(root: HTMLElement): boolean {
  for (const button of root.querySelectorAll('button')) {
    const name =
      button.text.trim() ||
      button.getAttribute('aria-label')?.trim() ||
      button.getAttribute('title')?.trim();
    if (!name) return true;
  }

  for (const input of root.querySelectorAll('input, select, textarea')) {
    if ((input.getAttribute('type') ?? '').toLowerCase() === 'hidden') continue;
    const id = input.getAttribute('id')?.trim();
    const matchingLabel = id
      ? root
          .querySelectorAll('label[for]')
          .find((label) => label.getAttribute('for') === id)
          ?.text.trim()
      : '';
    const labelled =
      input.getAttribute('aria-label')?.trim() ||
      input.getAttribute('aria-labelledby')?.trim() ||
      matchingLabel ||
      (input.parentNode && 'tagName' in input.parentNode && input.parentNode.tagName === 'LABEL'
        ? input.parentNode.text.trim()
        : '');
    if (!labelled) return true;
  }
  return false;
}

const TOKEN_STOPWORDS = new Set([
  '그리고',
  '하지만',
  '위한',
  '에서',
  '으로',
  '하는',
  '있는',
  '없는',
  '대한',
  '홈',
  '소개',
  '페이지',
  'website',
  'official',
]);

export function meaningfulTokens(text: string): Set<string> {
  const tokens = text.toLowerCase().match(/[가-힣]{2,}|[a-z0-9]{2,}/g) ?? [];
  return new Set(tokens.filter((token) => !TOKEN_STOPWORDS.has(token)));
}

export function titleHeadingAligned(root: HTMLElement): boolean {
  const title = root.querySelector('title')?.text.trim() ?? '';
  const h1 = root.querySelector('h1')?.text.trim() ?? '';
  if (!title || !h1) return true;
  const titleTokens = meaningfulTokens(title);
  const headingTokens = meaningfulTokens(h1);
  if (titleTokens.size === 0 || headingTokens.size === 0) return true;
  return [...titleTokens].some((token) => headingTokens.has(token));
}

const CLAIM_SIGNAL_RE = /(?:통계|연구|조사|보고서|자료|에 따르면|\d+(?:\.\d+)?\s*%|퍼센트|배 증가|명 중)/;
const LOCAL_SOURCE_SELECTOR = 'cite, a[href^="http://"], a[href^="https://"]';

function hasClaimSourceInSameBlock(block: HTMLElement): boolean {
  if (block.querySelector(LOCAL_SOURCE_SELECTOR)) return true;
  let parent = block.parentNode;
  while (parent && 'tagName' in parent) {
    const element = parent as HTMLElement;
    const tagName = element.tagName.toLowerCase();
    if (tagName === 'section' || tagName === 'article') {
      return Boolean(element.querySelector(LOCAL_SOURCE_SELECTOR));
    }
    if (tagName === 'main' || tagName === 'body') break;
    parent = element.parentNode;
  }
  return false;
}

export function hasUnsourcedClaimSignals(root: HTMLElement, visibleText: string): boolean {
  if (!CLAIM_SIGNAL_RE.test(visibleText)) return false;
  const claimBlocks = root
    .querySelectorAll('p, li, blockquote, dd, td')
    .filter((block) => CLAIM_SIGNAL_RE.test(block.text));
  if (claimBlocks.length > 0) {
    return claimBlocks.some((block) => !hasClaimSourceInSameBlock(block));
  }

  const semanticBlocks = root
    .querySelectorAll('section, article')
    .filter((block) => CLAIM_SIGNAL_RE.test(block.text));
  if (semanticBlocks.length > 0) {
    return semanticBlocks.some((block) => !block.querySelector(LOCAL_SOURCE_SELECTOR));
  }
  return true;
}
