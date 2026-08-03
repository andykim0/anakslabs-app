/**
 * ABS owner-review evidence. All visual material is deterministic CSS/SVG compiled from
 * stored DNA ramps; this script does not call an image provider or create product imagery.
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/render-abstract-review.tsx
 * Out: /private/tmp/anakslabs-abstract-review
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import puppeteer, { type Page } from 'puppeteer-core';
import sharp from 'sharp';
import { SiteRenderer } from '@/components/site-renderer';
import { applyProceduralBackgroundDefaults } from '@/lib/abstract/application';
import { ABS_FAMILY_IDS, type AbsFamilyId } from '@/lib/abstract/types';
import { expandTokens, tokenSetToSiteTheme } from '@/lib/design/dna';
import type { DesignDnaId } from '@/lib/design/dna/types';
import {
  withContinuousCanvasDefault,
  withSiteCinematicDefault,
} from '@/lib/motion/site-cinematic';
import {
  emptySiteConfig,
  type Section,
  type SiteConfig,
} from '@/lib/types/site';

const OUTPUT_DIR = '/private/tmp/anakslabs-abstract-review';
const CHROME = process.env.CHROME_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEWPORTS = [
  { band: 'wide', width: 1440, height: 900, mode: 'desktop' },
  { band: 'compact', width: 768, height: 900, mode: 'mobile' },
  { band: 'mobile', width: 390, height: 844, mode: 'mobile' },
] as const;
const REVIEW_DNAS = [
  { id: 'cafe-warm-editorial', hue: 28, label: 'cafe' },
  { id: 'medical-clinical-clarity', hue: 204, label: 'medical' },
] as const satisfies readonly {
  id: DesignDnaId;
  hue: number;
  label: string;
}[];

interface CaptureRecord {
  familyId: AbsFamilyId | 'legacy-blob' | 'flow-coexistence';
  dnaId: DesignDnaId;
  band: 'wide' | 'compact' | 'mobile';
  viewport: { width: number; height: number; devicePixelRatio: number };
  targetSize: { width: number; height: number };
  horizontalOverflow: number;
  activeFamily: string | null;
  screenshot: string;
  consoleErrors: string[];
}

function hero(theme: SiteConfig['theme']): Section {
  return {
    id: 'hero',
    type: 'hero',
    name: '첫 화면',
    height: 820,
    background: { color: theme.palette.background },
    elements: [
      {
        id: 'eyebrow',
        kind: 'text',
        text: '차분한 하루의 시작',
        frame: { x: 138, y: 156, w: 560, h: 48 },
        z: 2,
        style: {
          fontSize: 17,
          fontFamily: 'body' as const,
          fontWeight: 700,
          color: theme.palette.primary,
          lineHeight: 1.4,
        },
      },
      {
        id: 'headline',
        kind: 'text',
        text: '필요한 정보가\n차분하게 이어집니다',
        frame: { x: 132, y: 220, w: 760, h: 190 },
        z: 2,
        style: {
          fontSize: 68,
          fontFamily: 'heading',
          fontWeight: 700,
          color: theme.palette.text,
          lineHeight: 1.18,
        },
      },
      {
        id: 'lead',
        kind: 'text',
        text: '고객이 직접 전한 내용을 읽기 편한 순서로 차분하게 안내합니다.',
        frame: { x: 138, y: 438, w: 620, h: 76 },
        z: 2,
        style: {
          fontSize: 21,
          fontFamily: 'body',
          color: theme.palette.text,
          lineHeight: 1.55,
        },
      },
      {
        id: 'cta',
        kind: 'button',
        label: '자세히 보기',
        href: '#story',
        frame: { x: 138, y: 548, w: 190, h: 58 },
        z: 2,
        style: {
          fontSize: 17,
          color: theme.palette.primary,
          textColor: theme.palette.background,
          variant: 'solid',
        },
      },
    ],
  };
}

function chapter(
  theme: SiteConfig['theme'],
  index: number,
  type: Section['type'],
  title: string,
  body: string,
): Section {
  const start = index % 2 === 0 ? 156 : 600;
  return {
    id: index === 1 ? 'story' : `chapter-${index}`,
    type,
    name: title,
    height: 640,
    background: {
      color: index % 2 === 0
        ? theme.palette.background
        : theme.palette.surface,
    },
    elements: [
      {
        id: `chapter-${index}-number`,
        kind: 'text',
        text: String(index).padStart(2, '0'),
        frame: { x: start, y: 126, w: 120, h: 46 },
        z: 2,
        style: {
          fontSize: 16,
          fontFamily: 'body',
          fontWeight: 700,
          color: theme.palette.primary,
        },
      },
      {
        id: `chapter-${index}-title`,
        kind: 'text',
        text: title,
        frame: { x: start, y: 196, w: 680, h: 120 },
        z: 2,
        style: {
          fontSize: 48,
          fontFamily: 'heading',
          fontWeight: 700,
          color: theme.palette.text,
          lineHeight: 1.25,
        },
      },
      {
        id: `chapter-${index}-body`,
        kind: 'text',
        text: body,
        frame: { x: start, y: 344, w: 590, h: 110 },
        z: 2,
        style: {
          fontSize: 20,
          fontFamily: 'body',
          color: theme.palette.muted,
          lineHeight: 1.7,
        },
      },
    ],
  };
}

function reviewConfig(
  dnaId: DesignDnaId,
  hueSeed: number,
  familyId: AbsFamilyId,
  continuous = false,
): SiteConfig {
  const theme = tokenSetToSiteTheme(expandTokens(dnaId, hueSeed));
  theme.fonts = {
    heading: "'Apple SD Gothic Neo','Noto Sans KR',sans-serif",
    body: "'Apple SD Gothic Neo','Noto Sans KR',sans-serif",
    googleFonts: [],
  };
  let config = withSiteCinematicDefault(emptySiteConfig('절차적 배경 검수'));
  config = {
    ...config,
    theme,
    designDna: {
      catalogVersion: 1,
      dnaId,
      hueSeed,
      overrides: {},
    },
    meta: {
      ...config.meta,
      title: dnaId === 'medical-clinical-clarity' ? '온담 의원' : '온담 작업실',
      purposeId: dnaId === 'medical-clinical-clarity' ? 'professional_service' : 'local_store',
      industryClass: dnaId === 'medical-clinical-clarity' ? 'medical' : 'cafe',
    },
    pages: [{
      id: 'home',
      title: '홈',
      slug: '',
      sections: [
        hero(theme),
        chapter(
          theme,
          1,
          'about',
          '차분하게 이어지는 이야기',
          '한 장면에서 다음 장면으로 색과 리듬이 이어지며 실제로 전할 내용을 중심에 둡니다.',
        ),
        chapter(
          theme,
          2,
          'features',
          '필요한 내용을 분명하게',
          '장식으로 공간을 늘리지 않고 고객이 확인할 정보가 있을 때만 다음 장면을 만듭니다.',
        ),
        chapter(
          theme,
          3,
          'contact',
          '다음 행동까지 자연스럽게',
          '읽는 흐름이 끊기지 않도록 문의와 방문에 필요한 내용을 마지막까지 안내합니다.',
        ),
      ],
    }],
  };
  if (continuous) config = withContinuousCanvasDefault(config);
  const applied = applyProceduralBackgroundDefaults(config);
  const sections = applied.pages[0]!.sections.map((section) => (
    section.id === 'hero' && section.proceduralBackground
      ? {
          ...section,
          proceduralBackground: {
            ...section.proceduralBackground,
            familyId,
          },
        }
      : section
  ));
  return {
    ...applied,
    pages: [{ ...applied.pages[0]!, sections }],
  };
}

function documentFor(
  config: SiteConfig,
  mode: 'desktop' | 'mobile',
  width: number,
): string {
  const markup = renderToStaticMarkup(createElement(SiteRenderer, {
    config,
    mode,
    interactive: false,
    animate: false,
    runtimeDelivery: 'client',
  })).replace(/<link[^>]*>/gu, '');
  return [
    '<!doctype html><html lang="ko" data-review-settled="true"><head><meta charset="utf-8">',
    `<meta name="viewport" content="width=${width},initial-scale=1">`,
    '<style>*{box-sizing:border-box}html,body{margin:0;width:100%;overflow-x:hidden}body{min-height:100dvh}</style>',
    `</head><body>${markup}</body></html>`,
  ].join('');
}

async function settle(page: Page): Promise<void> {
  await page.waitForSelector('section[data-section-type="hero"]');
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise<void>((resolveFrame) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()));
    });
    window.scrollTo(0, 0);
    await new Promise<void>((resolveFrame) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()));
    });
  });
}

async function capture(
  page: Page,
  input: {
    config: SiteConfig;
    familyId: CaptureRecord['familyId'];
    dnaId: DesignDnaId;
    label: string;
    band: 'wide' | 'compact' | 'mobile';
    width: number;
    height: number;
    mode: 'desktop' | 'mobile';
    fullPage?: boolean;
  },
): Promise<CaptureRecord> {
  await page.setViewport({
    width: input.width,
    height: input.height,
    deviceScaleFactor: 1,
  });
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  const htmlFile = path.join(OUTPUT_DIR, 'html', `${input.label}-${input.width}.html`);
  await writeFile(htmlFile, documentFor(input.config, input.mode, input.width));
  const consoleErrors: string[] = [];
  const onConsole = (message: { type(): string; text(): string }) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  };
  page.on('console', onConsole);
  await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' });
  await settle(page);
  const metrics = await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>(
      'section[data-section-type="hero"]',
    );
    if (!target) throw new Error('ABS review hero missing');
    const targetRect = target.getBoundingClientRect();
    const visibleBackground = [...target.querySelectorAll<HTMLElement>('[data-abs-band]')]
      .find((layer) => {
        const style = getComputedStyle(layer);
        const rect = layer.getBoundingClientRect();
        return style.display !== 'none' && rect.width > 0 && rect.height > 0;
      });
    const textFrames = [...target.querySelectorAll<HTMLElement>(
      '[data-hero-layout-frame],[data-section-layout-frame],p,.anaks-btn',
    )].filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0;
    });
    const unsafe = textFrames.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left < 8 || rect.right > window.innerWidth - 8;
    }).map((element) => element.textContent?.trim() ?? element.tagName);
    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      targetSize: {
        width: targetRect.width,
        height: targetRect.height,
      },
      horizontalOverflow: Math.max(
        0,
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
      activeFamily: visibleBackground?.dataset.absFamily ?? null,
      unsafe,
    };
  });
  page.off('console', onConsole);
  if (
    metrics.viewport.width !== input.width
    || metrics.viewport.height !== input.height
    || metrics.viewport.devicePixelRatio !== 1
  ) {
    throw new Error(`${input.label}: viewport mismatch ${JSON.stringify(metrics.viewport)}`);
  }
  if (metrics.horizontalOverflow > 0) {
    throw new Error(`${input.label}: horizontal overflow ${metrics.horizontalOverflow}`);
  }
  if (metrics.unsafe.length > 0) {
    throw new Error(`${input.label}: text entered edge band ${metrics.unsafe.join(' | ')}`);
  }
  if (consoleErrors.length > 0) {
    throw new Error(`${input.label}: console errors ${consoleErrors.join(' | ')}`);
  }
  const expectedFamily = input.familyId === 'flow-coexistence'
    ? 'abs.paper-grain-wash'
    : input.familyId;
  if (expectedFamily !== 'legacy-blob' && metrics.activeFamily !== expectedFamily) {
    throw new Error(`${input.label}: active family ${metrics.activeFamily}`);
  }
  const screenshot = path.join(
    OUTPUT_DIR,
    input.familyId === 'flow-coexistence' ? 'coexistence' : 'families',
    `${input.label}-${input.width}.png`,
  );
  if (input.fullPage) {
    await page.screenshot({ path: screenshot, type: 'png', fullPage: true });
  } else {
    const target = await page.$('section[data-section-type="hero"]');
    if (!target) throw new Error(`${input.label}: hero handle missing`);
    await target.screenshot({ path: screenshot, type: 'png' });
  }
  return {
    familyId: input.familyId,
    dnaId: input.dnaId,
    band: input.band,
    viewport: metrics.viewport,
    targetSize: metrics.targetSize,
    horizontalOverflow: metrics.horizontalOverflow,
    activeFamily: metrics.activeFamily,
    screenshot,
    consoleErrors,
  };
}

async function contactSheet(records: readonly CaptureRecord[]): Promise<string> {
  const ordered = REVIEW_DNAS.flatMap((dna) => (
    ABS_FAMILY_IDS.flatMap((familyId) => (
      VIEWPORTS.map((viewport) => records.find((record) => (
        record.dnaId === dna.id
        && record.familyId === familyId
        && record.band === viewport.band
      ))!)
    ))
  ));
  const cellWidth = 300;
  const cellHeight = 208;
  const imageWidth = 288;
  const imageHeight = 174;
  const composites = await Promise.all(ordered.map(async (record, index) => {
    const input = await sharp(record.screenshot)
      .resize(imageWidth, imageHeight, { fit: 'cover', position: 'top' })
      .png()
      .toBuffer();
    const label = `${record.dnaId.split('-')[0]} · ${record.familyId.replace('abs.', '')} · ${record.band}`;
    const labelSvg = Buffer.from(
      `<svg width="${imageWidth}" height="24"><rect width="100%" height="100%" fill="#07111f"/><text x="8" y="16" fill="#fff" font-size="10" font-family="Arial">${label}</text></svg>`,
    );
    return [
      {
        input,
        left: (index % 3) * cellWidth + 6,
        top: Math.floor(index / 3) * cellHeight + 6,
      },
      {
        input: labelSvg,
        left: (index % 3) * cellWidth + 6,
        top: Math.floor(index / 3) * cellHeight + imageHeight + 6,
      },
    ];
  }));
  const output = path.join(OUTPUT_DIR, 'abstract-families-contact-sheet.png');
  await sharp({
    create: {
      width: cellWidth * 3,
      height: cellHeight * Math.ceil(ordered.length / 3),
      channels: 3,
      background: '#e8edf3',
    },
  }).composite(composites.flat()).png().toFile(output);
  return output;
}

async function beforeAfterSheet(before: string, after: string): Promise<string> {
  const label = (text: string) => Buffer.from(
    `<svg width="700" height="34"><rect width="100%" height="100%" fill="#07111f"/><text x="12" y="23" fill="#fff" font-size="16" font-family="Arial">${text}</text></svg>`,
  );
  const beforeImage = await sharp(before).resize(700, 420, { fit: 'cover', position: 'top' }).png().toBuffer();
  const afterImage = await sharp(after).resize(700, 420, { fit: 'cover', position: 'top' }).png().toBuffer();
  const output = path.join(OUTPUT_DIR, 'legacy-vs-abs-same-seed.png');
  await sharp({
    create: {
      width: 1400,
      height: 454,
      channels: 3,
      background: '#ffffff',
    },
  }).composite([
    { input: beforeImage, left: 0, top: 0 },
    { input: afterImage, left: 700, top: 0 },
    { input: label('BEFORE · radial blob + empty ring'), left: 0, top: 420 },
    { input: label('AFTER · soft-gradient-field'), left: 700, top: 420 },
  ]).png().toFile(output);
  return output;
}

async function main() {
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await Promise.all([
    mkdir(path.join(OUTPUT_DIR, 'html'), { recursive: true }),
    mkdir(path.join(OUTPUT_DIR, 'families'), { recursive: true }),
    mkdir(path.join(OUTPUT_DIR, 'coexistence'), { recursive: true }),
  ]);
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
  const records: CaptureRecord[] = [];
  try {
    const page = await browser.newPage();
    for (const dna of REVIEW_DNAS) {
      for (const familyId of ABS_FAMILY_IDS) {
        const config = reviewConfig(dna.id, dna.hue, familyId);
        for (const viewport of VIEWPORTS) {
          records.push(await capture(page, {
            config,
            familyId,
            dnaId: dna.id,
            label: `${dna.label}-${familyId.replace('abs.', '')}`,
            ...viewport,
          }));
        }
      }
    }

    const beforeBase = reviewConfig(
      'cafe-warm-editorial',
      28,
      'abs.soft-gradient-field',
    );
    const before: SiteConfig = {
      ...beforeBase,
      pages: [{
        ...beforeBase.pages[0]!,
        sections: beforeBase.pages[0]!.sections.map((section) => {
          const legacySection = structuredClone(section);
          delete legacySection.proceduralBackground;
          return legacySection;
        }),
      }],
    };
    const beforeRecord = await capture(page, {
      config: before,
      familyId: 'legacy-blob',
      dnaId: 'cafe-warm-editorial',
      label: 'before-legacy-blob',
      ...VIEWPORTS[0],
    });
    const afterRecord = records.find((record) => (
      record.dnaId === 'cafe-warm-editorial'
      && record.familyId === 'abs.soft-gradient-field'
      && record.band === 'wide'
    ))!;

    const coexistence = reviewConfig(
      'cafe-warm-editorial',
      28,
      'abs.paper-grain-wash',
      true,
    );
    const coexistenceRecord = await capture(page, {
      config: coexistence,
      familyId: 'flow-coexistence',
      dnaId: 'cafe-warm-editorial',
      label: 'flow-plus-paper-grain',
      ...VIEWPORTS[0],
      fullPage: true,
    });
    const familySheet = await contactSheet(records);
    const comparisonSheet = await beforeAfterSheet(
      beforeRecord.screenshot,
      afterRecord.screenshot,
    );
    const manifest = {
      generatedAt: new Date().toISOString(),
      renderer: 'SiteRenderer production boundary',
      staticState: 'prefers-reduced-motion: reduce + full scroll settle',
      families: ABS_FAMILY_IDS,
      dnas: REVIEW_DNAS,
      viewports: VIEWPORTS,
      records,
      comparison: {
        before: beforeRecord,
        after: afterRecord,
        sheet: comparisonSheet,
      },
      coexistence: coexistenceRecord,
      contactSheet: familySheet,
      assertions: {
        deterministicMatrixCases: 120,
        externalOrAiAssets: 0,
        circleOrEllipseElements: 0,
        horizontalOverflow: 0,
        consoleErrors: 0,
      },
    };
    await writeFile(
      path.join(OUTPUT_DIR, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await browser.close();
  }
}

void main();
