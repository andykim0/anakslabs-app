import type { HTMLElement } from 'node-html-parser';
import { claimSourceReport } from './locale-signals';
import type { ScanLocaleContext } from './rules';

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
  /(\uC11C\uC6B8(?:\uD2B9\uBCC4\uC2DC)?|\uBD80\uC0B0(?:\uAD11\uC5ED\uC2DC)?|\uB300\uAD6C(?:\uAD11\uC5ED\uC2DC)?|\uC778\uCC9C(?:\uAD11\uC5ED\uC2DC)?|\uAD11\uC8FC(?:\uAD11\uC5ED\uC2DC)?|\uB300\uC804(?:\uAD11\uC5ED\uC2DC)?|\uC6B8\uC0B0(?:\uAD11\uC5ED\uC2DC)?|\uC138\uC885(?:\uD2B9\uBCC4\uC790\uCE58\uC2DC)?|\uACBD\uAE30(?:\uB3C4)?|\uAC15\uC6D0(?:\uD2B9\uBCC4\uC790\uCE58\uB3C4)?|\uCDA9\uBD81|\uCDA9\uB0A8|\uC804\uBD81|\uC804\uB0A8|\uACBD\uBD81|\uACBD\uB0A8|\uC81C\uC8FC(?:\uD2B9\uBCC4\uC790\uCE58\uB3C4)?)[^\n<]{0,70}(?:\uB85C|\uAE38|\uB3D9|\uAC00|\uC74D|\uBA74|\uB9AC)(?:\s|\d)/;

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
  return /[\uAC00-\uD7A3]/.test(text);
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
  if (/\uC790\uC8FC\s*\uBB3B\uB294\s*\uC9C8\uBB38|faq/i.test(visibleText)) return true;
  const questions = visibleText.match(/[^.!?\n]{2,80}(?:\?|\uFF1F|\uC778\uAC00\uC694|\uD558\uB098\uC694|\uB418\uB098\uC694|\uC788\uB098\uC694)/g) ?? [];
  return questions.length >= 2;
}

export function isListWorthy(text: string): boolean {
  return /(\uBA54\uB274|\uAC00\uACA9|\uC694\uAE08|\uBE44\uC6A9|\uC808\uCC28|\uC21C\uC11C|\uC900\uBE44\uBB3C|\uBE44\uAD50|\uC7A5\uC810|\uB2E8\uC810|\uC11C\uBE44\uC2A4\s*\uD56D\uBAA9|\uCEE4\uB9AC\uD058\uB7FC|\uD504\uB85C\uADF8\uB7A8)/i.test(text);
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
  '\uADF8\uB9AC\uACE0',
  '\uD558\uC9C0\uB9CC',
  '\uC704\uD55C',
  '\uC5D0\uC11C',
  '\uC73C\uB85C',
  '\uD558\uB294',
  '\uC788\uB294',
  '\uC5C6\uB294',
  '\uB300\uD55C',
  '\uD648',
  '\uC18C\uAC1C',
  '\uD398\uC774\uC9C0',
  'website',
  'official',
]);

export function meaningfulTokens(text: string): Set<string> {
  const tokens = text.toLowerCase().match(/[\uAC00-\uD7A3]{2,}|[a-z0-9]{2,}/g) ?? [];
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

export function hasUnsourcedClaimSignals(
  root: HTMLElement,
  visibleText: string,
  locale?: ScanLocaleContext,
): boolean {
  return claimSourceReport(root, visibleText, locale).unsourcedClaimBlocks > 0;
}
