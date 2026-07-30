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
    reason: 'login-member-widget' | 'search-form' | 'pagination-label' | 'board-list-widget';
  }[];
}

function normalize(value: string): string {
  return value
    .replace(/\u00a0/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function deepestTextBlocks(root: HTMLElement): string[] {
  const blocks: string[] = [];
  const candidates = root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,dt,dd,address,th,td');
  const selected = new Set(candidates);
  for (const element of candidates) {
    if (element.querySelector('h1,h2,h3,h4,h5,h6,p,li,dt,dd,address,th,td')) continue;
    let parent = element.parentNode;
    let nested = false;
    while (parent && 'tagName' in parent) {
      if (selected.has(parent as HTMLElement)) {
        nested = true;
        break;
      }
      parent = parent.parentNode;
    }
    if (nested) continue;
    const text = normalize(element.text);
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
  for (const element of root.querySelectorAll(EXCLUDED_ORIGINAL_CHROME)) element.remove();
  const content = root.querySelector('.content_wrap')
    ?? root.querySelector('main')
    ?? root;
  return {
    sourceUrl: input.sourceUrl,
    included: deepestTextBlocks(content),
    excluded,
  };
}
