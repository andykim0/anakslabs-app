#!/usr/bin/env node
/**
 * Dependency-free Chrome DevTools Protocol visual/performance review runner.
 *
 * Input:  /private/tmp/daboim-motion-review (render-motion-review.tsx output)
 * Output: screenshots/, recordings/, browser-review.json in the same directory.
 */
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = process.env.MOTION_REVIEW_OUTPUT ?? '/private/tmp/daboim-motion-review';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.MOTION_REVIEW_PORT ?? 4179);
const RECORD = process.argv.includes('--record');
const QUICK = process.argv.includes('--quick');
const CHOREO_QUICK = process.argv.includes('--choreo-quick');
const MERGE = process.argv.includes('--merge');
const ONLY = (process.argv.find((value) => value.startsWith('--only='))?.slice('--only='.length) ?? '')
  .split(',').map((value) => value.trim()).filter(Boolean);
const PROFILE = `/private/tmp/daboim-motion-review-chrome-${process.pid}`;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function runtimeExceptionDetails(details = {}) {
  const frames = details.stackTrace?.callFrames ?? [];
  return {
    text: details.text ?? 'runtime exception',
    description: details.exception?.description ?? details.text ?? 'runtime exception',
    url: details.url || frames[0]?.url || null,
    line: Number.isFinite(details.lineNumber) ? details.lineNumber + 1 : null,
    column: Number.isFinite(details.columnNumber) ? details.columnNumber + 1 : null,
    stack: frames.map((frame) => ({
      functionName: frame.functionName || '(anonymous)',
      url: frame.url || null,
      line: Number.isFinite(frame.lineNumber) ? frame.lineNumber + 1 : null,
      column: Number.isFinite(frame.columnNumber) ? frame.columnNumber + 1 : null,
    })),
  };
}

function child(command, args, options = {}) {
  return spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
}

async function waitForExit(process, label) {
  let stdout = '';
  let stderr = '';
  process.stdout?.on('data', (chunk) => { stdout += chunk; });
  process.stderr?.on('data', (chunk) => { stderr += chunk; });
  const code = await new Promise((resolve, reject) => {
    process.once('error', reject);
    process.once('exit', resolve);
  });
  if (code !== 0) throw new Error(`${label} exited ${code}: ${stderr.slice(-2000)}`);
  return { stdout, stderr };
}

function startStaticServer(requests) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${PORT}`);
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'manifest.json';
      const filePath = path.resolve(ROOT, relative);
      if (!filePath.startsWith(`${path.resolve(ROOT)}${path.sep}`) && filePath !== path.resolve(ROOT)) {
        response.writeHead(403).end('forbidden');
        return;
      }
      requests.push({ at: Date.now(), path: url.pathname, query: url.search });
      const body = await readFile(filePath);
      response.writeHead(200, {
        'content-type': MIME[path.extname(filePath)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
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

async function launchChrome() {
  await rm(PROFILE, { recursive: true, force: true });
  await mkdir(PROFILE, { recursive: true });
  const chrome = child(CHROME, [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-sync',
    '--disable-extensions',
    '--metrics-recording-only',
    '--mute-audio',
    '--hide-scrollbars',
    '--remote-debugging-port=0',
    `--user-data-dir=${PROFILE}`,
    'about:blank',
  ]);
  let stderr = '';
  chrome.stderr.on('data', (chunk) => { stderr += chunk; });
  const portFile = path.join(PROFILE, 'DevToolsActivePort');
  let content = '';
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      content = await readFile(portFile, 'utf8');
      if (content.trim()) break;
    } catch {}
    if (chrome.exitCode !== null) throw new Error(`Chrome exited before CDP startup: ${stderr.slice(-2000)}`);
    await wait(50);
  }
  const [port, browserPath] = content.trim().split('\n');
  if (!port || !browserPath) throw new Error(`Chrome did not create DevToolsActivePort: ${stderr.slice(-2000)}`);
  return { chrome, wsUrl: `ws://127.0.0.1:${port}${browserPath}` };
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
  }

  async open() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
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

  event(method, sessionId, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        off();
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      const off = this.on((message) => {
        if (message.method !== method || (sessionId && message.sessionId !== sessionId)) return;
        clearTimeout(timeout);
        off();
        resolve(message.params ?? {});
      });
    });
  }

  close() {
    this.ws.close();
  }
}

const DIRECT_METRICS = `(() => {
  const stage=document.querySelector('[data-motion-signature]');
  const rail=stage&&stage.querySelector('[data-horizontal-rail]');
  const video=stage&&stage.querySelector('video');
  const poster=stage&&stage.querySelector('[data-video-poster]');
  const contractCopies=stage?[...stage.querySelectorAll('[data-signature-contract-copy]')]:[];
  const core=stage?[...stage.querySelectorAll('[data-signature-heading],[data-signature-body],[data-signature-caption],a,button')]:[];
  const hiddenCore=core.filter((node)=>{const s=getComputedStyle(node);const r=node.getBoundingClientRect();return s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0||r.width===0||r.height===0;}).length;
  const state=window.__motionReviewMetrics||{};
  return {
    signatureId:stage?.getAttribute('data-signature-id')||null,
    ready:Boolean(stage?.classList.contains('m-signature-ready')),
    active:Boolean(stage?.hasAttribute('data-signature-active')),
    stageHeight:stage?Math.round(stage.getBoundingClientRect().height):null,
    documentHeight:document.documentElement.scrollHeight,
    viewport:[innerWidth,innerHeight],
    pointerFine:matchMedia('(pointer: fine)').matches,
    hover:matchMedia('(hover: hover)').matches,
    reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,
    runtimeInstalled:typeof window.__anaksMotionDispose==='function',
    horizontalTransform:rail?getComputedStyle(rail).transform:null,
    horizontalOverflow:Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth),
    hiddenCore,
    coreCount:core.length,
    videoPreload:video?.getAttribute('preload')||null,
    videoPlaybackState:video?.getAttribute('data-playback-state')||null,
    videoOpacity:video?getComputedStyle(video).opacity:null,
    posterOpacity:poster?getComputedStyle(poster).opacity:null,
    signatureProgress:stage?getComputedStyle(stage).getPropertyValue('--signature-progress').trim():null,
    pathProgress:stage?getComputedStyle(stage).getPropertyValue('--path-progress').trim():null,
    activeMilestones:stage?stage.querySelectorAll('[data-path-milestone][data-active]').length:0,
    activeMosaicTiles:stage?stage.querySelectorAll('[data-mosaic-tile][data-active]').length:0,
    signatureContract:Boolean(stage?.hasAttribute('data-signature-contract')),
    signatureContractPhase:stage?.getAttribute('data-signature-contract-phase')||null,
    signatureContractToken:stage?.getAttribute('data-signature-contract-text-token')||null,
    signatureContractScrim:stage?.getAttribute('data-signature-contract-scrim')||null,
    signatureContractFallbackZone:stage?.getAttribute('data-signature-contract-fallback-zone')||null,
    signatureContractZones:stage?stage.querySelectorAll('[data-signature-contract-zone]').length:0,
    signatureContractCopies:contractCopies.length,
    cls:Number(state.cls||0),
    layoutShifts:Array.isArray(state.layoutShifts)?state.layoutShifts:[],
    longTaskCount:Number(state.longTaskCount||0),
    maxLongTask:Number(state.maxLongTask||0),
    errors:Array.isArray(state.errors)?state.errors:[],
  };
})()`;

async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: false,
  }, sessionId);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed');
  return result.result?.value;
}

async function setViewport(cdp, sessionId, width, height, scale = 1) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: scale, mobile: width < 600,
    screenWidth: width, screenHeight: height,
  }, sessionId);
}

async function setReduced(cdp, sessionId, reduced) {
  await cdp.send('Emulation.setEmulatedMedia', {
    media: 'screen',
    features: [
      { name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' },
      { name: 'prefers-color-scheme', value: 'light' },
    ],
  }, sessionId);
}

async function navigate(cdp, sessionId, url, options = {}) {
  await cdp.send('Emulation.setScriptExecutionDisabled', { value: Boolean(options.noJs) }, sessionId);
  await setReduced(cdp, sessionId, Boolean(options.reduced));
  const loaded = cdp.event('Page.loadEventFired', sessionId, 15000);
  await cdp.send('Page.navigate', { url }, sessionId);
  await loaded;
  await wait(options.settleMs ?? 450);
}

async function scrollStage(cdp, sessionId, progress) {
  await evaluate(cdp, sessionId, `(() => {
    const stage=document.querySelector('[data-motion-signature]');
    if(!stage)return false;
    const box=stage.getBoundingClientRect();
    const top=scrollY+box.top;
    const requested=${Math.max(0, Math.min(1, progress))};
    const id=stage.getAttribute('data-signature-id');
    if(id==='mosaic-reveal'||id==='path-journey'){
      const desiredTop=innerHeight-requested*(innerHeight+box.height);
      scrollTo(0,top-desiredTop);
    }else{
      const travel=Math.max(0,box.height-innerHeight);
      scrollTo(0,top+travel*requested);
    }
    return true;
  })()`);
  await wait(100);
}

async function screenshot(cdp, sessionId, file) {
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png', fromSurface: true, captureBeyondViewport: false,
  }, sessionId);
  await writeFile(file, Buffer.from(result.data, 'base64'));
}

async function collectMetrics(cdp, sessionId) {
  return evaluate(cdp, sessionId, DIRECT_METRICS);
}

function browserMotionLintViolations(fixture, mode, metrics) {
  if (!fixture.motionLint) return [];
  const violations = [];
  if (!metrics.signatureContract) violations.push('signature-contract-missing');
  if (metrics.signatureContractZones < 1) violations.push('safe-zone-projection-missing');
  if (metrics.signatureContractCopies < 1) violations.push('contract-copy-missing');
  if (metrics.horizontalOverflow > 0) violations.push(`horizontal-overflow:${metrics.horizontalOverflow}`);
  if (metrics.cls > 0.001) violations.push(`cls-budget-exceeded:${metrics.cls}`);
  if ((mode.reduced || mode.noJs) && metrics.hiddenCore > 0) violations.push(`static-content-hidden:${metrics.hiddenCore}`);
  return violations;
}

async function captureMode(cdp, sessionId, fixture, mode, requestLog) {
  const output = path.join(ROOT, 'screenshots', fixture.id);
  await mkdir(output, { recursive: true });
  const startRequest = requestLog.length;
  await setViewport(cdp, sessionId, mode.width, mode.height, mode.scale ?? 1);
  await navigate(cdp, sessionId, `http://127.0.0.1:${PORT}/${fixture.html}`, mode);
  if (mode.progress !== undefined && !mode.noJs) await scrollStage(cdp, sessionId, mode.progress);
  if (fixture.signatureId === 'mosaic-reveal' && mode.progress > 0) await wait(300);
  const file = path.join(output, `${mode.id}.png`);
  await screenshot(cdp, sessionId, file);
  let metrics;
  if (mode.noJs) {
    // Enabling after parsing permits CDP inspection but does not replay skipped inline scripts.
    await cdp.send('Emulation.setScriptExecutionDisabled', { value: false }, sessionId);
    metrics = await collectMetrics(cdp, sessionId);
  } else {
    metrics = await collectMetrics(cdp, sessionId);
  }
  return {
    id: mode.id,
    screenshot: path.relative(ROOT, file),
    viewport: [mode.width, mode.height],
    scale: mode.scale ?? 1,
    progress: mode.progress ?? 0,
    reduced: Boolean(mode.reduced),
    noJs: Boolean(mode.noJs),
    metrics,
    motionLintViolations: browserMotionLintViolations(fixture, mode, metrics),
    assetRequests: requestLog.slice(startRequest).map((entry) => entry.path).filter((value) => value.startsWith('/assets/')),
  };
}

async function recordViewport(cdp, sessionId, fixture, viewport) {
  const frameDir = path.join(ROOT, 'recordings', `${fixture.id}-${viewport.id}-frames`);
  const output = path.join(ROOT, 'recordings', `${fixture.id}-${viewport.id}.mp4`);
  await rm(frameDir, { recursive: true, force: true });
  await mkdir(frameDir, { recursive: true });
  await setViewport(cdp, sessionId, viewport.width, viewport.height, 1);
  await navigate(cdp, sessionId, `http://127.0.0.1:${PORT}/${fixture.html}`, { settleMs: 700 });
  const frameCount = 21;
  for (let index = 0; index < frameCount; index += 1) {
    const progress = index / (frameCount - 1);
    await scrollStage(cdp, sessionId, progress);
    await screenshot(cdp, sessionId, path.join(frameDir, `${String(index).padStart(3, '0')}.png`));
  }
  const ffmpeg = child('ffmpeg', [
    '-y', '-loglevel', 'error', '-framerate', '7', '-i', path.join(frameDir, '%03d.png'),
    '-c:v', 'libx264', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output,
  ]);
  await waitForExit(ffmpeg, `ffmpeg ${fixture.id}`);
  await rm(frameDir, { recursive: true, force: true });
  return path.relative(ROOT, output);
}

async function recordFixture(cdp, sessionId, fixture) {
  return {
    desktop1440: await recordViewport(cdp, sessionId, fixture, {
      id: 'desktop-1440', width: 1440, height: 900,
    }),
    mobile390: await recordViewport(cdp, sessionId, fixture, {
      id: 'mobile-390', width: 390, height: 844,
    }),
  };
}

async function stabilityAudit(cdp, sessionId, fixture) {
  await setViewport(cdp, sessionId, 1440, 900, 1);
  await navigate(cdp, sessionId, `http://127.0.0.1:${PORT}/${fixture.html}`, { settleMs: 700 });
  for (const progress of [0.08, 0.92, 0.22, 0.78, 0.5]) await scrollStage(cdp, sessionId, progress);
  const afterReversal = await collectMetrics(cdp, sessionId);
  await setViewport(cdp, sessionId, 390, 844, 1);
  await wait(600);
  const mobile = await collectMetrics(cdp, sessionId);
  await setViewport(cdp, sessionId, 1440, 900, 1);
  await wait(600);
  const desktopAgain = await collectMetrics(cdp, sessionId);
  return { afterReversal, mobile, desktopAgain };
}

async function videoErrorAudit(cdp, sessionId, fixture) {
  await setViewport(cdp, sessionId, 1440, 900, 1);
  await navigate(cdp, sessionId, `http://127.0.0.1:${PORT}/${fixture.html}`, { settleMs: 700 });
  return evaluate(cdp, sessionId, `(() => {
    const video=document.querySelector('[data-motion-signature] video');
    const poster=document.querySelector('[data-motion-signature] [data-video-poster]');
    if(!video||!poster)return null;
    video.dispatchEvent(new Event('error'));
    return new Promise((resolve)=>setTimeout(()=>resolve({
      videoOpacity:getComputedStyle(video).opacity,
      posterOpacity:getComputedStyle(poster).opacity,
      playbackState:video.getAttribute('data-playback-state'),
      posterConnected:poster.isConnected,
    }),500));
  })()`);
}

async function imageErrorAudit(cdp, sessionId, fixture) {
  await setViewport(cdp, sessionId, 1440, 900, 1);
  await navigate(cdp, sessionId, `http://127.0.0.1:${PORT}/${fixture.html}`, { settleMs: 700 });
  await scrollStage(cdp, sessionId, 0.45);
  return evaluate(cdp, sessionId, `(() => {
    const tile=document.querySelector('[data-mosaic-tile]');
    const image=tile&&tile.querySelector('img');
    if(!tile||!image)return null;
    const before=tile.getBoundingClientRect();
    image.src='/assets/does-not-exist.webp';
    return new Promise((resolve)=>setTimeout(()=>{const after=tile.getBoundingClientRect();resolve({
      before:[Math.round(before.width),Math.round(before.height)],
      after:[Math.round(after.width),Math.round(after.height)],
      stable:Math.abs(before.width-after.width)<.5&&Math.abs(before.height-after.height)<.5,
    });},300));
  })()`);
}

async function mosaicNetworkAudit(cdp, sessionId, requestLog) {
  const start = requestLog.length;
  await setViewport(cdp, sessionId, 1440, 900, 1);
  await navigate(cdp, sessionId, `http://127.0.0.1:${PORT}/mosaic-network-probe.html`, { settleMs: 2500 });
  const requested = requestLog.slice(start).map((entry) => entry.path).filter((value) => value.startsWith('/assets/'));
  const mosaicNames = ['portfolio-', 'photo.webp', '3d.webp', 'illustration.webp', 'brand-midnight.webp', 'brand-mint.webp', 'brand-sky.webp'];
  return {
    allAssetRequests: requested,
    offscreenMosaicRequests: requested.filter((value) => mosaicNames.some((name) => value.includes(name))),
  };
}

async function main() {
  if (MERGE) {
    const names = (await readdir(ROOT)).filter((name) => /^browser-review\.part\..+\.json$/.test(name)).sort();
    if (!names.length) throw new Error('No browser-review.part.*.json files to merge');
    const parts = await Promise.all(names.map(async (name) => JSON.parse(await readFile(path.join(ROOT, name), 'utf8'))));
    const fixtureById = new Map();
    for (const part of parts) {
      for (const fixture of part.fixtures ?? []) fixtureById.set(fixture.id, fixture);
    }
    const merged = {
      generatedAt: new Date().toISOString(),
      browser: parts[0].browser,
      protocolVersion: parts[0].protocolVersion,
      rendererPath: parts[0].rendererPath,
      browserMeasured: true,
      measurementScope: parts[0].measurementScope,
      modes: parts[0].modes,
      fixtures: [...fixtureById.values()],
      audits: Object.assign({}, ...parts.map((part) => Object.fromEntries(
        Object.entries(part.audits ?? {}).filter(([, value]) => value !== null),
      ))),
      runtimeExceptions: [...new Map(parts.flatMap((part) => part.runtimeExceptions ?? [])
        .map((entry) => [JSON.stringify(entry), entry])).values()],
      consoleErrors: [...new Set(parts.flatMap((part) => part.consoleErrors ?? []))],
      sourceParts: names,
    };
    await writeFile(path.join(ROOT, 'browser-review.json'), JSON.stringify(merged, null, 2), 'utf8');
    process.stdout.write(`Merged ${names.length} reports (${merged.fixtures.length} fixtures) into ${path.join(ROOT, 'browser-review.json')}\n`);
    return;
  }
  const manifest = JSON.parse(await readFile(path.join(ROOT, 'manifest.json'), 'utf8'));
  const fixtures = ONLY.length ? manifest.fixtures.filter((fixture) => ONLY.includes(fixture.id)) : manifest.fixtures;
  if (!fixtures.length) throw new Error(`No fixtures matched --only=${ONLY.join(',')}`);
  const requestLog = [];
  const server = await startStaticServer(requestLog);
  const { chrome, wsUrl } = await launchChrome();
  const cdp = new Cdp(wsUrl);
  const exceptions = [];
  const consoleErrors = [];
  try {
    await cdp.open();
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const attached = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const sessionId = attached.sessionId;
    await Promise.all([
      cdp.send('Page.enable', {}, sessionId),
      cdp.send('Runtime.enable', {}, sessionId),
      cdp.send('Network.enable', {}, sessionId),
      cdp.send('Performance.enable', {}, sessionId),
    ]);
    try { await cdp.send('Emulation.setHardwareConcurrencyOverride', { hardwareConcurrency: 8 }, sessionId); } catch {}
    cdp.on((message) => {
      if (message.sessionId !== sessionId) return;
      if (message.method === 'Runtime.exceptionThrown') {
        exceptions.push(runtimeExceptionDetails(message.params?.exceptionDetails));
      }
      if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') {
        consoleErrors.push(message.params.entry.text);
      }
    });

    const modes = CHOREO_QUICK ? [
      { id: 'desktop-1440-start', width: 1440, height: 900, progress: 0.02 },
      { id: 'desktop-1440-mid', width: 1440, height: 900, progress: 0.5 },
      { id: 'desktop-1440-settle', width: 1440, height: 900, progress: 0.96 },
      { id: 'mobile-390-mid', width: 390, height: 844, progress: 0.5 },
    ] : QUICK ? [
      { id: 'desktop-1440-mid', width: 1440, height: 900, progress: 0.5 },
      { id: 'mobile-390-mid', width: 390, height: 844, progress: 0.5 },
      { id: 'reduced-1440', width: 1440, height: 900, progress: 0.3, reduced: true },
      { id: 'no-js-1440', width: 1440, height: 900, noJs: true },
    ] : [
      { id: 'desktop-1440-start', width: 1440, height: 900, progress: 0.02 },
      { id: 'desktop-1440-mid', width: 1440, height: 900, progress: 0.5 },
      { id: 'desktop-1440-settle', width: 1440, height: 900, progress: 0.96 },
      { id: 'desktop-1024-mid', width: 1024, height: 768, progress: 0.5 },
      { id: 'mobile-390-start', width: 390, height: 844, progress: 0.02 },
      { id: 'mobile-390-mid', width: 390, height: 844, progress: 0.5 },
      { id: 'zoom-200-mid', width: 720, height: 450, scale: 2, progress: 0.5 },
      { id: 'reduced-1440', width: 1440, height: 900, progress: 0.3, reduced: true },
      { id: 'no-js-1440', width: 1440, height: 900, noJs: true },
    ];

    const results = [];
    for (const fixture of fixtures) {
      const captures = [];
      for (const mode of modes) captures.push(await captureMode(cdp, sessionId, fixture, mode, requestLog));
      const recording = RECORD ? await recordFixture(cdp, sessionId, fixture) : null;
      results.push({ ...fixture, captures, recording });
      process.stdout.write(`Captured ${fixture.id}\n`);
    }

    const horizontal = fixtures.find((fixture) => fixture.signatureId === 'horizontal-story');
    const cinematic = fixtures.find((fixture) => fixture.signatureId === 'cinematic-scrub');
    const mosaic = fixtures.find((fixture) => fixture.signatureId === 'mosaic-reveal');
    const audits = {
      horizontalResizeAndReversal: horizontal ? await stabilityAudit(cdp, sessionId, horizontal) : null,
      videoErrorPosterPreservation: cinematic ? await videoErrorAudit(cdp, sessionId, cinematic) : null,
      imageErrorGeometry: mosaic ? await imageErrorAudit(cdp, sessionId, mosaic) : null,
      mosaicBelowFoldNetwork: mosaic ? await mosaicNetworkAudit(cdp, sessionId, requestLog) : null,
    };

    const chromeVersion = await cdp.send('Browser.getVersion');
    const report = {
      generatedAt: new Date().toISOString(),
      browser: chromeVersion.product,
      protocolVersion: chromeVersion.protocolVersion,
      rendererPath: manifest.rendererPath,
      browserMeasured: true,
      measurementScope: 'headless Chrome deterministic fixtures; layout-shift observer includes all page shifts, not attribution to a single CSS property',
      modes,
      fixtures: results,
      audits,
      runtimeExceptions: exceptions,
      consoleErrors,
    };
    const partName = `browser-review.part.${fixtures.map((fixture) => fixture.id).join('__')}.json`;
    await writeFile(path.join(ROOT, partName), JSON.stringify(report, null, 2), 'utf8');
    process.stdout.write(`Browser review written to ${path.join(ROOT, partName)}\n`);
    const motionLintFailures = results.flatMap((fixture) => fixture.captures.flatMap((capture) =>
      capture.motionLintViolations.map((code) => `${fixture.id}/${capture.id}:${code}`),
    ));
    if (motionLintFailures.length) {
      throw new Error(`MotionLint browser review failed: ${motionLintFailures.join(', ')}`);
    }
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
