/**
 * MARQUEE conformance capture + AA sweep, on the rendered preview.
 *
 * Serves web/public alongside the rendered document so the self-hosted WOFF2 files resolve at the
 * same absolute paths the real preview uses. font-display:optional means a face that is not in
 * cache at first paint is NEVER used for that load — so every page is loaded twice, and only the
 * second load is measured. Screenshot the first one and you screenshot Arial.
 *
 * AA is computed in Node with the repo's own contrastRatio over colour pairs read from the live
 * page's computed styles. The browser only reports what it painted; it does not do the maths.
 */
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import puppeteer from 'puppeteer-core';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import { TenantPageContent } from '@/components/site-renderer/TenantPageContent';
import { prepareUsMedicalPreview } from '@/lib/us-demo/admin-workflow';
import { previewFullExperienceFromArtifact } from '@/lib/us-demo/full-preview';
import { prospectPublicSourceBlocks } from '@/lib/us-demo/source-extraction';
import { contrastRatio } from '@/lib/design/quality-standards';
import { marqueeAaFloorFor, marqueeTextIsLargeScale } from '@/lib/us-demo/design-language';

const OUT = '/Users/axxykim/.claude/jobs/b468d129/tmp/marquee';
const PORT = 3311;
const CHROME = process.env.CHROME_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PUBLIC = resolve(process.cwd(), 'public');

const MIME: Record<string, string> = {
  '.woff2': 'font/woff2', '.css': 'text/css', '.js': 'text/javascript',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif',
};

function buildDocument(language: 'marquee' | undefined): string {
  const artifact = JSON.parse(readFileSync(
    resolve(process.cwd(), 'scripts/fixtures/us-demo-artifacts/t0-enamel.json'), 'utf8',
  )) as CrawlArtifactPayload;
  const blocks = prospectPublicSourceBlocks(artifact);
  const prepared = prepareUsMedicalPreview({
    artifact,
    renderMode: 'preview-full',
    ...(language ? { designLanguage: language } : {}),
  });
  const html = renderToStaticMarkup(createElement(TenantPageContent, {
    config: prepared.config,
    pageSlug: '',
    interactive: true,
    animate: false,
    hrefForSlug: (s: string) => (s ? `/${s}` : '/'),
    clinicExperience: previewFullExperienceFromArtifact({ artifact, blocks }),
  }));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>MARQUEE — Enamel Dentistry</title></head><body style="margin:0">${html}</body></html>`;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const documents: Record<string, string> = {
    '/': buildDocument('marquee'),
    '/default': buildDocument(undefined),
  };

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${PORT}`);
    const doc = documents[url.pathname];
    if (doc) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(doc);
      return;
    }
    const file = join(PUBLIC, url.pathname);
    if (file.startsWith(PUBLIC) && existsSync(file) && statSync(file).isFile()) {
      response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
      createReadStream(file).pipe(response);
      return;
    }
    response.writeHead(404).end('not found');
  });
  await new Promise<void>((res, rej) => {
    // Without this the promise never settles when the port is held by a stray run, and the whole
    // capture hangs with no output at all instead of saying the port is taken.
    server.once('error', rej);
    server.listen(PORT, '127.0.0.1', res);
  });

  /**
   * The practice's own photography still points at enameldentistry.com, which now 403s this
   * network — so networkidle0 never fires and every request sits until its own timeout. Every
   * off-origin request is aborted instead, which also makes the capture deterministic: the only
   * bytes that reach the page are the ones this repo serves.
   */
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    // NOT 'shell': that mode wants the chrome-headless-shell binary, and pointing it at full
    // Chrome hangs before the first page ever loads.
    headless: true,
    args: ['--no-sandbox', '--force-device-scale-factor=1', '--hide-scrollbars'],
  });

  const report: Record<string, unknown> = {};

  for (const [width, height, label] of [[1440, 1200, '1440'], [390, 844, '390']] as const) {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    /**
     * tsx compiles with esbuild's keepNames, which wraps every function it emits in a `__name`
     * helper — including the ones handed to page.evaluate, where the helper does not exist and
     * every evaluate dies with "__name is not defined". Shimmed as a raw string so this line is
     * not itself compiled.
     */
    await page.evaluateOnNewDocument('globalThis.__name = globalThis.__name || ((f) => f);');
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      void (request.url().startsWith(`http://127.0.0.1:${PORT}`)
        ? request.continue()
        : request.abort());
    });

    // FONT CACHE WARM-UP. Load once so the WOFF2 files land in the HTTP cache, wait for the font
    // set to settle, then reload — font-display:optional only adopts faces already available.
    const settle = async () => {
      // Return a serialisable value: fonts.ready resolves to the FontFaceSet, which is not.
      await page.evaluate(async () => { await (document as Document).fonts.ready; return true; });
    };
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 60_000 });
    await settle();
    await page.reload({ waitUntil: 'load', timeout: 60_000 });
    await settle();

    const fontsUsed = await page.evaluate(() => {
      const heading = document.querySelector('[data-clinic-flow-heading],h1,h2');
      const body = document.querySelector('[data-clinic-flow-copy],p');
      const used = (el: Element | null) => (el
        ? getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/gu, '')
        : null);
      return {
        heading: used(heading),
        body: used(body),
        // Did the browser actually ADOPT the face, or silently fall back?
        headingRendered: heading
          ? (document as Document).fonts.check(
              `${getComputedStyle(heading).fontWeight} 40px "Bricolage Grotesque"`,
            )
          : false,
        bodyRendered: (document as Document).fonts.check('400 16px "DM Sans"'),
        loaded: [...(document as Document).fonts].map((f) => `${f.family} ${f.weight} ${f.status}`),
      };
    });

    await page.screenshot({
      path: `${OUT}/marquee-enamel-${label}-full.png`,
      fullPage: true,
    });

    const sections = await page.evaluate(() => {
      const out: { key: string; top: number; height: number }[] = [];
      const strip = document.querySelector('[data-marquee-utility-strip]');
      if (strip) {
        const r = strip.getBoundingClientRect();
        out.push({ key: 'utility-strip', top: r.top + scrollY, height: r.height });
      }
      const header = document.querySelector('.anaks-tenant-header, header');
      if (header) {
        const r = header.getBoundingClientRect();
        out.push({ key: 'header', top: r.top + scrollY, height: r.height });
      }
      document.querySelectorAll('[data-clinic-flow-section]').forEach((el, i) => {
        const r = el.getBoundingClientRect();
        out.push({
          key: `${String(i + 1).padStart(2, '0')}-${el.getAttribute('data-section-type') ?? el.getAttribute('data-clinic-flow-section') ?? 'section'}`,
          top: r.top + scrollY,
          height: r.height,
        });
      });
      const booking = document.querySelector('[data-clinic-sticky-booking]');
      if (booking) {
        const r = booking.getBoundingClientRect();
        out.push({ key: 'booking-bar', top: r.top + scrollY, height: r.height });
      }
      return out;
    });

    for (const section of sections) {
      if (section.height < 4) continue;
      await page.screenshot({
        path: `${OUT}/marquee-enamel-${label}-${section.key}.png`,
        clip: {
          x: 0,
          y: Math.max(0, Math.round(section.top)),
          width,
          height: Math.min(Math.round(section.height), 4000),
        },
        captureBeyondViewport: true,
      });
    }

    // Every rendered text node, with its composited background.
    const nodes = await page.evaluate(() => {
      const compositedBackground = (start: Element): string => {
        let el: Element | null = start;
        while (el) {
          const bg = getComputedStyle(el).backgroundColor;
          const m = /rgba?\(([^)]+)\)/u.exec(bg);
          if (m) {
            const parts = m[1].split(',').map((v) => Number.parseFloat(v));
            if ((parts[3] ?? 1) > 0.85) return bg;
          }
          el = el.parentElement;
        }
        return 'rgb(255, 255, 255)';
      };
      const toHex = (colour: string): string => {
        const m = /rgba?\(([^)]+)\)/u.exec(colour);
        if (!m) return '#000000';
        const [r, g, b] = m[1].split(',').map((v) => Math.round(Number.parseFloat(v)));
        return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      };
      const out: {
        text: string; colour: string; background: string;
        size: number; weight: number; tag: string; hook: string;
      }[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const seen = new Set<Element>();
      let node = walker.nextNode();
      while (node) {
        const text = (node.textContent ?? '').trim();
        const parent = node.parentElement;
        if (text.length > 0 && parent && !seen.has(parent)) {
          const style = getComputedStyle(parent);
          const rect = parent.getBoundingClientRect();
          if (style.visibility !== 'hidden' && style.display !== 'none'
            && rect.width > 0 && rect.height > 0 && Number.parseFloat(style.opacity) > 0.05) {
            seen.add(parent);
            const hookAttr = [...parent.attributes]
              .map((a) => a.name)
              .find((n) => n.startsWith('data-clinic-') || n.startsWith('data-marquee-'));
            out.push({
              text: text.slice(0, 60),
              colour: toHex(style.color),
              background: toHex(compositedBackground(parent)),
              size: Number.parseFloat(style.fontSize),
              weight: Number.parseInt(style.fontWeight, 10) || 400,
              tag: parent.tagName.toLowerCase(),
              hook: hookAttr ?? parent.className?.toString().slice(0, 40) ?? '',
            });
          }
        }
        node = walker.nextNode();
      }
      return out;
    });

    // The maths happens HERE, with the repo's own function.
    const results = nodes.map((n) => {
      const ratio = contrastRatio(n.colour, n.background);
      const floor = marqueeAaFloorFor(n.size, n.weight);
      return {
        ...n,
        ratio: Number(ratio.toFixed(3)),
        floor,
        large: marqueeTextIsLargeScale(n.size, n.weight),
        pass: ratio >= floor,
      };
    });
    const failures = results.filter((r) => !r.pass);

    console.log(`\n===== ${label}px`);
    console.log('heading font :', fontsUsed.heading, '| adopted:', fontsUsed.headingRendered);
    console.log('body font    :', fontsUsed.body, '| adopted:', fontsUsed.bodyRendered);
    console.log('sections shot:', sections.filter((s) => s.height >= 4).map((s) => s.key).join(', '));
    console.log(`text nodes   : ${results.length}, failures: ${failures.length}`);
    const byClass = {
      'normal text (4.5)': results.filter((r) => !r.large),
      'large scale (3.0)': results.filter((r) => r.large),
    };
    for (const [name, group] of Object.entries(byClass)) {
      const bad = group.filter((r) => !r.pass);
      const min = group.length ? Math.min(...group.map((r) => r.ratio)) : 0;
      console.log(`  ${name.padEnd(20)} n=${String(group.length).padEnd(4)} min=${min.toFixed(2)}  fail=${bad.length}`);
    }
    for (const f of failures.slice(0, 12)) {
      console.log(`  FAIL ${f.ratio} < ${f.floor}  ${f.colour} on ${f.background}  ${f.size}px/${f.weight}  <${f.tag}> ${f.hook}  "${f.text}"`);
    }
    report[label] = { fontsUsed, sections, total: results.length, failures };
    await page.close();
  }

  writeFileSync(`${OUT}/aa-report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nshots + aa-report.json -> ${OUT}`);
  await browser.close();
  server.close();
}

void main().catch((e: unknown) => { console.error(e); process.exitCode = 1; });
