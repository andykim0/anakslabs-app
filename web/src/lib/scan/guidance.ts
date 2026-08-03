/**
 * 발행 전 진단 가이드 — 모든 scan 이슈를 고객 언어의 실행 가능한 코칭으로 매핑한다.
 * 카피는 검색 노출이나 AI 인용을 보장하지 않고, 실제로 개선되는 해석·수집·접근 조건만 설명한다.
 */
import { ALL_SCAN_RULES } from './rule-registry';

/** 딥링크 대상 — 고객이 '어디를 채우면 되는지'. system=발행 시 자동 처리(고객 조치 불필요) */
export type GuidanceAnchor =
  | 'editor:content'
  | 'editor:business-info'
  | 'editor:meta'
  | 'editor:images'
  | 'system';

export interface ScanGuidance {
  /** 문제를 고객 언어로 */
  title: string;
  /** 무엇을 하면 되는지(코칭) */
  action: string;
  /** 예상 효과 한 줄 */
  effect: string;
  anchor: GuidanceAnchor;
  /** 단순 고객 정보 부재는 오류 대신 채우면 만점이 되는 항목으로 안내한다. */
  presentation?: 'input-to-perfect';
}

const G = (
  title: string,
  action: string,
  effect: string,
  anchor: GuidanceAnchor,
  presentation?: ScanGuidance['presentation'],
): ScanGuidance => ({
  title,
  action,
  effect,
  anchor,
  ...(presentation ? { presentation } : {}),
});

const AUTO = 'Handled automatically when the site is published.';

export const SCAN_GUIDANCE: Record<string, ScanGuidance> = {
  // ---------- SEO ----------
  seo_http_status: G('The page does not return a normal response', 'Make the real page return a 2xx response instead of an error, login screen, or soft 404.', 'Crawlers can distinguish the page from an error screen.', 'system'),
  seo_html_response: G('The response is not an HTML page', 'Configure the public page to return an HTML document.', 'Search engines can interpret it as a normal web page.', 'system'),
  seo_html_truncated: G('The initial HTML is unusually large', 'Remove duplicate markup and large inline data.', 'People and crawlers can reach the body text more efficiently.', 'editor:content'),
  seo_client_rendered_content: G('The body appears only after JavaScript runs', 'Read this score as an assessment of the first HTML response.', 'This separates missing server HTML from content that appears only in the browser.', 'system'),
  seo_soft_404: G('An error screen returns a 200 status', 'Return a real 404 or 410 status for missing URLs.', 'Search engines can distinguish real content from a missing page.', 'system'),
  seo_noindex: G('The page is marked noindex', 'If this page should be public, remove noindex from meta robots and X-Robots-Tag.', 'Search engines can consider the page for indexing.', 'system'),
  seo_googlebot_blocked: G('Googlebot cannot crawl this page', 'Allow Googlebot to access public pages in robots.txt.', 'Google Search can crawl the page.', 'system'),
  seo_naver_yeti_blocked: G('Naver Yeti cannot crawl this page', 'Allow Yeti to access public pages in robots.txt.', 'Naver can crawl the page.', 'system'),
  seo_daum_blocked: G('Daum cannot crawl this page', 'Allow Daum to access public pages in robots.txt.', 'Daum can crawl the page.', 'system'),
  seo_bingbot_blocked: G('Bingbot cannot crawl this page', 'Allow Bingbot to access public pages in robots.txt.', 'Bing Search and Copilot can crawl the page.', 'system'),
  seo_title_missing: G('The page title is empty', 'Add a distinct title that identifies the brand and page topic.', 'Search engines receive a clear primary topic.', 'editor:meta'),
  seo_title_multiple: G('The page has more than one title', 'Keep one title element in each document.', 'This removes conflicting title signals.', 'system'),
  seo_title_length: G('The title needs editing', 'Lead with the main topic and remove unnecessary repetition.', 'The title is less likely to be heavily shortened in results.', 'editor:meta'),
  seo_meta_description: G('The search description is empty', 'Summarize this page and its value in one or two specific sentences.', 'Search engines receive a more relevant description candidate.', 'editor:meta'),
  seo_h1: G('The primary heading structure needs attention', 'Give the page one clear H1.', 'Search engines can identify the page’s main topic.', 'editor:content'),
  seo_canonical: G('The canonical URL is missing', AUTO, 'Duplicate URLs can point to one primary address.', 'system'),
  seo_canonical_invalid: G('The canonical URL does not match this page', AUTO, 'Signals will not be merged into another host or fragment by mistake.', 'system'),
  seo_og: G('The sharing preview is incomplete', 'Add the page title, description, and representative image.', 'Shared links have accurate context.', 'editor:images'),
  seo_img_alt: G('Many images are missing alt text', 'Give meaningful images short, specific descriptions.', 'Search engines and assistive technology can understand their purpose.', 'editor:images'),
  seo_https: G('The page needs HTTPS', AUTO, 'People and crawlers can use an encrypted connection.', 'system'),
  seo_viewport: G('The mobile viewport setting is missing', AUTO, 'The page can render at a usable mobile scale.', 'system'),
  seo_korean_encoding: G('The character encoding is unclear', AUTO, 'Non-Latin text is less likely to render incorrectly.', 'system'),
  seo_hash_navigation: G('Some pages use hash navigation', 'Give standalone content a real path and normal link instead of a # URL.', 'Crawlers can discover each page separately.', 'editor:content'),
  seo_robots_txt: G('robots.txt could not be found', AUTO, 'Crawler policy and sitemap locations can be declared in one place.', 'system'),
  seo_robots_temporarily_unavailable: G('robots.txt is temporarily unavailable', 'The server may be busy or rate-limiting requests. Run the diagnostic again later.', 'A temporary failure stays separate from an explicit block.', 'system'),
  seo_robots_invalid: G('robots.txt is not valid', AUTO, 'Crawlers will not mistake an error page for a policy file.', 'system'),
  seo_robots_sitemap: G('robots.txt does not list a sitemap', AUTO, 'Search engines can discover the sitemap more easily.', 'system'),
  seo_sitemap: G('The sitemap could not be found', AUTO, 'Search engines receive the primary pages and modification dates.', 'system'),
  seo_sitemap_invalid: G('The sitemap is not valid', AUTO, 'Search engines can read the URL list as a sitemap.', 'system'),
  seo_speed_slow: G('The first server response is slow', 'Review large images, video, and server processing time.', 'People and crawlers wait less for the page.', 'editor:images'),
  seo_speed_very_slow: G('The first server response is very slow', 'Address server bottlenecks and above-the-fold assets first.', 'This lowers timeout and abandonment risk.', 'editor:images'),
  seo_favicon: G('The favicon is missing', 'Add a recognizable brand mark as the favicon.', 'The site is easier to identify in tabs and search surfaces.', 'editor:images'),
  // ---------- AEO (AI 답변 엔진 최적화) ----------
  aeo_jsonld_missing: G('Structured data is missing', AUTO, 'Search and answer systems need to infer fewer entity and page relationships.', 'system'),
  aeo_jsonld_invalid: G('The structured data is invalid', AUTO, 'Search engines can parse the full JSON-LD block.', 'system'),
  aeo_jsonld_type: G('The structured data lacks a specific type', AUTO, 'The roles of the business, person, page, and offering are explicit.', 'system'),
  aeo_entity_identity: G('The entity identity is incomplete', 'Confirm the official name and URL.', 'The brand, business, and people can be connected to one entity.', 'editor:business-info'),
  aeo_jsonld_visibility: G('Structured data and visible content do not match', 'Use the same name, phone, and address on the page and in JSON-LD.', 'People and search engines see the same business details.', 'editor:business-info'),
  aeo_local_business_details: G(
    'Add an address and phone number to complete this item',
    'Enter the real address and phone number confirmed by the business.',
    'Search engines can cross-check the local business details.',
    'editor:business-info',
    'input-to-perfect',
  ),
  aeo_heading_order: G('The heading order is inconsistent', 'Organize broad topics before narrower topics under one primary heading.', 'Question and answer boundaries become easier to parse.', 'editor:content'),
  aeo_question_headings: G('FAQ questions do not have clear boundaries', 'Use each question as a subheading and place its answer immediately below.', 'Answer systems can separate each question accurately.', 'editor:content'),
  aeo_main_landmark: G('The main content landmark is missing', AUTO, 'Search agents and screen readers can locate the body content.', 'system'),
  aeo_semantic_structure: G('The document structure is weak', 'Give each section a heading and an appropriate semantic element.', 'Repeated navigation stays separate from primary content.', 'editor:content'),
  aeo_lists_tables: G('List-like information appears only as prose', 'Mark prices, services, steps, and comparisons as lists or tables.', 'Systems can extract items and order without dropping details.', 'editor:content'),
  aeo_accessible_controls: G('Some controls have no accessible name', AUTO, 'People and ARIA-based agents can understand each control.', 'system'),
  aeo_breadcrumb: G('The subpage has no location trail', AUTO, 'People and search engines can understand the page hierarchy.', 'system'),
  // ---------- GEO (생성형 AI 인용 최적화) ----------
  geo_oai_search_blocked: G('OAI-SearchBot cannot crawl this page', 'Allow OAI-SearchBot to access public pages in robots.txt.', 'ChatGPT Search can consider the page for retrieval and citation.', 'system'),
  geo_perplexity_blocked: G('PerplexityBot cannot crawl this page', 'Allow PerplexityBot to access public pages in robots.txt.', 'Perplexity can consider the page for retrieval and citation.', 'system'),
  geo_snippet_restricted: G('Search summaries and excerpts are restricted', 'Review nosnippet, max-snippet:0, and noindex on public pages.', 'Search and answer systems can use the body within the allowed limits.', 'system'),
  geo_naver_sourceinfo_disabled: G('Naver source attribution is disabled', 'Remove nosourceinfo if source attribution is intended.', 'Naver can identify the page as a source where allowed.', 'system'),
  geo_no_text: G('There is almost no body text to read', 'Provide services, procedures, and practical details as real text.', 'Search and answer systems have material to summarize and verify.', 'editor:content'),
  geo_low_text_ratio: G('The main explanation is buried in markup', 'Add specific explanations to the first screen and primary sections.', 'The central information and evidence become easier to find.', 'editor:content'),
  geo_business_info: G(
    'Add an address and phone number to complete this item',
    'Use the same real phone number and street address throughout the page.',
    'Local questions have verifiable source material.',
    'editor:business-info',
    'input-to-perfect',
  ),
  geo_dates: G(
    'Add published and modified dates to complete this item',
    'Enter the actual published and modified dates for the article or guide.',
    'People and answer systems can assess freshness.',
    'editor:content',
    'input-to-perfect',
  ),
  geo_lang: G('The document language is missing', AUTO, 'Search and answer systems can identify the language and locale.', 'system'),
  geo_korean_lang_mismatch: G('The body and language declaration do not match', AUTO, 'Language signals remain consistent for search, speech, and answers.', 'system'),
  geo_author: G(
    'Add an author to complete this item',
    'Enter the real author and relevant experience. Do not imply a review that did not happen.',
    'Readers can identify the source and responsible party.',
    'editor:content',
    'input-to-perfect',
  ),
  geo_channel_identity: G('Official channels are not linked to the entity', AUTO, 'Official profiles can be interpreted as belonging to the same entity.', 'system'),
  geo_unsourced_claims: G('Numbers or research claims lack a source', 'Add the original link, publisher, and reference date.', 'People and answer systems can verify and cite the claim accurately.', 'editor:content'),
  geo_topic_alignment: G('The page title and primary heading describe different topics', 'Make title and H1 describe the same central topic.', 'The primary question and answer remain consistent.', 'editor:meta'),
  geo_empty_page: G('The page is effectively empty', 'Add unique explanations, items, or evidence before publishing the page.', 'Published pages retain a clear topic and useful content.', 'editor:content'),
  // ---------- 별도 개선 필요 신호(decay advisory) ----------
  decay_footer_year_stale: G('Review the footer year', 'If the site is active, update it to the current year.', 'Visitors can see that the site is still maintained.', 'editor:content'),
  decay_last_modified_stale: G('Review the modification date', 'Check both the real content history and the Last-Modified header.', 'A server setting stays separate from evidence of stale content.', 'system'),
  decay_legacy_builder_fingerprint: G('Review traces of an old site builder', 'Confirm whether the flagged file is still needed and move to a supported version.', 'This reduces maintenance risk from obsolete code.', 'system'),
  decay_social_link_dead: G('An official channel link is broken', 'Replace a confirmed 404 or 410 with the current official URL.', 'Visitors do not leave through a dead link.', 'editor:business-info'),
};

/** guidance 조회 — 미매핑 코드는 undefined(테스트가 누락 0을 강제하므로 실사용엔 항상 존재) */
export function guidanceFor(code: string): ScanGuidance | undefined {
  return SCAN_GUIDANCE[code];
}

/** 전 scan 규칙 코드 목록 (guidance 완전성 테스트·전수 검증용) */
export function allScanCodes(): string[] {
  return ALL_SCAN_RULES.map((rule) => rule.code);
}
