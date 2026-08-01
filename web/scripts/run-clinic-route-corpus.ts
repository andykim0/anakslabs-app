import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildImportPreviewSiteConfig } from '@/lib/crawl/import-preview';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import {
  compileRobustClinicArtifact,
  type RobustClinicCompilation,
} from '@/lib/clinic-engine/robust-compile';
import {
  KO_MEDICAL_IMPORT_PROFILE,
  US_MEDICAL_OUTREACH_PROFILE,
} from '@/lib/clinic-engine/profiles';
import {
  extractRobustClinicSource,
  normalizeRobustClinicText,
  type RobustClinicDocument,
  type RobustClinicSourceBlock,
} from '@/lib/clinic-engine/robust-source';
import type { ClinicEngineProfile } from '@/lib/clinic-engine/contracts';
import type { CanvasElement, SiteConfig } from '@/lib/types/site';

const CORPUS_ROOT = path.resolve(process.cwd(), '../docs/research/corpus-2026-08');
const OUTPUT_ROOT = '/private/tmp/clinic-route';

interface CorpusTarget {
  market: 'KR' | 'US';
  url: string;
  canonicalUrl: string;
  predictedGrade: 'L1' | 'L2' | 'L3' | 'L4' | 'unrecorded';
}

interface CorpusSiteRecord {
  version: 1;
  target: CorpusTarget;
  crawlStartedAt: string;
  crawlCompletedAt: string;
  status: 'success' | 'failure';
  artifact?: CrawlArtifactPayload;
  documents: Array<{
    sourceUrl: string;
    finalUrl: string;
    postModalDomFile: string;
    postModalDomSha256: string;
  }>;
}

interface CorpusExclusion {
  scope: 'page' | 'site';
  siteId: string;
  sourceUrl: string;
  reasonCode: string;
  reason: string;
}

interface CorpusManifest {
  generatedAt: string;
  targetCount: number;
  siteFiles: string[];
  excluded: CorpusExclusion[];
}

function normalizedUrl(value: string): string {
  const parsed = new URL(value);
  parsed.hash = '';
  if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/u, '');
  return parsed.toString();
}

function allText(config: SiteConfig): string[] {
  const result: string[] = [];
  const append = (element: CanvasElement) => {
    if (element.kind === 'text') result.push(normalizeRobustClinicText(element.text));
    if (element.kind === 'button') result.push(normalizeRobustClinicText(element.label));
  };
  for (const page of config.pages) {
    for (const section of page.sections) {
      for (const element of section.elements) append(element);
    }
  }
  return result.filter(Boolean);
}

function baselinePlacedIds(
  blocks: readonly RobustClinicSourceBlock[],
  config: SiteConfig,
): Set<string> {
  const available = allText(config).map((text, index) => ({ text, index, used: false }));
  const placed = new Set<string>();
  for (const block of blocks) {
    const source = normalizeRobustClinicText(block.text);
    const match = available.find((candidate) => (
      !candidate.used
      && (
        candidate.text === source
        || (source.length >= 12 && candidate.text.includes(source))
      )
    ));
    if (!match) continue;
    match.used = true;
    placed.add(block.id);
  }
  return placed;
}

async function readGzipJson<T>(file: string): Promise<T> {
  return JSON.parse(gunzipSync(await readFile(file)).toString('utf8')) as T;
}

async function readDocuments(
  record: CorpusSiteRecord,
  excludedPages: ReadonlySet<string>,
): Promise<RobustClinicDocument[]> {
  const result: RobustClinicDocument[] = [];
  for (const document of record.documents) {
    if (
      excludedPages.has(normalizedUrl(document.sourceUrl))
      || excludedPages.has(normalizedUrl(document.finalUrl))
    ) continue;
    const html = gunzipSync(
      await readFile(path.join(CORPUS_ROOT, document.postModalDomFile)),
    ).toString('utf8');
    result.push({ sourceUrl: document.sourceUrl, finalUrl: document.finalUrl, html });
  }
  return result;
}

function filteredArtifact(
  artifact: CrawlArtifactPayload,
  excludedPages: ReadonlySet<string>,
): CrawlArtifactPayload {
  return {
    ...artifact,
    pages: artifact.pages.filter((page) => !excludedPages.has(normalizedUrl(page.url))),
  };
}

function profileFor(target: CorpusTarget): ClinicEngineProfile {
  return target.market === 'KR'
    ? KO_MEDICAL_IMPORT_PROFILE
    : US_MEDICAL_OUTREACH_PROFILE;
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function siteIdFor(file: string): string {
  return file.split('/')[1] ?? '';
}

function compileMetrics(input: {
  siteId: string;
  record: CorpusSiteRecord;
  artifact: CrawlArtifactPayload;
  documents: RobustClinicDocument[];
  compiled?: RobustClinicCompilation;
  compileFailureReason?: string;
  baseline: SiteConfig;
}) {
  const profile = profileFor(input.record.target);
  const plan = extractRobustClinicSource({
    artifact: input.artifact,
    documents: input.documents,
    profile,
  });
  const baselinePlaced = baselinePlacedIds(plan.blocks, input.baseline);
  const baselineTargetPlaced = plan.targetBlocks.filter((block) => baselinePlaced.has(block.id)).length;
  const afterPlaced = new Set(input.compiled?.audit.placedBlockIds ?? []);
  const afterAllPlaced = plan.blocks.filter((block) => afterPlaced.has(block.id)).length;
  const baselineAllPlaced = plan.blocks.filter((block) => baselinePlaced.has(block.id)).length;
  const variants = input.compiled?.audit.pages.flatMap((page) => page.layoutVariants) ?? [];
  return {
    siteId: input.siteId,
    market: input.record.target.market,
    seedUrl: input.record.target.url,
    predictedGrade: input.record.target.predictedGrade,
    sourcePageCount: plan.pages.length,
    baselineOutputPageCount: input.baseline.pages.length,
    afterOutputPageCount: input.compiled?.config.pages.length ?? 0,
    sourceBlockCount: plan.blocks.length,
    legitimateExclusionCount: plan.excludedBlocks.length,
    targetBlockCount: plan.targetBlocks.length,
    exclusionBreakdown: input.compiled?.audit.exclusions ?? {
      'footer-legal': plan.excludedBlocks.filter((block) => block.exclusion === 'footer-legal').length,
      'navigation-label': plan.excludedBlocks.filter((block) => block.exclusion === 'navigation-label').length,
      'skip-link': plan.excludedBlocks.filter((block) => block.exclusion === 'skip-link').length,
    },
    baseline: {
      placedAll: baselineAllPlaced,
      placedBody: baselineTargetPlaced,
      totalPlacementRate: rate(baselineAllPlaced, plan.blocks.length),
      bodyPlacementRate: rate(baselineTargetPlaced, plan.targetBlocks.length),
    },
    after: {
      compileStatus: input.compiled ? 'success' : 'failure',
      ...(input.compileFailureReason ? { failureReason: input.compileFailureReason } : {}),
      placedAll: afterAllPlaced,
      placedBody: input.compiled?.audit.placedBlockIds.length ?? 0,
      totalPlacementRate: rate(afterAllPlaced, plan.blocks.length),
      bodyPlacementRate: rate(input.compiled?.audit.placedBlockIds.length ?? 0, plan.targetBlocks.length),
      unplacedTargetBlockCount: input.compiled?.audit.unplacedTargetBlockIds.length
        ?? plan.targetBlocks.length,
      renderBlockViolationCount: input.compiled?.audit.renderBlockViolationCount ?? 0,
    },
    layoutVariants: Object.fromEntries(
      [...new Set(variants)].sort().map((variant) => [
        variant,
        variants.filter((value) => value === variant).length,
      ]),
    ),
  };
}

async function main(): Promise<void> {
  const manifest = JSON.parse(
    await readFile(path.join(CORPUS_ROOT, 'manifest.json'), 'utf8'),
  ) as CorpusManifest;
  const siteExclusions = new Set(manifest.excluded
    .filter((entry) => entry.scope === 'site')
    .map((entry) => entry.siteId));
  const pageExclusionsBySite = new Map<string, Set<string>>();
  for (const entry of manifest.excluded.filter((candidate) => candidate.scope === 'page')) {
    const values = pageExclusionsBySite.get(entry.siteId) ?? new Set<string>();
    values.add(normalizedUrl(entry.sourceUrl));
    pageExclusionsBySite.set(entry.siteId, values);
  }
  const sites = [];
  const configs: Array<{
    siteId: string;
    market: 'KR' | 'US';
    config?: SiteConfig;
    bodyPlacementRate: number;
    totalPlacementRate: number;
  }> = [];
  for (const file of manifest.siteFiles) {
    const siteId = siteIdFor(file);
    if (siteExclusions.has(siteId)) continue;
    const record = await readGzipJson<CorpusSiteRecord>(path.join(CORPUS_ROOT, file));
    if (record.status !== 'success' || !record.artifact) continue;
    const excludedPages = pageExclusionsBySite.get(siteId) ?? new Set<string>();
    const artifact = filteredArtifact(record.artifact, excludedPages);
    const documents = await readDocuments(record, excludedPages);
    const profile = profileFor(record.target);
    const baseline = buildImportPreviewSiteConfig(artifact, {
      purposeId: 'booking_service',
      industry: 'clinic',
    }).config;
    let compiled: RobustClinicCompilation | undefined;
    let compileFailureReason: string | undefined;
    try {
      compiled = compileRobustClinicArtifact({ artifact, documents, profile });
    } catch (error) {
      compileFailureReason = error instanceof Error ? error.message : String(error);
    }
    const metrics = compileMetrics({
      siteId,
      record,
      artifact,
      documents,
      compiled,
      compileFailureReason,
      baseline,
    });
    sites.push(metrics);
    configs.push({
      siteId,
      market: record.target.market,
      ...(compiled ? { config: compiled.config } : {}),
      bodyPlacementRate: metrics.after.bodyPlacementRate,
      totalPlacementRate: metrics.after.totalPlacementRate,
    });
  }
  await mkdir(OUTPUT_ROOT, { recursive: true });
  await writeFile(
    path.join(OUTPUT_ROOT, 'placement-raw.json'),
    JSON.stringify({
      version: 1,
      corpusGeneratedAt: manifest.generatedAt,
      measuredAt: new Date().toISOString(),
      issuance: false,
      eligibleSiteCount: sites.length,
      sites,
    }, null, 2),
  );
  const ranked = [...configs].sort((left, right) => (
    left.totalPlacementRate - right.totalPlacementRate
    || left.siteId.localeCompare(right.siteId)
  ));
  const captureCandidates = [
    ...ranked.slice(0, 3).map((entry) => ({ ...entry, rank: 'bottom' as const })),
    ...ranked.slice(-3).map((entry) => ({ ...entry, rank: 'top' as const })),
  ];
  await writeFile(
    path.join(OUTPUT_ROOT, 'capture-configs.json'),
    JSON.stringify(captureCandidates, null, 2),
  );
  process.stdout.write(JSON.stringify({
    output: path.join(OUTPUT_ROOT, 'placement-raw.json'),
    eligibleSiteCount: sites.length,
    captureCandidates: captureCandidates.map((entry) => ({
      siteId: entry.siteId,
      rank: entry.rank,
      bodyPlacementRate: entry.bodyPlacementRate,
      totalPlacementRate: entry.totalPlacementRate,
    })),
  }, null, 2));
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
