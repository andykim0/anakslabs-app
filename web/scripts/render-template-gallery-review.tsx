/**
 * TPL owner-review evidence. Renders every named interior template through the
 * production SiteRenderer with customer-supplied content and checked-in media.
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/render-template-gallery-review.tsx
 * Out: /private/tmp/daboim-template-review
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
import {
  NAMED_TEMPLATE_CATALOG,
  resolveNamedTemplate,
} from '@/lib/design/templates';
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

const OUTPUT_DIR = '/private/tmp/daboim-template-review';
const PUBLIC_DIR = path.resolve('public');
const CHROME = process.env.CHROME_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.TEMPLATE_REVIEW_PORT ?? 4198);
const VIEWPORTS = [
  { band: 'wide', width: 1440, height: 900, mode: 'desktop' },
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
  band: 'wide' | 'mobile';
  screenshot: string;
  viewport: { width: number; height: number };
  pageHeight: number;
  horizontalOverflow: number;
  cls: number;
  consoleErrors: string[];
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
  return {
    id: `tpl-${template.id}`,
    label: template.name,
    style: imageDirectionToLegacyCandidateStyle(template.recipe.imageDirectionId),
    imageDirectionId: template.recipe.imageDirectionId,
    heroImageUrl: realPhoto ? projectPhotos[0] : template.previewImage,
    heroPresentation: realPhoto ? 'promoted_customer_photo' : 'system',
    theme: tokenSetToSiteTheme(expandTokens(
      resolved.designDna.dnaId,
      resolved.designDna.hueSeed,
      resolved.designDna.overrides,
    )),
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
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  return page.evaluate(() => ({
    pageHeight: document.documentElement.scrollHeight,
    horizontalOverflow: Math.max(
      0,
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
    cls: Number((window as typeof window & { __reviewCls?: number }).__reviewCls ?? 0),
    errors: [
      ...((window as typeof window & { __reviewErrors?: string[] }).__reviewErrors ?? []),
    ],
  }));
}

async function makeContactSheet(
  records: readonly CaptureRecord[],
  band: CaptureRecord['band'],
  output: string,
) {
  const selected = records.filter((record) => record.band === band);
  const columns = band === 'wide' ? 4 : 3;
  const tileWidth = band === 'wide' ? 330 : 250;
  const tileHeight = band === 'wide' ? 440 : 520;
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
  const width = band === 'wide' ? 1440 : 390;
  const columns = band === 'wide' ? 3 : 1;
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
  await makeContactSheet(
    records,
    'mobile',
    path.join(OUTPUT_DIR, 'gallery-sheet-390.png'),
  );
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
    `TPL review: ${records.length} captures, overflow 0, CLS 0, console errors 0\n`,
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
