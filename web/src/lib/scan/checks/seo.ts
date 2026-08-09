/**
 * SEO rules for Korean-market discoverability.
 *
 * The checks combine protocol-level eligibility (HTTP, robots, noindex),
 * Naver-specific crawl behavior (Yeti, SSR-readable HTML, absolute canonical),
 * and broadly supported page signals. They intentionally avoid claiming that
 * a passing score guarantees ranking.
 */
import type { ScanRule, RuleContext } from '../rules';
import { CLIENT_RENDER_RISK_CODE } from '../limitations';
import { looksClientRendered } from '../rendering-limit';
import { parseRobotsTxt, robotsAllows } from '../robots';
import { sitemapLooksValid } from '../sitemap';
import {
  canonicalHref,
  hasKoreanText,
  hasNoIndex,
} from '../signals';

function metaContent(ctx: RuleContext, selector: string): string {
  return ctx.root.querySelector(selector)?.getAttribute('content')?.trim() ?? '';
}

function crawlerBlocked(ctx: RuleContext, crawler: string): boolean {
  // 일시 오류는 명시적 Disallow와 구분해 별도 규칙 한 건으로 알린다.
  if (!ctx.robots.ok) return false;
  return !robotsAllows(ctx.robots.body, crawler, ctx.url);
}

function robotsTemporarilyUnavailable(ctx: RuleContext): boolean {
  return ctx.robots.status === 429 || (ctx.robots.status !== null && ctx.robots.status >= 500);
}

function robotsLooksValid(ctx: RuleContext): boolean {
  if (!ctx.robots.ok) return false;
  if (/text\/html/i.test(ctx.robots.contentType)) return false;
  const parsed = parseRobotsTxt(ctx.robots.body);
  return !ctx.robots.truncated && parsed.recognizedDirectives > 0;
}

function canonicalInvalid(ctx: RuleContext): boolean {
  const href = canonicalHref(ctx.root);
  if (!href) return false;
  try {
    const canonical = new URL(href);
    return (
      !['http:', 'https:'].includes(canonical.protocol) ||
      Boolean(canonical.hash) ||
      canonical.origin !== ctx.url.origin
    );
  } catch {
    return true;
  }
}

function looksLikeSoft404(ctx: RuleContext): boolean {
  if (ctx.status < 200 || ctx.status >= 300) return false;
  const title = ctx.root.querySelector('title')?.text.trim() ?? '';
  const heading = ctx.root.querySelector('h1')?.text.trim() ?? '';
  const marker =
    /(?:^|\b)404(?:\b|$)|not\s+found|page\s+not\s+found|\uD398\uC774\uC9C0\uB97C?\s*\uCC3E\uC744\s*\uC218\s*\uC5C6|\uC874\uC7AC\uD558\uC9C0\s*\uC54A\uB294\s*\uD398\uC774\uC9C0|\uC0AC\uC774\uD2B8\uB97C?\s*\uCC3E\uC744\s*\uC218\s*\uC5C6/i;
  return marker.test(`${title} ${heading}`) && ctx.visibleText.replace(/\s+/g, '').length < 800;
}

export const SEO_RULES: ScanRule[] = [
  {
    code: 'seo_http_status',
    pillar: 'seo',
    ownership: 'system',
    severity: 'critical',
    weight: 18,
    label: 'The page does not return a normal HTTP status',
    detail: 'A page intended for search should return a 2xx status. Check for soft 404 screens that return 200.',
    failed: (ctx) => ctx.status < 200 || ctx.status >= 300,
  },
  {
    code: 'seo_html_response',
    pillar: 'seo',
    ownership: 'system',
    severity: 'critical',
    weight: 10,
    label: 'The response is not an HTML document',
    detail: 'The response is not HTML or XHTML, so crawlers cannot interpret it as a normal web page.',
    failed: (ctx) =>
      Boolean(ctx.contentType) && !/(?:text\/html|application\/xhtml\+xml)/i.test(ctx.contentType),
  },
  {
    code: 'seo_html_truncated',
    pillar: 'seo',
    ownership: 'shared',
    severity: 'warn',
    weight: 3,
    label: 'The HTML is too large for a complete diagnostic',
    detail: 'The initial HTML exceeded 1 MB and was truncated. Remove duplicate markup and large inline data so the body remains easy to find.',
    failed: (ctx) => ctx.truncated,
  },
  {
    code: CLIENT_RENDER_RISK_CODE,
    pillar: 'seo',
    ownership: 'system',
    severity: 'warn',
    weight: 0,
    advisory: true,
    label: 'The body appears after JavaScript runs',
    detail: 'The server HTML has little body text and app-sized JavaScript. Browser-rendered content is outside this diagnostic, so the score may be lower than the final screen suggests.',
    failed: (ctx) => looksClientRendered(ctx.root, ctx.visibleText),
  },
  {
    code: 'seo_soft_404',
    pillar: 'seo',
    ownership: 'system',
    severity: 'critical',
    weight: 15,
    label: 'The page appears to be a soft 404',
    detail: 'A short not-found screen returned a 2xx status. Use a real 404 or 410 response for missing pages.',
    failed: looksLikeSoft404,
  },
  {
    code: 'seo_noindex',
    pillar: 'seo',
    ownership: 'system',
    severity: 'critical',
    weight: 20,
    label: 'The page is marked noindex',
    detail: 'Meta robots or X-Robots-Tag explicitly prevents search indexing.',
    rootCause: 'index-directive',
    failed: (ctx) => hasNoIndex(ctx.root, ctx.xRobotsTag),
  },
  {
    code: 'seo_googlebot_blocked',
    pillar: 'seo',
    ownership: 'system',
    severity: 'critical',
    weight: 18,
    label: 'robots.txt blocks Googlebot',
    detail: 'The crawl path required by Google Search is blocked.',
    rootCause: 'robots-crawler-access',
    failed: (ctx) => crawlerBlocked(ctx, 'Googlebot'),
  },
  {
    code: 'seo_naver_yeti_blocked',
    pillar: 'seo',
    ownership: 'system',
    severity: 'critical',
    weight: 20,
    label: 'robots.txt blocks Naver Yeti',
    detail: 'Naver Yeti cannot crawl the current URL.',
    rootCause: 'robots-crawler-access',
    failed: (ctx) => crawlerBlocked(ctx, 'Yeti'),
  },
  {
    code: 'seo_daum_blocked',
    pillar: 'seo',
    ownership: 'system',
    severity: 'critical',
    weight: 14,
    label: 'robots.txt blocks Daum',
    detail: 'Daum cannot crawl the current URL.',
    rootCause: 'robots-crawler-access',
    failed: (ctx) => crawlerBlocked(ctx, 'Daum'),
  },
  {
    code: 'seo_bingbot_blocked',
    pillar: 'seo',
    ownership: 'system',
    severity: 'critical',
    weight: 12,
    label: 'robots.txt blocks Bingbot',
    detail: 'The Bing crawl path used by Bing Search and Copilot is blocked.',
    rootCause: 'robots-crawler-access',
    failed: (ctx) => crawlerBlocked(ctx, 'bingbot'),
  },
  {
    code: 'seo_title_missing',
    pillar: 'seo',
    ownership: 'system',
    severity: 'critical',
    weight: 12,
    label: 'The page title is missing',
    detail: 'Without a title, search engines do not receive a clear page topic for results.',
    failed: (ctx) => !(ctx.root.querySelector('title')?.text ?? '').trim(),
  },
  {
    code: 'seo_title_multiple',
    pillar: 'seo',
    ownership: 'system',
    severity: 'warn',
    weight: 5,
    label: 'The document has multiple title elements',
    detail: 'Search engines must decide which title represents the page.',
    failed: (ctx) => ctx.root.querySelectorAll('head > title').length > 1,
  },
  {
    code: 'seo_title_length',
    pillar: 'seo',
    ownership: 'shared',
    severity: 'warn',
    weight: 3,
    label: 'The page title is unusually short or long',
    detail: 'There is no fixed character formula, but a very short title can be vague and a long title may be shortened in results.',
    failed: (ctx) => {
      const title = (ctx.root.querySelector('title')?.text ?? '').trim();
      return title.length > 0 && (title.length < 5 || title.length > 70);
    },
  },
  {
    code: 'seo_meta_description',
    pillar: 'seo',
    ownership: 'shared',
    severity: 'warn',
    weight: 8,
    label: 'The meta description is missing',
    detail: 'The page has no distinct summary, so search engines must select text from the body.',
    failed: (ctx) => !metaContent(ctx, 'meta[name="description"]'),
  },
  {
    code: 'seo_h1',
    pillar: 'seo',
    ownership: 'system',
    severity: 'warn',
    weight: 7,
    label: 'The primary heading structure needs attention',
    detail: 'A missing or repeated H1 makes the main page topic harder to identify.',
    rootCause: (ctx) => ctx.root.querySelectorAll('h1').length === 0
      ? 'heading-root-missing'
      : 'heading-root-multiple',
    failed: (ctx) => ctx.root.querySelectorAll('h1').length !== 1,
  },
  {
    // 정의는 website/tools/measure-specimen.py 의 headings_as_image 와 동일하게 둔다 —
    // 사이트가 인용하는 감사 수치가 그 정의로 산출됐으므로 다른 기준을 쓰면 진단 결과와
    // 마케팅 문구가 어긋난다. 텍스트가 비어 있고 img 를 품은 heading 만 센다.
    code: 'seo_heading_is_image',
    pillar: 'seo',
    ownership: 'system',
    severity: 'critical',
    // 0 = 채점 계약 밖. SCAN_SCORE_CAPACITY 는 룰 가중치의 합이라는 불변식이 있어
    // 0 이 아닌 값을 주면 capacity 가 261 -> 273 으로 움직이고, 그러면 이미 고객에게
    // 나간 점수의 의미가 소급해 달라진다. 이 룰은 /check/ 의 최상단 증거이지 감점
    // 항목이 아니므로 보고만 하고 점수에는 관여하지 않는다.
    weight: 0,
    label: 'A heading exists only inside an image',
    detail: 'The heading has no text of its own — the words are pixels in an image, so a search engine or assistant receives an empty heading where that sentence should be, and cannot quote it.',
    rootCause: 'heading-as-image',
    failed: (ctx) => {
      const headings = ctx.root.querySelectorAll('h1, h2, h3');
      return headings.some(
        (h) => h.text.replace(/\s+/g, '') === '' && h.querySelectorAll('img').length > 0,
      );
    },
  },
  {
    code: 'seo_canonical',
    pillar: 'seo',
    ownership: 'system',
    severity: 'warn',
    weight: 5,
    label: 'The canonical URL is missing',
    detail: 'When duplicate URLs exist, search engines have no declared primary address.',
    failed: (ctx) => !canonicalHref(ctx.root),
  },
  {
    code: 'seo_canonical_invalid',
    pillar: 'seo',
    ownership: 'system',
    severity: 'warn',
    weight: 8,
    label: 'The canonical URL does not match this page',
    detail: 'A canonical should be an absolute URL and should not point to another host or fragment by mistake.',
    failed: canonicalInvalid,
  },
  {
    code: 'seo_og',
    pillar: 'seo',
    ownership: 'shared',
    severity: 'warn',
    weight: 5,
    label: 'Open Graph data is incomplete',
    detail: 'The title, description, or representative image used in sharing previews is missing.',
    failed: (ctx) =>
      !metaContent(ctx, 'meta[property="og:title"]') ||
      !metaContent(ctx, 'meta[property="og:description"]') ||
      !metaContent(ctx, 'meta[property="og:image"]'),
  },
  {
    code: 'seo_img_alt',
    pillar: 'seo',
    ownership: 'shared',
    severity: 'warn',
    weight: 6,
    label: 'Many images are missing alt text',
    detail: 'Without alt text, search engines and assistive technology cannot reliably understand content images.',
    failed: (ctx) => {
      const images = ctx.root.querySelectorAll('img');
      if (images.length === 0) return false;
      const missing = images.filter((image) => image.getAttribute('alt') === undefined).length;
      return missing / images.length > 0.25;
    },
  },
  {
    code: 'seo_https',
    pillar: 'seo',
    ownership: 'system',
    severity: 'critical',
    weight: 12,
    decaySlot: 'secureConnection',
    decayWeight: 20,
    label: 'The page does not use HTTPS',
    detail: 'The unencrypted connection weakens user trust and a safe search experience.',
    failed: (ctx) => ctx.url.protocol !== 'https:',
  },
  {
    code: 'seo_viewport',
    pillar: 'seo',
    ownership: 'system',
    severity: 'critical',
    weight: 8,
    decaySlot: 'mobileReadiness',
    decayWeight: 15,
    label: 'The mobile viewport setting is missing',
    detail: 'Without a viewport meta tag, a desktop layout may be scaled down on mobile.',
    failed: (ctx) => !ctx.root.querySelector('meta[name="viewport"]'),
  },
  {
    code: 'seo_korean_encoding',
    pillar: 'seo',
    ownership: 'system',
    severity: 'warn',
    weight: 5,
    label: 'The character encoding is unclear',
    detail: 'Declare UTF-8 in the HTTP Content-Type or meta charset to prevent non-Latin text from breaking.',
    failed: (ctx) => {
      if (!hasKoreanText(ctx.visibleText)) return false;
      const metaCharset =
        ctx.root.querySelector('meta[charset]')?.getAttribute('charset') ??
        ctx.root.querySelector('meta[http-equiv="content-type"]')?.getAttribute('content') ??
        '';
      return !/utf-8/i.test(`${ctx.contentType} ${metaCharset}`);
    },
  },
  {
    code: 'seo_hash_navigation',
    pillar: 'seo',
    ownership: 'system',
    severity: 'warn',
    weight: 6,
    label: 'Hash-based page navigation was found',
    detail: 'Independent content should use real path URLs and normal a href links rather than fragments.',
    failed: (ctx) =>
      ctx.root
        .querySelectorAll('a[href]')
        .some((anchor) => /^#!|\/#!/.test(anchor.getAttribute('href')?.trim() ?? '')),
  },
  {
    code: 'seo_robots_temporarily_unavailable',
    pillar: 'seo',
    ownership: 'system',
    severity: 'warn',
    weight: 3,
    label: 'robots.txt is temporarily unavailable',
    detail: 'The server still returned 429 or 5xx after one short retry. This is not treated as an explicit block; run the diagnostic again later.',
    rootCause: 'robots-temporary-unavailable',
    failed: robotsTemporarilyUnavailable,
  },
  {
    code: 'seo_robots_txt',
    pillar: 'seo',
    ownership: 'system',
    severity: 'warn',
    weight: 4,
    label: 'robots.txt could not be found',
    detail: 'Crawling can work without it, but sitemap and crawler policies cannot be managed explicitly in one place.',
    failed: (ctx) => !ctx.robots.ok && !robotsTemporarilyUnavailable(ctx),
  },
  {
    code: 'seo_robots_invalid',
    pillar: 'seo',
    ownership: 'system',
    severity: 'critical',
    weight: 10,
    label: 'The robots.txt response is not valid',
    detail: 'An HTML error page, truncated file, or file with no recognized directives may be interpreted incorrectly.',
    failed: (ctx) => ctx.robots.ok && !robotsLooksValid(ctx),
  },
  {
    code: 'seo_robots_sitemap',
    pillar: 'seo',
    ownership: 'system',
    severity: 'info',
    weight: 2,
    label: 'robots.txt does not list a sitemap',
    detail: 'A Sitemap directive helps search engines discover the sitemap.',
    failed: (ctx) => ctx.robots.ok && parseRobotsTxt(ctx.robots.body).sitemaps.length === 0,
  },
  {
    code: 'seo_sitemap',
    pillar: 'seo',
    ownership: 'system',
    severity: 'warn',
    weight: 6,
    label: 'sitemap.xml could not be found',
    detail: 'There is no standard feed for canonical URLs and recent modification dates.',
    failed: (ctx) => !ctx.sitemap.ok,
  },
  {
    code: 'seo_sitemap_invalid',
    pillar: 'seo',
    ownership: 'system',
    severity: 'critical',
    weight: 10,
    label: 'sitemap.xml is not valid',
    detail: 'A 2xx response is not a valid sitemap when it is an HTML error page or lacks urlset or sitemapindex with absolute loc entries.',
    failed: (ctx) => ctx.sitemap.ok && !sitemapLooksValid(ctx.sitemap),
  },
  {
    code: 'seo_speed_slow',
    pillar: 'seo',
    ownership: 'shared',
    severity: 'warn',
    weight: 2,
    decaySlot: 'responseSpeed',
    decayWeight: 8,
    label: 'The first server response is slow: over 1.5 seconds',
    detail: 'The faster of two responses measured from the Anaks Labs diagnostic server exceeded 1.5 seconds. Actual results vary by visitor location and network.',
    failed: (ctx) => ctx.ttfbMs > 1500 && ctx.ttfbMs <= 3000,
  },
  {
    code: 'seo_speed_very_slow',
    pillar: 'seo',
    ownership: 'shared',
    severity: 'critical',
    weight: 3,
    decaySlot: 'responseSpeed',
    decayWeight: 15,
    label: 'The first server response is very slow: over 3 seconds',
    detail: 'The faster of two responses measured from the Anaks Labs diagnostic server exceeded 3 seconds. Confirm with repeated measurements from relevant locations.',
    failed: (ctx) => ctx.ttfbMs > 3000,
  },
  {
    code: 'seo_favicon',
    pillar: 'seo',
    ownership: 'system',
    severity: 'info',
    weight: 1,
    label: 'The favicon is missing',
    detail: 'The site has no identifying icon for browser tabs, bookmarks, or supported search surfaces.',
    failed: (ctx) => !ctx.root.querySelector('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'),
  },
];
