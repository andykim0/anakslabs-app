/**
 * IMG owner-review evidence. Reuses existing repository stills only:
 * no generated assets, provider calls, retouching, or image mutation.
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/render-image-promotion-review.tsx
 * Out: /private/tmp/daboim-image-promotion-review
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteRenderer } from '@/components/site-renderer';
import {
  applyHeroPhotoPromotion,
  resolveHeroPhotoCandidate,
} from '@/lib/assets/hero-photo-promotion';
import {
  HERO_PHOTO_QUALITY_LIMITS,
  HERO_PHOTO_QUALITY_VERSION,
  assessHeroPhotoQuality,
  type HeroPhotoQualityStamp,
} from '@/lib/assets/hero-photo-quality';
import type { AssetRecord } from '@/lib/assets/provenance';
import { withSiteCinematicDefault } from '@/lib/motion/site-cinematic';
import type { DesignCandidate } from '@/lib/types/domain';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';

const OUTPUT_DIR =
  process.env.IMAGE_PROMOTION_REVIEW_OUTPUT ?? '/private/tmp/daboim-image-promotion-review';
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ASSET_ID = '11111111-1111-4111-8111-111111111111';
const PASS_SOURCE = 'scripts/out/demo-cinematic/gyeol-beauty/poster.webp';

const QUALITY_SOURCES = [
  // Existing photo-like visual fixtures exercise the four quality dimensions.
  // They are not customer evidence; customer_upload provenance is tested separately.
  { id: 'beauty-photo-like', expected: 'pass', path: 'scripts/out/demo-cinematic/gyeol-beauty/poster.webp' },
  { id: 'law-photo-like-soft', expected: 'fail', path: 'scripts/out/demo-cinematic/darim-law/poster.webp' },
  { id: 'dining-photo-like-dark', expected: 'fail', path: 'scripts/out/demo-cinematic/onhwa-dining/poster.webp' },
  { id: 'cafe-photo-like-small', expected: 'fail', path: 'public/onboarding/style-samples/photo.webp' },
  // Published cinematic rasters add bright/dark controls without creating new assets.
  { id: 'workshop-poster', expected: 'pass', path: 'public/cases/demos/yeobaek-workshop/poster.webp' },
  { id: 'workshop-still-1', expected: 'pass', path: 'public/cases/demos/yeobaek-workshop/still-1.webp' },
  { id: 'woldam-poster', expected: 'fail', path: 'public/cases/demos/woldam/poster.webp' },
  { id: 'woldam-still-3', expected: 'fail', path: 'public/cases/demos/woldam/still-3.webp' },
] as const;

function heroConfig(photoUrl: string): SiteConfig {
  const config = withSiteCinematicDefault(emptySiteConfig('온결 살롱'));
  config.pages[0].sections = [{
    id: 'hero',
    type: 'hero',
    name: '첫 화면',
    height: 900,
    background: {
      color: config.theme.palette.background,
      image: {
        src: photoUrl,
        overlayColor: '#100f0c',
        overlayOpacity: 0.28,
      },
    },
    elements: [
      {
        id: 'eyebrow',
        kind: 'text',
        frame: { x: 118, y: 176, w: 520, h: 42 },
        z: 4,
        text: '나에게 맞는 결을 찾는 시간',
        style: {
          fontSize: 18,
          fontWeight: 600,
          fontFamily: 'body',
          color: '#e3c993',
          letterSpacing: 2,
        },
      },
      {
        id: 'title',
        kind: 'text',
        frame: { x: 112, y: 236, w: 690, h: 196 },
        z: 4,
        text: '나답게 빛나는\n결을 만듭니다',
        style: {
          fontSize: 68,
          fontWeight: 700,
          fontFamily: 'heading',
          color: '#fffaf0',
          lineHeight: 1.18,
          readabilityGuard: 'long-hero',
        },
      },
      {
        id: 'lead',
        kind: 'text',
        frame: { x: 118, y: 458, w: 560, h: 82 },
        z: 4,
        text: '예약 전에 궁금한 내용을\n한곳에서 확인하세요.',
        style: {
          fontSize: 21,
          fontFamily: 'body',
          color: '#f5efe3',
          lineHeight: 1.6,
        },
      },
      {
        id: 'cta',
        kind: 'button',
        frame: { x: 118, y: 580, w: 210, h: 62 },
        z: 4,
        label: '예약 안내 보기',
        href: '/booking',
        style: {
          variant: 'solid',
          color: '#b08d57',
          textColor: '#17130d',
          fontSize: 17,
          borderRadius: 999,
        },
      },
    ],
  }];
  config.motion = { presetId: 'base-calm-v2', intensity: 'normal' };
  return config;
}

function candidate(photoUrl: string): DesignCandidate {
  return {
    id: 'review-real-photo',
    label: '고객 실사진',
    style: 'photo',
    imageDirectionId: 'real_photo',
    heroImageUrl: photoUrl,
    heroAssetRef: { assetId: ASSET_ID, url: photoUrl },
    theme: emptySiteConfig('후보').theme,
    description: '품질 게이트를 통과한 고객 사진',
  };
}

function assetRecord(photoUrl: string, quality: HeroPhotoQualityStamp): AssetRecord {
  return {
    id: ASSET_ID,
    origin: 'customer_upload',
    mediaType: 'image',
    storageBucket: 'review',
    storageKey: 'customer/hero.webp',
    canonicalUrl: photoUrl,
    createdAt: '2026-07-23T00:00:00.000Z',
    ownerId: 'review-client',
    siteId: null,
    imageQuality: quality,
  };
}

function fixtureDocument(config: SiteConfig, mode: 'desktop' | 'mobile'): string {
  const markup = renderToStaticMarkup(createElement(SiteRenderer, {
    config,
    mode,
    interactive: true,
    animate: false,
    runtimeDelivery: 'client',
  })).replace(/<link[^>]*>/gu, '');
  return `<!doctype html><html lang="ko" data-review-settled="true"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;overflow:hidden;background:${config.theme.palette.background}}body{min-height:100dvh}</style></head><body>${markup}</body></html>`;
}

function legacyPublishedConfig(kind: 'illustration' | 'real-photo'): SiteConfig {
  const illustration = kind === 'illustration';
  const config = emptySiteConfig(illustration ? '기존 일러스트' : '기존 실사진');
  config.pages[0].sections = [{
    id: 'hero',
    type: 'hero',
    name: '첫 화면',
    height: 820,
    background: {
      image: {
        src: illustration ? '/legacy-illustration.webp' : '/legacy-real-photo.webp',
        overlayColor: '#111111',
        overlayOpacity: 0.4,
      },
    },
    elements: [{
      id: 'title',
      kind: 'text',
      frame: { x: 116, y: 260, w: 720, h: 180 },
      z: 3,
      text: illustration ? '기존 일러스트 발행본' : '기존 실사진 발행본',
      style: { fontSize: 68, fontFamily: 'heading', color: '#ffffff' },
    }],
  }];
  return config;
}

function publishedHtmlSha(config: SiteConfig): string {
  const markup = renderToStaticMarkup(createElement(SiteRenderer, {
    config,
    mode: 'auto',
    interactive: false,
    animate: false,
  }));
  return createHash('sha256').update(markup).digest('hex');
}

async function runChrome(
  htmlFile: string,
  outputFile: string,
  size: { width: number; height: number },
): Promise<void> {
  const profile = path.join(
    OUTPUT_DIR,
    `.chrome-${process.pid}-${path.basename(outputFile, '.png')}`,
  );
  await mkdir(profile, { recursive: true });
  await rm(outputFile, { force: true });
  const args = [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-sync',
    '--disable-extensions',
    '--hide-scrollbars',
    '--mute-audio',
    '--force-device-scale-factor=1',
    '--allow-file-access-from-files',
    '--run-all-compositor-stages-before-draw',
    '--force-prefers-reduced-motion',
    '--virtual-time-budget=2500',
    `--user-data-dir=${profile}`,
    `--window-size=${size.width},${size.height}`,
    `--screenshot=${outputFile}`,
    pathToFileURL(htmlFile).href,
  ];
  const chrome = spawn(CHROME, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  chrome.stderr.on('data', (chunk) => { stderr += String(chunk); });
  const exited = new Promise<number | null>((resolve, reject) => {
    chrome.once('error', reject);
    chrome.once('exit', resolve);
  });
  let captured = false;
  for (let attempt = 0; attempt < 400; attempt += 1) {
    try {
      if ((await stat(outputFile)).size > 0) {
        captured = true;
        break;
      }
    } catch {}
    if (chrome.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!captured) {
    if (chrome.exitCode === null) chrome.kill('SIGTERM');
    const code = await exited;
    throw new Error(`Chrome screenshot failed (${code}): ${stderr.slice(-2_000)}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (chrome.exitCode === null) chrome.kill('SIGTERM');
  await exited;
}

async function main(): Promise<void> {
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(path.join(OUTPUT_DIR, 'fixtures'), { recursive: true });
  await mkdir(path.join(OUTPUT_DIR, 'samples'), { recursive: true });
  await mkdir(path.join(OUTPUT_DIR, 'screenshots'), { recursive: true });

  const qualityMatrix = [];
  for (const sample of QUALITY_SOURCES) {
    const bytes = await readFile(sample.path);
    const quality = await assessHeroPhotoQuality(bytes);
    const copied = path.join(OUTPUT_DIR, 'samples', `${sample.id}${path.extname(sample.path)}`);
    await copyFile(sample.path, copied);
    if (quality.passed !== (sample.expected === 'pass')) {
      throw new Error(`Unexpected quality result for ${sample.id}: ${JSON.stringify(quality)}`);
    }
    qualityMatrix.push({
      id: sample.id,
      source: sample.path,
      copied,
      expected: sample.expected,
      result: quality,
      bytes: bytes.length,
    });
  }

  const passBytes = await readFile(PASS_SOURCE);
  const passQuality = await assessHeroPhotoQuality(passBytes);
  const photoUrl = '../samples/beauty-photo-like.webp';
  const base = heroConfig(photoUrl);
  const promotedCandidate = resolveHeroPhotoCandidate(
    candidate(photoUrl),
    assetRecord(photoUrl, passQuality),
  );
  const promoted = applyHeroPhotoPromotion({
    config: base,
    candidate: promotedCandidate,
    customerPhotoRef: { assetId: ASSET_ID, url: photoUrl },
  });
  if (base.siteCinematic?.heroBackdrop !== 'dna-procedural'
    || promoted.siteCinematic?.heroBackdrop !== 'promoted-photo') {
    throw new Error('Hero promotion evidence did not resolve expected presentations.');
  }

  const captures = [];
  for (const item of [
    { id: 'system-before-1440', config: base, mode: 'desktop' as const, width: 1440, height: 900 },
    { id: 'promoted-after-1440', config: promoted, mode: 'desktop' as const, width: 1440, height: 900 },
    { id: 'system-before-390', config: base, mode: 'mobile' as const, width: 390, height: 844 },
    { id: 'promoted-after-390', config: promoted, mode: 'mobile' as const, width: 390, height: 844 },
  ]) {
    const fixture = path.join(OUTPUT_DIR, 'fixtures', `${item.id}.html`);
    const screenshot = path.join(OUTPUT_DIR, 'screenshots', `${item.id}.png`);
    await writeFile(fixture, fixtureDocument(item.config, item.mode), 'utf8');
    await runChrome(fixture, screenshot, { width: item.width, height: item.height });
    captures.push({
      id: item.id,
      fixture,
      screenshot,
      width: item.width,
      height: item.height,
      mode: item.mode,
      settled: true,
      reducedMotion: true,
      darkDnaSeed: true,
      bytes: (await stat(screenshot)).size,
    });
  }

  const compatibility = [
    {
      kind: 'illustration',
      baselineCommit: '134fc96',
      baselineSha256: '5a9d42c139a341d47759883d4860a99d41162a454a5382bcebc3416e648077e7',
      currentSha256: publishedHtmlSha(legacyPublishedConfig('illustration')),
    },
    {
      kind: 'real_photo',
      baselineCommit: '134fc96',
      baselineSha256: '1902cf6133c2aecf5bae279bc0218cdbaff93674d8b108d5815a3bffe9c844f3',
      currentSha256: publishedHtmlSha(legacyPublishedConfig('real-photo')),
    },
  ];
  if (compatibility.some((item) => item.baselineSha256 !== item.currentSha256)) {
    throw new Error('Existing published renderer SHA changed.');
  }

  const evidence = {
    generatedAssetCalls: 0,
    retouchOrRegeneration: false,
    sourcePolicy: 'existing workspace photo-like/demo fixtures only; no customer claim',
    provenanceNote:
      'Visual quality does not prove customer origin. Promotion still requires the immutable customer_upload registry stamp.',
    algorithmVersion: HERO_PHOTO_QUALITY_VERSION,
    limits: HERO_PHOTO_QUALITY_LIMITS,
    qualityMatrix,
    heroPromotion: {
      default: base.siteCinematic?.heroBackdrop,
      promoted: promoted.siteCinematic?.heroBackdrop,
      source: PASS_SOURCE,
      focalPoint: promoted.pages[0]?.sections[0]?.background.image?.focalPoint,
      mobileFocalPoint: promoted.pages[0]?.sections[0]?.background.image?.mobileFocalPoint,
      captures,
    },
    compatibility,
  };
  await writeFile(
    path.join(OUTPUT_DIR, 'evidence.json'),
    JSON.stringify(evidence, null, 2),
    'utf8',
  );
  process.stdout.write(
    `IMG review: ${qualityMatrix.length} existing samples + ${captures.length} settled captures -> ${OUTPUT_DIR}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
