/**
 * TPL owner-review evidence. Renders every named interior template through the
 * production SiteRenderer with customer-supplied content and checked-in media.
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/render-template-gallery-review.tsx
 * Out: TEMPLATE_REVIEW_OUTPUT or /private/tmp/daboim-template-review
 */
import { createServer } from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import puppeteer, { type Page } from 'puppeteer-core';
import sharp from 'sharp';
import { SiteRenderer } from '@/components/site-renderer';
import { applyProceduralBackgroundDefaults } from '@/lib/abstract/application';
import { imageDirectionToLegacyCandidateStyle } from '@/lib/assets/image-directions';
import { buildZeroCostSiteConfig } from '@/lib/billing/prepublish-cost-policy';
import {
  pagePlanFromTemplate,
  planFromTemplate,
  resolveTemplate,
} from '@/lib/data/site-blueprints';
import { expandTokens, tokenSetToSiteTheme } from '@/lib/design/dna';
import { contrastRatio } from '@/lib/design/quality-standards';
import {
  NAMED_TEMPLATE_CATALOG,
  resolveNamedTemplate,
} from '@/lib/design/templates';
import {
  applyModernKoreanFontPairing,
  fontIndustryClassForSurvey,
  resolveKoreanFontPairingId,
} from '@/lib/fonts/selection';
import {
  withContinuousCanvasDefault,
  withSiteCinematicDefault,
} from '@/lib/motion/site-cinematic';
import { applyGeneratedMotion } from '@/lib/motion/validate';
import type {
  DesignCandidate,
  SurveyInput,
} from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';

const OUTPUT_DIR = process.env.TEMPLATE_REVIEW_OUTPUT
  ?? '/private/tmp/daboim-template-review';
const PUBLIC_DIR = path.resolve('public');
const CHROME = process.env.CHROME_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.TEMPLATE_REVIEW_PORT ?? 4198);
const VIEWPORTS = [
  { band: 'wide', width: 1440, height: 900, mode: 'desktop' },
  { band: 'compact', width: 768, height: 900, mode: 'mobile' },
  { band: 'mobile', width: 390, height: 844, mode: 'mobile' },
] as const;
const projectPhotos = [
  '/cases/demos/yeobaek-workshop/still-1.webp',
  '/cases/demos/yeobaek-workshop/still-2.webp',
  '/cases/demos/yeobaek-workshop/still-3.webp',
] as const;

interface CaptureRecord {
  templateId: string;
  templateName: string;
  dnaId: string;
  signatureId: string;
  band: 'wide' | 'compact' | 'mobile';
  screenshot: string;
  viewport: { width: number; height: number };
  pageHeight: number;
  horizontalOverflow: number;
  cls: number;
  consoleErrors: string[];
  heroForegroundCount: number;
  heroForegroundOverlaps: string[];
  buttonNowrapViolations: string[];
  imageContrastMeasurements: Array<{
    id: string;
    ratio: number;
    required: number;
    color: string;
  }>;
  fontPairingId: string | null;
  fontSelectionPolicy: string | null;
  sectionIds: string[];
  configSha: string;
  htmlSha: string;
}

function surveyFor(
  template: (typeof NAMED_TEMPLATE_CATALOG)[number],
): SurveyInput {
  const blueprint = resolveTemplate('company_brand', '건설·인테리어 시공');
  const realPhoto = template.recipe.imageDirectionId === 'real_photo';
  return {
    businessName: '다온 공간연구소',
    purposeId: 'company_brand',
    purpose: blueprint.label,
    industry: '건설·인테리어 시공',
    tone: ['차분한', '신뢰감 있는'],
    colorPreference: '#7b6952',
    referenceImageUrls: [],
    sectionPlan: planFromTemplate(blueprint),
    pagePlan: pagePlanFromTemplate(blueprint),
    templateId: blueprint.id,
    imageDirectionId: template.recipe.imageDirectionId,
    highlights: [
      '공간의 쓰임을 먼저 듣습니다',
      '재료와 동선의 균형을 살핍니다',
      '진행 과정을 분명하게 안내합니다',
    ],
    contentItems: [
      { name: '주거 공간 설계', description: '고객이 입력한 실제 업무', photoUrl: projectPhotos[0] },
      { name: '상업 공간 설계', description: '고객이 입력한 실제 업무', photoUrl: projectPhotos[1] },
      { name: '업무 공간 설계', description: '고객이 입력한 실제 업무', photoUrl: projectPhotos[2] },
      { name: '현장 관리', description: '고객이 입력한 실제 업무', photoUrl: projectPhotos[0] },
    ],
    storePhotoUrls: [...projectPhotos],
    contentDepth: {
      version: 2,
      facts: [
        { key: 'phone', value: '02-1234-5678', source: 'customer' },
        { key: 'address', value: '서울시 고객 확인 주소', source: 'customer' },
        { key: 'caseStudies', value: '고객이 직접 입력한 공간 프로젝트', source: 'customer' },
      ],
      faqAnswers: [],
      imports: [],
      mainStorytelling: {
        version: 1,
        brandStory: '공간의 목적을 듣고 재료와 동선을 함께 살핀다는 고객의 실제 이야기입니다.',
      },
      surveyBrief: {
        version: 1,
        targetCustomer: '새 공간을 준비하는 사업자',
        visitorNeed: '사업 분야와 진행 방식을 확인',
        valueProposition: '쓰임을 중심에 두는 태도',
        conversionDestination: { kind: 'phone_fact' },
      },
    },
    ...(realPhoto
      ? {
          generalAssetAttestationId: 'attestation-template-review',
          heroPhotoUrl: projectPhotos[0],
          heroPhotoAssetRef: {
            assetId: 'asset-template-review-hero',
            url: projectPhotos[0],
          },
        }
      : {}),
  };
}

function candidateFor(
  template: (typeof NAMED_TEMPLATE_CATALOG)[number],
  survey: SurveyInput,
): DesignCandidate {
  const resolved = resolveNamedTemplate(template, survey);
  if (!resolved) throw new Error(`${template.id}: catalog contract did not resolve`);
  const realPhoto = template.recipe.imageDirectionId === 'real_photo';
  const baseTheme = tokenSetToSiteTheme(expandTokens(
    resolved.designDna.dnaId,
    resolved.designDna.hueSeed,
    resolved.designDna.overrides,
  ));
  const theme = applyModernKoreanFontPairing(
    baseTheme,
    resolveKoreanFontPairingId({
      dnaId: resolved.designDna.dnaId,
      industryClass: fontIndustryClassForSurvey(survey),
    }),
  );
  return {
    id: `tpl-${template.id}`,
    label: template.name,
    style: imageDirectionToLegacyCandidateStyle(template.recipe.imageDirectionId),
    imageDirectionId: template.recipe.imageDirectionId,
    heroImageUrl: realPhoto ? projectPhotos[0] : template.previewImage,
    heroPresentation: realPhoto ? 'promoted_customer_photo' : 'system',
    theme,
    description: template.description,
    designDna: resolved.designDna,
    heroLayoutVariantId: resolved.heroLayoutVariantId,
    sectionLayoutVariantIds: resolved.sectionLayoutVariantIds,
    namedTemplate: resolved.selection,
    recommendedMotionSignatureId: resolved.recommendedMotionSignatureId,
  };
}

function configFor(
  template: (typeof NAMED_TEMPLATE_CATALOG)[number],
): SiteConfig {
  const survey = surveyFor(template);
  const candidate = candidateFor(template, survey);
  const base = buildZeroCostSiteConfig(survey, candidate);
  const cinematic = withContinuousCanvasDefault(withSiteCinematicDefault(base));
  const atmosphere = applyProceduralBackgroundDefaults(cinematic);
  return applyGeneratedMotion(
    atmosphere,
    survey.purposeId,
    'premium',
    {
      intensity: 'subtle',
      heroTechnique: 'ken-burns',
      signatureId: candidate.recommendedMotionSignatureId,
    },
    survey,
  );
}

function documentFor(config: SiteConfig, mode: 'desktop' | 'mobile'): string {
  const renderedMarkup = renderToStaticMarkup(createElement(SiteRenderer, {
    config,
    mode,
    interactive: false,
    animate: false,
    runtimeDelivery: 'client',
  }));
  // The evidence run is deliberately offline. Keep production markup otherwise
  // intact while removing only remote font hints so a blocked request cannot
  // masquerade as a renderer console error.
  const markup = renderedMarkup.replace(
    /<link\b[^>]*href="https:\/\/[^"]+"[^>]*\/?>/gu,
    '',
  );
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>window.__reviewCls=0;window.__reviewErrors=[];addEventListener('error',function(e){window.__reviewErrors.push(String(e.message||e.error||'error'))});new PerformanceObserver(function(list){list.getEntries().forEach(function(entry){if(!entry.hadRecentInput)window.__reviewCls+=entry.value})}).observe({type:'layout-shift',buffered:true})</script><style>html,body{margin:0;min-height:100%;overflow-x:hidden;background:#fff}img{color:transparent}</style></head><body>${markup}</body></html>`;
}

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${PORT}`);
      const decoded = decodeURIComponent(url.pathname);
      if (decoded === '/favicon.ico') {
        response.writeHead(204).end();
        return;
      }
      const isPublic = !decoded.startsWith('/review/');
      const root = isPublic ? PUBLIC_DIR : OUTPUT_DIR;
      const relative = isPublic
        ? decoded.replace(/^\/+/u, '')
        : decoded.replace(/^\/review\/+/u, '');
      const file = path.resolve(root, relative);
      if (!file.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403).end('forbidden');
        return;
      }
      const body = await readFile(file);
      const extension = path.extname(file);
      const contentType = extension === '.html'
        ? 'text/html; charset=utf-8'
        : extension === '.webp'
          ? 'image/webp'
          : extension === '.svg'
            ? 'image/svg+xml'
            : 'application/octet-stream';
      response.writeHead(200, {
        'content-type': contentType,
        'cache-control': 'no-store',
      });
      response.end(body);
    } catch {
      response.writeHead(404).end('not found');
    }
  });
  return new Promise<typeof server>((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function settledMetrics(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  return page.evaluate(() => {
    const hero = document.querySelector<HTMLElement>('section[data-section-type="hero"]');
    const targets = hero
      ? [
          ...[...hero.querySelectorAll<HTMLElement>('[data-site-cine-hero-copy]')]
            .map((wrapper) => wrapper.querySelector<HTMLElement>('p') ?? wrapper),
          ...hero.querySelectorAll<HTMLElement>('.anaks-btn'),
        ]
      : [];
    const foreground = targets.map((node, index) => {
      const rect = node.getBoundingClientRect();
      return {
        id: `${index}:${(node.textContent ?? '').trim().replace(/\s+/gu, ' ')}`,
        x: rect.x,
        y: rect.y,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    }).filter((item) => item.width > 0 && item.height > 0);
    const overlaps: string[] = [];
    for (let left = 0; left < foreground.length; left += 1) {
      for (let right = left + 1; right < foreground.length; right += 1) {
        const a = foreground[left];
        const b = foreground[right];
        const intersectionWidth = Math.min(a.right, b.right) - Math.max(a.x, b.x);
        const intersectionHeight = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
        if (intersectionWidth > 0.5 && intersectionHeight > 0.5) {
          overlaps.push(`${a.id} <> ${b.id}`);
        }
      }
    }
    const buttonNowrapViolations = [...document.querySelectorAll<HTMLElement>('.anaks-btn')]
      .filter((button) => getComputedStyle(button).whiteSpace !== 'nowrap')
      .map((button) => (button.textContent ?? '').trim().replace(/\s+/gu, ' '));
    const imageContrastForegrounds = [...document.querySelectorAll<HTMLElement>(
      '[data-section-type="hero"] [data-image-contrast-foreground]',
    )].map((frame) => {
      const text = frame.querySelector<HTMLElement>('p') ?? frame;
      const rect = text.getBoundingClientRect();
      const style = getComputedStyle(text);
      return {
        id: frame.dataset.imageContrastForeground ?? 'unknown',
        x: rect.left,
        y: rect.top + scrollY,
        width: rect.width,
        height: rect.height,
        color: style.color,
        fontSize: Number.parseFloat(style.fontSize),
        fontWeight: Number.parseInt(style.fontWeight, 10) || 400,
      };
    }).filter((item) => item.width > 0 && item.height > 0);
    return {
      pageHeight: document.documentElement.scrollHeight,
      horizontalOverflow: Math.max(
        0,
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
      cls: Number((window as typeof window & { __reviewCls?: number }).__reviewCls ?? 0),
      errors: [
        ...((window as typeof window & { __reviewErrors?: string[] }).__reviewErrors ?? []),
      ],
      heroForegroundCount: foreground.length,
      heroForegroundOverlaps: overlaps,
      buttonNowrapViolations,
      imageContrastForegrounds,
    };
  });
}

function cssColor(value: string): string {
  const channels = value.match(/\d+(?:\.\d+)?/gu)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) throw new Error(`Unsupported color: ${value}`);
  return `#${channels.map((channel) =>
    Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0'))
    .join('')}`;
}

async function measureImageTextContrast(
  page: Page,
  foregrounds: ReadonlyArray<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    fontSize: number;
    fontWeight: number;
  }>,
) {
  if (foregrounds.length === 0) return [];
  await page.evaluate(() => {
    for (const element of document.querySelectorAll<HTMLElement>(
      '[data-image-contrast-foreground]',
    )) {
      element.style.visibility = 'hidden';
    }
  });
  const background = await page.screenshot({ fullPage: true, type: 'png' });
  const raw = await sharp(background)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return foregrounds.map((foreground) => {
    const textColor = cssColor(foreground.color);
    const left = Math.max(0, Math.floor(foreground.x));
    const top = Math.max(0, Math.floor(foreground.y));
    const right = Math.min(raw.info.width, Math.ceil(foreground.x + foreground.width));
    const bottom = Math.min(raw.info.height, Math.ceil(foreground.y + foreground.height));
    let minimum = Number.POSITIVE_INFINITY;
    for (let y = top; y < bottom; y += 2) {
      for (let x = left; x < right; x += 2) {
        const offset = (y * raw.info.width + x) * raw.info.channels;
        const backgroundColor = `#${[
          raw.data[offset],
          raw.data[offset + 1],
          raw.data[offset + 2],
        ].map((channel) => channel!.toString(16).padStart(2, '0')).join('')}`;
        minimum = Math.min(minimum, contrastRatio(textColor, backgroundColor));
      }
    }
    const required = foreground.fontSize >= 24
      || (foreground.fontSize >= 18.66 && foreground.fontWeight >= 700)
      ? 3
      : 4.5;
    return {
      id: foreground.id,
      ratio: Number(minimum.toFixed(2)),
      required,
      color: textColor,
    };
  });
}

async function makeContactSheet(
  records: readonly CaptureRecord[],
  band: CaptureRecord['band'],
  output: string,
) {
  const selected = records.filter((record) => record.band === band);
  const columns = band === 'wide' ? 4 : band === 'compact' ? 3 : 2;
  const tileWidth = band === 'wide' ? 330 : band === 'compact' ? 250 : 195;
  const tileHeight = band === 'wide' ? 440 : band === 'compact' ? 520 : 460;
  const rows = Math.ceil(selected.length / columns);
  const composites: sharp.OverlayOptions[] = [];
  for (const [index, record] of selected.entries()) {
    const left = (index % columns) * tileWidth;
    const top = Math.floor(index / columns) * tileHeight;
    const preview = await sharp(record.screenshot)
      .resize({
        width: tileWidth - 20,
        height: tileHeight - 70,
        fit: 'cover',
        position: 'top',
      })
      .png()
      .toBuffer();
    const label = Buffer.from(
      `<svg width="${tileWidth - 20}" height="42" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#ffffff"/><text x="10" y="18" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="#0b1736">${record.templateName}</text><text x="10" y="34" font-family="Arial,sans-serif" font-size="9" fill="#667085">${record.templateId}</text></svg>`,
    );
    composites.push(
      { input: preview, left: left + 10, top: top + 8 },
      { input: label, left: left + 10, top: top + tileHeight - 54 },
    );
  }
  await sharp({
    create: {
      width: columns * tileWidth,
      height: rows * tileHeight,
      channels: 4,
      background: '#e9eef5',
    },
  }).composite(composites).png().toFile(output);
}

async function makeRecommendationSheet(
  records: readonly CaptureRecord[],
  band: CaptureRecord['band'],
  output: string,
) {
  const selected = records.filter((record) => record.band === band).slice(0, 6);
  const width = band === 'wide' ? 1440 : band === 'compact' ? 768 : 390;
  const columns = band === 'wide' ? 3 : band === 'compact' ? 2 : 1;
  const gap = band === 'wide' ? 24 : 14;
  const margin = band === 'wide' ? 56 : 18;
  const header = band === 'wide' ? 150 : 170;
  const cardWidth = Math.floor((width - margin * 2 - gap * (columns - 1)) / columns);
  const cardHeight = band === 'wide' ? 360 : 260;
  const rows = Math.ceil(selected.length / columns);
  const height = header + margin + rows * cardHeight + (rows - 1) * gap;
  const composites: sharp.OverlayOptions[] = [];
  const heading = Buffer.from(band === 'wide'
    ? `<svg width="${width}" height="${header}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f8fbff"/><text x="${margin}" y="54" font-family="Arial,sans-serif" font-size="30" font-weight="700" fill="#0b1736">디자인 방향을 골라주세요</text><text x="${margin}" y="88" font-family="Arial,sans-serif" font-size="17" fill="#526174">업종에 맞춰 고른 6가지입니다. 같은 내용이 구성과 분위기에 따라 달라집니다.</text><text x="${margin}" y="118" font-family="Arial,sans-serif" font-size="12" fill="#667085">실제 고객 입력 콘텐츠 · production SiteRenderer · 첫 선택 한 번</text></svg>`
    : `<svg width="${width}" height="${header}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f8fbff"/><text x="${margin}" y="48" font-family="Arial,sans-serif" font-size="23" font-weight="700" fill="#0b1736">디자인 방향을 골라주세요</text><text x="${margin}" y="84" font-family="Arial,sans-serif" font-size="13" fill="#526174">업종에 맞춰 고른 6가지입니다.</text><text x="${margin}" y="108" font-family="Arial,sans-serif" font-size="13" fill="#526174">같은 내용이 구성과 분위기에 따라 달라집니다.</text><text x="${margin}" y="142" font-family="Arial,sans-serif" font-size="11" fill="#667085">실제 고객 입력 · production SiteRenderer · 첫 선택</text></svg>`);
  composites.push({ input: heading, left: 0, top: 0 });
  for (const [index, record] of selected.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = margin + column * (cardWidth + gap);
    const top = header + row * (cardHeight + gap);
    const preview = await sharp(record.screenshot)
      .resize({
        width: cardWidth,
        height: cardHeight - 54,
        fit: 'cover',
        position: 'top',
      })
      .png()
      .toBuffer();
    const label = Buffer.from(
      `<svg width="${cardWidth}" height="54" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#ffffff"/><text x="14" y="23" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#0b1736">${record.templateName}</text><text x="14" y="42" font-family="Arial,sans-serif" font-size="10" fill="#667085">${record.dnaId} · ${record.signatureId}</text></svg>`,
    );
    composites.push(
      { input: preview, left, top },
      { input: label, left, top: top + cardHeight - 54 },
    );
  }
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: '#f8fbff',
    },
  }).composite(composites).png().toFile(output);
}

async function sha256(value: string) {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(value).digest('hex');
}

async function main() {
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(path.join(OUTPUT_DIR, 'screenshots'), { recursive: true });
  const rendered = NAMED_TEMPLATE_CATALOG.map((template) => {
    const config = configFor(template);
    return {
      template,
      config,
      html: {
        wide: documentFor(config, 'desktop'),
        compact: documentFor(config, 'mobile'),
        mobile: documentFor(config, 'mobile'),
      },
    };
  });
  for (const item of rendered) {
    for (const viewport of VIEWPORTS) {
      await writeFile(
        path.join(OUTPUT_DIR, `${item.template.id}-${viewport.band}.html`),
        item.html[viewport.band],
      );
    }
  }

  const server = await startServer();
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
    ],
  });
  const records: CaptureRecord[] = [];
  try {
    for (const item of rendered) {
      for (const viewport of VIEWPORTS) {
        const page = await browser.newPage();
        const consoleErrors: string[] = [];
        page.on('console', (message) => {
          if (message.type() === 'error') consoleErrors.push(message.text());
        });
        page.on('pageerror', (error) => consoleErrors.push(
          error instanceof Error ? error.message : String(error),
        ));
        await page.setRequestInterception(true);
        page.on('request', (request) => {
          const url = new URL(request.url());
          if (url.hostname === '127.0.0.1') request.continue();
          else request.abort();
        });
        await page.emulateMediaFeatures([
          { name: 'prefers-reduced-motion', value: 'reduce' },
        ]);
        await page.setViewport({
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: 1,
          isMobile: viewport.band === 'mobile',
        });
        await page.goto(
          `http://127.0.0.1:${PORT}/review/${item.template.id}-${viewport.band}.html`,
          { waitUntil: 'networkidle0' },
        );
        const metrics = await settledMetrics(page);
        const screenshot = path.join(
          OUTPUT_DIR,
          'screenshots',
          `${item.template.id}-${viewport.width}.png`,
        );
        await page.screenshot({ path: screenshot, fullPage: true });
        const imageContrastMeasurements = await measureImageTextContrast(
          page,
          metrics.imageContrastForegrounds,
        );
        const pageSectionIds = item.config.pages.flatMap((sitePage) =>
          sitePage.sections.map((section) => section.id));
        const record: CaptureRecord = {
          templateId: item.template.id,
          templateName: item.template.name,
          dnaId: item.template.recipe.designDna.dnaId,
          signatureId: item.template.recipe.motionSignatureId,
          band: viewport.band,
          screenshot,
          viewport: { width: viewport.width, height: viewport.height },
          pageHeight: metrics.pageHeight,
          horizontalOverflow: metrics.horizontalOverflow,
          cls: metrics.cls,
          consoleErrors: [...consoleErrors, ...metrics.errors],
          heroForegroundCount: metrics.heroForegroundCount,
          heroForegroundOverlaps: metrics.heroForegroundOverlaps,
          buttonNowrapViolations: metrics.buttonNowrapViolations,
          imageContrastMeasurements,
          fontPairingId: item.config.theme.fontPairing?.id ?? null,
          fontSelectionPolicy: item.config.theme.fontPairing?.selectionPolicy ?? null,
          sectionIds: pageSectionIds,
          configSha: await sha256(JSON.stringify(item.config)),
          htmlSha: await sha256(item.html[viewport.band]),
        };
        if (record.horizontalOverflow !== 0) {
          throw new Error(`${item.template.id}/${viewport.band}: horizontal overflow ${record.horizontalOverflow}`);
        }
        if (record.cls !== 0) {
          throw new Error(`${item.template.id}/${viewport.band}: CLS ${record.cls}`);
        }
        if (record.consoleErrors.length) {
          throw new Error(`${item.template.id}/${viewport.band}: ${record.consoleErrors.join(' | ')}`);
        }
        if (record.heroForegroundCount < 5) {
          throw new Error(`${item.template.id}/${viewport.band}: incomplete hero foreground ${record.heroForegroundCount}`);
        }
        if (record.heroForegroundOverlaps.length > 0) {
          throw new Error(
            `${item.template.id}/${viewport.band}: hero foreground overlap ${record.heroForegroundOverlaps.join(' | ')}`,
          );
        }
        if (record.buttonNowrapViolations.length > 0) {
          throw new Error(
            `${item.template.id}/${viewport.band}: button nowrap ${record.buttonNowrapViolations.join(' | ')}`,
          );
        }
        const contrastFailures = record.imageContrastMeasurements.filter(
          (measurement) => measurement.ratio + 0.01 < measurement.required,
        );
        if (contrastFailures.length > 0) {
          throw new Error(
            `${item.template.id}/${viewport.band}: image text contrast ${JSON.stringify(contrastFailures)}`,
          );
        }
        if (!record.fontPairingId || record.fontSelectionPolicy !== 'modern-sans-v1') {
          throw new Error(
            `${item.template.id}/${viewport.band}: modern font policy was not rendered`,
          );
        }
        records.push(record);
        await page.close();
      }
    }
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) => server.close((error) => (
      error ? reject(error) : resolve()
    )));
  }

  await makeContactSheet(
    records,
    'wide',
    path.join(OUTPUT_DIR, 'gallery-sheet-1440.png'),
  );
  // Do not compress 24 full pages into a short mobile sheet: that composite can
  // manufacture optical overlaps. The 24 settled full-page captures are the gate.
  await makeRecommendationSheet(
    records,
    'wide',
    path.join(OUTPUT_DIR, 'recommendations-1440.png'),
  );
  await makeRecommendationSheet(
    records,
    'mobile',
    path.join(OUTPUT_DIR, 'recommendations-390.png'),
  );
  await writeFile(
    path.join(OUTPUT_DIR, 'hero-foreground-overlap.log'),
    `${records.map((record) => (
      `${record.templateId}\t${record.band}\titems=${record.heroForegroundCount}\toverlaps=${record.heroForegroundOverlaps.length}`
    )).join('\n')}\n`,
  );
  await writeFile(
    path.join(OUTPUT_DIR, 'manifest.json'),
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      catalogCount: NAMED_TEMPLATE_CATALOG.length,
      captureCount: records.length,
      viewports: VIEWPORTS,
      records,
    }, null, 2)}\n`,
  );
  process.stdout.write(
    `TPL review: ${records.length} captures, modern fonts ready, hero foreground overlaps 0, image text AA pass, button nowrap pass, overflow 0, CLS 0, console errors 0\n`,
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
