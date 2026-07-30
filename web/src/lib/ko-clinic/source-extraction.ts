import { createHash } from 'node:crypto';
import { parse, type HTMLElement } from 'node-html-parser';
import type {
  KoClinicExtractedPage,
  KoClinicSourceBlock,
  KoClinicSourceImage,
  KoClinicSourceKind,
} from './contracts';

const CONTENT_TAGS = 'h1,h2,h3,h4,h5,h6,p,li,dt,dd,address,th,td';
const UI_CHROME_IMAGE = /(?:\/img\/common\/|\/cheditor5\/icons\/|(?:^|[/_.-])(?:arrow|blank|btn|button|favicon|icon|loading|logo|pg_(?:first|last|next|prev)|popup|scroll|sns|spacer|sprite|tracking)(?:[/_.-]|$))/iu;
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
  href?: string;
}): KoClinicSourceBlock {
  const sourceSha256 = sha256(input.text);
  return {
    id: `ko-${sourceSha256.slice(0, 16)}-${input.ordinal}`,
    kind: input.kind,
    text: input.text,
    sourceUrl: input.sourceUrl,
    sourceLocator: input.locator,
    sourceSha256,
    ...(input.href ? { href: input.href } : {}),
  };
}

function boardCoordinates(sourceUrl: string): KoClinicExtractedPage['board'] {
  const url = new URL(sourceUrl);
  if (!url.pathname.endsWith('/bbs/board.php')) return undefined;
  const table = url.searchParams.get('bo_table');
  const wrId = Number(url.searchParams.get('wr_id'));
  return table && Number.isSafeInteger(wrId) && wrId > 0 ? { table, wrId } : undefined;
}

function boardTitle(root: HTMLElement): HTMLElement | null {
  const titleRow = root.querySelectorAll('.board_view tr').find((row) => (
    normalizeKoClinicText(row.querySelector('th')?.text ?? '') === '제 목'
  ));
  return titleRow?.querySelector('td div') ?? titleRow?.querySelector('td') ?? null;
}

function pageHeading(root: HTMLElement): HTMLElement | null {
  return boardTitle(root)
    ?? root.querySelector('.sub_tit .main_tit h2')
    ?? root.querySelector('.main_tit h2')
    ?? root.querySelector('main h1')
    ?? root.querySelector('main h2')
    ?? root.querySelector('h1')
    ?? root.querySelector('h2');
}

function fallbackTitle(sourceUrl: string, board: KoClinicExtractedPage['board']): string {
  if (board) {
    const labels: Record<string, string> = {
      customer: '고객의 소리',
      edu: '학술활동',
      news: '공지사항',
      photo: '이담with스타',
      praise: '칭찬합니다',
      pub_counsel: '전문의상담',
      story: '이벤트',
      tv: '이담미디어',
    };
    return `${labels[board.table] ?? board.table} ${board.wrId}`;
  }
  const url = new URL(sourceUrl);
  if (url.pathname === '/' || url.pathname === '/main.php') return '이담병원';
  return url.pathname.split('/').pop()?.replace(/\.php$/u, '') ?? '이담병원';
}

function contentRoot(root: HTMLElement, board: KoClinicExtractedPage['board']): HTMLElement {
  if (board) {
    return root.querySelector('#writeContents')
      ?? root.querySelector('.board_view')
      ?? root.querySelector('.content_wrap')
      ?? root;
  }
  return root.querySelector('.content_wrap')
    ?? root.querySelector('main')
    ?? root;
}

function nearestSelectedAncestor(element: HTMLElement, selected: ReadonlySet<HTMLElement>): boolean {
  let parent = element.parentNode;
  while (parent && 'tagName' in parent) {
    if (selected.has(parent as HTMLElement)) return true;
    parent = parent.parentNode;
  }
  return false;
}

function contentBlocks(
  root: HTMLElement,
  sourceUrl: string,
  titleText: string,
): KoClinicSourceBlock[] {
  const candidates = root.querySelectorAll(CONTENT_TAGS);
  const selected = new Set(candidates);
  const blocks: KoClinicSourceBlock[] = [];
  for (const [index, element] of candidates.entries()) {
    if (nearestSelectedAncestor(element, selected)) continue;
    const text = blockText(element);
    if (!text || text === titleText) continue;
    const kind: KoClinicSourceKind = /^H[1-6]$/u.test(element.tagName)
      ? 'heading'
      : element.tagName === 'LI'
        ? 'list_item'
        : 'paragraph';
    blocks.push(sourceBlock({
      kind,
      text,
      sourceUrl,
      locator: `${element.tagName.toLocaleLowerCase('en-US')}:nth-source-block(${index + 1})`,
      ordinal: blocks.length,
    }));
  }
  return blocks;
}

function boardEvidence(
  root: HTMLElement,
  sourceUrl: string,
  startOrdinal: number,
): KoClinicSourceBlock[] {
  const row = root.querySelectorAll('.board_view tr').find((element) => (
    /작성자/u.test(element.text) && /작성일/u.test(element.text)
  ));
  if (!row) return [];
  const cells = row.querySelectorAll('th,td');
  const result: KoClinicSourceBlock[] = [];
  for (let index = 0; index < cells.length - 1; index += 1) {
    const label = normalizeKoClinicText(cells[index].text);
    if (label !== '작성자' && label !== '작성일') continue;
    const text = normalizeKoClinicText(cells[index + 1].text);
    if (!text) continue;
    result.push(sourceBlock({
      kind: label === '작성자' ? 'author' : 'published_date',
      text,
      sourceUrl,
      locator: `.board_view tr:has(th:${label}) td`,
      ordinal: startOrdinal + result.length,
    }));
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

function sourceImages(root: HTMLElement, sourceUrl: string): KoClinicSourceImage[] {
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
    });
  }
  return images;
}

export function extractKoClinicPage(input: {
  html: string;
  sourceUrl: string;
}): KoClinicExtractedPage {
  const root = parse(input.html);
  const board = boardCoordinates(input.sourceUrl);
  const heading = pageHeading(root);
  const titleText = heading ? compactAnimatedHeading(heading) : fallbackTitle(input.sourceUrl, board);
  const title = sourceBlock({
    kind: 'page_title',
    text: titleText || fallbackTitle(input.sourceUrl, board),
    sourceUrl: input.sourceUrl,
    locator: heading ? 'visible-page-heading' : 'url-structural-fallback',
    ordinal: 0,
  });
  const logoIdentity = root.querySelector('img[alt*="이담"]')?.getAttribute('alt');
  const businessNameText = logoIdentity ? normalizeKoClinicText(logoIdentity) : '';
  const businessName = businessNameText
    ? sourceBlock({
        kind: 'business_name',
        text: businessNameText,
        sourceUrl: input.sourceUrl,
        locator: 'img[alt*="이담"]@alt',
        ordinal: 1,
      })
    : undefined;
  const content = contentRoot(root, board);
  const contentClone = parse(content.toString());
  for (const element of contentClone.querySelectorAll(REMOVABLE)) element.remove();
  let blocks = contentBlocks(contentClone, input.sourceUrl, title.text);
  const evidence = boardEvidence(root, input.sourceUrl, blocks.length + 1);
  const publicNotice = board?.table === 'praise'
    ? praisePublicNotice(input.html, input.sourceUrl)
    : null;
  if (publicNotice) blocks = [publicNotice, ...blocks];
  blocks = [...evidence, ...blocks];
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
    images: sourceImages(content, input.sourceUrl),
    relatedLinks: related,
    ...(board ? { board } : {}),
  };
}
