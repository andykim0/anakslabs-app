import { createHash } from 'node:crypto';
import {
  NodeType,
  parse,
  type HTMLElement,
  type Node,
} from 'node-html-parser';
import type { CrawlArtifactPayload, CrawlPageArtifact } from '@/lib/crawl/contracts';
import type { ClinicMasterSourceBlock } from '@/lib/clinic-master/compiler';
import type { BusinessInfo } from '@/lib/types/site';
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
  metadataTitle?: ClinicMasterSourceBlock;
  metadataDescription?: ClinicMasterSourceBlock;
  accessFailure?: 'blocked-document';
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
  return value
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

function pageImages(page: CrawlPageArtifact, pageId: string): ClinicLayoutImage[] {
  const seen = new Set<string>();
  const scored = page.images.map((image, index) => {
    const normalized = image.url.toLocaleLowerCase('en-US');
    const obviousChrome = /(?:quick|toggle|logo|favicon|icon|button|btn|gnb|lnb|menu|close|popup|\/pop\/)/u.test(normalized);
    const heroLike = /(?:mainvis|hero|visual|banner|slide)/u.test(normalized);
    const score = image.role === 'atmosphere'
      ? 0
      : image.role === 'figure'
        ? 1
        : heroLike && !obviousChrome
          ? 2
          : obviousChrome
            ? 4
            : 3;
    return { image, index, score };
  }).sort((left, right) => left.score - right.score || left.index - right.index);
  return scored.flatMap(({ image, index }) => {
    if (!image.url || seen.has(image.url)) return [];
    seen.add(image.url);
    return [{
      id: `${pageId}-${index + 1}-${sha256(image.url).slice(0, 10)}`,
      src: image.url,
      alt: normalizeRobustClinicText(image.alt) || normalizeRobustClinicText(page.title ?? ''),
      ...(image.declaredWidth ? { sourceWidth: image.declaredWidth } : {}),
      ...(image.declaredHeight ? { sourceHeight: image.declaredHeight } : {}),
    }];
  });
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
  const documents = input.documents ?? input.artifact.pages.map(fallbackDocument);
  const consumedFinalUrls = new Set<string>();
  const pages: RobustClinicSourcePage[] = [];
  for (const [artifactIndex, artifactPage] of input.artifact.pages.entries()) {
    const document = documents.find((candidate) => (
      samePage(candidate.sourceUrl, artifactPage.url)
      || samePage(candidate.finalUrl, artifactPage.url)
    ));
    if (!document) continue;
    const finalKey = normalizedUrl(document.finalUrl);
    if (consumedFinalUrls.has(finalKey)) continue;
    consumedFinalUrls.add(finalKey);
    const id = `page-${String(artifactIndex + 1).padStart(3, '0')}-${sha256(finalKey).slice(0, 10)}`;
    const blocks = extractBlocks({
      html: document.html,
      sourceUrl: artifactPage.url,
      pageId: id,
      overlayRemovalEvidence: document.overlayRemovalEvidence,
    });
    const metadataTitle = metadataBlock({
      pageId: id,
      role: 'title',
      text: artifactPage.title,
      sourceUrl: artifactPage.url,
    });
    const metadataDescription = metadataBlock({
      pageId: id,
      role: 'description',
      text: artifactPage.description,
      sourceUrl: artifactPage.url,
    });
    pages.push({
      id,
      sourceUrl: artifactPage.url,
      finalUrl: document.finalUrl,
      artifactPage,
      blocks,
      targetBlocks: blocks.filter((block) => !block.exclusion),
      excludedBlocks: blocks.filter((block) => Boolean(block.exclusion)),
      images: pageImages(artifactPage, id),
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
