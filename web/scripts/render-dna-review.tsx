/**
 * DNA3 owner review artifacts. No generated assets or provider calls:
 * the production SiteRenderer reuses one existing repository preview image.
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/render-dna-review.tsx
 * Out: /private/tmp/anakslabs-dna3-review
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteRenderer } from '@/components/site-renderer';
import { buildCandidateBlueprints } from '@/lib/data/design-candidates';
import {
  pagePlanFromTemplate,
  planFromTemplate,
  resolveTemplate,
} from '@/lib/data/site-blueprints';
import {
  DESIGN_DNA_CATALOG,
  deterministicDnaSelections,
  expandTokens,
  tokenSetToSiteTheme,
  type DesignDNA,
  type DesignDnaSelection,
} from '@/lib/design/dna';
import { buildCandidatePreviewConfig } from '@/lib/onboarding/candidate-preview';
import type {
  DesignCandidate,
  SitePurposeId,
  SurveyInput,
} from '@/lib/types/domain';

const OUTPUT_DIR = '/private/tmp/anakslabs-dna3-review';
const BEFORE_DIR = process.env.DNA_REVIEW_BEFORE_DIR ?? '/private/tmp/anakslabs-dna3-before';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HERO_SOURCE = path.resolve('public/mock/candidate-light.svg');
const HUES = [24, 216] as const;

interface ReviewSeed {
  purposeId: SitePurposeId;
  purpose: string;
  industry: string;
  businessName: string;
  tagline: string;
  tone: string[];
}

const SEEDS: Record<DesignDNA['id'], ReviewSeed> = {
  'cafe-warm-editorial': {
    purposeId: 'local_store', purpose: '음식점·로컬 매장', industry: '카페',
    businessName: '모과 커피', tagline: '천천히 내린 한 잔과 오늘의 디저트', tone: ['따뜻한', '차분한'],
  },
  'dining-refined-contrast': {
    purposeId: 'local_store', purpose: '음식점·로컬 매장', industry: '파인다이닝',
    businessName: '정찬 여운', tagline: '계절의 흐름을 한 접시에 담습니다', tone: ['고급스러운', '절제된'],
  },
  'beauty-soft-wellness': {
    purposeId: 'booking_service', purpose: '예약·서비스업', industry: '헤어 살롱',
    businessName: '온결 살롱', tagline: '나에게 맞는 결을 찾는 예약제 살롱', tone: ['부드러운', '여유로운'],
  },
  'medical-clinical-clarity': {
    purposeId: 'booking_service', purpose: '예약·서비스업', industry: '의원',
    businessName: '바른봄 의원', tagline: '진료 안내를 쉽고 분명하게 전합니다', tone: ['신뢰감 있는', '명료한'],
  },
  'legal-authoritative-editorial': {
    purposeId: 'company_brand', purpose: '회사·브랜드', industry: '법률 사무소',
    businessName: '해온 법률사무소', tagline: '복잡한 절차를 차분하게 설명합니다', tone: ['신뢰감 있는', '차분한'],
  },
  'workshop-tactile-heritage': {
    purposeId: 'portfolio', purpose: '포트폴리오', industry: '도예 공방',
    businessName: '여백 공방', tagline: '흙의 시간과 손의 결을 기록합니다', tone: ['자연스러운', '정갈한'],
  },
  'academy-structured-friendly': {
    purposeId: 'edu_membership', purpose: '학원·교육', industry: '영어 학원',
    businessName: '한걸음 영어', tagline: '배운 만큼 보이는 단계별 수업', tone: ['친근한', '명료한'],
  },
  'retail-bold-geometric': {
    purposeId: 'company_brand', purpose: '회사·브랜드', industry: '리테일 브랜드',
    businessName: '오브젝트 마켓', tagline: '매일 쓰는 물건을 선명하게 고릅니다', tone: ['대담한', '모던한'],
  },
};

function surveyFor(seed: ReviewSeed): SurveyInput {
  const template = resolveTemplate(seed.purposeId, seed.industry);
  return {
    businessName: seed.businessName,
    purposeId: seed.purposeId,
    purpose: seed.purpose,
    industry: seed.industry,
    tagline: seed.tagline,
    region: '서울',
    tone: [...seed.tone],
    colorPreference: '시스템 추천',
    referenceImageUrls: [],
    sectionPlan: planFromTemplate(template),
    pagePlan: pagePlanFromTemplate(template),
    templateId: template.id,
    imageStyle: 'photo',
  } as SurveyInput;
}

async function heroDataUrl(): Promise<string> {
  const source = await readFile(HERO_SOURCE);
  return `data:image/svg+xml;base64,${source.toString('base64')}`;
}

function candidateWithSelection(
  survey: SurveyInput,
  selection: DesignDnaSelection,
  heroImageUrl: string,
): DesignCandidate {
  const legacy = buildCandidateBlueprints(survey)[0];
  if (!legacy) throw new Error(`Legacy candidate missing for ${survey.industry}`);
  return {
    ...legacy,
    label: DESIGN_DNA_CATALOG.find((dna) => dna.id === selection.dnaId)?.description ?? selection.dnaId,
    heroImageUrl,
    theme: tokenSetToSiteTheme(expandTokens(selection.dnaId, selection.hueSeed, selection.overrides)),
    designDna: { ...selection, overrides: { ...selection.overrides } },
  };
}

function rendererDocument(
  config: ReturnType<typeof buildCandidatePreviewConfig>,
  mode: 'desktop' | 'mobile' = 'mobile',
  width = 390,
  includeAudit = false,
): string {
  const renderedMarkup = renderToStaticMarkup(createElement(SiteRenderer, {
    config,
    mode,
    runtimeDelivery: 'client',
  }));
  // DOM audit must be deterministic and offline; font links are irrelevant to overflow/CLS geometry.
  const markup = includeAudit ? renderedMarkup.replace(/<link[^>]*>/gu, '') : renderedMarkup;
  const auditHead = includeAudit
    ? `<script>window.__dnaCls=0;new PerformanceObserver(function(list){list.getEntries().forEach(function(entry){if(!entry.hadRecentInput)window.__dnaCls+=entry.value})}).observe({type:'layout-shift',buffered:true})</script>`
    : '';
  const auditBody = includeAudit
    ? `<script>setTimeout(function(){var root=document.documentElement;root.dataset.auditOverflow=String(root.scrollWidth>root.clientWidth);root.dataset.auditCls=String(window.__dnaCls||0)},1200)</script>`
    : '';
  const overflow = includeAudit ? 'overflow-x:hidden' : 'overflow:hidden';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=${width},initial-scale=1">${auditHead}<style>html,body{margin:0;width:${width}px;background:${config.theme.palette.background};${overflow}}body{min-height:620px}</style></head><body>${markup}${auditBody}</body></html>`;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function sheetDocument(input: {
  title: string;
  subtitle: string;
  columns: number;
  cards: Array<{ label: string; note: string; file: string }>;
}): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;background:#eef2f8;color:#0b1736;font-family:Arial,"Noto Sans KR",sans-serif}
body{padding:34px}.head{margin:0 0 26px}.head h1{margin:0;font-size:30px}.head p{margin:8px 0 0;color:#52617a;font-size:15px}
.grid{display:grid;grid-template-columns:repeat(${input.columns},390px);gap:22px;align-items:start}
.card{width:390px;overflow:hidden;border:1px solid #d7deea;border-radius:18px;background:#fff;box-shadow:0 10px 28px rgba(11,23,54,.08)}
.meta{height:78px;padding:14px 16px;border-bottom:1px solid #e7ebf2}.meta strong{display:block;font-size:14px;line-height:1.35}.meta span{display:block;margin-top:5px;color:#667085;font-size:11px;line-height:1.35}
iframe{display:block;width:390px;height:590px;border:0;background:#fff}
</style></head><body><header class="head"><h1>${escapeHtml(input.title)}</h1><p>${escapeHtml(input.subtitle)}</p></header><main class="grid">${input.cards.map((card) => `<article class="card"><div class="meta"><strong>${escapeHtml(card.label)}</strong><span>${escapeHtml(card.note)}</span></div><iframe title="${escapeHtml(card.label)}" src="${escapeHtml(card.file)}"></iframe></article>`).join('')}</main></body></html>`;
}

function beforeAfterDocument(): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;background:#eef2f8;color:#0b1736;font-family:Arial,"Noto Sans KR",sans-serif}
body{padding:32px}.head{margin:0 0 22px}.head h1{margin:0;font-size:30px}.head p{margin:8px 0 0;color:#52617a;font-size:15px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.panel{overflow:hidden;border:1px solid #d7deea;border-radius:20px;background:#fff;box-shadow:0 10px 28px rgba(11,23,54,.08)}
.panel h2{margin:0;padding:15px 18px;border-bottom:1px solid #e7ebf2;font-size:18px}.panel img{display:block;width:100%;height:auto}
</style></head><body><header class="head"><h1>DNA3 · 토큰 소비 전/후</h1><p>같은 8프리셋·같은 hue·같은 콘텐츠·같은 자산입니다.</p></header><main class="grid"><section class="panel"><h2>Before · DNA2 legacy SiteTheme projection</h2><img src="screenshots/before-dna2-catalog.png" alt="DNA2 토큰 소비 전"></section><section class="panel"><h2>After · DNA3 renderer token consumption</h2><img src="screenshots/dna-catalog-8x2-390.png" alt="DNA3 토큰 소비 후"></section></main></body></html>`;
}

async function runChrome(
  htmlFile: string,
  outputFile: string,
  size: { width: number; height: number },
  options: { offline?: boolean } = {},
): Promise<void> {
  const profile = path.join(OUTPUT_DIR, `.chrome-${process.pid}-${path.basename(outputFile, '.png')}`);
  await mkdir(profile, { recursive: true });
  await rm(outputFile, { force: true });
  const args = [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-component-update', '--disable-default-apps', '--disable-sync', '--disable-extensions',
    '--hide-scrollbars', '--mute-audio', '--force-device-scale-factor=1', '--allow-file-access-from-files',
    '--run-all-compositor-stages-before-draw', '--virtual-time-budget=3500',
    ...(options.offline
      ? [
          '--disable-gpu',
          '--force-prefers-reduced-motion',
          '--host-resolver-rules=MAP fonts.googleapis.com 0.0.0.0, MAP fonts.gstatic.com 0.0.0.0',
        ]
      : []),
    `--user-data-dir=${profile}`, `--window-size=${size.width},${size.height}`,
    `--screenshot=${outputFile}`, pathToFileURL(htmlFile).href,
  ];
  const chrome = spawn(CHROME, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  chrome.stderr.on('data', (chunk) => { stderr += String(chunk); });
  const exit = new Promise<number | null>((resolve, reject) => {
    chrome.once('error', reject);
    chrome.once('exit', resolve);
  });
  let captured = false;
  for (let attempt = 0; attempt < 600; attempt += 1) {
    try {
      const output = await stat(outputFile);
      if (output.size > 0) {
        captured = true;
        break;
      }
    } catch {}
    if (chrome.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!captured) {
    chrome.kill('SIGTERM');
    const code = await exit;
    throw new Error(`Chrome screenshot failed (${code}): ${stderr.slice(-2_000)}`);
  }
  // Chrome 150 can keep the browser process alive after --screenshot has flushed the file.
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (chrome.exitCode === null) chrome.kill('SIGTERM');
  await exit;
}

async function runChromeDump(htmlFile: string, size: { width: number; height: number }): Promise<string> {
  const profile = path.join(OUTPUT_DIR, `.chrome-dump-${process.pid}-${path.basename(htmlFile, '.html')}`);
  await mkdir(profile, { recursive: true });
  const args = [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-component-update', '--disable-default-apps', '--disable-sync', '--disable-extensions',
    '--mute-audio', '--force-device-scale-factor=1', '--allow-file-access-from-files',
    '--run-all-compositor-stages-before-draw', '--virtual-time-budget=2500', '--dump-dom',
    `--user-data-dir=${profile}`, `--window-size=${size.width},${size.height}`,
    pathToFileURL(htmlFile).href,
  ];
  const chrome = spawn(CHROME, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  chrome.stdout.on('data', (chunk) => { stdout += String(chunk); });
  chrome.stderr.on('data', (chunk) => { stderr += String(chunk); });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    chrome.kill('SIGTERM');
  }, 8_000);
  const code = await new Promise<number | null>((resolve, reject) => {
    chrome.once('error', reject);
    chrome.once('exit', resolve);
  });
  clearTimeout(timeout);
  // Chrome 150 on macOS can leave its updater process alive after --dump-dom flushed stdout.
  if (timedOut && /data-audit-cls="[\d.]+"/u.test(stdout)) return stdout;
  if (timedOut) throw new Error(`Chrome DOM audit timed out before flush (${stdout.length} bytes): ${htmlFile}`);
  if (code !== 0) throw new Error(`Chrome DOM audit failed (${code}): ${stderr.slice(-2_000)}`);
  return stdout;
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

async function rasterDifference(before: string, after: string): Promise<{
  maxChannelDelta: number;
  meanChannelDelta: number;
  equivalent: boolean;
}> {
  const args = [
    '-hide_banner', '-v', 'info', '-i', before, '-i', after,
    '-lavfi', 'blend=all_mode=difference,signalstats,metadata=print',
    '-frames:v', '1', '-f', 'null', '-',
  ];
  const ffmpeg = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  ffmpeg.stderr.on('data', (chunk) => { stderr += String(chunk); });
  const code = await new Promise<number | null>((resolve, reject) => {
    ffmpeg.once('error', reject);
    ffmpeg.once('exit', resolve);
  });
  if (code !== 0) throw new Error(`ffmpeg raster diff failed (${code}): ${stderr.slice(-2_000)}`);
  const value = (key: string) => {
    const match = new RegExp(`lavfi\\.signalstats\\.${key}=([\\d.]+)`, 'u').exec(stderr);
    if (!match) throw new Error(`Missing ffmpeg ${key} for raster diff.`);
    return Number(match[1]);
  };
  const maxChannelDelta = Math.max(value('YMAX'), value('UMAX'), value('VMAX'));
  const meanChannelDelta = Number(((value('YAVG') + value('UAVG') + value('VAVG')) / 3).toFixed(6));
  // macOS CoreText can vary edge antialiasing across separate Chrome processes even for
  // byte-identical HTML. Keep the visual threshold below 8/255 max and 0.05/255 mean.
  return { maxChannelDelta, meanChannelDelta, equivalent: maxChannelDelta <= 8 && meanChannelDelta <= 0.05 };
}

async function main(): Promise<void> {
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(path.join(OUTPUT_DIR, 'fixtures'), { recursive: true });
  await mkdir(path.join(OUTPUT_DIR, 'screenshots'), { recursive: true });
  const heroImageUrl = await heroDataUrl();
  const presetCards: Array<{ label: string; note: string; file: string }> = [];

  for (const dna of DESIGN_DNA_CATALOG) {
    const survey = surveyFor(SEEDS[dna.id]);
    for (const hueSeed of HUES) {
      const selection: DesignDnaSelection = { catalogVersion: 1, dnaId: dna.id, hueSeed, overrides: {} };
      const candidate = candidateWithSelection(survey, selection, heroImageUrl);
      const config = buildCandidatePreviewConfig(survey, candidate, heroImageUrl);
      const fileName = `${dna.id}-${hueSeed}.html`;
      await writeFile(path.join(OUTPUT_DIR, 'fixtures', fileName), rendererDocument(config), 'utf8');
      presetCards.push({
        label: `${dna.id} · hue ${hueSeed}`,
        note: `${survey.industry} · ${dna.description}`,
        file: `fixtures/${fileName}`,
      });
    }
  }

  // Candidate acceptance gate: one customer's exact copy/media, three deterministic DNA families.
  const familySurvey = surveyFor(SEEDS['cafe-warm-editorial']);
  const familySelections = deterministicDnaSelections(familySurvey);
  const familyCards: Array<{ label: string; note: string; file: string }> = [];
  for (const [index, selection] of familySelections.entries()) {
    const candidate = candidateWithSelection(familySurvey, selection, heroImageUrl);
    const fileName = `family-${index + 1}-${selection.dnaId}.html`;
    await writeFile(
      path.join(OUTPUT_DIR, 'fixtures', fileName),
      rendererDocument(buildCandidatePreviewConfig(familySurvey, candidate, heroImageUrl)),
      'utf8',
    );
    familyCards.push({
      label: `후보 ${index + 1} · ${selection.dnaId}`,
      note: `같은 카페 콘텐츠·같은 이미지 · hue ${selection.hueSeed}`,
      file: `fixtures/${fileName}`,
    });
  }

  const comparisonCards: Array<{ label: string; note: string; file: string }> = [];
  const comparisonIds = [
    'cafe-warm-editorial',
    'medical-clinical-clarity',
    'retail-bold-geometric',
  ] as const;
  for (const dnaId of comparisonIds) {
    const survey = surveyFor(SEEDS[dnaId]);
    const legacy = buildCandidateBlueprints(survey)[0];
    if (!legacy) throw new Error(`Legacy comparison candidate missing for ${dnaId}`);
    const legacyCandidate: DesignCandidate = { ...legacy, heroImageUrl };
    const selection = deterministicDnaSelections(survey)[0];
    if (!selection) throw new Error(`DNA comparison candidate missing for ${dnaId}`);
    const dnaCandidate = candidateWithSelection(survey, selection, heroImageUrl);
    const pair = [
      { side: 'OFF · legacy', candidate: legacyCandidate, note: '기존 자유 테마 경로' },
      { side: 'ON · DNA', candidate: dnaCandidate, note: `${selection.dnaId} · hue ${selection.hueSeed}` },
    ] as const;
    for (const item of pair) {
      const fileName = `comparison-${dnaId}-${item.side.startsWith('OFF') ? 'off' : 'on'}.html`;
      const config = buildCandidatePreviewConfig(survey, item.candidate, heroImageUrl);
      await writeFile(path.join(OUTPUT_DIR, 'fixtures', fileName), rendererDocument(config), 'utf8');
      comparisonCards.push({
        label: `${survey.industry} · ${item.side}`,
        note: item.note,
        file: `fixtures/${fileName}`,
      });
    }
  }

  const catalogHtml = path.join(OUTPUT_DIR, 'dna-catalog-sheet.html');
  const comparisonHtml = path.join(OUTPUT_DIR, 'off-on-comparison.html');
  const familyHtml = path.join(OUTPUT_DIR, 'three-family-comparison.html');
  await writeFile(catalogHtml, sheetDocument({
    title: 'DNA3 · 8프리셋 × hue 2종 실렌더 대조표',
    subtitle: '각 카드는 production SiteRenderer의 390px 모바일 출력입니다. 기존 자산 하나를 고정해 테마만 비교합니다.',
    columns: 4,
    cards: presetCards,
  }), 'utf8');
  await writeFile(comparisonHtml, sheetDocument({
    title: 'DNA3 · 기존 OFF ↔ DNA ON 같은 입력 비교',
    subtitle: '카페·의료·리테일의 고객 콘텐츠와 이미지는 같고 선택 경로만 다릅니다.',
    columns: 2,
    cards: comparisonCards,
  }), 'utf8');
  await writeFile(familyHtml, sheetDocument({
    title: 'DNA3 · 같은 고객 콘텐츠, 다른 디자인 패밀리 3안',
    subtitle: '카피와 이미지는 고정하고 DNA id·hue만 바꾼 production SiteRenderer 후보입니다.',
    columns: 3,
    cards: familyCards,
  }), 'utf8');

  const catalogPng = path.join(OUTPUT_DIR, 'screenshots', 'dna-catalog-8x2-390.png');
  const comparisonPng = path.join(OUTPUT_DIR, 'screenshots', 'off-vs-on-3-pairs-390.png');
  const familyPng = path.join(OUTPUT_DIR, 'screenshots', 'same-content-three-families-390.png');
  await runChrome(catalogHtml, catalogPng, { width: 1740, height: 2860 });
  await runChrome(comparisonHtml, comparisonPng, { width: 900, height: 2200 });
  await runChrome(familyHtml, familyPng, { width: 1290, height: 800 });

  const legacyParity: Array<{
    id: string;
    htmlByteIdentical: boolean;
    pixelSha256Before: string;
    pixelSha256After: string;
    pixelFileIdentical: boolean;
    raster: Awaited<ReturnType<typeof rasterDifference>>;
  }> = [];
  for (const dnaId of comparisonIds) {
    const fileName = `comparison-${dnaId}-off.html`;
    const beforeHtml = path.join(BEFORE_DIR, 'fixtures', fileName);
    const afterHtml = path.join(OUTPUT_DIR, 'fixtures', fileName);
    const [beforeSource, afterSource] = await Promise.all([readFile(beforeHtml), readFile(afterHtml)]);
    const beforePng = path.join(OUTPUT_DIR, 'screenshots', `legacy-off-${dnaId}-before.png`);
    const afterPng = path.join(OUTPUT_DIR, 'screenshots', `legacy-off-${dnaId}-after.png`);
    await runChrome(beforeHtml, beforePng, { width: 390, height: 590 }, { offline: true });
    await runChrome(afterHtml, afterPng, { width: 390, height: 590 }, { offline: true });
    const [beforePixels, afterPixels] = await Promise.all([readFile(beforePng), readFile(afterPng)]);
    const beforeHash = sha256(beforePixels);
    const afterHash = sha256(afterPixels);
    const raster = await rasterDifference(beforePng, afterPng);
    legacyParity.push({
      id: dnaId,
      htmlByteIdentical: beforeSource.equals(afterSource),
      pixelSha256Before: beforeHash,
      pixelSha256After: afterHash,
      pixelFileIdentical: beforeHash === afterHash,
      raster,
    });
  }

  const viewportAudits: Array<{
    dnaId: string;
    width: number;
    mode: 'desktop' | 'mobile';
    overflow: boolean;
    cls: number;
    screenshot: string;
  }> = [];
  const auditViewports = [
    { width: 1440, height: 1000, mode: 'desktop' as const },
    { width: 768, height: 1000, mode: 'mobile' as const },
    { width: 390, height: 844, mode: 'mobile' as const },
  ];
  for (const dnaId of comparisonIds) {
    const survey = surveyFor(SEEDS[dnaId]);
    const selection = deterministicDnaSelections(survey)[0];
    if (!selection) throw new Error(`DNA audit candidate missing for ${dnaId}`);
    const config = buildCandidatePreviewConfig(
      survey,
      candidateWithSelection(survey, selection, heroImageUrl),
      heroImageUrl,
    );
    for (const viewport of auditViewports) {
      const fixture = path.join(OUTPUT_DIR, 'fixtures', `audit-${dnaId}-${viewport.width}.html`);
      const screenshot = path.join(OUTPUT_DIR, 'screenshots', `audit-${dnaId}-${viewport.width}.png`);
      await writeFile(fixture, rendererDocument(config, viewport.mode, viewport.width, true), 'utf8');
      await runChrome(fixture, screenshot, { width: viewport.width, height: viewport.height }, { offline: true });
      const dumped = await runChromeDump(fixture, { width: viewport.width, height: viewport.height });
      const overflow = /data-audit-overflow="true"/u.test(dumped);
      const clsMatch = /data-audit-cls="([\d.]+)"/u.exec(dumped);
      if (!clsMatch) throw new Error(`Browser audit did not settle: ${dnaId} ${viewport.width}`);
      viewportAudits.push({
        dnaId,
        width: viewport.width,
        mode: viewport.mode,
        overflow,
        cls: Number(clsMatch[1]),
        screenshot,
      });
    }
  }

  const beforeCatalog = path.join(OUTPUT_DIR, 'screenshots', 'before-dna2-catalog.png');
  await copyFile(path.join(BEFORE_DIR, 'screenshots', 'dna-catalog-8x2-390.png'), beforeCatalog);
  const beforeAfterHtml = path.join(OUTPUT_DIR, 'before-after.html');
  const beforeAfterPng = path.join(OUTPUT_DIR, 'screenshots', 'before-after-dna2-dna3.png');
  await writeFile(beforeAfterHtml, beforeAfterDocument(), 'utf8');
  await runChrome(beforeAfterHtml, beforeAfterPng, { width: 1840, height: 1580 });

  if (legacyParity.some((item) => (
    !item.htmlByteIdentical || !item.pixelFileIdentical || !item.raster.equivalent
  ))) {
    throw new Error('Legacy OFF renderer parity failed.');
  }
  if (viewportAudits.some((item) => item.overflow || item.cls !== 0)) {
    throw new Error('DNA viewport overflow/CLS audit failed.');
  }

  const [catalogStats, comparisonStats] = await Promise.all([stat(catalogPng), stat(comparisonPng)]);
  await writeFile(path.join(OUTPUT_DIR, 'manifest.json'), JSON.stringify({
    renderer: 'buildCandidatePreviewConfig -> SiteRenderer(mode=mobile, 390px)',
    generatedAssetCalls: 0,
    reusedAsset: path.relative(process.cwd(), HERO_SOURCE),
    catalog: { presets: DESIGN_DNA_CATALOG.length, hues: HUES, cards: presetCards.length, screenshot: catalogPng, bytes: catalogStats.size },
    comparison: { pairs: comparisonIds.length, cards: comparisonCards.length, screenshot: comparisonPng, bytes: comparisonStats.size },
    familyAcceptance: { cards: familyCards.length, screenshot: familyPng },
    beforeAfter: { baseline: BEFORE_DIR, screenshot: beforeAfterPng },
    legacyParity,
    viewportAudits,
  }, null, 2), 'utf8');
  process.stdout.write(`DNA review: ${presetCards.length} catalog cards + ${comparisonIds.length} OFF/ON pairs -> ${OUTPUT_DIR}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
