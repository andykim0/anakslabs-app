/** CONTENT owner-review: deterministic SiteRenderer fixtures and full-page browser captures. */
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteRenderer } from '@/components/site-renderer';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { expandTokens, tokenSetToSiteTheme } from '@/lib/design/dna';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';

const MAIN_REVIEW = process.env.MAIN_REVIEW === '1';
const OUTPUT = MAIN_REVIEW
  ? '/private/tmp/daboim-main-storytelling-review'
  : '/private/tmp/daboim-content-depth-review';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function dataUrl(file: string, mime: string): Promise<string> {
  return `data:${mime};base64,${(await readFile(file)).toString('base64')}`;
}

function sectionPlan(): SurveyInput['sectionPlan'] {
  return [
    { type: 'hero', name: '첫 화면', brief: '', source: 'template', pageSlug: '' },
    { type: 'about', name: '소개', brief: '', source: 'template', pageSlug: 'about' },
    { type: 'features', name: '강점', brief: '', source: 'template', pageSlug: '' },
    { type: 'menu', name: '메뉴', brief: '', source: 'template', pageSlug: 'menu' },
    { type: 'gallery', name: '갤러리', brief: '', source: 'template', pageSlug: 'gallery' },
    { type: 'faq', name: '질문', brief: '', source: 'template', pageSlug: 'guide' },
    { type: 'contact', name: '문의', brief: '', source: 'template', pageSlug: 'contact' },
  ];
}

function survey(photos: string[]): SurveyInput {
  const photoRefs = photos.map((url, index) => ({ assetId: `review-photo-${index + 1}`, url }));
  return {
    businessName: '온담카페', purposeId: 'local_store', purpose: '음식점·로컬 매장', industry: '카페·디저트',
    region: '서울 성수동', tone: ['따뜻한', '차분한'], colorPreference: '브라운', referenceImageUrls: [],
    existingPresence: [{ kind: 'naver_place', url: 'https://map.naver.com/p/entry/place/ondam-review' }],
    sectionPlan: sectionPlan(),
    pagePlan: [
      { slug: '', title: '홈' }, { slug: 'about', title: '소개' }, { slug: 'menu', title: '메뉴' },
      { slug: 'gallery', title: '갤러리' }, { slug: 'guide', title: '안내' }, { slug: 'contact', title: '문의' },
    ],
    templateId: 'local_store.default',
    tagline: '계절의 맛을 담은 커피와 디저트를 소개합니다.',
    providedContent: '[소개]\n커피와 디저트를 천천히 즐기는 시간을 생각합니다.\n메뉴의 재료와 맛을 알기 쉽게 안내합니다.',
    highlights: ['제철 재료로 만든 디저트', '원두별 맛 안내', '예약 가능한 단체석'],
    contentItems: [
      { name: '온담 라테', price: '6,500', description: '고소한 풍미를 소개한 대표 라테' },
      { name: '제철 과일 타르트', price: '8,000', description: '계절 과일을 담은 디저트' },
      { name: '필터 커피', price: '7,000', description: '원두를 고를 수 있는 커피' },
      { name: '홍차', price: '6,000', description: '찻잎의 향을 살린 따뜻한 차' },
      { name: '쿠키', price: '3,500', description: '커피와 함께 고르는 구움과자' },
    ],
    storePhotoUrls: photos,
    storePhotoAssetRefs: photoRefs,
    generalAssetAttestationId: 'review-attestation',
    contentDepth: {
      version: 1,
      imports: [{
        url: 'https://customer.example.com', origin: 'customer_import',
        extractedAt: '2026-07-22T00:00:00.000Z', fields: ['description', 'phone', 'address', 'openingHours'],
      }],
      facts: [
        { key: 'phone', value: '02-123-4567', source: 'customer_import' },
        { key: 'openingHours', value: '화–일 10:00–20:00, 월요일 휴무', source: 'customer' },
        { key: 'address', value: '서울 성동구 연무장길 12, 2층', source: 'customer_import' },
        { key: 'directions', value: '성수역 3번 출구에서 도보 5분', source: 'customer' },
        { key: 'parking', value: '건물 주차 1시간 가능', source: 'customer' },
        { key: 'accessibility', value: '2층, 엘리베이터 있음', source: 'customer' },
        { key: 'reservation', value: '전화로 단체석 예약 가능', source: 'customer' },
        { key: 'paymentMethods', value: '카드·현금·지역화폐', source: 'customer' },
        { key: 'wifi', value: '손님용 와이파이 제공', source: 'customer' },
      ],
      faqAnswers: [
        { questionId: 'hours', answer: '화요일부터 일요일까지 오전 10시부터 오후 8시까지 엽니다.' },
        { questionId: 'parking', answer: '건물 주차장을 한 시간 이용할 수 있습니다.' },
        { questionId: 'reservation', answer: '단체석은 전화로 예약해 주세요.' },
        { questionId: 'wifi', answer: '손님용 와이파이와 창가 콘센트를 이용할 수 있습니다.' },
      ],
      ...(MAIN_REVIEW ? {
        mainStorytelling: {
          version: 1,
          brandStory: '온담은 커피를 서두르지 않고 즐길 수 있는 자리를 만들고 싶다는 마음을 담았습니다.',
          origin: '동네에서 오래 머물 수 있는 작은 공간을 직접 꾸리고 싶어 시작했습니다.',
          philosophy: '메뉴를 고르는 순간부터 자리를 나설 때까지 편안한 결을 지키고 싶습니다.',
        },
      } : {}),
    },
  };
}

function textLength(config: SiteConfig, pageSlug?: string): number {
  const pages = pageSlug === undefined ? config.pages : config.pages.filter((page) => page.slug === pageSlug);
  return pages.flatMap((page) => page.sections)
    .flatMap((section) => section.elements)
    .flatMap((element) => element.kind === 'text' ? [element.text] : element.kind === 'button' ? [element.label] : [])
    .join('').replace(/\s/gu, '').length;
}

function document(config: SiteConfig, mode: 'desktop' | 'mobile', pageSlug = ''): string {
  const markup = renderToStaticMarkup(createElement(SiteRenderer, {
    config, pageSlug, mode, interactive: false, animate: false, runtimeDelivery: 'client',
  })).replace(/<link[^>]*>/gu, '');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;overflow-x:hidden;background:${config.theme.palette.background}}</style></head><body>${markup}</body></html>`;
}

class Cdp {
  private socket: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }>();
  constructor(url: string) { this.socket = new WebSocket(url); }
  async open(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.socket.addEventListener('open', () => resolve(), { once: true });
      this.socket.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: Record<string, unknown>; error?: { message: string } };
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result ?? {});
    });
  }
  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  close(): void { this.socket.close(); }
}

async function waitForFile(file: string): Promise<string> {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try {
      const value = await readFile(file, 'utf8');
      if (value.trim()) return value;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${file}`);
}

async function capture(html: string, output: string, width: number, height: number): Promise<{ width: number; height: number }> {
  const profile = path.join(OUTPUT, `.chrome-${path.basename(output, '.png')}-${process.pid}`);
  await rm(profile, { recursive: true, force: true });
  await mkdir(profile, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-component-update', '--disable-default-apps', '--disable-sync', '--disable-extensions',
    '--hide-scrollbars', '--mute-audio', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const portData = await waitForFile(path.join(profile, 'DevToolsActivePort'));
  const [port, browserPath] = portData.trim().split('\n');
  const cdp = new Cdp(`ws://127.0.0.1:${port}${browserPath}`);
  await cdp.open();
  const target = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const attached = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const sessionId = String(attached.sessionId);
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: width < 768, screenWidth: width, screenHeight: height,
  }, sessionId);
  await cdp.send('Page.navigate', { url: pathToFileURL(html).href }, sessionId);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await cdp.send('Runtime.evaluate', {
    expression: `new Promise(async(resolve)=>{const max=Math.max(0,document.documentElement.scrollHeight-innerHeight);for(let i=0;i<=12;i+=1){scrollTo(0,max*i/12);await new Promise(r=>setTimeout(r,90))}scrollTo(0,0);setTimeout(resolve,250)})`,
    awaitPromise: true,
  }, sessionId);
  const metrics = await cdp.send('Page.getLayoutMetrics', {}, sessionId) as {
    cssContentSize: { width: number; height: number };
  };
  const captureWidth = Math.ceil(metrics.cssContentSize.width);
  const captureHeight = Math.ceil(metrics.cssContentSize.height);
  const screenshot = await cdp.send('Page.captureScreenshot', {
    format: 'png', fromSurface: true, captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: captureWidth, height: captureHeight, scale: 1 },
  }, sessionId) as { data: string };
  await writeFile(output, Buffer.from(screenshot.data, 'base64'));
  cdp.close();
  chrome.kill('SIGTERM');
  return { width: captureWidth, height: captureHeight };
}

async function main(): Promise<void> {
  await rm(OUTPUT, { recursive: true, force: true });
  await mkdir(path.join(OUTPUT, 'fixtures'), { recursive: true });
  await mkdir(path.join(OUTPUT, 'screenshots'), { recursive: true });
  const hero = await dataUrl('public/mock/candidate-light.svg', 'image/svg+xml');
  const photos = await Promise.all([
    'public/cases/demos/woldam/still-1.webp', 'public/cases/demos/woldam/still-2.webp',
    'public/cases/demos/yeobaek-workshop/still-1.webp', 'public/cases/demos/yeobaek-workshop/still-2.webp',
  ].map((file) => dataUrl(file, 'image/webp')));
  const input = survey(photos);
  const candidate: DesignCandidate = {
    id: 'content-review', label: '콘텐츠 심화', style: 'photo', heroImageUrl: hero,
    theme: tokenSetToSiteTheme(expandTokens('cafe-warm-editorial', 44)), description: '',
  };
  const after = buildSiteConfigFromSurvey(input, candidate, { heroImageUrl: hero, imagePool: [] });
  const contentDepthBeforeInput = structuredClone(input);
  if (contentDepthBeforeInput.contentDepth) delete contentDepthBeforeInput.contentDepth.mainStorytelling;
  const contentDepthBefore = buildSiteConfigFromSurvey(
    contentDepthBeforeInput,
    candidate,
    { heroImageUrl: hero, imagePool: [] },
  );
  const beforeInput = structuredClone(input);
  delete beforeInput.contentDepth;
  beforeInput.pagePlan = undefined;
  beforeInput.sectionPlan = [
    { type: 'hero', name: '첫 화면', brief: '', source: 'template', pageSlug: '' },
    { type: 'menu', name: '메뉴', brief: '', source: 'template', pageSlug: '' },
    { type: 'contact', name: '문의', brief: '', source: 'template', pageSlug: '' },
  ];
  const before = buildSiteConfigFromSurvey(beforeInput, candidate, { heroImageUrl: hero, imagePool: photos });
  const jobs = MAIN_REVIEW ? [
    { id: 'main-after-1440', config: after, pageSlug: '', mode: 'desktop' as const, width: 1440, height: 900 },
    { id: 'main-after-390', config: after, pageSlug: '', mode: 'mobile' as const, width: 390, height: 844 },
    { id: 'menu-1440', config: after, pageSlug: 'menu', mode: 'desktop' as const, width: 1440, height: 900 },
    { id: 'gallery-1440', config: after, pageSlug: 'gallery', mode: 'desktop' as const, width: 1440, height: 900 },
    { id: 'faq-1440', config: after, pageSlug: 'faq', mode: 'desktop' as const, width: 1440, height: 900 },
    { id: 'directions-1440', config: after, pageSlug: 'directions', mode: 'desktop' as const, width: 1440, height: 900 },
    { id: 'main-before-1440', config: contentDepthBefore, pageSlug: '', mode: 'desktop' as const, width: 1440, height: 900 },
  ] : [
    { id: 'after-1440', config: after, pageSlug: '', mode: 'desktop' as const, width: 1440, height: 900 },
    { id: 'after-390', config: after, pageSlug: '', mode: 'mobile' as const, width: 390, height: 844 },
    { id: 'before-1440', config: before, pageSlug: '', mode: 'desktop' as const, width: 1440, height: 900 },
  ];
  const screenshots = [];
  for (const job of jobs) {
    const html = path.join(OUTPUT, 'fixtures', `${job.id}.html`);
    const png = path.join(OUTPUT, 'screenshots', `${job.id}-full.png`);
    await writeFile(html, document(job.config, job.mode, job.pageSlug), 'utf8');
    screenshots.push({ id: job.id, file: png, ...(await capture(html, png, job.width, job.height)), bytes: (await stat(png)).size });
  }
  const reviewBefore = MAIN_REVIEW ? contentDepthBefore : before;
  const beforeLength = textLength(reviewBefore, '');
  const afterLength = textLength(after, '');
  const afterSiteLength = textLength(after);
  await writeFile(path.join(OUTPUT, 'manifest.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), generatedAssetCalls: 0,
    reviewMode: MAIN_REVIEW ? 'main-storytelling' : 'content-depth',
    reusedAssets: ['public/mock/candidate-light.svg', 'public/cases/demos/*/still-{1,2}.webp'],
    pages: after.pages.map((page) => ({
      slug: page.slug,
      sectionIds: page.sections.map((section) => section.id),
      indexedText: textLength(after, page.slug),
    })),
    indexedText: {
      beforeHome: beforeLength,
      beforeSite: textLength(reviewBefore),
      afterHome: afterLength,
      afterSite: afterSiteLength,
      homeRatio: afterLength / beforeLength,
    },
    screenshots,
  }, null, 2), 'utf8');
  process.stdout.write(`${MAIN_REVIEW ? 'MAIN' : 'CONTENT'} review -> ${OUTPUT}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
