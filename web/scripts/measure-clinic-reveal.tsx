import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import puppeteer from 'puppeteer-core';
import { TenantPageContent } from '@/components/site-renderer';
import type { SiteConfig } from '@/lib/types/site';

const INPUT = process.env.CLINIC_REVEAL_CONFIG
  ?? '/private/tmp/clinic-nav/edom-before/site-config.json';
const OUTPUT = process.env.CLINIC_REVEAL_OUTPUT
  ?? '/private/tmp/clinic-nav/reveal-before';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

interface RevealSample {
  id: string;
  group: string | null;
  rectTop: number;
  opacity: string;
  transform: string;
  transitionDuration: string;
  transitionProperty: string;
  visibility: string;
  classes: string[];
}

function documentFor(config: SiteConfig): string {
  const body = renderToStaticMarkup(createElement(TenantPageContent, {
    config,
    pageSlug: '',
    interactive: false,
    animate: true,
    runtimeDelivery: 'inline',
  }));
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;min-height:100%;overflow-x:hidden}.hidden{display:none!important}@media(min-width:1280px){.xl\\:block{display:block!important}.xl\\:hidden{display:none!important}}</style></head><body>${body}</body></html>`;
}

async function main(): Promise<void> {
  const config = JSON.parse(await readFile(INPUT, 'utf8')) as SiteConfig;
  await mkdir(OUTPUT, { recursive: true });
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
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (request.isNavigationRequest() || request.url().startsWith('data:')) request.continue();
      else request.abort();
    });
    await page.setContent(documentFor(config), { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => scrollTo(0, 0));
    await new Promise((resolve) => setTimeout(resolve, 150));
    const pre = await page.evaluate(() => {
      const result: RevealSample[] = [];
      const nodes = document.querySelectorAll<HTMLElement>(
        '[data-ko-reveal-group][data-m="reveal"]',
      );
      nodes.forEach((node, index) => {
        const rect = node.getBoundingClientRect();
        if (rect.top < innerHeight) return;
        node.dataset.clinicRevealAudit = String(index);
        const style = getComputedStyle(node);
        result.push({
          id: String(index),
          group: node.getAttribute('data-ko-reveal-group'),
          rectTop: rect.top,
          opacity: style.opacity,
          transform: style.transform,
          transitionDuration: style.transitionDuration,
          transitionProperty: style.transitionProperty,
          visibility: style.visibility,
          classes: [...node.classList],
        });
      });
      return result;
    });
    await page.screenshot({ path: path.join(OUTPUT, 'frame-00-pre.png') });
    const live: RevealSample[] = [];
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    let frame = 1;
    for (let y = 300; y < scrollHeight; y += 300) {
      await page.evaluate((nextY) => scrollTo(0, nextY), y);
      for (let poll = 0; poll < 4; poll += 1) {
        await new Promise((resolve) => setTimeout(resolve, 60));
        const samples = await page.evaluate(() => {
          const result: RevealSample[] = [];
          document.querySelectorAll<HTMLElement>('[data-clinic-reveal-audit]').forEach((node) => {
            const rect = node.getBoundingClientRect();
            if (rect.bottom <= 0 || rect.top >= innerHeight) return;
            const style = getComputedStyle(node);
            result.push({
              id: node.dataset.clinicRevealAudit ?? '',
              group: node.getAttribute('data-ko-reveal-group'),
              rectTop: rect.top,
              opacity: style.opacity,
              transform: style.transform,
              transitionDuration: style.transitionDuration,
              transitionProperty: style.transitionProperty,
              visibility: style.visibility,
              classes: [...node.classList],
            });
          });
          return result;
        });
        live.push(...samples);
      }
      if (frame <= 3 && live.length > 0) {
        await page.screenshot({ path: path.join(OUTPUT, `frame-0${frame}-live.png`) });
        frame += 1;
      }
    }
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await new Promise((resolve) => setTimeout(resolve, 900));
    const post = await page.evaluate(() => {
      const result: RevealSample[] = [];
      document.querySelectorAll<HTMLElement>('[data-clinic-reveal-audit]').forEach((node) => {
        const style = getComputedStyle(node);
        result.push({
          id: node.dataset.clinicRevealAudit ?? '',
          group: node.getAttribute('data-ko-reveal-group'),
          rectTop: node.getBoundingClientRect().top,
          opacity: style.opacity,
          transform: style.transform,
          transitionDuration: style.transitionDuration,
          transitionProperty: style.transitionProperty,
          visibility: style.visibility,
          classes: [...node.classList],
        });
      });
      return result;
    });
    await page.screenshot({ path: path.join(OUTPUT, 'frame-04-post.png') });
    const postById = new Map(post.map((sample) => [sample.id, sample]));
    const transitions = pre.map((sample) => {
      const after = postById.get(sample.id);
      return {
        id: sample.id,
        pre: sample,
        post: after ?? null,
        fired: Boolean(after && (
          Number(after.opacity) - Number(sample.opacity) > 0.3
          || after.transform !== sample.transform
          || (sample.visibility === 'hidden' && after.visibility === 'visible')
        )),
      };
    });
    const report = {
      input: INPUT,
      viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
      scrollStartedAtZero: true,
      pre,
      live,
      post,
      transitions,
      summary: {
        preCandidateCount: pre.length,
        preHiddenCount: pre.filter((sample) => (
          Number(sample.opacity) === 0 || sample.transform !== 'none'
        )).length,
        preVisibleCount: pre.filter((sample) => (
          Number(sample.opacity) === 1 && sample.transform === 'none'
        )).length,
        preTransition280Count: pre.filter((sample) => (
          sample.transitionDuration.includes('0.28s')
        )).length,
        liveTransition280Count: live.filter((sample) => (
          sample.transitionDuration.includes('0.28s')
        )).length,
        postTransition280Count: post.filter((sample) => (
          sample.transitionDuration.includes('0.28s')
        )).length,
        firedCount: transitions.filter((transition) => transition.fired).length,
        stuckHiddenCount: transitions.filter((transition) => (
          !transition.fired
          && (Number(transition.pre.opacity) === 0 || transition.pre.transform !== 'none')
        )).length,
        visibilityHiddenCount: pre.filter((sample) => sample.visibility === 'hidden').length,
      },
    };
    await writeFile(path.join(OUTPUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
  } finally {
    await browser.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
