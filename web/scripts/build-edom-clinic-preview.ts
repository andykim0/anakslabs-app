import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'node-html-parser';
import { siteConfigSchema } from '@/app/api/_lib/schemas';
import {
  buildTenantLlmsText,
  buildTenantSitemapXml,
} from '@/lib/content-fulfillment/public-projection';
import {
  CRAWL_ARTIFACT_SCHEMA_VERSION,
  type CrawlArtifactPayload,
  type CrawlPageArtifact,
} from '@/lib/crawl/contracts';
import { DECAY_SCORE_DISCLOSURE } from '@/lib/scan/decay-contract';
import { buildJsonLd } from '@/lib/seo/jsonld';
import type { Site } from '@/lib/types/domain';
import {
  compileKoClinicSite,
  edomClinicImageManifest,
  extractIndependentOriginalText,
  extractKoClinicPage,
} from '@/lib/ko-clinic';

const CRAWL_REPORT = process.env.EDOM_CRAWL_REPORT
  ?? '/private/tmp/edom-fixed-crawl/crawl-report.json';
const OUTPUT_DIR = process.env.EDOM_BUILD_OUTPUT
  ?? '/private/tmp/ko-clinic-p1';
const EXPECTED_PUBLIC_PAGE_COUNT = 284;
const EXPECTED_PRAISE_HOLD_COUNT = 33;
const EXPECTED_EXCLUDED_PRIVATE_COUNT = 79;
const STRUCTURAL_PAGE_COUNT = 1;

interface CrawlAttempt {
  url: string;
  ok: boolean;
  status?: number;
  contentType?: string;
  rawPath: string;
  finalUrl?: string;
  error?: string;
}

interface CrawlReport {
  expectedPath: string;
  expectedManifestSha256: string;
  expectedCount: number;
  attemptedCount: number;
  successCount: number;
  failureCount: number;
  generatedAt: string;
  attempts: CrawlAttempt[];
  tls: CrawlArtifactPayload['tls'];
  robots: CrawlArtifactPayload['robots'];
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalSourceUrl(raw: string): string {
  const url = new URL(raw);
  url.protocol = 'https:';
  url.hostname = 'edomclinic.com';
  url.port = '';
  url.hash = '';
  const query = [...url.searchParams.entries()].sort(([ak, av], [bk, bv]) => (
    ak.localeCompare(bk) || av.localeCompare(bv)
  ));
  url.search = '';
  query.forEach(([key, value]) => url.searchParams.append(key, value));
  if (url.pathname === '/main.php') url.pathname = '/';
  return url.toString();
}

function publicExpectedUrls(text: string): string[] {
  return text
    .split(/\r?\n/gu)
    .map((line) => line.trim())
    .filter((line) => /^https:\/\/edomclinic\.com\//u.test(line));
}

function excludedPrivateUrls(text: string): string[] {
  return text
    .split(/\r?\n/gu)
    .map((line) => line.match(/^# EXCLUDED_URL (https:\/\/edomclinic\.com\/\S+)$/u)?.[1])
    .filter((value): value is string => Boolean(value));
}

function pageArtifact(input: {
  page: ReturnType<typeof extractKoClinicPage>;
  attempt: CrawlAttempt;
  observedAt: string;
}): CrawlPageArtifact {
  const text = input.page.blocks.map((block) => block.text).join('\n\n');
  return {
    url: input.page.sourceUrl,
    status: input.attempt.status ?? 200,
    contentType: input.attempt.contentType ?? 'text/html; charset=utf-8',
    title: input.page.title.text,
    ...(input.page.description ? { description: input.page.description } : {}),
    headings: [
      input.page.title.text,
      ...input.page.blocks
        .filter((block) => block.kind === 'heading')
        .map((block) => block.text),
    ],
    text,
    structured: {
      ...(input.page.businessName ? { businessName: input.page.businessName.text } : {}),
      ...(input.page.description ? { description: input.page.description } : {}),
      commercialPhrases: [],
      contentItems: [],
    },
    images: input.page.images
      .filter((image) => image.classification === 'content')
      .map((image) => ({
        url: image.sourceUrl,
        alt: image.alt,
        role: 'figure' as const,
      })),
    connectors: [],
    decay: {
      score: 100,
      signals: [],
      observedAt: input.observedAt,
      disclosure: DECAY_SCORE_DISCLOSURE,
    },
  };
}

interface IndependentOriginalImage {
  sourceUrl: string;
  classification: 'content' | 'ui-chrome';
  exclusionReason?: string;
}

const ORIGINAL_UI_IMAGE_PATH =
  /(?:\/n_images\/common\/|\/img\/common\/|\/cheditor5\/icons\/|banner_(?:call|reservation)|(?:^|[/_.-])(?:arrow|blank|btn|button|favicon|icon|loading|logo|pg_(?:first|last|next|prev)|popup|scroll|sns|spacer|sprite|tracking)(?:[/_.-]|$))/iu;

function originalImageReferences(
  html: string,
  sourceUrl: string,
): IndependentOriginalImage[] {
  const root = parse(html);
  return root.querySelectorAll('img').flatMap((image) => {
    const raw = image.getAttribute('src') ?? image.getAttribute('data-src');
    if (!raw) return [];
    try {
      const absolute = new URL(raw, sourceUrl);
      if (!['http:', 'https:'].includes(absolute.protocol)) return [];
      absolute.protocol = 'https:';
      absolute.hostname = 'edomclinic.com';
      absolute.port = '';
      absolute.hash = '';
      const inChrome = Boolean(image.closest('header,footer,nav,.paging,.pagination,.scroll'));
      const exclusionReason = ORIGINAL_UI_IMAGE_PATH.test(absolute.pathname)
        ? 'ui-chrome-path'
        : inChrome
          ? 'ui-chrome-container'
          : undefined;
      return [{
        sourceUrl: absolute.toString(),
        classification: exclusionReason ? 'ui-chrome' as const : 'content' as const,
        ...(exclusionReason ? { exclusionReason } : {}),
      }];
    } catch {
      return [];
    }
  });
}

function pageSchemaTypes(config: ReturnType<typeof siteConfigSchema.parse>) {
  return Object.fromEntries(config.pages.map((page) => {
    const nodes = buildJsonLd(config, 'https://edomclinic.example', page.slug);
    const pageNode = nodes.find((node) => {
      const type = node['@type'];
      return type === 'WebPage'
        || (Array.isArray(type) && type.includes('WebPage'));
    });
    return [page.slug, pageNode?.['@type'] ?? null];
  }));
}

function normalizedAuditText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function relativeLuminance(value: string): number {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/iu.exec(value);
  if (!match) return 0;
  const channel = (hex: string) => {
    const normalized = Number.parseInt(hex, 16) / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(match[1])
    + 0.7152 * channel(match[2])
    + 0.0722 * channel(match[3])
  );
}

function contrastRatio(left: number, right: number): number {
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

function compiledPageText(
  page: ReturnType<typeof siteConfigSchema.parse>['pages'][number],
): string {
  return normalizedAuditText([
    page.title,
    page.navLabel,
    page.description,
    ...page.sections.flatMap((section) => [
      section.name,
      ...section.elements.flatMap((element) => {
        if (element.kind === 'text') return [element.text];
        if (element.kind === 'button') return [element.label];
        if (element.kind === 'image') return [element.alt];
        return [];
      }),
    ]),
  ].filter((value): value is string => Boolean(value)).join('\n'));
}

async function main() {
  const report = JSON.parse(await readFile(CRAWL_REPORT, 'utf8')) as CrawlReport;
  const expectedText = await readFile(report.expectedPath, 'utf8');
  const expectedUrls = publicExpectedUrls(expectedText);
  const excludedPrivate = excludedPrivateUrls(expectedText);
  if (sha256(expectedText) !== report.expectedManifestSha256) {
    throw new Error('EDOM_EXPECTED_MANIFEST_SHA_MISMATCH');
  }
  if (
    expectedUrls.length !== EXPECTED_PUBLIC_PAGE_COUNT
    || new Set(expectedUrls.map(canonicalSourceUrl)).size !== EXPECTED_PUBLIC_PAGE_COUNT
  ) {
    throw new Error(`EDOM_EXPECTED_PUBLIC_SET_INVALID:${expectedUrls.length}`);
  }
  if (excludedPrivate.length !== EXPECTED_EXCLUDED_PRIVATE_COUNT) {
    throw new Error(`EDOM_EXPECTED_PRIVATE_EXCLUSIONS_INVALID:${excludedPrivate.length}`);
  }
  if (
    report.expectedCount !== EXPECTED_PUBLIC_PAGE_COUNT
    || report.attemptedCount !== EXPECTED_PUBLIC_PAGE_COUNT
    || report.successCount !== EXPECTED_PUBLIC_PAGE_COUNT
    || report.failureCount !== 0
  ) {
    throw new Error('EDOM_FIXED_CRAWL_INCOMPLETE');
  }
  const successes = report.attempts.filter((attempt) => attempt.ok);
  const extractedWithRaw = await Promise.all(successes.map(async (attempt) => {
    const html = await readFile(attempt.rawPath, 'utf8');
    return {
      attempt,
      html,
      page: extractKoClinicPage({ html, sourceUrl: attempt.url }),
      independentOriginal: extractIndependentOriginalText({
        html,
        sourceUrl: attempt.url,
      }),
    };
  }));
  const imageManifest = edomClinicImageManifest();
  if (
    imageManifest.expectedManifestSha256 !== report.expectedManifestSha256
    || imageManifest.assets.length === 0
  ) {
    throw new Error('EDOM_IMAGE_MANIFEST_NOT_READY');
  }
  const unavailableImageUrls = new Set(imageManifest.unavailable.map((image) => (
    canonicalSourceUrl(image.sourceUrl)
  )));
  const compilablePages = extractedWithRaw.map((entry) => ({
    ...entry.page,
    images: entry.page.images.filter((image) => (
      !unavailableImageUrls.has(canonicalSourceUrl(image.sourceUrl))
    )),
  }));
  const first = compileKoClinicSite({
    pages: compilablePages,
    images: imageManifest.assets,
  });
  const second = compileKoClinicSite({
    pages: compilablePages,
    images: imageManifest.assets,
  });
  if (JSON.stringify(first) !== JSON.stringify(second)) {
    throw new Error('EDOM_COMPILATION_NON_DETERMINISTIC');
  }
  const config = siteConfigSchema.parse(first.config);
  const sourceBackedCompiledUrls = new Set(Object.values(first.sourceUrlBySlug).map(
    canonicalSourceUrl,
  ));
  const heldUrls = new Set(first.publicationHolds.map((hold) => (
    canonicalSourceUrl(hold.sourceUrl)
  )));
  if (
    first.publicationHolds.length !== EXPECTED_PRAISE_HOLD_COUNT
    || heldUrls.size !== EXPECTED_PRAISE_HOLD_COUNT
  ) {
    throw new Error(`EDOM_PRAISE_HOLD_SET_INVALID:${first.publicationHolds.length}`);
  }
  const expectedPublished = new Set(expectedUrls
    .map(canonicalSourceUrl)
    .filter((url) => !heldUrls.has(url)));
  if (
    sourceBackedCompiledUrls.size !== expectedPublished.size
    || [...expectedPublished].some((url) => !sourceBackedCompiledUrls.has(url))
  ) {
    throw new Error('EDOM_COMPILED_SOURCE_SET_MISMATCH');
  }
  if (config.pages.length !== expectedPublished.size + STRUCTURAL_PAGE_COUNT) {
    throw new Error(`EDOM_COMPILED_PAGE_COUNT_INVALID:${config.pages.length}`);
  }
  const compiledPageBySourceUrl = new Map(
    Object.entries(first.sourceUrlBySlug).map(([slug, sourceUrl]) => [
      canonicalSourceUrl(sourceUrl),
      config.pages.find((page) => page.slug === slug),
    ]),
  );
  const perPageTextCompleteness = extractedWithRaw
    .filter(({ attempt }) => !heldUrls.has(canonicalSourceUrl(attempt.url)))
    .map(({ attempt, independentOriginal }) => {
      const compiledPage = compiledPageBySourceUrl.get(canonicalSourceUrl(attempt.url));
      const rendered = compiledPage ? compiledPageText(compiledPage) : '';
      const missing = independentOriginal.included.filter((text) => (
        !rendered.includes(normalizedAuditText(text))
      ));
      return {
        sourceUrl: attempt.url,
        slug: compiledPage?.slug ?? null,
        originalBlocks: independentOriginal.included.length,
        missing,
        missingDetails: independentOriginal.includedEvidence.filter((entry) => (
          missing.includes(entry.text)
        )),
      };
    });
  const perPageFailures = perPageTextCompleteness.filter((entry) => entry.missing.length > 0);
  const globalCompiledText = normalizedAuditText(
    config.pages.map(compiledPageText).join('\n'),
  );
  const globalMissing = extractedWithRaw
    .filter(({ attempt }) => !heldUrls.has(canonicalSourceUrl(attempt.url)))
    .flatMap(({ independentOriginal }) => independentOriginal.included)
    .filter((text) => !globalCompiledText.includes(normalizedAuditText(text)));
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(
    path.join(OUTPUT_DIR, 'source-completeness.json'),
    `${JSON.stringify({
      version: 2,
      generatedAt: new Date().toISOString(),
      independentPath: 'src/lib/ko-clinic/original-text-audit.ts',
      publishedPages: perPageTextCompleteness.length,
      passedPages: perPageTextCompleteness.length - perPageFailures.length,
      failures: perPageFailures,
      globalAuxiliary: {
        missingCount: globalMissing.length,
        missing: globalMissing,
      },
    }, null, 2)}\n`,
  );
  await writeFile(
    path.join(OUTPUT_DIR, 'render-integrity.json'),
    `${JSON.stringify({
      version: 1,
      generatedAt: new Date().toISOString(),
      axis: 'source-text-node-to-render-block',
      ...first.renderIntegrity,
    }, null, 2)}\n`,
  );
  if (perPageFailures.length > 0) {
    await writeFile(
      path.join(OUTPUT_DIR, 'candidate-site-config.blocked.json'),
      `${JSON.stringify(config, null, 2)}\n`,
    );
    throw new Error(`EDOM_PER_PAGE_TEXT_LOSS:${perPageFailures.length}`);
  }
  if (first.renderIntegrity.violations.length > 0) {
    await writeFile(
      path.join(OUTPUT_DIR, 'candidate-site-config.blocked.json'),
      `${JSON.stringify(config, null, 2)}\n`,
    );
    throw new Error(
      `EDOM_RENDER_BLOCK_INTEGRITY:${first.renderIntegrity.violations.length}`,
    );
  }
  const duplicateSlugs = config.pages
    .map((page) => page.slug)
    .filter((slug, index, all) => all.indexOf(slug) !== index);
  const duplicateTitles = config.pages
    .map((page) => page.title)
    .filter((title, index, all) => all.indexOf(title) !== index);
  if (duplicateSlugs.length || duplicateTitles.length) {
    throw new Error(`EDOM_PAGE_IDENTITY_COLLISION:${duplicateSlugs}:${duplicateTitles}`);
  }
  const visibleNav = config.pages.filter((page) => page.showInNav);
  if (visibleNav.length !== 8) throw new Error(`EDOM_NAV_COUNT_INVALID:${visibleNav.length}`);
  const imageManifestUrls = new Set(imageManifest.assets.map((asset) => (
    canonicalSourceUrl(asset.sourceUrl)
  )));
  const sourceContentImages = new Set(extractedWithRaw.flatMap(({ page }) => (
    page.images
      .filter((image) => image.classification === 'content')
      .map((image) => canonicalSourceUrl(image.sourceUrl))
  )));
  const missingImages = [...sourceContentImages].filter((url) => (
    !imageManifestUrls.has(url) && !unavailableImageUrls.has(url)
  ));
  if (missingImages.length) throw new Error(`EDOM_IMAGE_PROVENANCE_MISSING:${missingImages.length}`);
  const originalImageAudit = extractedWithRaw.flatMap(({ html, attempt }) => (
    originalImageReferences(html, attempt.url)
  ));
  const originalImageUrls = new Set(originalImageAudit.map((image) => image.sourceUrl));
  const originalContentImageUrls = new Set(originalImageAudit
    .filter((image) => image.classification === 'content')
    .map((image) => image.sourceUrl));
  const sourceClassifiedImages = new Set(extractedWithRaw.flatMap(({ page }) => (
    page.images.map((image) => canonicalSourceUrl(image.sourceUrl))
  )));
  const unclassifiedOriginalImages = [...originalImageUrls].filter(
    (url) => !sourceClassifiedImages.has(url),
  );
  const unclassifiedOriginalContentImages = [...originalContentImageUrls].filter(
    (url) => !sourceClassifiedImages.has(url),
  );
  if (unclassifiedOriginalContentImages.length) {
    throw new Error(
      `EDOM_ORIGINAL_CONTENT_IMAGE_UNCLASSIFIED:${unclassifiedOriginalContentImages.length}`,
    );
  }
  const observedAt = report.generatedAt;
  const originalDocumentTitles = extractedWithRaw.map(({ html, attempt }) => ({
    sourceUrl: attempt.url,
    title: parse(html).querySelector('title')?.text.trim() ?? '',
  }));
  const originalTitleGroups = [...new Set(originalDocumentTitles.map((entry) => entry.title))]
    .map((title) => ({
      title,
      count: originalDocumentTitles.filter((entry) => entry.title === title).length,
      urls: originalDocumentTitles
        .filter((entry) => entry.title === title)
        .map((entry) => entry.sourceUrl),
    }))
    .filter((group) => group.count > 1 || !group.title)
    .sort((left, right) => right.count - left.count || left.title.localeCompare(right.title));
  const crawlArtifact: CrawlArtifactPayload = {
    schemaVersion: CRAWL_ARTIFACT_SCHEMA_VERSION,
    seedUrl: 'https://edomclinic.com/',
    finalOrigin: 'https://edomclinic.com',
    observedAt,
    tls: report.tls,
    robots: report.robots,
    pages: extractedWithRaw.map(({ page, attempt }) => pageArtifact({
      page,
      attempt,
      observedAt,
    })),
    skippedUrls: [],
    stoppedReason: 'queue_exhausted',
  };
  const site: Site = {
    id: 'ko-clinic-evidence',
    clientId: 'ko-clinic-evidence',
    name: config.meta.title,
    domain: 'edomclinic.example',
    domainType: 'custom',
    dnsVerified: false,
    cloudflareHostnameId: null,
    status: 'draft',
    siteConfig: config,
    draftConfig: config,
    publishedAt: null,
    createdAt: observedAt,
  };
  const sitemap = buildTenantSitemapXml({
    host: 'edomclinic.example',
    site,
    posts: [],
  });
  const llms = buildTenantLlmsText({
    host: 'edomclinic.example',
    site,
    posts: [],
  });
  const sitemapSlugs = [...sitemap.matchAll(
    /https:\/\/edomclinic\.example(?:\/([a-z0-9-]+))?</gu,
  )].map((match) => match[1] ?? '');
  const llmsSlugs = [...llms.matchAll(
    /https:\/\/edomclinic\.example(?:\/([a-z0-9-]+))?/gu,
  )].map((match) => match[1] ?? '');
  if (
    new Set(sitemapSlugs).size !== config.pages.length
    || config.pages.some((page) => !sitemapSlugs.includes(page.slug))
    || config.pages.some((page) => !llmsSlugs.includes(page.slug))
  ) {
    throw new Error('EDOM_PUBLIC_PROJECTION_SET_MISMATCH');
  }
  const compiledImagePlacements = config.pages.flatMap((page) => (
    page.sections.flatMap((section) => [
      ...(section.background.image ? [section.background.image.src] : []),
      ...section.elements.flatMap((element) => (
        element.kind === 'image' ? [element.src] : []
      )),
    ])
  ));
  const compiledImagePaths = new Set(compiledImagePlacements);
  const optimizedImagePaths = new Set(imageManifest.assets.map((asset) => asset.publicPath));
  const unplacedOptimizedImagePaths = [...optimizedImagePaths]
    .filter((publicPath) => !compiledImagePaths.has(publicPath))
    .sort();
  const imageAnalysisByPath = new Map(imageManifest.assets.map((asset) => [
    asset.publicPath,
    asset.analysis,
  ]));
  const heroContrast = config.pages.flatMap((page) => {
    const hero = page.sections.find((section) => section.type === 'hero');
    const image = hero?.background.image;
    if (!image) return [];
    const analysis = imageAnalysisByPath.get(image.src);
    if (!analysis) throw new Error(`EDOM_HERO_IMAGE_ANALYSIS_MISSING:${page.slug}`);
    const overlayOpacity = image.overlayOpacity ?? 0;
    const compositeLuminance = (
      overlayOpacity + (1 - overlayOpacity) * analysis.heroTextRegionLuminance
    );
    return [{
      slug: page.slug,
      image: image.src,
      textDense: analysis.textDense,
      rawLuminance: analysis.heroTextRegionLuminance,
      overlayOpacity,
      measuredCompositeContrast: contrastRatio(
        compositeLuminance,
        relativeLuminance(config.theme.palette.text),
      ),
    }];
  });
  const textDenseHeroViolations = heroContrast.filter((entry) => entry.textDense);
  const heroContrastViolations = heroContrast.filter(
    (entry) => entry.measuredCompositeContrast < 4.5,
  );
  const articleHeroBackgrounds = Object.entries(first.sourceUrlBySlug)
    .filter(([, sourceUrl]) => new URL(sourceUrl).pathname.endsWith('/bbs/board.php'))
    .flatMap(([slug]) => {
      const page = config.pages.find((candidate) => candidate.slug === slug);
      return page?.sections[0]?.background.image ? [slug] : [];
    });
  if (
    textDenseHeroViolations.length > 0
    || heroContrastViolations.length > 0
    || articleHeroBackgrounds.length > 0
  ) {
    throw new Error(
      `EDOM_HERO_READABILITY_INVALID:${textDenseHeroViolations.length}:`
      + `${heroContrastViolations.length}:${articleHeroBackgrounds.length}`,
    );
  }
  const proseStructure = config.pages.flatMap((page) => (
    page.sections.flatMap((section) => {
      if (section.sectionLayout?.resolvedId !== 'features.prose-article') return [];
      const textById = new Map(section.elements.flatMap((element) => (
        element.kind === 'text' ? [[element.id, element.text] as const] : []
      )));
      const items = section.sectionLayout.items.map((item) => {
        const text = item.elementIds.flatMap((id) => (
          textById.has(id) ? [{ id, text: textById.get(id)! }] : []
        ));
        const first = text[0];
        const copyOnly = first?.id.includes('-ko-copy-only-') ?? false;
        return {
          id: item.id,
          heading: copyOnly ? '' : first?.text ?? '',
          body: [
            ...(copyOnly && first ? [first.text] : []),
            ...text.slice(1).map((entry) => entry.text),
          ].join(' '),
        };
      });
      let activeHeadingOnlyRun = 0;
      let maximumHeadingOnlyRun = 0;
      for (const item of items) {
        if (
          normalizedAuditText(item.heading).length > 0
          && normalizedAuditText(item.body).length === 0
        ) {
          activeHeadingOnlyRun += 1;
          maximumHeadingOnlyRun = Math.max(
            maximumHeadingOnlyRun,
            activeHeadingOnlyRun,
          );
        } else {
          activeHeadingOnlyRun = 0;
        }
      }
      return [{
        slug: page.slug,
        sectionId: section.id,
        shortHeadings: items
          .filter((item) => {
            const heading = normalizedAuditText(item.heading);
            return heading.length > 0 && [...heading].length < 3;
          })
          .map((item) => ({ itemId: item.id, text: item.heading })),
        headingCount: items.filter((item) => normalizedAuditText(item.heading)).length,
        bodyCharacterCount: items.reduce(
          (sum, item) => sum + [...normalizedAuditText(item.body)].length,
          0,
        ),
        maximumHeadingOnlyRun,
      }];
    })
  ));
  const shortHeadingViolations = proseStructure.flatMap((entry) => (
    entry.shortHeadings.map((heading) => ({
      slug: entry.slug,
      sectionId: entry.sectionId,
      ...heading,
    }))
  ));
  const headingOnlySections = proseStructure.filter((entry) => (
    entry.headingCount > 0 && entry.bodyCharacterCount === 0
  ));
  const consecutiveHeadingRuns = proseStructure.filter(
    (entry) => entry.maximumHeadingOnlyRun > 1,
  );
  const loweredStructureLabels = ['Difference', 'EDAM Story', 'News'];
  const visibleStructureLabels = config.pages.flatMap((page) => (
    page.sections.flatMap((section) => {
      const projectedIds = new Set(section.sectionLayout?.items.flatMap(
        (item) => item.elementIds,
      ) ?? []);
      return section.elements.flatMap((element) => (
        element.kind === 'text'
        && projectedIds.has(element.id)
        && loweredStructureLabels.some((label) => (
          normalizedAuditText(element.text).startsWith(label)
        ))
          ? [{ slug: page.slug, sectionId: section.id, text: element.text }]
          : []
      ));
    })
  ));
  if (
    shortHeadingViolations.length > 0
    || headingOnlySections.length > 0
    || consecutiveHeadingRuns.length > 0
    || visibleStructureLabels.length > 0
  ) {
    throw new Error(
      `EDOM_RENDER_STRUCTURE_INVALID:${shortHeadingViolations.length}:`
      + `${headingOnlySections.length}:${consecutiveHeadingRuns.length}:`
      + `${visibleStructureLabels.length}`,
    );
  }
  const homeSource = compilablePages.find((page) => (
    canonicalSourceUrl(page.sourceUrl) === 'https://edomclinic.com/'
  ));
  const homeCompiled = config.pages.find((page) => page.slug === '');
  const homeExplicitContextImages = homeSource?.images.filter((image) => (
    image.classification === 'content'
    && image.renderGroupId?.startsWith('ko-render-group-')
  )).length ?? 0;
  const homeContextGalleryImages = homeCompiled?.sections
    .filter((section) => section.id.startsWith('ko-context-gallery-'))
    .reduce((sum, section) => (
      sum + section.elements.filter((element) => element.kind === 'image').length
    ), 0) ?? 0;
  const homeTailGalleryImages = homeCompiled?.sections
    .filter((section) => section.id.startsWith('ko-gallery-'))
    .reduce((sum, section) => (
      sum + section.elements.filter((element) => element.kind === 'image').length
    ), 0) ?? 0;
  const artifacts: Record<string, unknown> = {
    'site-config.json': config,
    'crawl-artifact.json': crawlArtifact,
    'source-manifest.json': first.sourceManifest,
    'image-manifest.json': first.imageManifest,
    'publication-holds.json': first.publicationHolds,
    'ad-diagnostics.json': first.adDiagnostics,
    'source-url-by-slug.json': first.sourceUrlBySlug,
    'independent-original-text.json': extractedWithRaw.map((entry) => (
      entry.independentOriginal
    )),
    'seo-report.json': {
      pageSchemaTypes: pageSchemaTypes(config),
      visibleNavigation: visibleNav.map((page) => ({
        slug: page.slug,
        label: page.navLabel ?? page.title,
      })),
      sitemapSlugs,
      llmsSlugs: [...new Set(llmsSlugs)],
    },
    'build-report.json': {
      version: 1,
      generatedAt: new Date().toISOString(),
      fixedCrawl: {
        expectedManifestSha256: report.expectedManifestSha256,
        expected: report.expectedCount,
        attempted: report.attemptedCount,
        succeeded: report.successCount,
        failed: report.failureCount,
      },
      privateConsultationExclusions: {
        count: excludedPrivate.length,
        urls: excludedPrivate,
        reason: '비밀번호 보호·비공개 개인 상담 — 이관 비대상, 상담 기능으로 대체',
      },
      pages: {
        extracted: extractedWithRaw.length,
        sourceBackedPublished: sourceBackedCompiledUrls.size,
        structural: STRUCTURAL_PAGE_COUNT,
        compiled: config.pages.length,
        visibleNav: visibleNav.length,
        duplicateSlugs,
        duplicateTitles,
        originalDuplicateOrEmptyDocumentTitles: originalTitleGroups,
      },
      publicationHolds: {
        count: first.publicationHolds.length,
        urls: [...heldUrls].sort(),
      },
      source: {
        blocks: first.sourceManifest.length,
        independentIncludedBlocks: extractedWithRaw.reduce(
          (sum, entry) => sum + entry.independentOriginal.included.length,
          0,
        ),
        independentExcludedChrome: extractedWithRaw.reduce(
          (sum, entry) => sum + entry.independentOriginal.excluded.length,
          0,
        ),
        perPageCompleteness: {
          publishedPages: perPageTextCompleteness.length,
          passedPages: perPageTextCompleteness.length - perPageFailures.length,
          failures: perPageFailures,
        },
        globalAuxiliary: {
          missingCount: globalMissing.length,
          missing: globalMissing,
        },
        renderIntegrity: first.renderIntegrity,
        renderStructure: {
          shortHeadingViolations,
          headingOnlySections,
          consecutiveHeadingRuns,
          visibleStructureLabels,
        },
      },
      images: {
        originalReferences: originalImageAudit.length,
        originalUnique: originalImageUrls.size,
        originalContentUnique: originalContentImageUrls.size,
        originalUiChromeUnique: new Set(originalImageAudit
          .filter((image) => image.classification === 'ui-chrome')
          .map((image) => image.sourceUrl)).size,
        sourceClassifiedUnique: sourceClassifiedImages.size,
        unclassifiedOriginalImages,
        unclassifiedOriginalContentImages,
        contentUnique: sourceContentImages.size,
        optimized: imageManifest.assets.length,
        optimizedUniquePublicPaths: optimizedImagePaths.size,
        compiledPlacements: compiledImagePlacements.length,
        compiledUniquePublicPaths: compiledImagePaths.size,
        unplacedOptimizedPublicPaths: unplacedOptimizedImagePaths,
        unavailable: imageManifest.unavailable,
        missingProvenance: missingImages,
        sourceContextPlacement: {
          homeExplicitCardImages: homeExplicitContextImages,
          homeContextGalleryImages,
          homeMovedFromTail:
            homeExplicitContextImages + homeContextGalleryImages,
          homeTailGalleryImages,
        },
        analysis: {
          version: 1,
          analyzed: imageManifest.assets.filter((asset) => asset.analysis.version === 1).length,
          textDense: imageManifest.assets.filter((asset) => asset.analysis.textDense).length,
          heroCandidateSample: imageManifest.assets
            .filter((asset) => [
              '/clinic/edom/54afd16d7b1c21326cbd5537.webp',
              '/clinic/edom/3693d581b2f639a83e9ef29a.webp',
              '/clinic/edom/98b84daffe5e65f35e71cd12.webp',
              '/clinic/edom/48f40ac2014e1f9121986454.webp',
              '/clinic/edom/d415b2392856a0714f426c05.webp',
            ].includes(asset.publicPath))
            .map((asset) => ({
              publicPath: asset.publicPath,
              ...asset.analysis,
            })),
          heroContrast,
          textDenseHeroViolations,
          heroContrastViolations,
          articleHeroBackgrounds,
        },
      },
      deterministic: true,
    },
  };
  await Promise.all(Object.entries(artifacts).map(([name, value]) => (
    writeFile(path.join(OUTPUT_DIR, name), `${JSON.stringify(value, null, 2)}\n`)
  )));
  await writeFile(path.join(OUTPUT_DIR, 'sitemap.xml'), sitemap);
  await writeFile(path.join(OUTPUT_DIR, 'llms.txt'), llms);
  process.stdout.write(`${JSON.stringify(artifacts['build-report.json'], null, 2)}\n`);
  process.stdout.write(`[ko-clinic] output=${OUTPUT_DIR}\n`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
