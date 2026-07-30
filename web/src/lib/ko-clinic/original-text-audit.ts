import { parse, type HTMLElement } from 'node-html-parser';

/**
 * Independent S_orig extractor. It deliberately imports neither KO source extraction nor
 * curation/ad-policy code, so a missed source block cannot validate itself.
 */
const EXCLUDED_ORIGINAL_CHROME = [
  'script',
  'style',
  'noscript',
  'template',
  'header',
  'footer',
  'nav',
  'form',
  '.login_icon',
  '.paging',
  '.pagination',
  '.board_button',
  '.board_bottom_spacer',
  '.scroll',
].join(',');

export interface IndependentOriginalText {
  sourceUrl: string;
  included: readonly string[];
  excluded: readonly {
    selector: string;
    text: string;
    reason:
      | 'login-member-widget'
      | 'search-form'
      | 'pagination-label'
      | 'board-list-widget'
      | 'board-view-label'
      | 'board-view-count'
      | 'hidden-form-state';
  }[];
}

function normalize(value: string): string {
  return value
    .replace(/\u00a0/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function independentVisibleText(element: HTMLElement): string {
  if (/^H[1-6]$/u.test(element.tagName)) {
    const directText = element.childNodes
      .filter((child) => !('tagName' in child))
      .map((child) => normalize(child.text))
      .filter(Boolean);
    const elementChildren = element.childNodes.filter((child) => 'tagName' in child) as HTMLElement[];
    const characterChildren = elementChildren.map((child) => normalize(child.text));
    if (
      directText.length === 0
      &&
      characterChildren.length >= 2
      && characterChildren.every((value) => value.length === 1 && /[\p{L}\p{N}]/u.test(value))
    ) {
      // Source indentation between inline, one-character animation spans is layout
      // whitespace, not a visible word boundary. This remains independent of the
      // production source extractor while matching what the original page displays.
      return characterChildren.join('');
    }
  }
  return normalize(element.text);
}

function deepestTextBlocks(root: HTMLElement): string[] {
  const blocks: string[] = [];
  const candidates = root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,dt,dd,address,th,td');
  for (const element of candidates) {
    if (element.querySelector('h1,h2,h3,h4,h5,h6,p,li,dt,dd,address,th,td')) continue;
    const text = independentVisibleText(element);
    if (text) blocks.push(text);
  }
  return blocks;
}

export function extractIndependentOriginalText(input: {
  html: string;
  sourceUrl: string;
}): IndependentOriginalText {
  const root = parse(input.html);
  const excluded: IndependentOriginalText['excluded'][number][] = [];
  const record = (
    selector: string,
    reason: IndependentOriginalText['excluded'][number]['reason'],
  ) => {
    for (const element of root.querySelectorAll(selector)) {
      const text = normalize(element.text);
      if (text) excluded.push({ selector, text, reason });
      element.remove();
    }
  };
  record('.login_icon,.login-wrap,.member-wrap', 'login-member-widget');
  record('form[action*="search"],.search-wrap', 'search-form');
  record('.paging,.pagination', 'pagination-label');
  record('.board_list', 'board-list-widget');
  record('textarea,input,[style*="display:none"]', 'hidden-form-state');
  for (const row of root.querySelectorAll('.board_view tr')) {
    const cells = row.querySelectorAll('th,td');
    for (let index = 0; index < cells.length; index += 1) {
      const label = normalize(cells[index].text);
      if (label === '제 목') {
        excluded.push({
          selector: '.board_view th',
          text: label,
          reason: 'board-view-label',
        });
        cells[index].remove();
        continue;
      }
      if (
        ['발행연도'].includes(label)
        && (!cells[index + 1] || !normalize(cells[index + 1].text))
      ) {
        excluded.push({
          selector: '.board_view th',
          text: label,
          reason: 'board-view-label',
        });
        cells[index].remove();
        continue;
      }
      if (label !== '조회' && label !== '조회수') continue;
      const value = cells[index + 1] ? normalize(cells[index + 1].text) : '';
      excluded.push({
        selector: '.board_view th',
        text: label,
        reason: 'board-view-count',
      });
      if (value) {
        excluded.push({
          selector: '.board_view td',
          text: value,
          reason: 'board-view-count',
        });
        cells[index + 1].remove();
      }
      cells[index].remove();
    }
  }
  for (const element of root.querySelectorAll(EXCLUDED_ORIGINAL_CHROME)) element.remove();
  const content = root.querySelector('main')
    ?? root.querySelector('.content_wrap')
    ?? root;
  return {
    sourceUrl: input.sourceUrl,
    included: deepestTextBlocks(content),
    excluded,
  };
}
