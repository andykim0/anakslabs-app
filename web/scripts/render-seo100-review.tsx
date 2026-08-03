/**
 * SEO100 owner-review evidence.
 *
 * Captures the same 11 generated-site seeds before/after the hidden semantic
 * outline change with an exact Puppeteer CSS viewport. No generated assets or
 * external network calls are used.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { renderStaticDocument } from '@/lib/export/render-static';
import { preflightScan } from '@/lib/scan/preflight';
import {
  SEO100_DOGFOOD_SEEDS,
  seo100ConfigFor,
  seo100SurveyFor,
} from './lib/seo100-dogfood-fixtures';

const OUTPUT = '/private/tmp/anakslabs-seo100-review';
const PHASE = process.env.SEO100_REVIEW_PHASE === 'after' ? 'after' : 'before';
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HERO = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221600%22 height=%22900%22 viewBox=%220 0 1600 900%22%3E%3Crect width=%221600%22 height=%22900%22 fill=%22%23d8e0ea%22/%3E%3C/svg%3E';

function configFor(seed: (typeof SEO100_DOGFOOD_SEEDS)[number]) {
  const config = seo100ConfigFor(seed, HERO);
  // 프로덕션은 시스템 히어로의 공개 URL을 OG에 쓴다. data SVG는 오프라인
  // 캡처 배경으로만 사용하고, 스캐너에는 동일 계약의 공개 경로를 제공한다.
  config.meta.ogImage = '/mock/mintwash-hero.svg';
  return config;
}

async function capture(htmlFile: string, screenshot: string, width: number, height: number) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-extensions',
      '--hide-scrollbars',
      '--mute-audio',
      '--allow-file-access-from-files',
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ]);
    await page.goto(new URL(`file://${htmlFile}`).toString(), { waitUntil: 'load' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    });
    const viewport = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
      devicePixelRatio: window.devicePixelRatio,
    }));
    if (
      viewport.innerWidth !== width
      || viewport.clientWidth !== width
      || viewport.devicePixelRatio !== 1
    ) {
      throw new Error(`SEO100 viewport mismatch: ${JSON.stringify({ width, ...viewport })}`);
    }
    await page.screenshot({
      path: screenshot,
      type: 'png',
      fullPage: true,
      captureBeyondViewport: true,
    });
    return viewport;
  } finally {
    await browser.close();
  }
}

async function pixelDifference(beforeFile: string, afterFile: string) {
  const before = await sharp(beforeFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const after = await sharp(afterFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (
    before.info.width !== after.info.width
    || before.info.height !== after.info.height
    || before.data.length !== after.data.length
  ) {
    return {
      equal: false,
      reason: 'geometry',
      before: { width: before.info.width, height: before.info.height },
      after: { width: after.info.width, height: after.info.height },
    };
  }
  let changedChannels = 0;
  for (let index = 0; index < before.data.length; index += 1) {
    if (before.data[index] !== after.data[index]) changedChannels += 1;
  }
  return {
    equal: changedChannels === 0,
    changedChannels,
    width: before.info.width,
    height: before.info.height,
  };
}

async function main() {
  const phaseDir = path.join(OUTPUT, PHASE);
  const fixtureDir = path.join(phaseDir, 'fixtures');
  const screenshotDir = path.join(phaseDir, 'screenshots');
  await rm(phaseDir, { recursive: true, force: true });
  await mkdir(fixtureDir, { recursive: true });
  await mkdir(screenshotDir, { recursive: true });

  const matrix = [];
  for (const seed of SEO100_DOGFOOD_SEEDS) {
    const config = configFor(seed);
    const scan = preflightScan(config, {
      tier: 'basic',
      siteUrl: `https://${seed.id}.example.com`,
    });
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      const name = `${seed.id}-${viewport.width}`;
      const htmlFile = path.join(fixtureDir, `${name}.html`);
      const screenshot = path.join(screenshotDir, `${name}.png`);
      await writeFile(
        htmlFile,
        renderStaticDocument({
          config,
          siteUrl: `https://${seed.id}.example.com`,
          pageSlug: '',
          tier: 'basic',
        }),
        'utf8',
      );
      const measuredViewport = await capture(
        htmlFile,
        screenshot,
        viewport.width,
        viewport.height,
      );
      matrix.push({
        seed: seed.id,
        templateId: seo100SurveyFor(seed).templateId,
        dark: Boolean(seed.dark),
        viewport,
        measuredViewport,
        screenshot,
        scores: scan.scores,
        issues: scan.issues.map((issue) => issue.code),
      });
    }
  }
  await writeFile(
    path.join(phaseDir, 'matrix.json'),
    JSON.stringify(matrix, null, 2),
    'utf8',
  );

  if (PHASE === 'after') {
    const diffs = [];
    for (const item of matrix) {
      const name = `${item.seed}-${item.viewport.width}.png`;
      const beforeFile = path.join(OUTPUT, 'before', 'screenshots', name);
      const afterFile = path.join(OUTPUT, 'after', 'screenshots', name);
      diffs.push({
        seed: item.seed,
        width: item.viewport.width,
        ...(await pixelDifference(beforeFile, afterFile)),
      });
    }
    await writeFile(
      path.join(OUTPUT, 'pixel-diff.json'),
      JSON.stringify(diffs, null, 2),
      'utf8',
    );
    if (diffs.some((diff) => !diff.equal)) {
      throw new Error('SEO100 hidden semantic change produced a visual pixel difference.');
    }
  }
  process.stdout.write(`SEO100 ${PHASE}: ${matrix.length} exact-viewport captures -> ${phaseDir}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
