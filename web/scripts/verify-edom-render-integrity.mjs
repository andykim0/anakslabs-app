import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '/private/tmp/ko-playwright/node_modules/playwright-core/index.mjs';

const BASE_URL = process.env.EDOM_PREVIEW_BASE_URL ?? 'http://127.0.0.1:3111';
const BUILD_DIR = process.env.EDOM_BUILD_OUTPUT ?? '/private/tmp/ko-clinic-p1';
const OUTPUT_DIR = process.env.EDOM_P1G_OUTPUT ?? '/private/tmp/ko-clinic-p1g';
const EVIDENCE_DIR = path.join(OUTPUT_DIR, 'captures');
const RECEIPT_PATH = path.join(BUILD_DIR, 'preview-issuance-private.json');
const STRUCTURE_LABELS = new Set(['Difference', 'EDAM Story', 'News']);
const HOME_FRAGMENT_HEADINGS = new Set([
  '당신의',
  '건',
  '강에',
  '이름도',
  '록',
  '01.',
  '하지정맥류',
  '자세히보기',
]);
const HOME_COMPOUNDS = [
  '01. 하지정맥류 자세히보기',
  '02. 투석혈관 자세히보기',
  '03. 당뇨발 자세히보기',
  '04. 장기질환 케어 자세히보기',
];

await mkdir(EVIDENCE_DIR, { recursive: true });

const [receipt, config, buildReport, renderIntegrity, sourceBySlug] = await Promise.all([
  readFile(RECEIPT_PATH, 'utf8').then(JSON.parse),
  readFile(path.join(BUILD_DIR, 'site-config.json'), 'utf8').then(JSON.parse),
  readFile(path.join(BUILD_DIR, 'build-report.json'), 'utf8').then(JSON.parse),
  readFile(path.join(BUILD_DIR, 'render-integrity.json'), 'utf8').then(JSON.parse),
  readFile(path.join(BUILD_DIR, 'source-url-by-slug.json'), 'utf8').then(JSON.parse),
]);

function previewUrl(slug) {
  return `${BASE_URL}${receipt.relativeUrl}${slug ? `/${slug}` : ''}`;
}

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

async function settle(page, loadImages) {
  await page.evaluate(async ({ shouldLoadImages }) => {
    await document.fonts.ready;
    if (shouldLoadImages) {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 760) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 12));
      }
      await Promise.race([
        Promise.all([...document.images].map((image) => (
          image.complete ? undefined : image.decode().catch(() => undefined)
        ))),
        new Promise((resolve) => setTimeout(resolve, 8_000)),
      ]);
    }
    window.scrollTo(0, 0);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, { shouldLoadImages: loadImages });
}

async function captureSegments(page, name) {
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  const files = [];
  for (let top = 0, index = 1; top < dimensions.height; top += 16_000, index += 1) {
    const height = Math.min(16_000, dimensions.height - top);
    const file = path.join(EVIDENCE_DIR, `${name}-${index}.png`);
    await page.screenshot({
      path: file,
      animations: 'disabled',
      clip: { x: 0, y: top, width: dimensions.width, height },
    });
    files.push({ file, top, height });
  }
  return { ...dimensions, files };
}

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--disable-gpu', '--hide-scrollbars'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
  locale: 'ko-KR',
});
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(error.message));

// The home screenshot is deliberately the first browser assertion in this driver.
let response = await page.goto(previewUrl(''), {
  waitUntil: 'networkidle',
  timeout: 90_000,
});
await settle(page, true);
const homeDesktop = {
  status: response?.status() ?? 0,
  ...(await captureSegments(page, 'home-desktop')),
};
const homeContextGallery = await page.locator('[id^="ko-context-gallery-"]').first().count() > 0
  ? await page.locator('[id^="ko-context-gallery-"]').first().screenshot({
    path: path.join(EVIDENCE_DIR, 'home-context-gallery.png'),
    animations: 'disabled',
  }).then(() => path.join(EVIDENCE_DIR, 'home-context-gallery.png'))
  : null;

await page.route('**/*', async (route) => {
  if (route.request().resourceType() === 'image') {
    await route.abort();
    return;
  }
  await route.continue();
});

const rows = [];
for (const [pageIndex, sitePage] of config.pages.entries()) {
  response = await page.goto(previewUrl(sitePage.slug), {
    waitUntil: 'domcontentloaded',
    timeout: 90_000,
  });
  await settle(page, false);
  const measured = await page.evaluate(({ structureLabels, homeFragments, homeCompounds }) => {
    const isVisible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number.parseFloat(style.opacity) !== 0
        && rect.width > 0
        && rect.height > 0;
    };
    const normalized = (value) => value?.replace(/\s+/gu, ' ').trim() ?? '';
    const visibleHeadings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .filter(isVisible)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        text: normalized(element.textContent),
        sectionId: element.closest('section')?.id ?? null,
      }));
    const sections = [...document.querySelectorAll(
      '[data-clinic-flow-section="features.prose-article"]',
    )]
      .filter(isVisible)
      .map((section) => {
        const items = [...section.querySelectorAll('[data-clinic-flow-item]')]
          .filter(isVisible)
          .map((item) => ({
            heading: [...item.querySelectorAll('[data-clinic-flow-item-heading]')]
              .filter(isVisible)
              .map((element) => normalized(element.textContent))
              .join(''),
            body: [...item.querySelectorAll('[data-clinic-flow-copy]')]
              .filter(isVisible)
              .map((element) => normalized(element.textContent))
              .join(''),
          }));
        let currentHeadingRun = 0;
        let maximumHeadingRun = 0;
        for (const item of items) {
          if (item.heading && !item.body) {
            currentHeadingRun += 1;
            maximumHeadingRun = Math.max(maximumHeadingRun, currentHeadingRun);
          } else {
            currentHeadingRun = 0;
          }
        }
        return {
          id: section.id,
          archetype: section.getAttribute('data-clinic-flow-section'),
          items,
          headingCount: items.filter((item) => item.heading).length,
          bodyCharacters: items.reduce((total, item) => total + item.body.length, 0),
          maximumHeadingRun,
        };
      });
    const itemStates = [...document.querySelectorAll(
      '[data-clinic-flow-section="features.prose-article"] [data-clinic-flow-item]',
    )]
      .filter(isVisible)
      .map((item) => ({
        heading: [...item.querySelectorAll('[data-clinic-flow-item-heading]')]
          .filter(isVisible)
          .map((element) => normalized(element.textContent))
          .join(''),
        body: [...item.querySelectorAll('[data-clinic-flow-copy]')]
          .filter(isVisible)
          .map((element) => normalized(element.textContent))
          .join(''),
      }));
    const physicalLines = [];
    for (const element of [...document.querySelectorAll(
      '[data-ko-clinic] [data-clinic-flow-section="features.prose-article"] [data-clinic-flow-copy]',
    )].filter(isVisible)) {
      const fontSize = Number.parseFloat(getComputedStyle(element).fontSize);
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const lineMap = new Map();
      while (walker.nextNode()) {
        const node = walker.currentNode;
        for (let offset = 0; offset < node.data.length; offset += 1) {
          const character = node.data[offset];
          if (/\s/u.test(character)) continue;
          const range = document.createRange();
          range.setStart(node, offset);
          range.setEnd(node, offset + 1);
          const rect = range.getBoundingClientRect();
          if (!rect.width && !rect.height) continue;
          const key = [...lineMap.keys()].find((top) => Math.abs(top - rect.top) <= 1)
            ?? rect.top;
          const line = lineMap.get(key) ?? {
            left: rect.left,
            right: rect.right,
            text: '',
          };
          line.left = Math.min(line.left, rect.left);
          line.right = Math.max(line.right, rect.right);
          line.text += character;
          lineMap.set(key, line);
        }
      }
      for (const line of lineMap.values()) {
        physicalLines.push({
          physicalEm: (line.right - line.left) / fontSize,
          weightedCharacters: [...line.text].reduce((total, character) => (
            total + (/[가-힣]/u.test(character) ? 1 : 0.5)
          ), 0),
          text: line.text,
        });
      }
    }

    const sourceMetadata = [...document.querySelectorAll('[data-ko-clinic-source-breadcrumb]')]
      .map((element) => normalized(element.textContent));
    return {
      h1Count: visibleHeadings.filter((heading) => heading.tag === 'h1').length,
      shortHeadings: itemStates
        .filter((item) => item.heading && [...item.heading].length < 3)
        .map((item) => ({ text: item.heading })),
      headingOnlySections: sections.filter((section) => (
        section.headingCount > 0 && section.bodyCharacters === 0
      )),
      maximumHeadingOnlyRun: Math.max(0, ...sections.map((section) => (
        section.maximumHeadingRun
      ))),
      visibleStructureLabels: visibleHeadings.filter((heading) => (
        structureLabels.some((label) => heading.text.startsWith(label))
      )),
      homeFragmentHeadings: visibleHeadings.filter((heading) => (
        homeFragments.includes(heading.text)
      )),
      homeCompounds: homeCompounds.map((compound) => ({
        text: compound,
        headingCount: visibleHeadings.filter((heading) => heading.text === compound).length,
        itemCount: itemStates.filter((item) => item.heading === compound).length,
      })),
      sourceMetadataStructureLabels: sourceMetadata.filter((text) => (
        structureLabels.some((label) => text.startsWith(label))
      )),
      contextGalleryImages: [...document.querySelectorAll(
        '[id^="ko-context-gallery-"] [data-clinic-flow-media] img',
      )].filter(isVisible).length,
      tailGalleryImages: [...document.querySelectorAll(
        '[id^="ko-gallery-"] [data-clinic-flow-media] img',
      )].filter(isVisible).length,
      physicalLines,
    };
  }, {
    structureLabels: [...STRUCTURE_LABELS],
    homeFragments: [...HOME_FRAGMENT_HEADINGS],
    homeCompounds: HOME_COMPOUNDS,
  });
  rows.push({
    slug: sitePage.slug,
    sourceUrl: sourceBySlug[sitePage.slug] ?? null,
    status: response?.status() ?? 0,
    ...measured,
  });
  if ((pageIndex + 1) % 40 === 0 || pageIndex + 1 === config.pages.length) {
    process.stdout.write(`[p1-g] ${pageIndex + 1}/${config.pages.length}\n`);
  }
}

await page.unroute('**/*');
const captures = [];
for (const capture of [
  { slug: 'community-tv-46', name: 'board-long-tv-46-desktop', viewport: { width: 1440, height: 1000 } },
  { slug: 'community-edu-10', name: 'board-short-edu-10-desktop', viewport: { width: 1440, height: 1000 } },
  { slug: 'community-edu-22', name: 'board-image-edu-22-desktop', viewport: { width: 1440, height: 1000 } },
  { slug: '', name: 'home-mobile-390', viewport: { width: 390, height: 844 } },
]) {
  await page.setViewportSize(capture.viewport);
  response = await page.goto(previewUrl(capture.slug), {
    waitUntil: 'networkidle',
    timeout: 90_000,
  });
  await settle(page, true);
  captures.push({
    slug: capture.slug,
    label: capture.name,
    status: response?.status() ?? 0,
    viewport: capture.viewport,
    ...(await captureSegments(page, capture.name)),
  });
}

await browser.close();

const physicalLines = rows.flatMap((row) => row.physicalLines.map((line) => ({
  slug: row.slug,
  sourceUrl: row.sourceUrl,
  ...line,
})));
const physicalViolations = physicalLines.filter((line) => line.physicalEm > 30.01);
const weightedViolations = physicalLines.filter((line) => line.weightedCharacters > 40);
const shortHeadings = rows.flatMap((row) => row.shortHeadings.map((heading) => ({
  slug: row.slug,
  sourceUrl: row.sourceUrl,
  ...heading,
})));
const headingOnlySections = rows.flatMap((row) => row.headingOnlySections.map((section) => ({
  slug: row.slug,
  sourceUrl: row.sourceUrl,
  ...section,
})));
const consecutiveHeadingRuns = rows
  .filter((row) => row.maximumHeadingOnlyRun > 1)
  .map((row) => ({
    slug: row.slug,
    sourceUrl: row.sourceUrl,
    maximum: row.maximumHeadingOnlyRun,
  }));
const visibleStructureLabels = rows.flatMap((row) => row.visibleStructureLabels.map((heading) => ({
  slug: row.slug,
  sourceUrl: row.sourceUrl,
  ...heading,
})));
const home = rows.find((row) => row.slug === '');

const report = {
  version: 1,
  generatedAt: new Date().toISOString(),
  route: 'real issued /preview bearer route; no shell projection or renderStaticDocument',
  previewId: receipt.previewId,
  pageCount: config.pages.length,
  pagesVisited: rows.length,
  statusFailures: rows.filter((row) => row.status !== 200).map((row) => ({
    slug: row.slug,
    status: row.status,
  })),
  homeFirstVisual: {
    desktop: homeDesktop,
    contextGallery: homeContextGallery,
    fragments: home?.homeFragmentHeadings ?? [],
    compounds: home?.homeCompounds ?? [],
    contextGalleryImages: home?.contextGalleryImages ?? null,
    tailGalleryImages: home?.tailGalleryImages ?? null,
  },
  renderIntegrity: {
    sourceNodeCount: renderIntegrity.sourceNodeCount,
    affectedPageCount: renderIntegrity.affectedPageCount,
    violations: renderIntegrity.violations,
  },
  completeness: buildReport.source.perPageCompleteness,
  auxiliary: {
    shortHeadings,
    headingOnlySections,
    consecutiveHeadingRuns,
    visibleStructureLabels,
    metadataStructureLabelCount: rows.reduce(
      (total, row) => total + row.sourceMetadataStructureLabels.length,
      0,
    ),
    h1Violations: rows.filter((row) => row.h1Count !== 1).map((row) => ({
      slug: row.slug,
      h1Count: row.h1Count,
    })),
  },
  physicalWidth: {
    lineCount: physicalLines.length,
    physicalEm: {
      p95: percentile(physicalLines.map((line) => line.physicalEm), 0.95),
      maximum: Math.max(0, ...physicalLines.map((line) => line.physicalEm)),
      violations: physicalViolations,
    },
    weightedCharacters: {
      p95: percentile(physicalLines.map((line) => line.weightedCharacters), 0.95),
      maximum: Math.max(0, ...physicalLines.map((line) => line.weightedCharacters)),
      violations: weightedViolations,
    },
  },
  relationAxes: {
    textDenseHeroViolations: buildReport.images.analysis.textDenseHeroViolations,
    heroContrastViolations: buildReport.images.analysis.heroContrastViolations,
    articleHeroBackgrounds: buildReport.images.analysis.articleHeroBackgrounds,
  },
  captures: [
    { slug: '', label: 'home-desktop', ...homeDesktop },
    ...captures,
  ],
  consoleErrors: consoleErrors.filter((message) => (
    !message.includes('/_next/webpack-hmr')
    && message !== 'Failed to load resource: net::ERR_FAILED'
  )),
  expectedHarnessConsoleNoise: consoleErrors.filter((message) => (
    message.includes('/_next/webpack-hmr')
    || message === 'Failed to load resource: net::ERR_FAILED'
  )).length,
};

await writeFile(
  path.join(OUTPUT_DIR, 'live-preview-driver-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify({
  route: report.route,
  previewId: report.previewId,
  pagesVisited: report.pagesVisited,
  statusFailures: report.statusFailures.length,
  homeFirstVisual: report.homeFirstVisual,
  renderIntegrity: report.renderIntegrity,
  completeness: report.completeness,
  auxiliary: {
    shortHeadings: report.auxiliary.shortHeadings.length,
    headingOnlySections: report.auxiliary.headingOnlySections.length,
    consecutiveHeadingRuns: report.auxiliary.consecutiveHeadingRuns.length,
    visibleStructureLabels: report.auxiliary.visibleStructureLabels.length,
    metadataStructureLabelCount: report.auxiliary.metadataStructureLabelCount,
    h1Violations: report.auxiliary.h1Violations.length,
  },
  physicalWidth: {
    lineCount: report.physicalWidth.lineCount,
    physicalEm: {
      p95: report.physicalWidth.physicalEm.p95,
      maximum: report.physicalWidth.physicalEm.maximum,
      violations: report.physicalWidth.physicalEm.violations.length,
    },
    weightedCharacters: {
      p95: report.physicalWidth.weightedCharacters.p95,
      maximum: report.physicalWidth.weightedCharacters.maximum,
      violations: report.physicalWidth.weightedCharacters.violations.length,
    },
  },
  relationAxes: report.relationAxes,
  captures: report.captures,
  consoleErrors: report.consoleErrors.length,
}, null, 2)}\n`);
