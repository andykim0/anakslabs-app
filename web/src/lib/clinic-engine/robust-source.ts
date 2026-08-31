import { createHash } from 'node:crypto';
import {
  NodeType,
  parse,
  type HTMLElement,
  type Node,
} from 'node-html-parser';
import type {
  CrawlArtifactPayload,
  CrawlConsentedSourceBlock,
  CrawlImageCandidate,
  CrawlPageArtifact,
} from '@/lib/crawl/contracts';
import { isSafeMediaSrc } from '@/lib/safe-url';
import type { ClinicMasterSourceBlock } from '@/lib/clinic-master/compiler';
import type { BusinessInfo } from '@/lib/types/site';
import {
  clinicPhotoGate,
  prospectPublicSourceImages,
  sourceImageIsBeforeAfter,
  type ProjectedUsDemoSourceImage,
} from '@/lib/us-demo/source-images';
import type { ClinicEngineProfile } from './contracts';
import type { ClinicLayoutImage } from './layout-sections';
import {
  classifyOverlayUiChrome,
  overlayElementPath,
  vetoOverlayUiChromeClassification,
  type OverlayContentVetoEvidence,
  type OverlayRemovalEvidence,
  type OverlayUiChromeEvidence,
} from './overlay-ui-chrome';
import { stripShortcodes } from '@/lib/import/extract';

const CONTENT_BLOCK_TAGS = new Set([
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'P',
  'LI',
  'DT',
  'DD',
  'ADDRESS',
  'FIGCAPTION',
  'BLOCKQUOTE',
  'PRE',
  'TH',
  'TD',
]);
const GENERIC_BLOCK_TAGS = new Set([
  'ARTICLE',
  'ASIDE',
  'DIV',
  'SECTION',
  'A',
  'BUTTON',
]);
const REMOVED_TAGS = 'script,style,noscript,template,svg,canvas';
const SKIP_LINK_TEXT = /(?:skip|건너뛰기|본문으로|콘텐츠로|메뉴 건너)/iu;
const FOOTER_COPYRIGHT = /(?:copyright|all rights reserved|©|ⓒ)/iu;

export type RobustClinicExclusionKind =
  | 'footer-legal'
  | 'navigation-label'
  | 'skip-link'
  | 'overlay-ui-chrome';

export interface RobustClinicDocument {
  sourceUrl: string;
  finalUrl: string;
  html: string;
  /** Persisted crawl-time evidence; no computed style or recrawl is needed at extraction time. */
  overlayRemovalEvidence?: readonly OverlayRemovalEvidence[];
}

export interface RobustClinicSourceBlock extends ClinicMasterSourceBlock {
  sourceLocator: string;
  sourceElementPath: string;
  sourceSha256: string;
  tagName: string;
  heading: boolean;
  exclusion?: RobustClinicExclusionKind;
  overlayUiChromeEvidence?: OverlayUiChromeEvidence;
  /** Pre-veto classifier result retained so content restoration stays fully auditable. */
  overlayUiChromeCandidateEvidence?: OverlayUiChromeEvidence;
  overlayContentVetoEvidence?: OverlayContentVetoEvidence;
  /**
   * Additive audit evidence for excluded navigation labels. Rendering never consumes this field;
   * corpus analysis uses it to distinguish links to already-crawled pages from destinations the
   * designated crawl never observed.
   */
  navigationDestinations?: Array<{
    url: string;
    label: string;
  }>;
}

export interface RobustClinicSourcePage {
  id: string;
  sourceUrl: string;
  finalUrl: string;
  artifactPage: CrawlPageArtifact;
  blocks: RobustClinicSourceBlock[];
  targetBlocks: RobustClinicSourceBlock[];
  excludedBlocks: RobustClinicSourceBlock[];
  images: ClinicLayoutImage[];
  brandImages: ClinicLayoutImage[];
  imageDecisions: RobustClinicImageDecision[];
  metadataOgTitle?: ClinicMasterSourceBlock;
  metadataTitle?: ClinicMasterSourceBlock;
  metadataDescription?: ClinicMasterSourceBlock;
  accessFailure?: 'blocked-document';
}

export type RobustClinicImageDecisionReason =
  | 'eligible-photograph'
  | 'brand-logo'
  | 'junk-image'
  | 'insurance-logo'
  /** Shared with the US demo gate: a lender's advertisement is not a photograph of the practice. */
  | 'patient-financing-mark'
  | 'composed-layout'
  | 'credential-image'
  | 'patient-result'
  | 'indeterminate'
  | 'duplicate-url'
  | 'source-projection-rejected';

export interface RobustClinicImageDecision {
  sourcePageUrl: string;
  url: string;
  alt: string;
  sourceRole: CrawlImageCandidate['role'];
  disposition: 'photo-slot' | 'brand-slot' | 'blocked' | 'indeterminate';
  reason: RobustClinicImageDecisionReason;
  signals: string[];
  score?: number;
  sourceOrdinal: number;
}

export interface RobustClinicSourcePlan {
  profile: ClinicEngineProfile;
  pages: RobustClinicSourcePage[];
  blocks: RobustClinicSourceBlock[];
  targetBlocks: RobustClinicSourceBlock[];
  excludedBlocks: RobustClinicSourceBlock[];
  /** Complete, source-backed legal projection. Partial footers remain ordinary source content. */
  businessInfo?: {
    info: BusinessInfo;
    sourceBlockIds: string[];
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function normalizeRobustClinicText(value: string): string {
  // Shortcodes come out here too. This path reads the rendered DOM, and an
  // unrendered [wp_form …] is a text node in it exactly as on the import path
  // — then the consented compile *requires* every block to be placed, so
  // anything left here is guaranteed to reach the page.
  return stripShortcodes(value)
    .replace(/\u00a0/gu, ' ')
    .replace(/[ \t\f\v]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function normalizedUrl(value: string): string {
  const parsed = new URL(value);
  parsed.hash = '';
  if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/u, '');
  return parsed.toString();
}

function samePage(left: string, right: string): boolean {
  try {
    return normalizedUrl(left) === normalizedUrl(right);
  } catch {
    return left === right;
  }
}

function fallbackDocument(page: CrawlPageArtifact): RobustClinicDocument {
  const headingHtml = page.headings
    .map((heading) => `<h2>${escapeHtml(heading)}</h2>`)
    .join('');
  const textHtml = page.text
    .split(/\n+/u)
    .map(normalizeRobustClinicText)
    .filter(Boolean)
    .map((text) => `<p>${escapeHtml(text)}</p>`)
    .join('');
  return {
    sourceUrl: page.url,
    finalUrl: page.url,
    html: `<main>${page.title ? `<h1>${escapeHtml(page.title)}</h1>` : ''}${headingHtml}${textHtml}</main>`,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function locator(element: HTMLElement, ordinal: number): string {
  const segments: string[] = [];
  let cursor: Node | null = element;
  while (cursor && cursor.nodeType === NodeType.ELEMENT_NODE && segments.length < 6) {
    const current = cursor as HTMLElement;
    if (!current.tagName) break;
    const parent = current.parentNode;
    const siblingIndex = parent
      ? parent.childNodes.filter((node) => (
          node.nodeType === NodeType.ELEMENT_NODE
          && (node as HTMLElement).tagName === current.tagName
        )).indexOf(current)
      : 0;
    segments.unshift(`${current.tagName.toLocaleLowerCase('en-US')}:nth-of-type(${siblingIndex + 1})`);
    cursor = parent;
  }
  return `${segments.join('>')}#${ordinal}`;
}

function isNavigation(element: HTMLElement): boolean {
  if (element.closest('nav,[role="navigation"]')) return true;
  const footer = element.closest('footer,[role="contentinfo"]');
  if (!footer) return false;
  const anchor = element.tagName === 'A'
    ? element
    : element.closest('a') ?? element.querySelector('a');
  return Boolean(anchor || element.getAttribute('onclick'));
}

function isSkipLink(element: HTMLElement, text: string): boolean {
  const anchor = element.tagName === 'A' ? element : element.closest('a');
  return Boolean(
    anchor
    && (anchor.getAttribute('href') ?? '').startsWith('#')
    && SKIP_LINK_TEXT.test(text),
  );
}

function isFooterLegal(element: HTMLElement, text: string): boolean {
  if (!element.closest('footer,[role="contentinfo"]')) return false;
  // Factual business fields are not dropped piecemeal. A complete footer projection routes them
  // to SiteConfig.businessInfo; incomplete projections remain ordinary body source content.
  return FOOTER_COPYRIGHT.test(text);
}

function exclusionFor(
  element: HTMLElement,
  text: string,
): RobustClinicExclusionKind | undefined {
  if (isSkipLink(element, text)) return 'skip-link';
  if (isNavigation(element)) return 'navigation-label';
  if (isFooterLegal(element, text)) return 'footer-legal';
  return undefined;
}

function navigationDestinations(
  element: HTMLElement,
  sourceUrl: string,
): RobustClinicSourceBlock['navigationDestinations'] {
  const anchors = element.tagName === 'A'
    ? [element]
    : element.querySelectorAll('a[href]');
  const seen = new Set<string>();
  const result: NonNullable<RobustClinicSourceBlock['navigationDestinations']> = [];
  for (const anchor of anchors) {
    const href = anchor.getAttribute('href')?.trim();
    if (!href) continue;
    let destination: URL;
    try {
      destination = new URL(href, sourceUrl);
    } catch {
      continue;
    }
    if (!['http:', 'https:'].includes(destination.protocol)) continue;
    destination.hash = '';
    if (destination.pathname !== '/') {
      destination.pathname = destination.pathname.replace(/\/+$/u, '');
    }
    const url = destination.toString();
    if (seen.has(url)) continue;
    seen.add(url);
    result.push({
      url,
      label: normalizeRobustClinicText(anchor.text),
    });
  }
  return result.length > 0 ? result : undefined;
}

function hasDescendantContentBlock(element: HTMLElement): boolean {
  return element.querySelectorAll([
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'li',
    'dt',
    'dd',
    'address',
    'figcaption',
    'blockquote',
    'pre',
    'th',
    'td',
  ].join(',')).length > 0;
}

function directTextWithoutNestedBlocks(element: HTMLElement): string {
  const cloneRoot = parse(element.toString());
  const clone = cloneRoot.querySelector(element.tagName.toLocaleLowerCase('en-US'));
  if (!clone) return '';
  for (const nested of clone.querySelectorAll([
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'li',
    'dt',
    'dd',
    'address',
    'figcaption',
    'blockquote',
    'pre',
    'th',
    'td',
  ].join(','))) nested.remove();
  return normalizeRobustClinicText(clone.text);
}

function extractBlocks(input: {
  html: string;
  sourceUrl: string;
  pageId: string;
  overlayRemovalEvidence?: RobustClinicDocument['overlayRemovalEvidence'];
}): RobustClinicSourceBlock[] {
  const root = parse(input.html);
  for (const removed of root.querySelectorAll(REMOVED_TAGS)) removed.remove();
  const body = root.querySelector('body') ?? root;
  const result: RobustClinicSourceBlock[] = [];
  const seenElements = new Set<HTMLElement>();

  const append = (element: HTMLElement, textValue: string) => {
    const text = normalizeRobustClinicText(textValue);
    if (!text) return;
    const ordinal = result.length + 1;
    const sourceLocator = locator(element, ordinal);
    const sourceSha256 = sha256(text);
    const heading = /^H[1-6]$/u.test(element.tagName);
    const establishedExclusion = exclusionFor(element, text);
    const overlayUiChromeClassification = establishedExclusion
      ? undefined
      : classifyOverlayUiChrome({
        element,
        text,
        removalEvidence: input.overlayRemovalEvidence,
      });
    const overlayContentVetoEvidence = vetoOverlayUiChromeClassification({
      text,
      classification: overlayUiChromeClassification,
    });
    const overlayUiChromeEvidence = overlayContentVetoEvidence
      ? undefined
      : overlayUiChromeClassification;
    const exclusion = establishedExclusion
      ?? (overlayUiChromeEvidence ? 'overlay-ui-chrome' : undefined);
    const destinations = exclusion === 'navigation-label'
      ? navigationDestinations(element, input.sourceUrl)
      : undefined;
    result.push({
      id: `robust-${input.pageId}-${ordinal}-${sourceSha256.slice(0, 12)}`,
      kind: heading ? 'service' : 'service_detail',
      text,
      sourceUrl: input.sourceUrl,
      sourceLocator,
      sourceElementPath: overlayElementPath(element),
      sourceSha256,
      tagName: element.tagName.toLocaleLowerCase('en-US'),
      heading,
      ...(exclusion ? { exclusion } : {}),
      ...(destinations ? { navigationDestinations: destinations } : {}),
      ...(overlayUiChromeEvidence ? { overlayUiChromeEvidence } : {}),
      ...(overlayContentVetoEvidence && overlayUiChromeClassification
        ? { overlayUiChromeCandidateEvidence: overlayUiChromeClassification }
        : {}),
      ...(overlayContentVetoEvidence ? { overlayContentVetoEvidence } : {}),
    });
  };

  const visit = (node: Node): void => {
    if (node.nodeType !== NodeType.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    if (seenElements.has(element)) return;
    seenElements.add(element);
    if (CONTENT_BLOCK_TAGS.has(element.tagName)) {
      if (hasDescendantContentBlock(element)) {
        append(element, directTextWithoutNestedBlocks(element));
        for (const child of element.childNodes) visit(child);
      } else {
        append(element, element.text);
      }
      return;
    }
    const descendantContent = hasDescendantContentBlock(element);
    if (GENERIC_BLOCK_TAGS.has(element.tagName) && !descendantContent) {
      append(element, element.text);
      return;
    }
    for (const child of element.childNodes) visit(child);
  };
  visit(body);
  return result;
}

/**
 * Persistable, source-only block projection for the consented crawl artifact. IDs are rebuilt
 * from the consuming page position so the artifact carries no compiler-owned identifiers.
 */
export function projectConsentedClinicSourceBlocks(input: {
  html: string;
  sourceUrl: string;
}): CrawlConsentedSourceBlock[] {
  return extractBlocks({
    html: input.html,
    sourceUrl: input.sourceUrl,
    pageId: 'consented-source',
  }).map((block) => ({
    text: block.text,
    sourceLocator: block.sourceLocator,
    sourceElementPath: block.sourceElementPath,
    sourceSha256: block.sourceSha256,
    tagName: block.tagName,
    heading: block.heading,
    ...(block.exclusion ? { exclusion: block.exclusion } : {}),
    ...(block.navigationDestinations
      ? { navigationDestinations: block.navigationDestinations }
      : {}),
  }));
}

function hydrateConsentedSourceBlocks(input: {
  blocks: readonly CrawlConsentedSourceBlock[];
  pageId: string;
  sourceUrl: string;
}): RobustClinicSourceBlock[] {
  return input.blocks.map((block, index) => ({
    id: `robust-${input.pageId}-${index + 1}-${block.sourceSha256.slice(0, 12)}`,
    kind: block.heading ? 'service' : 'service_detail',
    text: block.text,
    sourceUrl: input.sourceUrl,
    sourceLocator: block.sourceLocator,
    sourceElementPath: block.sourceElementPath,
    sourceSha256: block.sourceSha256,
    tagName: block.tagName,
    heading: block.heading,
    ...(block.exclusion ? { exclusion: block.exclusion } : {}),
    ...(block.navigationDestinations
      ? { navigationDestinations: block.navigationDestinations }
      : {}),
  }));
}

const BRAND_IMAGE_RE =
  /(?:^|[-_/\s.])(?:logo\d*|logotype|wordmark|brandmark|로고)(?:[-_/\s.]|$)/iu;
const THIRD_PARTY_BRAND_RE =
  /(?:kakao(?:map)?|naver(?:map)?|google(?:logo|maps?)?|facebook|instagram|youtube|yelp|super\s*doctors?|visa|mastercard|paypal)|카카오|네이버|구글/iu;
const NON_SITE_BRAND_PATH_RE =
  /(?:^|[-_/\s.])(?:press|award|partner|reservation|reserv|booking|certificate|credential)(?:[-_/\s.]|$)/iu;
const CLINIC_ROUTE_JUNK_IMAGE_RE =
  /(?:^|[-_/\s.?=&])(?:icon\d*|favicon|fav|sprite|button\d*|btn\d*|blank|spacer|placeholder|loader|captcha|badge|social|payment|powered[-_ ]by|quick\d*|toggle|gnb|lnb|allmenu|allmenuclose|menuclose|close|popup|mouse|no[-_ ]?img|txt\d*|text\d*|title[-_ ]?img|pixel(?:id)?|tracking|attribution|analytics|1x1)(?:[-_/\s.?=&]|$)/iu;
const HERO_STORY_RE =
  /(?:^|[-_/\s.])(?:main[-_]?vis(?:ual)?\d*|main[-_]?img\d*|visual\d*|hero|keyvisual|headshot|portrait|doctor|team|office|interior|exterior|facility|clinic|hospital|dental)(?:[-_/\s.]|$)/iu;
const SOCIAL_CARD_RE =
  /(?:^|[-_/\s.])(?:og|ogimage|og[-_ ]?image|social[-_ ]?card|sns[-_ ]?img)(?:[-_/\s.]|$)/iu;
const PROMOTIONAL_LAYOUT_RE =
  /(?:^|[-_/\s.])(?:event|promo(?:tion)?|campaign|coupon|sale|offer|price|top[-_ ]?banner)(?:[-_/\s.]|$)/iu;
const CTA_IMAGE_ALT_RE =
  /(?:자세히\s*보기|예약하기|문의하기|more|learn\s+more|book\s+now|view\s+details)/iu;
const URL_DIMENSION_RE = /(?:^|[-_])\d{3,4}x\d{3,4}(?:[-_.]|$)/u;
const GENERIC_IMAGE_ALT_RE = /^(?:image|photo|picture|이미지|사진|관련 이미지|로고)?\s*\d*$/iu;

function safeExternalImageUrl(value: string): boolean {
  if (!isSafeMediaSrc(value)) return false;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function imageContext(image: CrawlImageCandidate): string {
  let pathname = image.url;
  try {
    const parsed = new URL(image.url);
    pathname = `${parsed.pathname} ${parsed.search}`;
  } catch {
    // The existing US projection remains authoritative for URL validity.
  }
  return `${pathname} ${normalizeRobustClinicText(image.alt)}`;
}

function imageUrlContext(image: CrawlImageCandidate): string {
  try {
    const parsed = new URL(image.url);
    return `${parsed.pathname} ${parsed.search}`;
  } catch {
    return image.url;
  }
}

function siteIdentityTokens(page: CrawlPageArtifact): string[] {
  const tokens = new Set<string>();
  try {
    const hostLabel = new URL(page.url).hostname.replace(/^www\./u, '').split('.')[0];
    if (hostLabel.length >= 4) tokens.add(hostLabel.toLocaleLowerCase('en-US'));
    if (hostLabel.startsWith('the') && hostLabel.length >= 7) {
      tokens.add(hostLabel.slice(3).toLocaleLowerCase('en-US'));
    }
  } catch {
    // A malformed source URL cannot contribute identity evidence.
  }
  for (const token of normalizeRobustClinicText(page.title ?? '')
    .toLocaleLowerCase('en-US')
    .split(/[^\p{L}\p{N}]+/u)) {
    if (token.length >= 4) tokens.add(token);
  }
  return [...tokens];
}

function imageMatchesSiteIdentity(image: CrawlImageCandidate, page: CrawlPageArtifact): boolean {
  const context = imageContext(image).toLocaleLowerCase('en-US');
  return siteIdentityTokens(page).some((token) => context.includes(token));
}

function brandSignals(image: CrawlImageCandidate, page: CrawlPageArtifact): string[] {
  const context = imageContext(image);
  const urlContext = imageUrlContext(image);
  const matchesSiteIdentity = imageMatchesSiteIdentity(image, page);
  const alt = normalizeRobustClinicText(image.alt);
  const descriptiveAlt = alt.length >= 3 && !GENERIC_IMAGE_ALT_RE.test(alt);
  if (
    !BRAND_IMAGE_RE.test(urlContext)
    || THIRD_PARTY_BRAND_RE.test(context)
    || NON_SITE_BRAND_PATH_RE.test(urlContext)
    || SOCIAL_CARD_RE.test(urlContext)
    || ((image.role === 'figure' || descriptiveAlt) && !matchesSiteIdentity)
  ) return [];
  const signals = ['url-or-alt:brand-logo'];
  try {
    const imageHost = new URL(image.url).hostname.replace(/^www\./u, '');
    const pageHost = new URL(page.url).hostname.replace(/^www\./u, '');
    if (imageHost === pageHost) signals.push('host:same-site');
  } catch {
    // Shared safe-URL validation remains authoritative.
  }
  if (descriptiveAlt) signals.push('alt:brand-descriptive');
  if (matchesSiteIdentity) signals.push('site-context:identity-match');
  return signals;
}

function routeJunkSignals(image: CrawlImageCandidate, page: CrawlPageArtifact): string[] {
  const context = imageContext(image);
  const urlContext = imageUrlContext(image);
  const alt = normalizeRobustClinicText(image.alt);
  const nonSiteBrand = BRAND_IMAGE_RE.test(urlContext)
    && (image.role === 'figure' || (alt.length >= 3 && !GENERIC_IMAGE_ALT_RE.test(alt)))
    && !imageMatchesSiteIdentity(image, page);
  return [
    ...(CLINIC_ROUTE_JUNK_IMAGE_RE.test(context) ? ['url-or-alt:ui-junk'] : []),
    ...(THIRD_PARTY_BRAND_RE.test(context) || nonSiteBrand
      ? ['url-or-alt:third-party-ui-brand']
      : []),
    ...(SOCIAL_CARD_RE.test(context) ? ['url-or-alt:social-card'] : []),
    ...(CTA_IMAGE_ALT_RE.test(normalizeRobustClinicText(image.alt)) ? ['alt:image-cta'] : []),
  ];
}

function promotionalLayoutSignals(image: CrawlImageCandidate): string[] {
  return PROMOTIONAL_LAYOUT_RE.test(imageContext(image))
    ? ['url-or-alt:promotional-layout']
    : [];
}

function narrativeScore(image: CrawlImageCandidate): {
  score: number;
  signals: string[];
  sufficientlyClassified: boolean;
} {
  const context = imageContext(image);
  const alt = normalizeRobustClinicText(image.alt);
  const signals: string[] = [];
  let score = 0;
  if (image.role === 'atmosphere') {
    score += 60;
    signals.push('role:atmosphere');
  } else if (image.role === 'figure') {
    score += 45;
    signals.push('role:figure');
  } else {
    signals.push('role:unknown');
  }
  if (HERO_STORY_RE.test(context)) {
    score += 35;
    signals.push('url-or-alt:hero-story');
  }
  const descriptiveAlt = alt.length >= 5
    && !GENERIC_IMAGE_ALT_RE.test(alt)
    && !CTA_IMAGE_ALT_RE.test(alt);
  if (descriptiveAlt) {
    score += 15;
    signals.push('alt:descriptive');
  }
  if (SOCIAL_CARD_RE.test(context)) {
    score -= 50;
    signals.push('url-or-alt:social-card');
  }
  let pathDepth = 0;
  const dimensionInUrl = URL_DIMENSION_RE.test(imageUrlContext(image));
  if (dimensionInUrl) {
    score += 30;
    signals.push('url:dimension-token');
  }
  try {
    pathDepth = new URL(image.url).pathname.split('/').filter(Boolean).length;
  } catch {
    // Invalid URLs are rejected by the shared projection before this score is consumed.
  }
  score += Math.min(pathDepth, 6);
  signals.push(`path-depth:${pathDepth}`);
  return {
    score,
    signals,
    sufficientlyClassified: HERO_STORY_RE.test(context)
      || dimensionInUrl
      || ((image.role === 'atmosphere' || image.role === 'figure') && descriptiveAlt),
  };
}

function pageImageSelection(input: {
  artifact: CrawlArtifactPayload;
  page: CrawlPageArtifact;
  pageId: string;
}): {
  images: ClinicLayoutImage[];
  brandImages: ClinicLayoutImage[];
  decisions: RobustClinicImageDecision[];
} {
  const projected = prospectPublicSourceImages({ ...input.artifact, pages: [input.page] });
  const projectionByCandidate = new Map<CrawlImageCandidate, ProjectedUsDemoSourceImage>(
    projected.map((image) => [image.candidate, image]),
  );
  const seen = new Set<string>();
  const photoCandidates: Array<{
    image: CrawlImageCandidate;
    index: number;
    score: number;
    signals: string[];
  }> = [];
  const brandCandidates: Array<{ image: ClinicLayoutImage; score: number }> = [];
  const decisions: RobustClinicImageDecision[] = [];
  for (const [index, image] of input.page.images.entries()) {
    const base = {
      sourcePageUrl: input.page.url,
      url: image.url,
      alt: normalizeRobustClinicText(image.alt),
      sourceRole: image.role,
      sourceOrdinal: index,
    };
    if (!image.url || seen.has(image.url)) {
      decisions.push({
        ...base,
        disposition: 'blocked',
        reason: 'duplicate-url',
        signals: ['same-page:url-duplicate'],
      });
      continue;
    }
    seen.add(image.url);
    const projection = projectionByCandidate.get(image);
    if (projection) {
      const sharedGate = clinicPhotoGate(projection);
      const sharedReason = sourceImageIsBeforeAfter(projection)
        ? 'patient-result' as const
        : sharedGate.reason;
      if (sharedReason !== 'eligible-photograph') {
        decisions.push({
          ...base,
          disposition: 'blocked',
          reason: sharedReason,
          signals: [`shared-us-gate:${sharedReason}`],
        });
        continue;
      }
    }
    const brand = brandSignals(image, input.page);
    if (brand.length > 0 && safeExternalImageUrl(image.url)) {
      brandCandidates.push({
        image: {
          id: `${input.pageId}-brand-${index + 1}-${sha256(image.url).slice(0, 10)}`,
          src: image.url,
          alt: normalizeRobustClinicText(image.alt),
          selectionScore: (brand.includes('site-context:identity-match') ? 100 : 0)
            + (brand.includes('host:same-site') ? 40 : 0)
            + (brand.includes('alt:brand-descriptive') ? 30 : 0)
            + 10,
        },
        score: (brand.includes('site-context:identity-match') ? 100 : 0)
          + (brand.includes('host:same-site') ? 40 : 0)
          + (brand.includes('alt:brand-descriptive') ? 30 : 0)
          + 10,
      });
      decisions.push({
        ...base,
        disposition: 'brand-slot',
        reason: 'brand-logo',
        signals: brand,
      });
      continue;
    }
    const routeJunk = routeJunkSignals(image, input.page);
    if (!projection || routeJunk.length > 0) {
      decisions.push({
        ...base,
        disposition: 'blocked',
        reason: routeJunk.length > 0 ? 'junk-image' : 'source-projection-rejected',
        signals: routeJunk.length > 0
          ? routeJunk
          : ['shared-us-projection:rejected'],
      });
      continue;
    }
    const promotionalLayout = promotionalLayoutSignals(image);
    if (promotionalLayout.length > 0) {
      decisions.push({
        ...base,
        disposition: 'indeterminate',
        reason: 'indeterminate',
        signals: promotionalLayout,
      });
      continue;
    }
    const scored = narrativeScore(image);
    if (!scored.sufficientlyClassified) {
      decisions.push({
        ...base,
        disposition: 'indeterminate',
        reason: 'indeterminate',
        signals: scored.signals,
        score: scored.score,
      });
      continue;
    }
    photoCandidates.push({ image, index, score: scored.score, signals: scored.signals });
    decisions.push({
      ...base,
      disposition: 'photo-slot',
      reason: 'eligible-photograph',
      signals: scored.signals,
      score: scored.score,
    });
  }
  photoCandidates.sort((left, right) => right.score - left.score || left.index - right.index);
  brandCandidates.sort((left, right) => right.score - left.score);
  const images = photoCandidates.map(({ image, index }) => ({
      id: `${input.pageId}-${index + 1}-${sha256(image.url).slice(0, 10)}`,
      src: image.url,
      alt: normalizeRobustClinicText(image.alt) || normalizeRobustClinicText(input.page.title ?? ''),
      ...(image.declaredWidth ? { sourceWidth: image.declaredWidth } : {}),
      ...(image.declaredHeight ? { sourceHeight: image.declaredHeight } : {}),
    }));
  return {
    images,
    brandImages: brandCandidates.map((candidate) => candidate.image),
    decisions,
  };
}

function metadataBlock(input: {
  pageId: string;
  role: 'title' | 'description';
  text: string | undefined;
  sourceUrl: string;
}): ClinicMasterSourceBlock | undefined {
  const text = normalizeRobustClinicText(input.text ?? '');
  if (!text) return undefined;
  return {
    id: `robust-meta-${input.pageId}-${input.role}-${sha256(text).slice(0, 12)}`,
    kind: input.role === 'title' ? 'introduction' : 'service_detail',
    text,
    sourceUrl: input.sourceUrl,
  };
}

function documentOgTitle(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const root = parse(html);
  return normalizeRobustClinicText(
    root.querySelector('meta[property="og:title"]')?.getAttribute('content')
      ?? root.querySelector('meta[name="og:title"]')?.getAttribute('content')
      ?? '',
  ) || undefined;
}

function blockedAccessDocument(page: CrawlPageArtifact, blocks: readonly RobustClinicSourceBlock[]): boolean {
  const evidence = normalizeRobustClinicText([
    page.title,
    page.text,
    ...blocks.slice(0, 5).map((block) => block.text),
  ].filter(Boolean).join(' '));
  return /(?:ninjafirewall|403 forbidden|access denied|request cannot be processed|blocked and logged)/iu.test(evidence)
    || (blocks.length <= 5 && /\bforbidden\b/iu.test(evidence));
}

type FooterBusinessField =
  | 'businessName'
  | 'ownerName'
  | 'businessNumber'
  | 'address'
  | 'phone';

const FOOTER_FIELD_MARKER =
  /(?:상호명?|business\s+name|사업자(?:등록)?번호|business\s+(?:registration|license|no\.?)(?:\s+number)?|대표번호|대표전화|전화번호|phone|tel|대표자|owner|representative|주소|address)\s*[:：]?/giu;

function footerContainerPath(block: RobustClinicSourceBlock): string | undefined {
  const segments = block.sourceElementPath.split('>');
  const footerIndex = segments.findIndex((segment) => /^footer(?::|#|$)/u.test(segment));
  return footerIndex >= 0 ? segments.slice(0, footerIndex + 1).join('>') : undefined;
}

function footerFieldFor(label: string): FooterBusinessField | undefined {
  const normalized = label.replace(/\s+/gu, ' ').trim().toLocaleLowerCase('en-US');
  if (/^(?:상호명?|business name)$/u.test(normalized)) return 'businessName';
  if (/^(?:대표자|owner|representative)$/u.test(normalized)) return 'ownerName';
  if (/^(?:사업자(?:등록)?번호|business (?:registration|license|no\.?)(?: number)?)$/u.test(normalized)) {
    return 'businessNumber';
  }
  if (/^(?:대표번호|대표전화|전화번호|phone|tel)$/u.test(normalized)) return 'phone';
  if (/^(?:주소|address)$/u.test(normalized)) return 'address';
  return undefined;
}

function footerFields(block: RobustClinicSourceBlock): Array<{
  field: FooterBusinessField;
  value: string;
}> {
  const matches = [...block.text.matchAll(FOOTER_FIELD_MARKER)];
  return matches.flatMap((match, index) => {
    const field = footerFieldFor(match[0].replace(/[:：]\s*$/u, '').trim());
    if (!field || match.index === undefined) return [];
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? block.text.length;
    const value = normalizeRobustClinicText(block.text.slice(start, end))
      .replace(/(?:copyright|all rights reserved|[©ⓒ])[\s\S]*$/iu, '')
      .trim();
    return value ? [{ field, value }] : [];
  });
}

function normalizeBusinessNumber(value: string): string | undefined {
  const digits = value.match(/\d/g)?.join('') ?? '';
  return digits.length === 10
    ? `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
    : undefined;
}

function normalizeBusinessPhone(value: string): string | undefined {
  const match = value.match(/(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?)[\s.-]\d{3,4}[\s.-]\d{4}/u);
  return match?.[0].trim();
}

function projectFooterBusinessInfo(pages: readonly RobustClinicSourcePage[]): {
  info: BusinessInfo;
  sourceBlockIds: string[];
} | undefined {
  const groups = new Map<string, RobustClinicSourceBlock[]>();
  for (const page of pages) {
    for (const block of page.blocks) {
      const footerPath = footerContainerPath(block);
      if (!footerPath) continue;
      const key = `${page.finalUrl}\n${footerPath}`;
      const values = groups.get(key) ?? [];
      values.push(block);
      groups.set(key, values);
    }
  }
  const complete: Array<{
    info: BusinessInfo;
    sourceBlockIds: string[];
  }> = [];
  for (const blocks of groups.values()) {
    const values = new Map<FooterBusinessField, string>();
    const sourceIds = new Set<string>();
    for (const block of blocks) {
      for (const entry of footerFields(block)) {
        if (!values.has(entry.field)) values.set(entry.field, entry.value);
        sourceIds.add(block.id);
      }
    }
    const businessName = values.get('businessName');
    const ownerName = values.get('ownerName');
    const businessNumber = normalizeBusinessNumber(values.get('businessNumber') ?? '');
    const address = values.get('address');
    const phone = normalizeBusinessPhone(values.get('phone') ?? '');
    if (!businessName || !ownerName || !businessNumber || !address || !phone) continue;
    complete.push({
      info: { businessName, ownerName, businessNumber, address, phone },
      sourceBlockIds: [...sourceIds],
    });
  }
  const canonical = complete[0];
  if (!canonical) return undefined;
  const canonicalValue = JSON.stringify(canonical.info);
  return {
    info: canonical.info,
    sourceBlockIds: [...new Set(complete
      .filter((candidate) => JSON.stringify(candidate.info) === canonicalValue)
      .flatMap((candidate) => candidate.sourceBlockIds))],
  };
}

/**
 * Frozen post-modal DOM is the source of truth. Artifact fields are used only when a caller has
 * no rendered document (unit tests and legacy diagnostics); CLINIC-ROUTE corpus drivers always
 * supply documents.
 */
export function extractRobustClinicSource(input: {
  artifact: CrawlArtifactPayload;
  documents?: readonly RobustClinicDocument[];
  profile: ClinicEngineProfile;
}): RobustClinicSourcePlan {
  const documents = input.documents;
  const consumedFinalUrls = new Set<string>();
  const pages: RobustClinicSourcePage[] = [];
  for (const [artifactIndex, artifactPage] of input.artifact.pages.entries()) {
    const suppliedDocument = documents?.find((candidate) => (
      samePage(candidate.sourceUrl, artifactPage.url)
      || samePage(candidate.finalUrl, artifactPage.url)
    ));
    const document = suppliedDocument
      ?? (artifactPage.consentedSource ? undefined : fallbackDocument(artifactPage));
    if (!document && !artifactPage.consentedSource) continue;
    const finalUrl = document?.finalUrl ?? artifactPage.url;
    const finalKey = normalizedUrl(finalUrl);
    if (consumedFinalUrls.has(finalKey)) continue;
    consumedFinalUrls.add(finalKey);
    const id = `page-${String(artifactIndex + 1).padStart(3, '0')}-${sha256(finalKey).slice(0, 10)}`;
    const blocks = document
      ? extractBlocks({
          html: document.html,
          sourceUrl: artifactPage.url,
          pageId: id,
          overlayRemovalEvidence: document.overlayRemovalEvidence,
        })
      : hydrateConsentedSourceBlocks({
          blocks: artifactPage.consentedSource!.blocks,
          pageId: id,
          sourceUrl: artifactPage.url,
        });
    const metadataTitle = metadataBlock({
      pageId: id,
      role: 'title',
      text: artifactPage.title,
      sourceUrl: artifactPage.url,
    });
    const metadataOgTitle = metadataBlock({
      pageId: id,
      role: 'title',
      text: documentOgTitle(document?.html),
      sourceUrl: artifactPage.url,
    });
    const metadataDescription = metadataBlock({
      pageId: id,
      role: 'description',
      text: artifactPage.description,
      sourceUrl: artifactPage.url,
    });
    const imageSelection = pageImageSelection({
      artifact: input.artifact,
      page: artifactPage,
      pageId: id,
    });
    pages.push({
      id,
      sourceUrl: artifactPage.url,
      finalUrl,
      artifactPage,
      blocks,
      targetBlocks: blocks.filter((block) => !block.exclusion),
      excludedBlocks: blocks.filter((block) => Boolean(block.exclusion)),
      images: imageSelection.images,
      brandImages: imageSelection.brandImages,
      imageDecisions: imageSelection.decisions,
      ...(metadataOgTitle ? { metadataOgTitle } : {}),
      ...(metadataTitle ? { metadataTitle } : {}),
      ...(metadataDescription ? { metadataDescription } : {}),
      ...(blockedAccessDocument(artifactPage, blocks)
        ? { accessFailure: 'blocked-document' as const }
        : {}),
    });
  }
  const businessInfo = projectFooterBusinessInfo(pages);
  const routedBusinessIds = new Set(businessInfo?.sourceBlockIds ?? []);
  const routedPages = pages.map((page) => {
    const blocks = page.blocks.map((block) => (
      routedBusinessIds.has(block.id) && !block.exclusion
        ? { ...block, exclusion: 'footer-legal' as const }
        : block
    ));
    return {
      ...page,
      blocks,
      targetBlocks: blocks.filter((block) => !block.exclusion),
      excludedBlocks: blocks.filter((block) => Boolean(block.exclusion)),
    };
  });
  return {
    profile: input.profile,
    pages: routedPages,
    blocks: routedPages.flatMap((page) => page.blocks),
    targetBlocks: routedPages.flatMap((page) => page.targetBlocks),
    excludedBlocks: routedPages.flatMap((page) => page.excludedBlocks),
    ...(businessInfo ? { businessInfo } : {}),
  };
}
