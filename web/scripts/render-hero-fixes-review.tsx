/**
 * FIXHERO owner review artifacts. Uses the production SiteRenderer and an existing
 * repository SVG only; no generated asset or provider call is made.
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/render-hero-fixes-review.tsx
 * Out: /private/tmp/anakslabs-hero-fixes-review
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
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
import { buildSiteConfigFromSurvey, type SectionCopy } from '@/lib/data/site-templates';
import { expandTokens, tokenSetToSiteTheme, type DesignDNA } from '@/lib/design/dna';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';

const OUTPUT_DIR = '/private/tmp/anakslabs-hero-fixes-review';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HERO_SOURCE = path.resolve('public/mock/candidate-light.svg');

interface ReviewCase {
  id: string;
  label: string;
  config: SiteConfig;
}

function survey(input: {
  industry: string;
  businessName: string;
  tagline: string;
  tone: string[];
  highlights?: string[];
}): SurveyInput {
  const template = resolveTemplate('local_store', input.industry);
  return {
    businessName: input.businessName,
    purposeId: 'local_store',
    purpose: '음식점·로컬 매장',
    industry: input.industry,
    tagline: input.tagline,
    region: '서울',
    tone: [...input.tone],
    colorPreference: '시스템 추천',
    referenceImageUrls: [],
    sectionPlan: planFromTemplate(template),
    pagePlan: pagePlanFromTemplate(template),
    templateId: template.id,
    imageStyle: 'photo',
    ...(input.highlights ? { highlights: [...input.highlights] } : {}),
  } as SurveyInput;
}

function dnaCandidate(
  input: SurveyInput,
  dnaId: DesignDNA['id'],
  hueSeed: number,
  heroImageUrl: string,
): DesignCandidate {
  const legacy = buildCandidateBlueprints(input)[0];
  if (!legacy) throw new Error(`Candidate missing for ${input.industry}`);
  return {
    ...legacy,
    heroImageUrl,
    theme: tokenSetToSiteTheme(expandTokens(dnaId, hueSeed)),
    designDna: { catalogVersion: 1, dnaId, hueSeed, overrides: {} },
  };
}

function buildConfig(input: {
  survey: SurveyInput;
  dnaId: DesignDNA['id'];
  hueSeed: number;
  heroImageUrl: string;
  copy: SectionCopy;
  heroVariant: 'fullbleed' | 'centered' | 'split';
}): SiteConfig {
  return buildSiteConfigFromSurvey(
    input.survey,
    dnaCandidate(input.survey, input.dnaId, input.hueSeed, input.heroImageUrl),
    {
      heroImageUrl: input.heroImageUrl,
      imagePool: [input.heroImageUrl],
      heroVariant: input.heroVariant,
      copy: input.copy,
    },
  );
}

function emulatePriorSplitAlignment(config: SiteConfig): SiteConfig {
  const copy = structuredClone(config);
  const hero = copy.pages[0]?.sections.find((section) => section.type === 'hero');
  if (!hero) throw new Error('Hero section missing');
  for (const element of hero.elements) {
    if (element.kind === 'text' && !element.id.includes('chip-label') && !element.id.includes('hero-logo')) {
      element.style.align = 'right';
    }
  }
  return copy;
}

function documentFor(
  config: SiteConfig,
  mode: 'desktop' | 'mobile',
  width: number,
  audit = false,
): string {
  const rendered = renderToStaticMarkup(createElement(SiteRenderer, {
    config,
    mode,
    interactive: false,
    animate: false,
    runtimeDelivery: 'client',
  }));
  const markup = audit ? rendered.replace(/<link[^>]*>/gu, '') : rendered;
  const auditHead = audit
    ? `<script>window.__reviewCls=0;window.__reviewErrors=[];window.addEventListener('error',function(event){window.__reviewErrors.push(event.message)});new PerformanceObserver(function(list){list.getEntries().forEach(function(entry){if(!entry.hadRecentInput)window.__reviewCls+=entry.value})}).observe({type:'layout-shift',buffered:true})</script>`
    : '';
  const auditBody = audit
    ? `<script>setTimeout(function(){var root=document.documentElement;root.dataset.auditOverflow=String(root.scrollWidth>root.clientWidth);root.dataset.auditCls=String(window.__reviewCls||0);root.dataset.auditErrors=String(window.__reviewErrors.length)},1200)</script>`
    : '';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=${width},initial-scale=1">${auditHead}<style>html,body{margin:0;width:${width}px;overflow-x:hidden;background:${config.theme.palette.background}}body{min-height:844px}</style></head><body>${markup}${auditBody}</body></html>`;
}

async function runChrome(
  htmlFile: string,
  outputFile: string,
  size: { width: number; height: number },
  offline = false,
): Promise<void> {
  const profile = path.join(OUTPUT_DIR, `.chrome-${process.pid}-${path.basename(outputFile, '.png')}`);
  await mkdir(profile, { recursive: true });
  await rm(outputFile, { force: true });
  const args = [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-component-update', '--disable-default-apps', '--disable-sync', '--disable-extensions',
    '--hide-scrollbars', '--mute-audio', '--force-device-scale-factor=1', '--allow-file-access-from-files',
    '--run-all-compositor-stages-before-draw', '--virtual-time-budget=3500',
    ...(offline
      ? [
          '--disable-gpu', '--force-prefers-reduced-motion',
          '--host-resolver-rules=MAP fonts.googleapis.com 0.0.0.0, MAP fonts.gstatic.com 0.0.0.0',
        ]
      : []),
    `--user-data-dir=${profile}`,
    `--window-size=${size.width},${size.height}`,
    `--screenshot=${outputFile}`,
    pathToFileURL(htmlFile).href,
  ];
  const chrome = spawn(CHROME, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  chrome.stderr.on('data', (chunk) => { stderr += String(chunk); });
  const exit = new Promise<number | null>((resolve, reject) => {
    chrome.once('error', reject);
    chrome.once('exit', resolve);
  });
  let captured = false;
  for (let attempt = 0; attempt < 600; attempt += 1) {
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
    chrome.kill('SIGTERM');
    const code = await exit;
    throw new Error(`Chrome screenshot failed (${code}): ${stderr.slice(-2_000)}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (chrome.exitCode === null) chrome.kill('SIGTERM');
  await exit;
}

async function dumpChrome(htmlFile: string, size: { width: number; height: number }): Promise<string> {
  const profile = path.join(OUTPUT_DIR, `.chrome-dump-${process.pid}-${path.basename(htmlFile, '.html')}`);
  await mkdir(profile, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-component-update', '--disable-default-apps', '--disable-sync', '--disable-extensions',
    '--mute-audio', '--force-device-scale-factor=1', '--allow-file-access-from-files',
    '--run-all-compositor-stages-before-draw', '--virtual-time-budget=2500', '--dump-dom',
    `--user-data-dir=${profile}`, `--window-size=${size.width},${size.height}`,
    pathToFileURL(htmlFile).href,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
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
  if (timedOut && /data-audit-cls="[\d.]+"/u.test(stdout)) return stdout;
  if (timedOut) throw new Error(`Chrome audit timed out: ${htmlFile}`);
  if (code !== 0) throw new Error(`Chrome audit failed (${code}): ${stderr.slice(-2_000)}`);
  return stdout;
}

function heroFacts(config: SiteConfig): {
  chips: string[];
  titleAlign: string | undefined;
  subAlign: string | undefined;
} {
  const hero = config.pages[0]?.sections.find((section) => section.type === 'hero');
  if (!hero) throw new Error('Hero section missing');
  const texts = hero.elements.filter((element) => element.kind === 'text');
  return {
    chips: texts.filter((element) => element.id.includes('hero-chip-label')).map((element) => element.text),
    titleAlign: texts.find((element) => element.id.includes('hero-title'))?.style.align,
    subAlign: texts.find((element) => element.id.includes('hero-sub'))?.style.align,
  };
}

async function main(): Promise<void> {
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(path.join(OUTPUT_DIR, 'fixtures'), { recursive: true });
  await mkdir(path.join(OUTPUT_DIR, 'screenshots'), { recursive: true });
  const heroSource = await readFile(HERO_SOURCE);
  const heroImageUrl = `data:image/svg+xml;base64,${heroSource.toString('base64')}`;

  const cafeBase = {
    industry: '카페', businessName: '모과 커피', tagline: '천천히 내린 한 잔과 오늘의 디저트',
    tone: ['따뜻한', '차분한'],
  };
  const cafeCopy: SectionCopy = {
    heroKicker: '카페', heroTitle: '매일의 한 잔을\n차분하게 준비합니다',
    heroSub: '메뉴와 공간, 방문 전에 궁금한 내용을 한눈에 안내합니다.',
  };
  const noChips = buildConfig({
    survey: survey(cafeBase), dnaId: 'cafe-warm-editorial', hueSeed: 44,
    heroImageUrl, copy: cafeCopy, heroVariant: 'fullbleed',
  });
  const withChips = buildConfig({
    survey: survey({
      ...cafeBase,
      highlights: ['매일 직접 굽는 빵', '직접 로스팅한 커피', '편하게 머무는 자리'],
    }),
    dnaId: 'cafe-warm-editorial', hueSeed: 44,
    heroImageUrl, copy: cafeCopy, heroVariant: 'fullbleed',
  });

  const diningSurvey = survey({
    industry: '파인다이닝', businessName: '정찬 여운',
    tagline: '오늘 준비한 재료와 식사 순서를 차분하게 안내해 드립니다.',
    tone: ['고급스러운', '절제된'],
  });
  const diningShort = buildConfig({
    survey: diningSurvey, dnaId: 'dining-refined-contrast', hueSeed: 73,
    heroImageUrl, heroVariant: 'split',
    copy: {
      heroKicker: '파인다이닝', heroTitle: '계절의 흐름을\n한 접시에 담습니다',
      heroSub: '오늘 준비한 재료와 식사 순서를 차분하게 안내해 드립니다.',
    },
  });
  const diningLong = buildConfig({
    survey: diningSurvey, dnaId: 'dining-refined-contrast', hueSeed: 73,
    heroImageUrl, heroVariant: 'split',
    copy: {
      heroKicker: '파인다이닝',
      heroTitle: '계절의 흐름과 재료의 이야기를\n한 접시에 정성껏 담아\n오늘의 식사로 전합니다',
      heroSub: '오늘 준비한 재료와 식사 순서를 차분하게 안내해 드립니다.',
    },
  });

  const cases: ReviewCase[] = [
    { id: 'chips-none', label: '실제 highlights 없음', config: noChips },
    { id: 'chips-highlights', label: '실제 highlights 3개', config: withChips },
    { id: 'dining-short-before', label: 'dining 이전 · 서브카피 우측정렬', config: emulatePriorSplitAlignment(diningShort) },
    { id: 'dining-short-after', label: 'dining 현재 · 서브카피 좌정렬', config: diningShort },
    { id: 'dining-long-before', label: '긴 제목 이전 · 우측정렬', config: emulatePriorSplitAlignment(diningLong) },
    { id: 'dining-long-after', label: '긴 제목 현재 · 좌정렬', config: diningLong },
  ];
  for (const item of cases) {
    for (const viewport of [
      { width: 1440, height: 900, mode: 'desktop' as const },
      { width: 390, height: 844, mode: 'mobile' as const },
    ]) {
      const fixture = path.join(OUTPUT_DIR, 'fixtures', `${item.id}-${viewport.width}.html`);
      const screenshot = path.join(OUTPUT_DIR, 'screenshots', `${item.id}-${viewport.width}.png`);
      await writeFile(fixture, documentFor(item.config, viewport.mode, viewport.width), 'utf8');
      await runChrome(fixture, screenshot, viewport);
    }
  }

  const audits: Array<{
    caseId: string;
    width: number;
    overflow: boolean;
    cls: number;
    errors: number;
  }> = [];
  for (const item of [
    { id: 'chips-none', config: noChips },
    { id: 'chips-highlights', config: withChips },
    { id: 'dining-long-after', config: diningLong },
  ]) {
    for (const viewport of [
      { width: 1440, height: 900, mode: 'desktop' as const },
      { width: 768, height: 900, mode: 'mobile' as const },
      { width: 390, height: 844, mode: 'mobile' as const },
    ]) {
      const fixture = path.join(OUTPUT_DIR, 'fixtures', `audit-${item.id}-${viewport.width}.html`);
      const screenshot = path.join(OUTPUT_DIR, 'screenshots', `audit-${item.id}-${viewport.width}.png`);
      await writeFile(fixture, documentFor(item.config, viewport.mode, viewport.width, true), 'utf8');
      await runChrome(fixture, screenshot, viewport, true);
      const dumped = await dumpChrome(fixture, viewport);
      const clsMatch = /data-audit-cls="([\d.]+)"/u.exec(dumped);
      const errorsMatch = /data-audit-errors="(\d+)"/u.exec(dumped);
      if (!clsMatch || !errorsMatch) throw new Error(`Audit did not settle: ${item.id}/${viewport.width}`);
      audits.push({
        caseId: item.id,
        width: viewport.width,
        overflow: /data-audit-overflow="true"/u.test(dumped),
        cls: Number(clsMatch[1]),
        errors: Number(errorsMatch[1]),
      });
    }
  }

  if (audits.some((audit) => audit.overflow || audit.cls !== 0 || audit.errors !== 0)) {
    throw new Error('Hero viewport audit failed.');
  }
  const facts = {
    noChips: heroFacts(noChips),
    withChips: heroFacts(withChips),
    diningShort: heroFacts(diningShort),
    diningLong: heroFacts(diningLong),
  };
  if (facts.noChips.chips.length !== 0 || facts.withChips.chips.length !== 3) {
    throw new Error('Hero chip fact audit failed.');
  }
  if (facts.diningShort.subAlign === 'right' || facts.diningLong.titleAlign === 'right') {
    throw new Error('Hero readability alignment audit failed.');
  }
  await writeFile(path.join(OUTPUT_DIR, 'manifest.json'), JSON.stringify({
    renderer: 'buildSiteConfigFromSurvey -> SiteRenderer',
    generatedAssetCalls: 0,
    reusedAsset: path.relative(process.cwd(), HERO_SOURCE),
    cases: cases.map(({ id, label }) => ({ id, label })),
    facts,
    audits,
  }, null, 2), 'utf8');
  process.stdout.write(`FIXHERO review: ${cases.length} cases, ${audits.length} viewport audits -> ${OUTPUT_DIR}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
