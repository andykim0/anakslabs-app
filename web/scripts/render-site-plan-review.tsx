/** PLAN owner review: the approved SitePlan beside the production SiteRenderer output. */
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteRenderer } from '@/components/site-renderer';
import { buildSitePlan, type SitePlan } from '@/lib/content/site-plan';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { pagePlanFromTemplate, planFromTemplate, resolveTemplate } from '@/lib/data/site-blueprints';
import { expandTokens, tokenSetToSiteTheme } from '@/lib/design/dna';
import type { DesignCandidate, LivePurposeId, SurveyInput } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';

const OUTPUT = '/private/tmp/daboim-plan-contract-review';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

interface ReviewSeed {
  id: string;
  label: string;
  purposeId: LivePurposeId;
  industry: string;
  dnaId: Parameters<typeof expandTokens>[0];
  hue: number;
}

const SEEDS: readonly ReviewSeed[] = [
  { id: 'professional', label: '전문법인', purposeId: 'company_brand', industry: '법률 법인', dnaId: 'legal-authoritative-editorial', hue: 218 },
  { id: 'clinic', label: '의원', purposeId: 'booking_service', industry: '의원', dnaId: 'medical-clinical-clarity', hue: 188 },
  { id: 'fine-dining', label: '파인다이닝', purposeId: 'local_store', industry: '파인다이닝', dnaId: 'dining-refined-contrast', hue: 28 },
  { id: 'resume', label: '이력서', purposeId: 'portfolio', industry: '이력서 CV', dnaId: 'retail-bold-geometric', hue: 244 },
  { id: 'generic', label: '일반 회사', purposeId: 'company_brand', industry: '브랜드 컨설팅', dnaId: 'cafe-warm-editorial', hue: 44 },
];

async function dataUrl(file: string, mime: string): Promise<string> {
  return `data:${mime};base64,${(await readFile(file)).toString('base64')}`;
}

function reviewSurvey(seed: ReviewSeed, photos: string[]): SurveyInput {
  const template = resolveTemplate(seed.purposeId, seed.industry);
  const isClinic = seed.id === 'clinic';
  const isDining = seed.id === 'fine-dining';
  const items = isDining
    ? [
      { name: '계절 코스', price: '120,000', description: '사장님이 입력한 계절 코스 구성' },
      { name: '저녁 코스', price: '160,000', description: '사장님이 입력한 저녁 코스 구성' },
      { name: '논알코올 페어링', price: '45,000', description: '사장님이 입력한 페어링 안내' },
    ]
    : [
      { name: '고객 확인 서비스 A', description: '고객이 직접 입력한 서비스 설명' },
      { name: '고객 확인 서비스 B', description: '고객이 직접 입력한 두 번째 설명' },
      { name: '고객 확인 프로젝트', description: '고객이 공개를 확인한 프로젝트 내용' },
    ];
  const photoRefs = photos.map((url, index) => ({ assetId: `plan-review-${seed.id}-${index + 1}`, url }));
  return {
    businessName: `${seed.label} 계획`, purposeId: seed.purposeId, purpose: template.label,
    industry: seed.industry, region: '서울 고객 확인 지역', tone: ['차분한', '신뢰감 있는'],
    colorPreference: '고객 선택색', referenceImageUrls: [], templateId: template.id,
    sectionPlan: planFromTemplate(template), pagePlan: pagePlanFromTemplate(template),
    tagline: '고객이 직접 확인한 한 줄 소개입니다.',
    highlights: ['고객이 입력한 운영 기준', '고객이 입력한 대표 강점'],
    contentItems: items,
    existingPresence: [{ kind: 'instagram', url: 'https://www.instagram.com/customer-confirmed' }],
    storePhotoUrls: photos,
    storePhotoAssetRefs: photoRefs,
    generalAssetAttestationId: 'plan-review-customer-attestation',
    contentDepth: {
      version: 2,
      imports: [],
      facts: [
        { key: 'phone', value: '02-123-4567', source: 'customer' },
        { key: 'openingHours', value: '평일 10:00–18:00', source: 'customer' },
        { key: 'address', value: '서울 고객 확인 주소 2층', source: 'customer' },
        { key: 'directions', value: '고객이 입력한 역에서 도보 5분', source: 'customer' },
        { key: 'services', value: isClinic ? '고객이 입력한 진료과목' : '고객이 입력한 업무·서비스', source: 'customer' },
        { key: 'specialties', value: isClinic ? '고객이 입력한 실제 진료 분야' : '고객이 입력한 전문 분야', source: 'customer' },
        { key: 'credentials', value: '고객이 입력한 경력·자격', source: 'customer' },
        { key: 'caseStudies', value: '고객이 공개를 확인한 수행 사례', source: 'customer' },
      ],
      faqAnswers: [
        { questionId: 'hours', answer: '평일 오전 10시부터 오후 6시까지 운영합니다.' },
        { questionId: 'appointment', answer: '전화로 일정을 확인한 뒤 예약할 수 있습니다.' },
      ],
      mainStorytelling: {
        version: 1,
        brandStory: '사장님이 직접 전한 브랜드 이야기와 시작의 마음입니다.',
        origin: '고객이 직접 입력한 시작 계기입니다.',
        philosophy: '고객이 직접 입력한 운영 철학과 지향입니다.',
      },
    },
  };
}

function shell(title: string, body: string, background = '#f4f7fb'): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>html,body{margin:0;width:100%;background:${background};font-family:Arial,"Noto Sans KR",sans-serif}*{box-sizing:border-box}</style></head><body>${body}</body></html>`;
}

function planDocument(seed: ReviewSeed, plan: SitePlan): string {
  const body = renderToStaticMarkup(
    <main style={{ width: 1180, margin: '0 auto', padding: '64px 0 96px', color: '#0b1736' }}>
      <header style={{ marginBottom: 36 }}>
        <p style={{ margin: 0, color: '#174dda', fontWeight: 800, letterSpacing: 2 }}>승인 와이어프레임 · SITEPLAN V2</p>
        <h1 style={{ margin: '12px 0 8px', fontSize: 44 }}>{seed.label} · {plan.templateId}</h1>
        <p style={{ margin: 0, color: '#667085', fontSize: 18 }}>이 순서와 섹션 ID를 실제 생성기가 그대로 소비합니다.</p>
      </header>
      <div style={{ display: 'grid', gap: 24 }}>
        {plan.pages.map((page) => (
          <section key={page.slug} style={{ padding: 28, borderRadius: 24, background: '#fff', border: '1px solid #dce4f0', boxShadow: '0 16px 42px rgba(11,23,54,.07)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'baseline', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 26 }}>{page.title}</h2>
              <code style={{ color: '#174dda', fontSize: 15 }}>/{page.slug}</code>
            </div>
            <ol style={{ display: 'grid', gap: 12, listStyle: 'none', padding: 0, margin: 0 }}>
              {page.sections.map((section, index) => (
                <li key={section.id} style={{ display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: 18, alignItems: 'center', padding: 18, borderRadius: 16, background: section.mode === 'teaser' ? '#f1f6ff' : '#f8fafc', border: '1px solid #e2e8f2' }}>
                  <strong style={{ color: '#174dda' }}>{String(index + 1).padStart(2, '0')}</strong>
                  <span><strong style={{ display: 'block', fontSize: 18 }}>{section.name}</strong><code style={{ color: '#667085' }}>{section.id}</code></span>
                  <span style={{ padding: '6px 10px', borderRadius: 99, background: section.mode === 'teaser' ? '#dfeaff' : '#eafbf7', color: '#0b517d', fontWeight: 700 }}>{section.mode}</span>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
      {plan.absentSections.length > 0 && <section style={{ marginTop: 24, padding: 28, borderRadius: 24, background: '#fff8e7', border: '1px solid #f2dfad' }}>
        <h2 style={{ marginTop: 0 }}>데이터가 없어 이번에 부재</h2>
        {plan.absentSections.map((section) => <p key={`${section.type}-${section.name}`}><strong>{section.name}</strong> · {section.inputHint}</p>)}
      </section>}
    </main>,
  );
  return shell(`${seed.label} 승인 와이어프레임`, body);
}

function generatedDocument(seed: ReviewSeed, config: SiteConfig): string {
  const body = renderToStaticMarkup(
    <main>
      <div style={{ position: 'relative', zIndex: 100, padding: '16px 28px', color: '#fff', background: '#0b1736', fontSize: 16, fontWeight: 700 }}>
        실제 SiteRenderer · {seed.label} · 홈
      </div>
      {createElement(SiteRenderer, {
        config, pageSlug: '', mode: 'desktop', interactive: false, animate: false, runtimeDelivery: 'client',
      })}
    </main>,
  ).replace(/<link[^>]*>/gu, '');
  return shell(`${seed.label} 생성 화면`, body, config.theme.palette.background);
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

async function capture(html: string, output: string): Promise<{ width: number; height: number }> {
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
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: 1440, screenHeight: 900,
  }, sessionId);
  await cdp.send('Page.navigate', { url: pathToFileURL(html).href }, sessionId);
  await new Promise((resolve) => setTimeout(resolve, 700));
  const metrics = await cdp.send('Page.getLayoutMetrics', {}, sessionId) as { cssContentSize: { width: number; height: number } };
  const width = Math.ceil(metrics.cssContentSize.width);
  const height = Math.ceil(metrics.cssContentSize.height);
  const screenshot = await cdp.send('Page.captureScreenshot', {
    format: 'png', fromSurface: true, captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height, scale: 1 },
  }, sessionId) as { data: string };
  await writeFile(output, Buffer.from(screenshot.data, 'base64'));
  cdp.close();
  chrome.kill('SIGTERM');
  await rm(profile, { recursive: true, force: true });
  return { width, height };
}

async function main(): Promise<void> {
  await rm(OUTPUT, { recursive: true, force: true });
  await mkdir(path.join(OUTPUT, 'fixtures'), { recursive: true });
  await mkdir(path.join(OUTPUT, 'screenshots'), { recursive: true });
  const hero = await dataUrl('public/mock/candidate-light.svg', 'image/svg+xml');
  const photos = await Promise.all([
    'public/cases/demos/woldam/still-1.webp',
    'public/cases/demos/yeobaek-workshop/still-1.webp',
  ].map((file) => dataUrl(file, 'image/webp')));
  const results = [];
  for (const seed of SEEDS) {
    const survey = reviewSurvey(seed, photos);
    const plan = buildSitePlan(survey);
    const candidate: DesignCandidate = {
      id: `plan-review-${seed.id}`, label: seed.label, style: 'photo', heroImageUrl: hero,
      theme: tokenSetToSiteTheme(expandTokens(seed.dnaId, seed.hue)), description: '',
    };
    const config = buildSiteConfigFromSurvey(survey, candidate, { heroImageUrl: hero, imagePool: [] });
    const planHtml = path.join(OUTPUT, 'fixtures', `${seed.id}-wireframe.html`);
    const generatedHtml = path.join(OUTPUT, 'fixtures', `${seed.id}-generated.html`);
    const planPng = path.join(OUTPUT, 'screenshots', `${seed.id}-wireframe-1440.png`);
    const generatedPng = path.join(OUTPUT, 'screenshots', `${seed.id}-generated-1440.png`);
    await writeFile(planHtml, planDocument(seed, plan), 'utf8');
    await writeFile(generatedHtml, generatedDocument(seed, config), 'utf8');
    const planCapture = await capture(planHtml, planPng);
    const generatedCapture = await capture(generatedHtml, generatedPng);
    const approvedIds = [...plan.sections.map((section) => section.id)].sort();
    const generatedIds = [...config.pages.flatMap((page) => page.sections.map((section) => section.id))].sort();
    results.push({
      id: seed.id, templateId: plan.templateId, equal: JSON.stringify(approvedIds) === JSON.stringify(generatedIds),
      approvedIds, generatedIds, pages: config.pages.map((page) => page.slug),
      wireframe: { file: planPng, ...planCapture, bytes: (await stat(planPng)).size },
      generated: { file: generatedPng, ...generatedCapture, bytes: (await stat(generatedPng)).size },
    });
  }
  await writeFile(path.join(OUTPUT, 'manifest.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), generatedAssetCalls: 0,
    renderer: 'buildSitePlan -> buildSiteConfigFromSurvey -> SiteRenderer', results,
  }, null, 2), 'utf8');
  process.stdout.write(`PLAN review -> ${OUTPUT}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
