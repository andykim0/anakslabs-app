/** FLOW owner-review: record the deterministic static fixtures with production motion runtime. */
import { spawn } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = '/private/tmp/daboim-continuous-canvas-review';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function ffmpeg(input, output) {
  await new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', [
      '-y', '-i', input, '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    child.stderr.on('data', (chunk) => { error += String(chunk); });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(error)));
  });
}

async function record(browser, fixture, id, width, height) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: width < 768 });
  await page.evaluateOnNewDocument(() => {
    window.__flowReview = { frames: [], longTasks: [], cls: 0 };
    let previous = 0;
    const frame = (now) => {
      if (previous) window.__flowReview.frames.push(now - previous);
      previous = now;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__flowReview.longTasks.push(entry.duration);
      }).observe({ type: 'longtask', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__flowReview.cls += entry.value;
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {}
  });
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(pathToFileURL(fixture).href, { waitUntil: 'load' });
  await new Promise((resolve) => setTimeout(resolve, 400));
  const webm = path.join(ROOT, 'recordings', `${id}.webm`);
  const mp4 = path.join(ROOT, 'recordings', `${id}.mp4`);
  const recorder = await page.screencast({ path: webm, fps: 30, quality: 24 });
  await page.evaluate(async () => {
    const maximum = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    const duration = 9200;
    const start = performance.now();
    await new Promise((resolve) => {
      const step = (now) => {
        const elapsed = Math.min(1, (now - start) / duration);
        const eased = elapsed < .5 ? 2 * elapsed * elapsed : 1 - Math.pow(-2 * elapsed + 2, 2) / 2;
        scrollTo(0, maximum * eased);
        if (elapsed < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
  await recorder.stop();
  const measurements = await page.evaluate(() => {
    const frames = window.__flowReview.frames.filter((value) => value < 250).sort((a, b) => a - b);
    const percentile = (ratio) => frames[Math.min(frames.length - 1, Math.floor(frames.length * ratio))] ?? 0;
    const stage = document.querySelector('[data-continuous-canvas]');
    return {
      scrollHeight: document.documentElement.scrollHeight,
      chapterCount: stage?.querySelectorAll('[data-story-chapter]').length ?? 0,
      depth: stage?.getAttribute('data-flow-depth') ?? null,
      frameCount: frames.length,
      frameP95Ms: Number(percentile(.95).toFixed(2)),
      frameMaxMs: Number((frames.at(-1) ?? 0).toFixed(2)),
      longTaskCount: window.__flowReview.longTasks.length,
      longTaskMaxMs: Number(Math.max(0, ...window.__flowReview.longTasks).toFixed(2)),
      cls: Number(window.__flowReview.cls.toFixed(4)),
      videoCount: document.querySelectorAll('video').length,
      blockingExternalScripts: [...document.scripts].filter((script) => script.src && !script.async && !script.defer).length,
    };
  });
  await page.close();
  await ffmpeg(webm, mp4);
  return {
    id, width, height, webm, mp4,
    webmBytes: (await stat(webm)).size,
    mp4Bytes: (await stat(mp4)).size,
    consoleErrors, pageErrors, ...measurements,
  };
}

async function main() {
  await mkdir(path.join(ROOT, 'recordings'), { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  try {
    const recordings = [];
    recordings.push(await record(browser, path.join(ROOT, 'fixtures', 'flow-live-1440.html'), 'flow-scroll-1440', 1440, 900));
    recordings.push(await record(browser, path.join(ROOT, 'fixtures', 'flow-live-390.html'), 'flow-scroll-390', 390, 844));
    const manifestFile = path.join(ROOT, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
    manifest.recordings = recordings;
    await writeFile(manifestFile, JSON.stringify(manifest, null, 2), 'utf8');
    process.stdout.write(`FLOW recordings -> ${path.join(ROOT, 'recordings')}\n`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
