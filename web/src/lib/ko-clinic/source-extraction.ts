import { createHash } from 'node:crypto';
import {
  NodeType,
  parse,
  type HTMLElement,
  type Node,
} from 'node-html-parser';
import {
  runClinicSourceExtraction,
} from '@/lib/clinic-engine/pipeline';
import { KO_MEDICAL_IMPORT_PROFILE } from '@/lib/clinic-engine/profiles';
import type {
  KoClinicExtractedPage,
  KoClinicSourceBlock,
  KoClinicSourceImage,
  KoClinicSourceKind,
} from './contracts';
import {
  EDOM_KO_CLINIC_SOURCE_PROFILE,
  type KoClinicSourceProfile,
} from './source-profile';

const CONTENT_TAGS = 'h1,h2,h3,h4,h5,h6,p,li,dt,dd,address,th,td,figcaption';
const BOARD_RICH_CONTENT_TAGS = `${CONTENT_TAGS},div`;
const UI_CHROME_IMAGE = /(?:\/n_images\/common\/|\/img\/common\/|\/cheditor5\/icons\/|banner_(?:call|reservation)|(?:^|[/_.-])(?:arrow|blank|btn|button|favicon|icon|loading|logo|pg_(?:first|last|next|prev)|popup|scroll|sns|spacer|sprite|tracking)(?:[/_.-]|$))/iu;
const UI_CHROME_CONTEXT = /(?:login|menu|navigation|pagination|popup|scroll|sns|social|toolbar)/iu;
const REMOVABLE = [
  'script',
  'style',
  'noscript',
  'template',
  'nav',
  'button',
  '.scroll',
  '.board_button',
  '.board_bottom_spacer',
  '.paging',
  '.pagination',
  '.login_icon',
].join(',');
const STRUCTURE_LABEL = /^(?:Difference(?:\s+자세히보기)?|EDAM Story|News)$/iu;
const LOWERED_CARD_LABEL = /^(?:이담 With 스타|공지사항)$/iu;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function normalizeKoClinicText(value: string): string {
  return value
    .replace(/\u00a0/gu, ' ')
    .replace(/[ \t\f\v]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function compactAnimatedHeading(element: HTMLElement): string {
  const directText = element.childNodes
    .filter((child) => !('tagName' in child))
    .map((child) => normalizeKoClinicText(child.text))
    .filter(Boolean);
  if (directText.length > 0) return normalizeKoClinicText(element.text);
  const children = element.childNodes.filter((child) => (
    'tagName' in child && (child as HTMLElement).tagName !== 'BR'
  )) as HTMLElement[];
  const childText = children.map((child) => normalizeKoClinicText(child.text));
  if (
    childText.length >= 2
    && childText.every((value) => value.length === 1 && /[\p{L}\p{N}]/u.test(value))
  ) {
    return childText.join('');
  }
  return normalizeKoClinicText(element.text);
}

function animatedHeadingDisplayText(element: HTMLElement): string | undefined {
  const animatedCharacters = element.querySelectorAll('[data-scroll]')
    .map((child) => normalizeKoClinicText(child.text))
    .filter(Boolean);
  if (
    animatedCharacters.length < 2
    || !animatedCharacters.every((value) => (
      [...value].length === 1 && /[\p{L}\p{N}]/u.test(value)
    ))
  ) {
    return undefined;
  }
  const words: string[] = [];
  let active = '';
  const flush = () => {
    if (active) words.push(active);
    active = '';
  };
  for (const child of element.childNodes) {
    if (child.nodeType === NodeType.TEXT_NODE) {
      const text = normalizeKoClinicText(child.text);
      if (text) {
        flush();
        words.push(text);
      }
      continue;
    }
    if (child.nodeType !== NodeType.ELEMENT_NODE) continue;
    const childElement = child as HTMLElement;
    const text = normalizeKoClinicText(childElement.text);
    if (
      childElement.tagName === 'BR'
      || (
        !text
        && /(?:padding|margin|width)\s*:/iu.test(
          childElement.getAttribute('style') ?? '',
        )
      )
    ) {
      flush();
      continue;
    }
    if ([...text].length === 1 && childElement.hasAttribute('data-scroll')) {
      active += text;
      continue;
    }
    if (text) {
      flush();
      words.push(text);
    }
  }
  flush();
  return normalizeKoClinicText(words.join(' '));
}

function blockText(element: HTMLElement): string {
  if (/^H[1-6]$/u.test(element.tagName)) return compactAnimatedHeading(element);
  const withBreaks = element.innerHTML.replace(/<br\s*\/?>/giu, '\n');
  return normalizeKoClinicText(parse(`<div>${withBreaks}</div>`).text);
}

function sourceBlock(input: {
  kind: KoClinicSourceKind;
  text: string;
  sourceUrl: string;
  locator: string;
  ordinal: number;
  sourceLabel?: string;
  href?: string;
  render?: KoClinicSourceBlock['render'];
}): KoClinicSourceBlock {
  const sourceSha256 = sha256(input.text);
  return {
    id: `ko-${sourceSha256.slice(0, 16)}-${input.ordinal}`,
    kind: input.kind,
    text: input.text,
    sourceUrl: input.sourceUrl,
    sourceLocator: input.locator,
    sourceSha256,
    ...(input.sourceLabel ? { sourceLabel: input.sourceLabel } : {}),
    ...(input.href ? { href: input.href } : {}),
    ...(input.render ? { render: input.render } : {}),
  };
}

function sourceNodesForElement(input: {
  element: HTMLElement;
  candidateSelector: string;
  sourceUrl: string;
  locator: string;
}): NonNullable<KoClinicSourceBlock['render']>['sourceNodes'] {
  const nodes: { id: string; text: string }[] = [];
  const visit = (node: Node, nested: boolean) => {
    if (node.nodeType === NodeType.TEXT_NODE) {
      const text = normalizeKoClinicText(node.text);
      if (!text) return;
      const id = `ko-node-${sha256([
        input.sourceUrl,
        input.locator,
        String(nodes.length),
        text,
      ].join('\n')).slice(0, 20)}`;
      nodes.push({ id, text });
      return;
    }
    if (node.nodeType !== NodeType.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    if (nested && element.matches(input.candidateSelector)) return;
    for (const child of element.childNodes) visit(child, true);
  };
  visit(input.element, false);
  return nodes;
}

function renderDisplayText(element: HTMLElement, auditText: string): string {
  if (/^H[1-6]$/u.test(element.tagName)) {
    return animatedHeadingDisplayText(element) ?? normalizedDisplayText(auditText);
  }
  return normalizedDisplayText(auditText);
}

function normalizedDisplayText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function isStructureLabel(value: string): boolean {
  return STRUCTURE_LABEL.test(normalizedDisplayText(value));
}

function assignRenderGroups(root: HTMLElement): void {
  const grouped = [
    ...root.querySelectorAll('li').filter((element) => (
      Boolean(element.querySelector('h1,h2,h3,h4,h5,h6,p,dt,dd,address,figcaption,img'))
    )),
    ...root.querySelectorAll('figure'),
  ];
  for (const [index, element] of grouped.entries()) {
    element.setAttribute('data-ko-render-group', `ko-render-group-${index + 1}`);
  }
}

function closestRenderGroup(element: HTMLElement): HTMLElement | null {
  return element.closest('[data-ko-render-group]');
}

function renderRole(input: {
  element: HTMLElement;
  auditText: string;
  candidateSelector: string;
}): NonNullable<KoClinicSourceBlock['render']>['role'] {
  const displayText = renderDisplayText(input.element, input.auditText);
  if (isStructureLabel(displayText)) return 'structure-label';
  const group = closestRenderGroup(input.element);
  if (input.element.tagName === 'LI') {
    return group && !LOWERED_CARD_LABEL.test(displayText) ? 'title' : 'body';
  }
  if (/^H[1-6]$/u.test(input.element.tagName)) {
    if (group?.tagName !== 'LI') return 'title';
    const groupText = textWithoutNestedSourceBlocks(group, input.candidateSelector);
    if (LOWERED_CARD_LABEL.test(normalizedDisplayText(displayText))) return 'body';
    return groupText
      && !isStructureLabel(groupText)
      && !LOWERED_CARD_LABEL.test(normalizedDisplayText(groupText))
      ? 'body'
      : 'title';
  }
  if (
    group?.tagName === 'LI'
    && group.querySelectorAll('h1,h2,h3,h4,h5,h6').some((heading) => (
      LOWERED_CARD_LABEL.test(
        normalizedDisplayText(renderDisplayText(heading, blockText(heading))),
      )
    ))
  ) {
    return 'title';
  }
  return 'body';
}

function boardCoordinates(
  sourceUrl: string,
  profile: KoClinicSourceProfile,
): KoClinicExtractedPage['board'] {
  const url = new URL(sourceUrl);
  if (!profile.board || url.pathname !== profile.board.pathname) return undefined;
  const table = url.searchParams.get(profile.board.tableParam);
  const wrId = Number(url.searchParams.get(profile.board.articleIdParam));
  return table && Number.isSafeInteger(wrId) && wrId > 0 ? { table, wrId } : undefined;
}

function boardTitle(root: HTMLElement): HTMLElement | null {
  const titleRow = root.querySelectorAll('.board_view tr').find((row) => (
    normalizeKoClinicText(row.querySelector('th')?.text ?? '') === '제 목'
  ));
  return titleRow?.querySelector('td div') ?? titleRow?.querySelector('td') ?? null;
}

function pageHeading(root: HTMLElement, profile: KoClinicSourceProfile): HTMLElement | null {
  return boardTitle(root)
    ?? profile.headingSelectors
      .map((selector) => root.querySelector(selector))
      .find((element): element is HTMLElement => Boolean(element))
    ?? null;
}

function fallbackTitle(
  sourceUrl: string,
  board: KoClinicExtractedPage['board'],
  profile: KoClinicSourceProfile,
): string {
  if (board) {
    return `${profile.board?.labels[board.table] ?? board.table} ${board.wrId}`;
  }
  const url = new URL(sourceUrl);
  if (profile.homePaths.includes(url.pathname) && profile.fallbackHomeTitle) {
    return profile.fallbackHomeTitle;
  }
  return url.pathname.split('/').pop()?.replace(/\.[a-z0-9]+$/iu, '')
    || url.hostname;
}

function contentRoot(
  root: HTMLElement,
  board: KoClinicExtractedPage['board'],
  profile: KoClinicSourceProfile,
): HTMLElement {
  if (board) {
    return root.querySelector('#writeContents')
      ?? root.querySelector('.board_view')
      ?? profile.contentRootSelectors
        .map((selector) => root.querySelector(selector))
        .find((element): element is HTMLElement => Boolean(element))
      ?? root;
  }
  return profile.contentRootSelectors
    .map((selector) => root.querySelector(selector))
    .find((element): element is HTMLElement => Boolean(element))
    ?? root;
}

function textWithoutNestedSourceBlocks(
  element: HTMLElement,
  candidateSelector: string,
): string {
  const nestedBlocks = element.querySelectorAll(candidateSelector);
  if (nestedBlocks.length === 0) return blockText(element);
  const cloneRoot = parse(element.toString());
  const clone = cloneRoot.querySelector(element.tagName.toLocaleLowerCase('en-US'));
  if (!clone) return '';
  for (const nested of clone.querySelectorAll(candidateSelector)) nested.remove();
  return blockText(clone);
}

function contentBlocks(
  root: HTMLElement,
  sourceUrl: string,
  titleText: string,
  includeRichContainers: boolean,
): KoClinicSourceBlock[] {
  const candidateSelector = includeRichContainers
    ? BOARD_RICH_CONTENT_TAGS
    : CONTENT_TAGS;
  const candidates = root.querySelectorAll(candidateSelector);
  const blocks: KoClinicSourceBlock[] = [];
  for (const [index, element] of candidates.entries()) {
    // Keep direct/inline text beside nested source blocks as its own verbatim block.
    // The old outermost-only rule merged home-card chrome into the body and, on
    // board articles, discarded inline div copy and figure captions whenever a
    // sibling paragraph happened to exist.
    const text = textWithoutNestedSourceBlocks(element, candidateSelector);
    if (!text || text === titleText) continue;
    const locator = `${element.tagName.toLocaleLowerCase('en-US')}:nth-source-block(${index + 1})`;
    const group = closestRenderGroup(element);
    const renderText = renderDisplayText(element, text);
    const kind: KoClinicSourceKind = /^H[1-6]$/u.test(element.tagName)
      ? 'heading'
      : element.tagName === 'LI'
        ? 'list_item'
        : 'paragraph';
    blocks.push(sourceBlock({
      kind,
      text,
      sourceUrl,
      locator,
      ordinal: blocks.length,
      render: {
        groupId: group?.getAttribute('data-ko-render-group')
          ?? `ko-render-source-block-${index + 1}`,
        text: renderText,
        role: renderRole({ element, auditText: text, candidateSelector }),
        sourceNodes: sourceNodesForElement({
          element,
          candidateSelector,
          sourceUrl,
          locator,
        }),
      },
    }));
  }
  if (blocks.length === 0) {
    const text = blockText(root);
    if (text && text !== titleText) {
      blocks.push(sourceBlock({
        kind: 'paragraph',
        text,
        sourceUrl,
        locator: `${root.tagName?.toLocaleLowerCase('en-US') ?? 'root'}:direct-source-block`,
        ordinal: 0,
        render: {
          groupId: 'ko-render-source-root',
          text: normalizedDisplayText(text),
          role: 'body',
          sourceNodes: sourceNodesForElement({
            element: root,
            candidateSelector,
            sourceUrl,
            locator: `${root.tagName?.toLocaleLowerCase('en-US') ?? 'root'}:direct-source-block`,
          }),
        },
      }));
    }
  }
  return blocks;
}

function breadcrumbBlocks(
  root: HTMLElement,
  sourceUrl: string,
  titleText: string,
  profile: KoClinicSourceProfile,
): KoClinicSourceBlock[] {
  const seen = new Set<string>();
  const blocks: KoClinicSourceBlock[] = [];
  for (const selector of profile.breadcrumbSelectors) {
    for (const element of root.querySelectorAll(selector)) {
    const text = blockText(element);
    if (!text || text === titleText || seen.has(text)) continue;
    seen.add(text);
    blocks.push(sourceBlock({
      kind: 'category',
      text,
      sourceUrl,
      locator: profile.breadcrumbLocator ?? `${selector}:source-breadcrumb`,
      ordinal: blocks.length,
    }));
    }
  }
  return blocks;
}

function boardCommentBlocks(
  root: HTMLElement,
  sourceUrl: string,
  startOrdinal: number,
): KoClinicSourceBlock[] {
  const commentRoot = root.querySelector('#commentContents');
  if (!commentRoot) return [];
  const result: KoClinicSourceBlock[] = [];
  const seen = new Set<string>();
  const heading = commentRoot.querySelector('span[style*="color"]');
  if (heading) {
    const text = blockText(heading);
    if (text) {
      seen.add(text);
      result.push(sourceBlock({
        kind: 'heading',
        text,
        sourceUrl,
        locator: '#commentContents:answer-heading',
        ordinal: startOrdinal + result.length,
      }));
    }
  }
  for (const [index, element] of commentRoot
    .querySelectorAll('div[style*="line-height"]')
    .entries()) {
    const clone = parse(element.toString());
    for (const removable of clone.querySelectorAll(
      'script,style,input,textarea,a,div[style*="text-align:center"],[style*="display:none"]',
    )) {
      removable.remove();
    }
    const text = blockText(clone);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(sourceBlock({
      kind: 'paragraph',
      text,
      sourceUrl,
      locator: `#commentContents:answer(${index + 1})`,
      ordinal: startOrdinal + result.length,
    }));
  }
  return result;
}

function boardEvidence(
  root: HTMLElement,
  sourceUrl: string,
  startOrdinal: number,
): KoClinicSourceBlock[] {
  const result: KoClinicSourceBlock[] = [];
  for (const row of root.querySelectorAll('.board_view tr')) {
    const cells = row.querySelectorAll('th,td');
    for (let index = 0; index < cells.length - 1; index += 1) {
      const label = normalizeKoClinicText(cells[index].text);
      if (!['분 류', '진료과목', '작성자', '작성일', '작성일자', '발행연도'].includes(label)) {
        continue;
      }
      const text = normalizeKoClinicText(cells[index + 1].text);
      if (!text) continue;
      result.push(sourceBlock({
        kind: label === '분 류' || label === '진료과목'
          ? 'category'
          : label === '작성자'
            ? 'author'
            : 'published_date',
        text,
        sourceUrl,
        locator: `.board_view tr:has(th:${label}) td`,
        ordinal: startOrdinal + result.length,
        sourceLabel: label,
      }));
    }
  }
  return result;
}

function praisePublicNotice(html: string, sourceUrl: string): KoClinicSourceBlock | null {
  const match = /alert\(['"]([\s\S]*?치료[\s\S]*?)['"]\)/u.exec(html);
  if (!match) return null;
  const text = normalizeKoClinicText(
    match[1]
      .replace(/\\n/gu, '\n')
      .replace(/\\(['"\\])/gu, '$1'),
  );
  return text
    ? sourceBlock({
        kind: 'public_notice',
        text,
        sourceUrl,
        locator: 'script:public-access-notice',
        ordinal: 0,
      })
    : null;
}

function relatedLinks(
  root: HTMLElement,
  sourceUrl: string,
  startOrdinal: number,
): KoClinicSourceBlock[] {
  const links: KoClinicSourceBlock[] = [];
  for (const [index, anchor] of root.querySelectorAll('.board_button a[title]').entries()) {
    const text = normalizeKoClinicText(anchor.getAttribute('title') ?? anchor.text);
    const rawHref = anchor.getAttribute('href');
    if (!text || !rawHref) continue;
    let href: string;
    try {
      href = new URL(rawHref, sourceUrl).toString();
    } catch {
      continue;
    }
    links.push(sourceBlock({
      kind: 'related_link',
      text,
      sourceUrl,
      locator: `.board_button a[title]:nth-of-type(${index + 1})`,
      ordinal: startOrdinal + links.length,
      href,
    }));
  }
  return links;
}

function renderGroupByImageUrl(input: {
  root: HTMLElement;
  sourceUrl: string;
  candidateSelector: string;
}): ReadonlyMap<string, string> {
  const groups = new Map<string, string>();
  const candidates = input.root.querySelectorAll(input.candidateSelector);
  for (const image of input.root.querySelectorAll('img')) {
    const raw = image.getAttribute('src') ?? image.getAttribute('data-src');
    if (!raw) continue;
    let absolute: string;
    try {
      absolute = new URL(raw, input.sourceUrl).toString();
    } catch {
      continue;
    }
    const explicit = closestRenderGroup(image)?.getAttribute('data-ko-render-group');
    if (explicit) {
      groups.set(absolute, explicit);
      continue;
    }
    const closest = candidates.reduce<{
      index: number;
      distance: number;
    } | null>((best, candidate, index) => {
      const distance = Math.min(
        Math.abs(candidate.range[0] - image.range[1]),
        Math.abs(image.range[0] - candidate.range[1]),
      );
      return !best || distance < best.distance ? { index, distance } : best;
    }, null);
    if (closest) groups.set(absolute, `ko-render-source-block-${closest.index + 1}`);
  }
  return groups;
}

function sourceImages(
  root: HTMLElement,
  sourceUrl: string,
  renderGroups: ReadonlyMap<string, string>,
): KoClinicSourceImage[] {
  const images: KoClinicSourceImage[] = [];
  const seen = new Set<string>();
  for (const [index, image] of root.querySelectorAll('img').entries()) {
    const raw = image.getAttribute('src') ?? image.getAttribute('data-src');
    if (!raw) continue;
    let absolute: string;
    try {
      absolute = new URL(raw, sourceUrl).toString();
    } catch {
      continue;
    }
    if (!/^https?:/u.test(absolute) || seen.has(absolute)) continue;
    seen.add(absolute);
    const context = [
      image.getAttribute('class'),
      image.getAttribute('id'),
      image.parentNode && 'getAttribute' in image.parentNode
        ? (image.parentNode as HTMLElement).getAttribute('class')
        : undefined,
    ].filter(Boolean).join(' ');
    const exclusionReason = UI_CHROME_IMAGE.test(new URL(absolute).pathname)
      ? 'ui-chrome-filename'
      : UI_CHROME_CONTEXT.test(context)
        ? 'ui-chrome-context'
        : undefined;
    const sourceReferenceSha256 = sha256(`${sourceUrl}\n${absolute}`);
    images.push({
      id: `ko-image-${sourceReferenceSha256.slice(0, 20)}`,
      sourceUrl: absolute,
      sourcePageUrl: sourceUrl,
      sourceLocator: `img:nth-source-image(${index + 1})`,
      sourceReferenceSha256,
      alt: normalizeKoClinicText(image.getAttribute('alt') ?? ''),
      classification: exclusionReason ? 'ui-chrome' : 'content',
      ...(exclusionReason ? { exclusionReason } : {}),
      ...(renderGroups.get(absolute)
        ? { renderGroupId: renderGroups.get(absolute) }
        : {}),
    });
  }
  return images;
}

function extractKoClinicPageSource(input: {
  html: string;
  sourceUrl: string;
  profile?: KoClinicSourceProfile;
}): KoClinicExtractedPage {
  const profile = input.profile ?? EDOM_KO_CLINIC_SOURCE_PROFILE;
  const root = parse(input.html);
  const board = boardCoordinates(input.sourceUrl, profile);
  const heading = pageHeading(root, profile);
  const titleText = heading
    ? compactAnimatedHeading(heading)
    : fallbackTitle(input.sourceUrl, board, profile);
  const titleLocator = heading ? 'visible-page-heading' : 'url-structural-fallback';
  const title = sourceBlock({
    kind: 'page_title',
    text: titleText || fallbackTitle(input.sourceUrl, board, profile),
    sourceUrl: input.sourceUrl,
    locator: titleLocator,
    ordinal: 0,
    ...(heading
      ? {
          render: {
            groupId: 'ko-render-page-title',
            text: animatedHeadingDisplayText(heading)
              ?? normalizedDisplayText(titleText),
            role: 'title' as const,
            sourceNodes: sourceNodesForElement({
              element: heading,
              candidateSelector: 'h1,h2,h3,h4,h5,h6',
              sourceUrl: input.sourceUrl,
              locator: titleLocator,
            }),
          },
        }
      : {}),
  });
  const identityElement = profile.businessNameSelectors
    .map((selector) => root.querySelector(selector))
    .find((element): element is HTMLElement => Boolean(element));
  const logoIdentity = identityElement?.tagName === 'META'
    ? identityElement.getAttribute('content')
    : identityElement?.getAttribute('alt');
  const businessNameText = logoIdentity ? normalizeKoClinicText(logoIdentity) : '';
  const businessName = businessNameText
    ? sourceBlock({
        kind: 'business_name',
        text: businessNameText,
        sourceUrl: input.sourceUrl,
        locator: profile.businessNameLocator ?? `${profile.businessNameSelectors[0] ?? 'identity'}@${
          identityElement?.tagName === 'META' ? 'content' : 'alt'
        }`,
        ordinal: 1,
      })
    : undefined;
  const content = contentRoot(root, board, profile);
  const contentClone = parse(content.toString());
  for (const element of contentClone.querySelectorAll(REMOVABLE)) element.remove();
  assignRenderGroups(contentClone);
  const candidateSelector = board ? BOARD_RICH_CONTENT_TAGS : CONTENT_TAGS;
  let blocks = contentBlocks(contentClone, input.sourceUrl, title.text, Boolean(board));
  const imageRenderGroups = renderGroupByImageUrl({
    root: contentClone,
    sourceUrl: input.sourceUrl,
    candidateSelector,
  });
  const breadcrumbs = breadcrumbBlocks(root, input.sourceUrl, title.text, profile);
  const evidence = boardEvidence(
    root,
    input.sourceUrl,
    breadcrumbs.length + blocks.length + 1,
  );
  const comments = boardCommentBlocks(
    root,
    input.sourceUrl,
    breadcrumbs.length + blocks.length + evidence.length + 1,
  );
  const publicNotice = board?.table === 'praise'
    ? praisePublicNotice(input.html, input.sourceUrl)
    : null;
  if (publicNotice) blocks = [publicNotice, ...blocks];
  blocks = [...breadcrumbs, ...evidence, ...blocks, ...comments];
  const related = relatedLinks(root, input.sourceUrl, blocks.length + 1);
  const metaDescription = root.querySelector('meta[name="description"]')
    ?.getAttribute('content');
  const description = metaDescription ? normalizeKoClinicText(metaDescription) : undefined;
  return {
    sourceUrl: input.sourceUrl,
    sourceHtmlSha256: sha256(input.html),
    title,
    ...(businessName ? { businessName } : {}),
    ...(description ? { description } : {}),
    blocks,
    images: sourceImages(root, input.sourceUrl, imageRenderGroups),
    relatedLinks: related,
    ...(board ? { board } : {}),
  };
}

export function extractKoClinicPage(input: {
  html: string;
  sourceUrl: string;
  profile?: KoClinicSourceProfile;
}): KoClinicExtractedPage {
  return runClinicSourceExtraction({
    profile: KO_MEDICAL_IMPORT_PROFILE,
    value: input,
    extract: extractKoClinicPageSource,
  });
}
