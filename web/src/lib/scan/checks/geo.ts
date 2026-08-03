/**
 * GEO rules — can generative search systems retrieve, understand, and cite the
 * page with enough context and evidence?
 *
 * There is no special "AI ranking file": the rules prioritize crawler access,
 * snippet eligibility, clear entity/topic signals, first-party evidence, and
 * content patterns that make a faithful citation possible.
 */
import type { ScanRule, RuleContext } from '../rules';
import { contentMarkupLength } from '../document';
import { robotsAllows } from '../robots';
import {
  hasAddressForScanLocale,
  hasPhoneForScanLocale,
} from '../locale-signals';
import {
  hasBusinessNumber,
  hasKoreanAddress,
  hasKoreanText,
  hasLocalBusinessType,
  hasNaverSourceInfoRestriction,
  hasNoIndex,
  hasPhone,
  hasSnippetRestriction,
  hasUnsourcedClaimSignals,
  isArticleLike,
  jsonLdReport,
  jsonLdSameAs,
  supportedChannelUrls,
  titleHeadingAligned,
} from '../signals';

function crawlerBlocked(ctx: RuleContext, crawler: string): boolean {
  if (!ctx.robots.ok) return false;
  return !robotsAllows(ctx.robots.body, crawler, ctx.url);
}

function hasAuthor(ctx: RuleContext): boolean {
  if (ctx.root.querySelector('meta[name="author"], [rel="author"], [itemprop="author"]')) return true;
  const report = jsonLdReport(ctx.root);
  return report.nodes.some((node) => {
    const author = node.author;
    if (typeof author === 'string') return Boolean(author.trim());
    if (Array.isArray(author)) return author.length > 0;
    return Boolean(author && typeof author === 'object');
  });
}

function hasDate(ctx: RuleContext): boolean {
  if (
    ctx.root.querySelector(
      'time[datetime], meta[property="article:published_time"], meta[property="article:modified_time"]',
    )
  ) {
    return true;
  }
  return jsonLdReport(ctx.root).nodes.some(
    (node) =>
      (typeof node.datePublished === 'string' && Boolean(node.datePublished.trim())) ||
      (typeof node.dateModified === 'string' && Boolean(node.dateModified.trim())),
  );
}

function isLocalPage(ctx: RuleContext): boolean {
  const report = jsonLdReport(ctx.root);
  return (
    hasLocalBusinessType(report) ||
    (ctx.scanLocale ? hasPhoneForScanLocale(ctx.visibleText, ctx) : hasPhone(ctx.visibleText)) ||
    (ctx.scanLocale ? hasAddressForScanLocale(ctx.visibleText, ctx) : hasKoreanAddress(ctx.visibleText)) ||
    hasBusinessNumber(ctx.visibleText) ||
    Boolean(
      ctx.root.querySelector(
        'a[href*="map.naver.com"], a[href*="place.naver.com"], a[href*="map.kakao.com"], a[href*="place.map.kakao.com"]',
      ),
    )
  );
}

function normalizeIdentityUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = '';
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return raw.trim().replace(/\/+$/, '').toLowerCase();
  }
}

export const GEO_RULES: ScanRule[] = [
  {
    code: 'geo_oai_search_blocked',
    pillar: 'geo',
    ownership: 'system',
    severity: 'critical',
    weight: 16,
    label: 'robots.txt blocks OAI-SearchBot',
    detail: 'OAI-SearchBot must be able to crawl public pages before ChatGPT Search can consider them for retrieval and citation.',
    rootCause: 'robots-crawler-access',
    failed: (ctx) => crawlerBlocked(ctx, 'OAI-SearchBot'),
  },
  {
    code: 'geo_perplexity_blocked',
    pillar: 'geo',
    ownership: 'system',
    severity: 'critical',
    weight: 14,
    label: 'robots.txt blocks PerplexityBot',
    detail: 'PerplexityBot must be able to crawl public content before Perplexity can consider it for retrieval and citation.',
    rootCause: 'robots-crawler-access',
    failed: (ctx) => crawlerBlocked(ctx, 'PerplexityBot'),
  },
  {
    code: 'geo_snippet_restricted',
    pillar: 'geo',
    ownership: 'system',
    severity: 'critical',
    weight: 16,
    label: 'Search summaries and AI excerpts are restricted',
    detail: 'Directives such as nosnippet, max-snippet:0, and noindex restrict search summaries and generative search use of the body.',
    rootCause: (ctx) => hasNoIndex(ctx.root, ctx.xRobotsTag)
      ? 'index-directive'
      : 'snippet-directive',
    failed: (ctx) => hasSnippetRestriction(ctx.root, ctx.xRobotsTag),
  },
  {
    code: 'geo_naver_sourceinfo_disabled',
    pillar: 'geo',
    ownership: 'system',
    severity: 'info',
    weight: 3,
    label: 'Naver source attribution is disabled',
    detail: 'nosourceinfo asks Naver not to identify this page as a source in supported AI search surfaces.',
    failed: (ctx) => hasNaverSourceInfoRestriction(ctx.root),
  },
  {
    code: 'geo_no_text',
    pillar: 'geo',
    ownership: 'shared',
    severity: 'critical',
    weight: 18,
    label: 'There is almost no body text to read',
    detail: 'Visible text is under 200 characters. Information that exists only in images or after client rendering may not be available to search and answer systems.',
    rootCause: 'insufficient-server-html',
    failed: (ctx) => ctx.visibleText.replace(/\s+/g, '').length < 200,
  },
  {
    code: 'geo_low_text_ratio',
    pillar: 'geo',
    ownership: 'system',
    severity: 'warn',
    weight: 8,
    label: 'The body-to-markup ratio is low',
    detail: 'The page contains little text relative to its code, making the primary explanation and evidence harder to identify.',
    failed: (ctx) => {
      const denominator = contentMarkupLength(ctx.root);
      if (denominator === 0) return true;
      const visibleLength = ctx.visibleText.length;
      if (visibleLength < 200) return false;
      return visibleLength / denominator < 0.05 && visibleLength < 1200;
    },
  },
  {
    code: 'geo_business_info',
    pillar: 'geo',
    ownership: 'customer',
    severity: 'warn',
    weight: 12,
    label: 'The local business phone number or address is incomplete',
    detail: 'A location-based service page should show a consistent real phone number and street address so the business can be verified.',
    failed: (ctx) =>
      isLocalPage(ctx) && (
        ctx.scanLocale
          ? (!hasPhoneForScanLocale(ctx.visibleText, ctx) || !hasAddressForScanLocale(ctx.visibleText, ctx))
          : (!hasPhone(ctx.visibleText) || !hasKoreanAddress(ctx.visibleText))
      ),
  },
  {
    code: 'geo_dates',
    pillar: 'geo',
    ownership: 'customer',
    severity: 'warn',
    weight: 7,
    label: 'The content has no published or modified date',
    detail: 'Without a date on an article or guide, people and answer systems cannot assess freshness.',
    failed: (ctx) => isArticleLike(ctx.root, jsonLdReport(ctx.root), ctx.url) && !hasDate(ctx),
  },
  {
    code: 'geo_lang',
    pillar: 'geo',
    ownership: 'system',
    severity: 'critical',
    weight: 10,
    label: 'The document language is missing',
    detail: 'Without an html lang value, search and answer systems must infer the document language and locale.',
    failed: (ctx) => !(ctx.root.querySelector('html')?.getAttribute('lang') ?? '').trim(),
  },
  {
    code: 'geo_korean_lang_mismatch',
    pillar: 'geo',
    ownership: 'system',
    severity: 'warn',
    weight: 6,
    label: 'The body and document language do not match',
    detail: 'The body appears to be Korean but html lang is not a ko locale, creating conflicting language signals.',
    failed: (ctx) => {
      if (!hasKoreanText(ctx.visibleText)) return false;
      const lang = ctx.root.querySelector('html')?.getAttribute('lang')?.trim().toLowerCase() ?? '';
      return Boolean(lang) && lang !== 'ko' && !lang.startsWith('ko-');
    },
  },
  {
    code: 'geo_author',
    pillar: 'geo',
    ownership: 'customer',
    severity: 'warn',
    weight: 7,
    label: 'The content has no author or responsible reviewer',
    detail: 'An article or guide should identify the real responsible party so readers can assess experience and source.',
    failed: (ctx) => isArticleLike(ctx.root, jsonLdReport(ctx.root), ctx.url) && !hasAuthor(ctx),
  },
  {
    code: 'geo_channel_identity',
    pillar: 'geo',
    ownership: 'shared',
    severity: 'info',
    weight: 5,
    label: 'Official channels are not linked to the structured entity',
    detail: 'Visible official profiles should also appear in Organization or Person sameAs.',
    failed: (ctx) => {
      const visible = supportedChannelUrls(ctx.root).map(normalizeIdentityUrl);
      if (visible.length === 0) return false;
      const sameAs = jsonLdSameAs(jsonLdReport(ctx.root)).map(normalizeIdentityUrl);
      return visible.some((url) => !sameAs.includes(url));
    },
  },
  {
    code: 'geo_unsourced_claims',
    pillar: 'geo',
    ownership: 'customer',
    severity: 'warn',
    weight: 9,
    label: 'Numbers or research claims lack a verifiable source',
    detail: 'When citing statistics or research, include the original link, publisher, and reference date.',
    failed: (ctx) => hasUnsourcedClaimSignals(ctx.root, ctx.visibleText, ctx.scanLocale),
  },
  {
    code: 'geo_topic_alignment',
    pillar: 'geo',
    ownership: 'shared',
    severity: 'warn',
    weight: 7,
    label: 'The page title and primary heading do not align',
    detail: 'Title and H1 share no central terms, so the primary page topic is unclear.',
    failed: (ctx) => !titleHeadingAligned(ctx.root),
  },
  {
    code: 'geo_empty_page',
    pillar: 'geo',
    ownership: 'shared',
    severity: 'critical',
    weight: 10,
    label: 'The page is effectively empty',
    detail: 'The page has too little body content to answer a question or support a citation.',
    rootCause: 'insufficient-server-html',
    failed: (ctx) => ctx.root.querySelectorAll('p, li, h1, h2, h3, td, dd').length < 3,
  },
];
