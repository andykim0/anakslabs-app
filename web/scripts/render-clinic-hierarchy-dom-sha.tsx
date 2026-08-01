import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { parse } from 'node-html-parser';
import { TenantPageContent } from '@/components/site-renderer';
import type { SiteConfig } from '@/lib/types/site';

const INPUT = process.env.CLINIC_HIERARCHY_REGRESSION_INPUT
  ?? '/private/tmp/clinic-hierarchy/regression-input.json';
const OUTPUT = process.env.CLINIC_HIERARCHY_DOM_OUTPUT
  ?? '/private/tmp/clinic-hierarchy/dom-sha.json';

interface RegressionInput {
  version: 1;
  us: Array<{
    renderMode: 'outreach-safe' | 'preview-full';
    outputSha256: string;
    configSha256: string;
    manifestSha256: string;
    config: SiteConfig;
  }>;
  ko: SiteConfig;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function domRows(surface: string, config: SiteConfig) {
  return config.pages.map((page) => {
    const markup = renderToStaticMarkup(createElement(TenantPageContent, {
      config,
      pageSlug: page.slug,
      interactive: false,
      animate: false,
      runtimeDelivery: 'inline',
    }));
    const root = parse(markup);
    const main = root.querySelector('main')?.outerHTML;
    const site = root.querySelector('.anaks-site')?.outerHTML;
    if (!main || !site) throw new Error(`CLINIC_HIERARCHY_DOM_MISSING:${surface}:${page.slug}`);
    return {
      surface,
      slug: page.slug,
      mainSha256: sha256(main),
      anaksSiteSha256: sha256(site),
    };
  });
}

async function main(): Promise<void> {
  const input = JSON.parse(await readFile(INPUT, 'utf8')) as RegressionInput;
  const rows = [
    ...input.us.flatMap((entry) => domRows(`us:${entry.renderMode}`, entry.config)),
    ...domRows('ko:import', input.ko),
  ];
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify({ version: 1, input: INPUT, rows }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    output: OUTPUT,
    routeCount: rows.length,
    usRouteCount: rows.filter((row) => row.surface.startsWith('us:')).length,
    koRouteCount: rows.filter((row) => row.surface === 'ko:import').length,
  }, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
