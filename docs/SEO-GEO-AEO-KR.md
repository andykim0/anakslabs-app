# SEO · GEO · AEO optimization model for South Korea

Last reviewed: 2026-07-21

This document is the research basis for the deterministic optimization engine in
`web/src/lib/scan/` and the tenant publishing layer in `web/src/lib/seo/`.
Passing these checks improves technical eligibility and interpretability. It
does not guarantee ranking, rich-result display, indexing, or AI citation.

## 1. The model

Modern search and answer visibility is a pipeline, not a single score:

1. **Retrieval eligibility** — the URL returns useful HTML, is not blocked by
   robots/noindex, and permits the relevant search crawler.
2. **Canonical discovery** — internal links, canonical URLs, sitemaps, and
   change notifications expose stable URLs.
3. **Entity interpretation** — the page clearly identifies the business,
   person, location, service, and official channels in visible text and
   connected structured data.
4. **Answer extraction** — headings, landmarks, lists, tables, and question
   boundaries match the actual content type. An FAQ is useful only when the
   page genuinely contains FAQs.
5. **Evidence and trust** — original experience, accountable authorship where
   appropriate, source links for claims, dates for time-sensitive editorial
   content, and consistent business facts make an answer verifiable.
6. **Freshness and feedback** — IndexNow and webmaster tools accelerate
   discovery; search-console and referral data reveal what was actually
   indexed, clicked, or cited.

The engine therefore avoids universal bonuses for `llms.txt`, FAQ markup,
article dates, or arbitrary content length. Those shortcuts do not represent
how the major platforms document their systems.

## 2. Platform findings

### Google Search and Google AI features

- Google states that the same technical and content SEO foundations apply to AI
  Overviews and AI Mode; no special AI schema or machine-readable file is
  required. [Google AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
- Google's AI optimization guide, updated 2026-07-10, says Google does not use
  `llms.txt` and discourages special AI-only rewrites or artificial chunking.
  Distinctive first-hand value remains the durable strategy.
  [Google AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- `nosnippet`, `max-snippet:0`, and `noindex` can restrict use in search
  snippets and Google AI experiences.
  [Google robots meta documentation](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
- Structured data must describe visible, accurate content. Specific types,
  complete properties, and connected nodes help interpretation but do not
  guarantee display.
  [Google structured-data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
- Google limits FAQ rich results mainly to authoritative government and health
  sites, so ordinary commercial sites should not be scored as defective merely
  for lacking FAQ markup.
  [Google FAQ rich-result change](https://developers.google.com/search/blog/2023/08/howto-faq-changes)
- Helpful content guidance emphasizes original information, clear sourcing,
  first-hand expertise, and explaining who created content, how it was made,
  and why it exists.
  [Google helpful-content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)

### Naver

- Naver's crawler is `Yeti`. Crawlable server-rendered content, a clear title,
  one representative H1, descriptions, image alt text, and absolute canonical
  URLs are core signals.
  [Naver SEO help](https://searchadvisor.naver.com/guide/seo-help),
  [Naver markup structure](https://searchadvisor.naver.com/guide/markup-structure)
- Naver warns against fragment-based page URLs and JavaScript-only links.
  Distinct pages should have real paths and crawlable `<a href>` links.
  [Naver URL guidance](https://searchadvisor.naver.com/guide/seo-advanced-url),
  [Naver JavaScript SEO](https://searchadvisor.naver.com/guide/seo-advanced-javascript)
- Naver recommends robots policy plus sitemap/RSS discovery. The engine validates
  actual response content instead of treating any HTTP 200 page as a valid
  robots or sitemap file.
  [Naver robots guidance](https://searchadvisor.naver.com/guide/seo-basic-robots),
  [Naver feed guidance](https://searchadvisor.naver.com/guide/request-feed)
- `nosourceinfo` opts a page out of Naver's AI source-description use, so it is
  diagnosed separately from standard snippet and indexing directives.
  [Naver markup structure](https://searchadvisor.naver.com/guide/markup-structure)
- Naver supports `Person`/`Organization` `sameAs` relationships for official
  Naver and social channels. The generated entity graph now connects visible
  Naver Blog, Smart Store, Kakao, Instagram, YouTube, and other supported
  channels.
  [Naver related-channel markup](https://searchadvisor.naver.com/guide/structured-data-channel)
- Naver announced that FAQ structured-data display ended on 2026-07-08. FAQ is
  therefore treated as a content structure, not a blanket visibility bonus.
  [Naver Search Advisor announcement](https://searchadvisor.naver.com/)
- Naver supports IndexNow and shares submitted updates with participating
  search engines, while explicitly noting that submission does not guarantee
  indexing.
  [Naver IndexNow introduction](https://searchadvisor.naver.com/guide/indexnow-about)
- Naver's content guidance favors focused, readable, updated content grounded in
  direct experience and clearly identified sources. AI-assisted content still
  needs an operator's point of view and quality control.
  [Naver content guidance](https://searchadvisor.naver.com/guide/content-basic)

### Daum and Kakao

- Daum documents the robots token as `User-agent: Daum` and respects
  `noindex`, `none`, and `nosnippet`. The engine now evaluates this crawler
  independently instead of assuming the wildcard group is enough.
  [Daum web-search robots help](https://cs.daum.net/faq/service/15/category/4118/detail/28966),
  [Daum crawl troubleshooting](https://cs.daum.net/m/faq/faqlist/36378)
- Daum still provides a manual site-search registration surface. This requires
  owner action and is not silently automated by the product.
  [Daum search registration](https://register.search.daum.net/)
- Local entities should also keep Kakao Map place facts consistent with the
  website. Kakao's Local API can be used for place-search verification where an
  operator supplies credentials and authorizes that integration.
  [Kakao Local API](https://developers.kakao.com/docs/en/local/dev-guide)

### Bing and Copilot

- Bing's webmaster guidance ties standard crawlability, quality, and
  structured-data practices to Bing search and Copilot grounding/citations.
  [Bing Webmaster Guidelines](https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a)
- Bing strongly recommends IndexNow for changed URLs. Naver's IndexNow endpoint
  participates in the shared protocol.
  [Bing IndexNow guidance](https://www.bing.com/webmasters/help/indexnow-0z209wby)

### ChatGPT and Perplexity

- OpenAI separates `OAI-SearchBot`, used for ChatGPT search visibility, from
  `GPTBot`, used for model training. Allowing search does not require opting
  into training. OpenAI's browsing agent also depends on accessible controls
  and ARIA semantics.
  [OpenAI publisher FAQ](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq)
- Perplexity identifies `PerplexityBot` as its search crawler and documents IP
  ranges for WAF allowlisting.
  [Perplexity crawler documentation](https://docs.perplexity.ai/docs/resources/perplexity-crawlers)

## 3. GEO research interpretation

The foundational GEO paper reports that citations, quotations, and statistics
can improve source visibility in its benchmark, with effects varying by
domain. These are useful content-design hypotheses, not universal ranking
factors. The engine consequently checks whether numerical or research claims
have a verifiable source, but it does not reward cosmetic keyword stuffing or
fabricated quotations. [GEO paper](https://arxiv.org/abs/2311.09735)

Recent measurement research also finds that cited or absorbed pages often
contain definitions, quantitative facts, comparisons, and procedural steps.
This supports conditional structure checks for pages that naturally contain
prices, procedures, or comparisons, rather than forcing every page into the
same template. [Generative search measurement study](https://arxiv.org/abs/2604.25707)

## 4. Engine implementation

### Scanner

- Parses and evaluates robots groups using longest-match precedence, including
  `Yeti`, `Daum`, `Googlebot`, `bingbot`, `OAI-SearchBot`, and
  `PerplexityBot`.
- Validates HTTP status, content type, `X-Robots-Tag`, noindex/snippet policy,
  absolute canonical URLs, UTF-8 Korean documents, real robots content, and
  real XML sitemap content.
- Detects Naver-specific `nosourceinfo`, fragment navigation, Korean language
  mismatch, official-channel entity linkage, and local phone/address
  completeness.
- Parses JSON-LD arrays and `@graph`, reports malformed blocks, checks entity
  identity and visible/schema consistency, and conditionally validates local
  business detail.
- Applies date/author checks only to genuinely editorial pages; FAQ and
  list/table checks only to matching content.
- Flags unsupported numerical/research claims without citations and title/H1
  topic divergence.
- Does not score `llms.txt`. The optional tenant route remains only for tools
  that voluntarily consume the emerging format.

#### 2026-07-21 score-calibration and robots error hardening

- Raw rule weights are normalized against a fixed 100-point budget per pillar
  (SEO 261, AEO 107, GEO 148), then use a deterministic square-root deduction
  curve. This keeps the first material defect visible while preventing a long
  list of correlated heuristics from collapsing many different sites to zero.
  The curve is a product calibration model, not a platform ranking formula.
- One root cause is charged once. The currently audited cross-rule groups are:
  one robots policy across Googlebot/Yeti/Daum/bingbot/OAI-SearchBot/
  PerplexityBot; `noindex` across SEO indexing and GEO snippet eligibility;
  missing H1 across SEO and AEO heading order; and sparse server HTML across
  GEO low-content and empty-page rules. Secondary crawler/pillar states remain
  visible as zero-deduction details.
- A `429` or `5xx` robots response is retried once after 120 ms. A repeated
  transient failure becomes one reduced “temporarily unavailable” diagnostic,
  never six explicit crawler-block findings. Google documents that `429` is
  excluded from ordinary `4xx` handling and that `5xx` robots failures trigger
  retry/cache behavior rather than proving an authored `Disallow` policy.
  [Google robots.txt status handling, reviewed 2026-07-21](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec#handling-of-errors-and-http-status-codes)

#### 2026-07-21 false-positive and response-time hardening

- Document-title multiplicity is scoped to direct `head > title` children.
  SVG's child `<title>` is an accessible name for the graphic, not a second
  document title, so it must not trigger the SEO rule.
- Sitemap probing follows up to the first three absolute `Sitemap:` locations
  declared by robots.txt and uses `/sitemap.xml` only when no location is
  declared. Google documents `Sitemap:` as a supported robots field and
  requires an absolute URL; following the declared location avoids rejecting a
  valid custom sitemap because the conventional path is absent.
  [Google robots.txt fields, reviewed 2026-07-21](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec#sitemap)
  [Google sitemap discovery, reviewed 2026-07-21](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- Numerical/research-claim citations are now local evidence: a citation or
  absolute source link must be in the claim block or its nearest semantic
  `section`/`article`. An unrelated footer link no longer clears the finding.
  This remains a deterministic product heuristic rather than a platform
  ranking claim, grounded in the GEO evidence interpretation in section 3.
- A structured entity name may be corroborated by visible text, a logo
  `img[alt]`, an `aria-label`, or `og:site_name`. Phone and address still have
  to appear in readable page text, preserving Google's requirement that
  structured data represent page content rather than hidden facts.
  [Google structured-data policies, reviewed 2026-07-21](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
- TTFB is measured twice and the faster valid response-header sample is used.
  Scanner URL/DNS safety-validation time is outside the stopwatch, while every
  redirect hop is still revalidated against SSRF. Slow/very-slow deductions
  were reduced from 4/8 to 2/3 because this is a lab observation from the
  Daboim scanner region, not a field metric from the visitor's location.
  web.dev describes TTFB as including connection and server latency, notes that
  values vary by architecture and measurement context, and treats its numeric
  thresholds as rough guidance rather than a Core Web Vital.
  [web.dev TTFB guide, reviewed 2026-07-21](https://web.dev/articles/ttfb)

#### 2026-07-21 server-HTML diagnostic limitation

- The scanner does not execute page JavaScript. Every result now discloses that
  it evaluates the HTML initially returned by the server. This aligns with
  Naver's recommendation to expose important content in server-rendered HTML;
  Naver can render JavaScript, but resource collection and rendering may be
  delayed, so the disclosure does not claim that Naver never executes scripts.
  [Naver JavaScript SEO, reviewed 2026-07-21](https://searchadvisor.naver.com/guide/seo-advanced-javascript)
- Google crawls, queues eligible pages for rendering, and then uses the rendered
  HTML for indexing. App-shell sites can therefore expose more content to
  Google than this scanner observes. Google likewise recommends server-side or
  pre-rendering because not every bot executes JavaScript.
  [Google JavaScript SEO basics, reviewed 2026-07-21](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- A top warning is raised only when two deterministic signals coincide: fewer
  than 160 non-space server-text characters and an app-sized JavaScript signal
  (at least 50 KB inline script, three external bundles, or a hashed main/app/
  bundle/index asset). The warning is advisory and never changes the score.

### Generated tenant sites

- Emit page-specific `WebPage` and `BreadcrumbList` nodes connected by stable
  `@id` references to one `WebSite` and one operator identity.
- Include Korean local-business subtypes where the server-owned industry
  classification supports them, plus visible business facts, tax ID,
  contact point, region, and official-channel `sameAs`.
- Emit FAQ structured data only on the page containing the visible FAQ.
- Use website Open Graph metadata for ordinary pages, Korean locale metadata,
  full preview permissions, canonical URLs, SSR-readable semantic HTML, and
  indexable-only sitemaps.
- Publish explicit crawler policy for Korean/global search and AI-search bots.
- Derive a separate IndexNow verification key per tenant domain from one
  server secret and notify Naver asynchronously only after a successful,
  audited publish.

## 5. Required operational work outside the engine

The following tasks require domain-owner accounts, credentials, or human
verification and should not be represented as automatic:

1. Verify each production domain in Naver Search Advisor, Google Search
   Console, and Bing Webmaster Tools; submit the sitemap and monitor exclusions.
2. Register or claim the business in Naver SmartPlace and Kakao Map, then keep
   name, address, phone, opening hours, category, and closure status consistent.
3. Submit sites to Daum's registration flow where relevant.
4. Add real authors/reviewers, source links, publication dates, and first-hand
   evidence to editorial content.
5. Monitor branded/unbranded Korean queries, search-console landing pages,
   crawl logs, AI referral traffic, and a fixed set of answer-engine prompts.
6. Review generated claims and structured data whenever the underlying
   business facts change.

## 6. Next high-value extensions

- Add opening-hours, geo coordinates, price range, and Kakao/Naver place IDs to
  the business-information contract before emitting restaurant-specific rich
  properties.
- Integrate Search Advisor/Search Console/Bing APIs after explicit domain-owner
  authorization, storing index coverage and query evidence separately from the
  deterministic technical score.
- Add Korean morphological topic/entity comparison and cross-page duplication
  analysis for full-site crawls.
- Add server-log crawler verification and WAF diagnostics for Yeti,
  OAI-SearchBot, and PerplexityBot.
- Build outcome measurement around indexed URLs, impressions, clicks, branded
  entity consistency, and observed citations—not around a promised “100 score.”
