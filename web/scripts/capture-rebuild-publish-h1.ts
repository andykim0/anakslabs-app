import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import Module from 'node:module';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';
import type { SiteConfig } from '@/lib/types/site';

const siteIdEnv = process.env.REBUILD_PUBLISH_SITE_ID;
const outputDirectory = process.env.REBUILD_PUBLISH_CAPTURE_DIR
  ?? '/private/tmp/rebuild-publish-h1/captures';
const chrome = process.env.ANAKS_CHROME_EXECUTABLE_PATH?.trim()
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

if (!siteIdEnv) throw new Error('REBUILD_PUBLISH_SITE_ID is required.');
const siteId: string = siteIdEnv;
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Supabase service credentials are required.');
}

type ModuleLoader = (request: string, parent: unknown, isMain: boolean) => unknown;
const moduleInternals = Module as unknown as { _load: ModuleLoader };
const originalLoad = moduleInternals._load;
moduleInternals._load = function loadForServerDriver(
  request: string,
  parent: unknown,
  isMain: boolean,
): unknown {
  if (request === 'server-only') return {};
  return originalLoad.call(this, request, parent, isMain);
};

async function builtCss(): Promise<string> {
  const root = path.resolve(process.cwd(), '.next/static');
  const files = (await readdir(root, { recursive: true }))
    .filter((file) => file.endsWith('.css'))
    .sort();
  return (await Promise.all(files.map((file) => readFile(path.join(root, file), 'utf8'))))
    .join('\n');
}

async function main(): Promise<void> {
  const [{ renderStaticDocument }, css] = await Promise.all([
    import('@/lib/export/render-static'),
    builtCss(),
  ]);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const result = await supabase
    .from('sites')
    .select('draft_config')
    .eq('id', siteId)
    .single();
  if (result.error) throw new Error(`site lookup failed: ${result.error.message}`);
  const config = result.data.draft_config as SiteConfig | null;
  if (!config) throw new Error('The measured site has no draft config.');
  const rendered = renderStaticDocument({
    config,
    pageSlug: '',
    siteUrl: 'https://rebuild-publish-measurement.invalid',
  });
  const html = rendered.replace('</head>', `<style>${css}</style></head>`);
  await mkdir(outputDirectory, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-extensions',
      '--mute-audio',
    ],
  });
  const captures = [];
  try {
    for (const width of [375, 1024, 1440]) {
      const page = await browser.newPage();
      await page.setViewport({ width, height: 1000, deviceScaleFactor: 1 });
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      const consoleErrors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 10_000 }).catch(() => undefined);
      await page.evaluate(() => scrollTo(0, 0));
      const metrics = await page.evaluate(() => {
        const h1s = Array.from(document.querySelectorAll<HTMLElement>('h1'));
        const firstImage = document.querySelector<HTMLImageElement>('main img');
        return {
          mainCount: document.querySelectorAll('main').length,
          h1Count: h1s.length,
          h1Text: h1s.map((heading) => heading.innerText.replace(/\s+/gu, ' ').trim()),
          scrollHeight: document.documentElement.scrollHeight,
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
          firstImageLoading: firstImage?.loading ?? null,
          firstImageFetchPriority: firstImage?.fetchPriority ?? null,
        };
      });
      const file = path.join(outputDirectory, `home-${width}.png`);
      await page.screenshot({ path: file });
      captures.push({ width, file, consoleErrors, ...metrics });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  const report = {
    source: 'remote-issued-site-draft-rendered-through-renderStaticDocument',
    siteId,
    captures,
  };
  const reportFile = path.join(outputDirectory, 'evidence.json');
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ reportFile, captures }, null, 2)}\n`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
