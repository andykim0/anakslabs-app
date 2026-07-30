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
const EXPECTED_PUBLIC_PAGE_COUNT = 283;
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
  await mkdir(OUTPUT_DIR, { recursive: true });
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
        unavailable: imageManifest.unavailable,
        missingProvenance: missingImages,
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
