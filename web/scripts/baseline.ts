/**
 * Regression baseline for the Wednesday batch. Re-run after each step and diff.
 *
 * publish-hypothesis is server-only, so bundle it first (the output is a build artifact and is
 * not committed):
 *   node_modules/.bin/esbuild src/lib/us-demo/publish-hypothesis.ts --bundle --platform=node \
 *     --format=esm --conditions=default \
 *     --alias:server-only=./scripts/_empty-server-only.ts --outfile=scripts/_ph.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import { compileUsMedicalDemo } from '@/lib/us-demo/source-compiler';
import { buildUsMedicalCompilationAudit } from '@/lib/us-demo/compilation-audit';
import { buildUsDemoStructureComparisons } from './_ph.mjs';

const TMP = '/Users/axxykim/.claude/jobs/b468d129/tmp';
const samples = ['dental360', 'cameods', 'iddental'] as const;
const out: Record<string, unknown> = {};

for (const name of samples) {
  const artifact = JSON.parse(readFileSync(`${TMP}/base-${name}.json`, 'utf8')) as CrawlArtifactPayload;
  const compilation = compileUsMedicalDemo(artifact, { renderMode: 'preview-full' });
  const config = compilation.config;
  const audit = buildUsMedicalCompilationAudit({ artifact, compilation, renderMode: 'preview-full', config });
  const pages = buildUsDemoStructureComparisons(artifact, config).map((e: any) => ({
    slug: e.pageSlug || 'home',
    rawSource: e.comparison.source.score,
    rawDemo: e.comparison.publishHypothesis.score,
    asLaunchedSource: e.comparison.asLaunched.source.score,
    asLaunchedDemo: e.comparison.asLaunched.publishHypothesis.score,
  }));
  out[name] = {
    pageCount: config.pages.length,
    slugs: config.pages.map((p) => p.slug || 'home'),
    navItems: config.pages.filter((p) => p.showInNav !== false).length,
    sectionsPerPage: config.pages.map((p) => p.sections.length),
    imagesPerPage: audit.pages.map((p) => p.imageCount),
    charsPerPage: audit.pages.map((p) => p.characterCount),
    contributingPages: `${audit.source.contributingPageCount}/${audit.source.crawledPageCount}`,
    blocksByKind: audit.source.blocksByKind,
    imageFunnel: { crawled: audit.images.crawledCount, projected: audit.images.projectedCount, eligible: audit.images.eligibleCount, used: audit.images.usedCount },
    template: audit.template,
    paletteMeta: audit.palette.meta,
    paletteSlots: audit.palette.slots,
    asLaunched: pages,
  };
  const s = out[name] as any;
  console.log(`${name.padEnd(11)} pages=${s.pageCount} nav=${s.navItems} contributing=${s.contributingPages} template=${s.template.designatedByDoc} palette=${s.paletteMeta.origin}`);
  console.log(`             as-launched demo: ${pages.map((p: any) => p.asLaunchedDemo).join(',')} | source: ${pages.map((p: any) => p.asLaunchedSource).join(',')}`);
}
writeFileSync(`${TMP}/BASELINE.json`, JSON.stringify(out, null, 1));
console.log('\nwritten:', `${TMP}/BASELINE.json`);
