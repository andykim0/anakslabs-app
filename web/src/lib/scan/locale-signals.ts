import type { HTMLElement } from 'node-html-parser';
import type { RuleContext, ScanLocaleContext } from './rules';

const US_PHONE_RE =
  /(?:^|[^\d])(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?:$|[^\d])/u;
const US_STREET_RE =
  /\b\d{1,6}\s+[A-Za-z0-9.'# -]{2,80}\s(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Way|Court|Ct|Highway|Hwy|Suite|Ste)\b/iu;
const US_REGION_POSTAL_RE =
  /\b(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\s+\d{5}(?:-\d{4})?\b/u;

const ENGLISH_LIST_WORTHY_RE =
  /\b(?:services?|treatments?|procedures?|pricing|prices?|costs?|steps?|process|preparation|what to expect|insurance|payment options?|conditions?|specialties|frequently asked questions?|faq)\b/iu;
const ENGLISH_CLAIM_SIGNAL_RE =
  /\b(?:study|studies|research|survey|report|data|statistics?|evidence|clinical trial|according to)\b|\d+(?:\.\d+)?\s*%|\b\d+(?:\.\d+)?\s*(?:times?|x)\b/iu;
const KOREAN_CLAIM_SIGNAL_RE =
  /(?:통계|연구|조사|보고서|자료|에 따르면|\d+(?:\.\d+)?\s*%|퍼센트|배 증가|명 중)/u;
const LOCAL_SOURCE_SELECTOR = 'cite, a[href^="http://"], a[href^="https://"]';

export interface ClaimSourceReport {
  applicable: boolean;
  claimBlocks: number;
  sourcedClaimBlocks: number;
  unsourcedClaimBlocks: number;
}

function claimPattern(locale?: ScanLocaleContext): RegExp {
  return locale?.locale === 'en-US' ? ENGLISH_CLAIM_SIGNAL_RE : KOREAN_CLAIM_SIGNAL_RE;
}

function hasClaimSourceInSameBlock(block: HTMLElement): boolean {
  if (block.querySelector(LOCAL_SOURCE_SELECTOR)) return true;
  let parent = block.parentNode;
  // The walk stops at the document root, and node-html-parser's root carries `tagName` with the
  // value null — so `'tagName' in parent` let the root through and the next line threw on a real
  // clinic site whose claim paragraph sits outside any section/article/main/body. That crash
  // surfaced only after the polite crawl had finished, discarding the whole completed crawl.
  while (parent && typeof (parent as HTMLElement).tagName === 'string') {
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

export function claimSourceReport(
  root: HTMLElement,
  visibleText: string,
  locale?: ScanLocaleContext,
): ClaimSourceReport {
  const pattern = claimPattern(locale);
  if (!pattern.test(visibleText)) {
    return { applicable: false, claimBlocks: 0, sourcedClaimBlocks: 0, unsourcedClaimBlocks: 0 };
  }
  const leafBlocks = root
    .querySelectorAll('p, li, blockquote, dd, td')
    .filter((block) => pattern.test(block.text));
  const blocks = leafBlocks.length > 0
    ? leafBlocks
    : root.querySelectorAll('section, article').filter((block) => pattern.test(block.text));
  if (blocks.length === 0) {
    return { applicable: true, claimBlocks: 1, sourcedClaimBlocks: 0, unsourcedClaimBlocks: 1 };
  }
  const sourcedClaimBlocks = blocks.filter(hasClaimSourceInSameBlock).length;
  return {
    applicable: true,
    claimBlocks: blocks.length,
    sourcedClaimBlocks,
    unsourcedClaimBlocks: blocks.length - sourcedClaimBlocks,
  };
}

export function hasPhoneForScanLocale(text: string, ctx: RuleContext): boolean {
  if (ctx.scanLocale?.locale === 'en-US') return US_PHONE_RE.test(` ${text} `);
  return false;
}

export function hasAddressForScanLocale(text: string, ctx: RuleContext): boolean {
  if (ctx.scanLocale?.locale === 'en-US') {
    return US_STREET_RE.test(text) && US_REGION_POSTAL_RE.test(text);
  }
  return false;
}

export function isListWorthyForScanLocale(text: string, ctx: RuleContext): boolean {
  if (ctx.scanLocale?.locale === 'en-US') return ENGLISH_LIST_WORTHY_RE.test(text);
  return false;
}

export function expectedLanguageMatches(root: HTMLElement, locale?: ScanLocaleContext): boolean {
  if (!locale) return true;
  const declared = root.querySelector('html')?.getAttribute('lang')?.trim().toLowerCase() ?? '';
  const expected = locale.locale.toLowerCase();
  return declared === expected || declared === expected.split('-')[0];
}
