import { writeFile } from 'node:fs/promises';
import {
  assertUrlAllowed,
  safeFetch,
} from '@/lib/import/extract';
import { DABOIM_CRAWLER_USER_AGENT } from '@/lib/crawl/contracts';

const SITEMAP_URL = 'https://edomclinic.com/sitemap.xml';
const OUTPUT_PATH = '/private/tmp/ko-clinic-p1/original-sitemap-audit.json';
const MIN_REQUEST_INTERVAL_MS = 1_000;
const MAX_REDIRECTS = 3;

interface ProbeResult {
  sourceUrl: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  redirects: string[];
  error?: string;
}

async function probe(sourceUrl: string): Promise<ProbeResult> {
  let current = sourceUrl;
  const redirects: string[] = [];
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    try {
      await assertUrlAllowed(current);
      const response = await fetch(current, {
        redirect: 'manual',
        headers: {
          'user-agent': DABOIM_CRAWLER_USER_AGENT,
          accept: 'text/html,application/xhtml+xml,*/*;q=0.1',
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) {
          return {
            sourceUrl,
            finalUrl: current,
            status: response.status,
            ok: false,
            redirects,
            error: 'redirect-without-location',
          };
        }
        current = new URL(location, current).toString();
        redirects.push(current);
        continue;
      }
      const status = response.status;
      await response.body?.cancel();
      return {
        sourceUrl,
        finalUrl: current,
        status,
        ok: status >= 200 && status < 300,
        redirects,
      };
    } catch (error) {
      if (hop < MAX_REDIRECTS) {
        await new Promise((resolve) => setTimeout(resolve, 750 * (hop + 1)));
        continue;
      }
      return {
        sourceUrl,
        finalUrl: current,
        status: 0,
        ok: false,
        redirects,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return {
    sourceUrl,
    finalUrl: current,
    status: 0,
    ok: false,
    redirects,
    error: 'too-many-redirects',
  };
}

async function main() {
  const { res } = await safeFetch(SITEMAP_URL, {
    timeoutMs: 12_000,
    maxRedirects: 3,
    accept: 'application/xml,text/xml,*/*;q=0.1',
  });
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/giu)]
    .map((match) => match[1].trim());
  const uniqueUrls = [...new Set(urls)];
  const results: ProbeResult[] = [];
  let lastRequestAt = 0;
  for (const [index, url] of uniqueUrls.entries()) {
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
    }
    lastRequestAt = Date.now();
    results.push(await probe(url));
    if ((index + 1) % 25 === 0 || index + 1 === uniqueUrls.length) {
      process.stdout.write(`[edom-sitemap] ${index + 1}/${uniqueUrls.length}\n`);
    }
  }
  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sitemapUrl: SITEMAP_URL,
    listed: uniqueUrls.length,
    live: results.filter((result) => result.ok).length,
    dead: results.filter((result) => !result.ok).length,
    results,
  };
  await writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`[edom-sitemap] report=${OUTPUT_PATH}\n`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
