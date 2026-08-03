#!/usr/bin/env node
/** Browser evidence for render-site-cinematic-review.tsx output. */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.env.SITECINE_REVIEW_OUTPUT ?? '/private/tmp/anakslabs-site-cinematic-review';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.SITECINE_REVIEW_PORT ?? 4183);
const PROFILE = `/private/tmp/anakslabs-sitecine-chrome-${process.pid}`;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.mp4': 'video/mp4',
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function child(command, args) {
  return spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
}

async function waitForExit(process, label) {
  let stderr = '';
  process.stderr?.on('data', (chunk) => { stderr += String(chunk); });
  const code = await new Promise((resolve, reject) => {
    process.once('error', reject);
    process.once('exit', resolve);
  });
  if (code !== 0) throw new Error(`${label} exited ${code}: ${stderr.slice(-2_000)}`);
}

function startServer(requests) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${PORT}`);
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'manifest.json';
      if (relative === 'favicon.ico') {
        response.writeHead(204).end();
        return;
      }
      const file = path.resolve(ROOT, relative);
      if (!file.startsWith(`${path.resolve(ROOT)}${path.sep}`)) {
        response.writeHead(403).end('forbidden');
        return;
      }
      requests.push({ at: Date.now(), path: url.pathname });
      const body = await readFile(file);
      response.writeHead(200, {
        'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      response.end(body);
    } catch {
      response.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
  }

  async open() {
    if (this.ws.readyState !== WebSocket.OPEN) {
      await new Promise((resolve, reject) => {
        this.ws.addEventListener('open', resolve, { once: true });
        this.ws.addEventListener('error', reject, { once: true });
      });
    }
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        else pending.resolve(message.result ?? {});
        return;
      }
      for (const listener of this.listeners) listener(message);
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  event(method, sessionId, timeoutMs = 15_000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        off();
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      const off = this.on((message) => {
        if (message.method !== method || message.sessionId !== sessionId) return;
        clearTimeout(timeout);
        off();
        resolve(message.params ?? {});
      });
    });
  }

  close() { this.ws.close(); }
}

async function launchChrome() {
  await rm(PROFILE, { recursive: true, force: true });
  await mkdir(PROFILE, { recursive: true });
  const chrome = child(CHROME, [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-component-update', '--disable-default-apps', '--disable-sync', '--disable-extensions',
    '--metrics-recording-only', '--mute-audio', '--hide-scrollbars', '--remote-debugging-port=0',
    '--host-resolver-rules=MAP fonts.googleapis.com 0.0.0.0, MAP fonts.gstatic.com 0.0.0.0',
    `--user-data-dir=${PROFILE}`, 'about:blank',
  ]);
  let stderr = '';
  chrome.stderr.on('data', (chunk) => { stderr += String(chunk); });
  const portFile = path.join(PROFILE, 'DevToolsActivePort');
  let content = '';
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      content = await readFile(portFile, 'utf8');
      if (content.trim()) break;
    } catch {}
    if (chrome.exitCode !== null) throw new Error(`Chrome startup failed: ${stderr.slice(-2_000)}`);
    await wait(50);
  }
  const [port, browserPath] = content.trim().split('\n');
  if (!port || !browserPath) throw new Error(`Chrome did not expose CDP: ${stderr.slice(-2_000)}`);
  return { chrome, wsUrl: `ws://127.0.0.1:${port}${browserPath}` };
}

async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true,
  }, sessionId);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'Runtime evaluation failed');
  return result.result?.value;
}

async function setViewport(cdp, sessionId, width, height) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: width < 768,
    screenWidth: width, screenHeight: height,
  }, sessionId);
}

async function navigate(cdp, sessionId, html, options = {}) {
  await cdp.send('Emulation.setScriptExecutionDisabled', { value: Boolean(options.noJs) }, sessionId);
  await cdp.send('Emulation.setEmulatedMedia', {
    media: '', features: [{ name: 'prefers-reduced-motion', value: options.reduced ? 'reduce' : 'no-preference' }],
  }, sessionId);
  const loaded = cdp.event('Page.loadEventFired', sessionId);
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${html}` }, sessionId);
  await loaded;
  await wait(options.settleMs ?? 700);
  if (options.noJs) await cdp.send('Emulation.setScriptExecutionDisabled', { value: false }, sessionId);
}

async function scrollToProgress(cdp, sessionId, progress) {
  return evaluate(cdp, sessionId, `new Promise((resolve)=>{const max=Math.max(0,document.documentElement.scrollHeight-innerHeight);scrollTo(0,max*${progress});requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(()=>resolve({max,y:scrollY}),45)))})`);
}

async function screenshot(cdp, sessionId, file, fullPage = false) {
  let params = { format: 'png', fromSurface: true, captureBeyondViewport: fullPage };
  if (fullPage) {
    const metrics = await cdp.send('Page.getLayoutMetrics', {}, sessionId);
    const size = metrics.cssContentSize;
    params = {
      ...params,
      clip: { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 },
    };
  }
  const result = await cdp.send('Page.captureScreenshot', params, sessionId);
  await writeFile(file, Buffer.from(result.data, 'base64'));
}

async function metrics(cdp, sessionId) {
  return evaluate(cdp, sessionId, `(() => {
    const sequence=document.querySelector('[data-site-cinematic-continuation]');
    const root=document.querySelector('.anaks-site');
    const fill=document.querySelector('[data-story-progress-fill]');
    const chapters=[...document.querySelectorAll('[data-story-chapter]')];
    const teaserCards=[...document.querySelectorAll('[data-uniform-teaser-card]')];
    const teaserGrid=document.querySelector('[data-uniform-teaser-grid]');
    const teaserThumbs=[...document.querySelectorAll('[data-uniform-teaser-thumbnail]')];
    const teaserCtas=[...document.querySelectorAll('[data-uniform-teaser-cta]')];
    const cardRects=teaserCards.map((card)=>card.getBoundingClientRect());
    const thumbRects=teaserThumbs.map((thumb)=>thumb.getBoundingClientRect());
    const uniqueColumns=[...new Set(cardRects.map((rect)=>Math.round(rect.left)))].length;
    const cardHeights=cardRects.map((rect)=>rect.height);
    const thumbRatios=thumbRects.map((rect)=>rect.width/Math.max(1,rect.height));
    const textCtaGaps=teaserCards.map((card)=>{
      const description=card.querySelector('[data-uniform-teaser-description]');
      const cta=card.querySelector('[data-uniform-teaser-cta]');
      return description&&cta?cta.getBoundingClientRect().top-description.getBoundingClientRect().bottom:null;
    }).filter((value)=>Number.isFinite(value));
    const cardBottomGaps=teaserCards.map((card)=>{
      const cta=card.querySelector('[data-uniform-teaser-cta]');
      return cta?card.getBoundingClientRect().bottom-cta.getBoundingClientRect().bottom:null;
    }).filter((value)=>Number.isFinite(value));
    return {
      width:innerWidth,height:innerHeight,scrollY,maxScroll:Math.max(0,document.documentElement.scrollHeight-innerHeight),
      scrollWidth:document.documentElement.scrollWidth,cls:Number(window.__reviewCls||0),clsSources:window.__reviewShifts||[],
      progress:sequence?Number.parseFloat(getComputedStyle(sequence).getPropertyValue('--scroll-progress'))||0:null,
      fillTransform:fill?getComputedStyle(fill).transform:null,
      chapterCount:chapters.length,quietCount:document.querySelectorAll('[data-site-cine-quiet-section]').length,
      chapterState:chapters.map((chapter)=>{const child=chapter.firstElementChild;const style=child?getComputedStyle(child):null;return {
        id:chapter.getAttribute('data-story-chapter'),opacity:style?.opacity??null,transform:style?.transform??null,
      }}),
      copy:root?.innerText??'',videoCount:document.querySelectorAll('video').length,
      teaser:teaserCards.length?{
        cardCount:teaserCards.length,columns:uniqueColumns,ctaCount:teaserCtas.length,
        orphanCtas:teaserCtas.filter((cta)=>!cta.closest('[data-uniform-teaser-card]')).length,
        unfilledThumbs:teaserThumbs.filter((thumb)=>!thumb.querySelector('img')&&!thumb.querySelector('[data-teaser-procedural-thumbnail]')).length,
        cardHeightDelta:Math.max(...cardHeights)-Math.min(...cardHeights),
        thumbRatioDelta:Math.max(...thumbRatios)-Math.min(...thumbRatios),
        gridAutoRows:teaserGrid?getComputedStyle(teaserGrid).gridAutoRows:null,
        textCtaGapMin:Math.min(...textCtaGaps),textCtaGapMax:Math.max(...textCtaGaps),
        cardBottomGapMin:Math.min(...cardBottomGaps),cardBottomGapMax:Math.max(...cardBottomGaps),
      }:null,
      errors:[...(window.__reviewErrors||[])],
    };
  })()`);
}

async function sampleScroll(cdp, sessionId) {
  const samples = [];
  for (let index = 0; index <= 20; index += 1) {
    const requested = index / 20;
    await scrollToProgress(cdp, sessionId, requested);
    samples.push({ requested, ...(await metrics(cdp, sessionId)) });
  }
  const progresses = samples.map((sample) => sample.progress).filter((value) => Number.isFinite(value));
  const monotonic = progresses.every((value, index) => index === 0 || value >= progresses[index - 1]);
  const changingSteps = samples.slice(1).filter((sample, index) => (
    sample.fillTransform !== samples[index].fillTransform ||
    JSON.stringify(sample.chapterState) !== JSON.stringify(samples[index].chapterState)
  )).length;
  return { samples, monotonic, changingSteps, deadSteps: 20 - changingSteps };
}

async function record(cdp, sessionId, fixture, width, height, name) {
  const frameDir = path.join(ROOT, 'recordings', `${name}-frames`);
  const output = path.join(ROOT, 'recordings', `${name}.mp4`);
  await rm(frameDir, { recursive: true, force: true });
  await mkdir(frameDir, { recursive: true });
  await setViewport(cdp, sessionId, width, height);
  await navigate(cdp, sessionId, fixture, { settleMs: 650 });
  for (let index = 0; index < 25; index += 1) {
    await scrollToProgress(cdp, sessionId, index / 24);
    await screenshot(cdp, sessionId, path.join(frameDir, `${String(index).padStart(3, '0')}.png`));
  }
  const ffmpeg = child('ffmpeg', [
    '-y', '-loglevel', 'error', '-framerate', '8', '-i', path.join(frameDir, '%03d.png'),
    '-c:v', 'libx264', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output,
  ]);
  await waitForExit(ffmpeg, `ffmpeg ${name}`);
  await rm(frameDir, { recursive: true, force: true });
  return path.relative(ROOT, output);
}

async function main() {
  const manifest = JSON.parse(await readFile(path.join(ROOT, 'manifest.json'), 'utf8'));
  await mkdir(path.join(ROOT, 'screenshots', 'complete-sites'), { recursive: true });
  await mkdir(path.join(ROOT, 'screenshots', 'comparison'), { recursive: true });
  await mkdir(path.join(ROOT, 'screenshots', 'spine'), { recursive: true });
  const requests = [];
  const server = await startServer(requests);
  const { chrome, wsUrl } = await launchChrome();
  const cdp = new Cdp(wsUrl);
  await cdp.open();
  const errors = [];
  let currentFixture = 'startup';
  try {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await Promise.all([
      cdp.send('Page.enable', {}, sessionId), cdp.send('Runtime.enable', {}, sessionId),
      cdp.send('Log.enable', {}, sessionId),
    ]);
    cdp.on((message) => {
      if (message.sessionId !== sessionId) return;
      if (message.method === 'Runtime.exceptionThrown') errors.push({ fixture: currentFixture, type: 'exception', detail: message.params?.exceptionDetails?.text });
      if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') errors.push({ fixture: currentFixture, type: 'console', detail: message.params.entry.text });
    });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__reviewCls=0;window.__reviewErrors=[];window.__reviewShifts=[];
      window.addEventListener('error',(event)=>window.__reviewErrors.push(event.message));
      new PerformanceObserver((list)=>list.getEntries().forEach((entry)=>{if(!entry.hadRecentInput){window.__reviewCls+=entry.value;window.__reviewShifts.push({value:entry.value,sources:(entry.sources||[]).map((source)=>source.node?.outerHTML?.slice(0,180)||null)})}})).observe({type:'layout-shift',buffered:true});
    ` }, sessionId);

    const audits = [];
    for (const fixture of manifest.fixtures.filter((item) => item.rollout === 'site-cinematic' && item.id !== 'customer-video-1440')) {
      currentFixture = fixture.id;
      await setViewport(cdp, sessionId, fixture.width, fixture.height);
      await navigate(cdp, sessionId, fixture.html, { reduced: true });
      const full = path.join(ROOT, 'screenshots', 'complete-sites', `${fixture.id}-full.png`);
      await screenshot(cdp, sessionId, full, true);
      await navigate(cdp, sessionId, fixture.html);
      const scroll = await sampleScroll(cdp, sessionId);
      const finalMetrics = scroll.samples.at(-1);
      audits.push({
        id: fixture.id, viewport: [fixture.width, fixture.height], screenshot: path.relative(ROOT, full),
        overflow: finalMetrics.scrollWidth > fixture.width, cls: finalMetrics.cls, clsSources: finalMetrics.clsSources, errors: finalMetrics.errors,
        chapterCount: finalMetrics.chapterCount, quietCount: finalMetrics.quietCount,
        teaser: finalMetrics.teaser,
        monotonic: scroll.monotonic, changingSteps: scroll.changingSteps, deadSteps: scroll.deadSteps,
      });
    }

    for (const width of [1440, 390]) {
      for (const variant of ['before', 'after']) {
        const id = variant === 'before' ? `cafe-before-${width}` : `cafe-${width}`;
        const fixture = manifest.fixtures.find((item) => item.id === id);
        currentFixture = id;
        await setViewport(cdp, sessionId, fixture.width, fixture.height);
        await navigate(cdp, sessionId, fixture.html);
        const file = path.join(ROOT, 'screenshots', 'comparison', `cafe-${variant}-${width}.png`);
        await screenshot(cdp, sessionId, file);
      }
    }

    for (const width of [1440, 390]) {
      const fixture = manifest.fixtures.find((item) => item.id === `cafe-${width}`);
      currentFixture = `spine-${width}`;
      await setViewport(cdp, sessionId, fixture.width, fixture.height);
      await navigate(cdp, sessionId, fixture.html);
      await scrollToProgress(cdp, sessionId, 0.52);
      await screenshot(cdp, sessionId, path.join(ROOT, 'screenshots', 'spine', `cafe-${width}-mid.png`));
    }

    currentFixture = 'no-js';
    await setViewport(cdp, sessionId, 1440, 900);
    await navigate(cdp, sessionId, 'fixtures/cafe-1440.html', { noJs: true });
    const noJs = await metrics(cdp, sessionId);
    await screenshot(cdp, sessionId, path.join(ROOT, 'screenshots', 'cafe-no-js-1440.png'));
    currentFixture = 'reduced';
    await navigate(cdp, sessionId, 'fixtures/cafe-1440.html', { reduced: true });
    const reduced = await metrics(cdp, sessionId);
    await screenshot(cdp, sessionId, path.join(ROOT, 'screenshots', 'cafe-reduced-1440.png'));

    currentFixture = 'customer-video';
    await navigate(cdp, sessionId, 'fixtures/customer-video-1440.html');
    const videoFixtureSource = await readFile(path.join(ROOT, 'fixtures/customer-video-1440.html'), 'utf8');
    const video = await evaluate(cdp, sessionId, `(() => {const element=document.querySelector('video');const poster=element?.previousElementSibling?.tagName==='IMG'?element.previousElementSibling:null;return {
      count:document.querySelectorAll('video').length,src:element?.getAttribute('src'),poster:element?.getAttribute('poster'),
      hydratedPreload:element?.getAttribute('preload'),posterFetchPriority:poster?.getAttribute('fetchpriority')||poster?.fetchPriority||null,
    }})()`);
    video.ssrPreloadNone = /<video\b[^>]*preload="none"/u.test(videoFixtureSource);

    const recordings = [];
    currentFixture = 'recording-desktop';
    recordings.push(await record(cdp, sessionId, 'fixtures/cafe-1440.html', 1440, 900, 'cafe-full-scroll-1440'));
    currentFixture = 'recording-mobile';
    recordings.push(await record(cdp, sessionId, 'fixtures/cafe-390.html', 390, 844, 'cafe-full-scroll-390'));

    const failed = audits.filter((audit) => {
      const expectedColumns = audit.viewport[0] >= 1280 ? 3 : audit.viewport[0] >= 640 ? 2 : 1;
      const responsiveGapFailed = audit.viewport[0] <= 768 && (
        audit.teaser?.textCtaGapMin < 8 || audit.teaser?.textCtaGapMax > 16
      );
      const rowStrategyFailed = audit.viewport[0] === 768
        ? audit.teaser?.gridAutoRows !== '360px'
        : audit.viewport[0] === 390
          ? audit.teaser?.gridAutoRows !== 'auto'
          : false;
      return audit.overflow || audit.cls !== 0 || audit.errors.length > 0 || !audit.monotonic ||
        audit.deadSteps > 0 || audit.chapterCount !== audit.quietCount || !audit.teaser ||
        audit.teaser.columns !== expectedColumns || audit.teaser.orphanCtas !== 0 ||
        audit.teaser.unfilledThumbs !== 0 || audit.teaser.ctaCount !== audit.teaser.cardCount ||
        (expectedColumns > 1 && audit.teaser.cardHeightDelta > 1) || audit.teaser.thumbRatioDelta > .02 ||
        responsiveGapFailed || rowStrategyFailed;
    });
    if (failed.length > 0 || errors.length > 0) throw new Error(`Browser audit failed: ${JSON.stringify({ failed, errors }, null, 2)}`);
    if (video.count !== 1 || !video.ssrPreloadNone || !video.poster || video.posterFetchPriority !== 'high') {
      throw new Error(`Video performance contract failed: ${JSON.stringify(video)}`);
    }
    if (!noJs.copy.includes('매일의 한 잔을') || !reduced.copy.includes('매일의 한 잔을')) {
      throw new Error('Static fallback copy is missing.');
    }

    const browser = await cdp.send('Browser.getVersion');
    await writeFile(path.join(ROOT, 'browser-review.json'), JSON.stringify({
      generatedAt: new Date().toISOString(), browser: browser.product,
      rendererPath: manifest.rendererPath, audits, errors, video, recordings,
      noJs: { copyPresent: true, chapterCount: noJs.chapterCount, cls: noJs.cls },
      reduced: { copyPresent: true, chapterCount: reduced.chapterCount, cls: reduced.cls },
      requests: requests.map((request) => request.path),
      anakslabsAssetRequests: requests.filter((request) => request.path.includes('anakslabs-visibility-film')),
    }, null, 2), 'utf8');
    process.stdout.write(`SITECINE browser review: ${audits.length} viewport audits, 2 recordings -> ${ROOT}\n`);
  } finally {
    cdp.close();
    chrome.kill('SIGTERM');
    await new Promise((resolve) => server.close(resolve));
    await rm(PROFILE, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
