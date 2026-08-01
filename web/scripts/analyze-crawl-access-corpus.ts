import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import {
  extractRobustClinicSource,
  type RobustClinicDocument,
} from '@/lib/clinic-engine/robust-source';
import {
  KO_MEDICAL_IMPORT_PROFILE,
  US_MEDICAL_OUTREACH_PROFILE,
} from '@/lib/clinic-engine/profiles';

const CORPUS_ROOT = path.resolve(process.cwd(), '../docs/research/corpus-2026-08');
const OUTPUT_ROOT = '/private/tmp/crawl-access';

interface CorpusTarget {
  market: 'KR' | 'US';
  url: string;
}

interface RemovedDetail {
  selector: string;
  reason: 'explicit_close' | 'dim_backdrop';
}

interface CorpusDocumentRecord {
  sourceUrl: string;
  finalUrl: string;
  postModalDomFile: string;
  postModalDomSha256: string;
  removedDetails?: RemovedDetail[];
}

interface CorpusSiteRecord {
  target: CorpusTarget;
  status: 'success' | 'failure';
  artifact?: CrawlArtifactPayload;
  documents: CorpusDocumentRecord[];
}

interface CorpusExclusion {
  scope: 'page' | 'site';
  siteId: string;
  sourceUrl: string;
}

interface UncrawledDestination {
  siteId: string;
  url: string;
  labels: string[];
  discoveredOn: string[];
}

interface CorpusManifest {
  generatedAt: string;
  targetCount: number;
  siteFiles: string[];
  excluded: CorpusExclusion[];
  uncrawledDestinations?: UncrawledDestination[];
  navigationAudit?: {
    generatedAt: string;
    navigationLabelCount: number;
    crawledDestinationLabelCount: number;
    uncrawledDestinationLabelCount: number;
    noInternalDestinationLabelCount: number;
    uncrawledDestinationCount: number;
  };
}

function normalizedUrl(value: string): string {
  const parsed = new URL(value);
  parsed.hash = '';
  if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/u, '');
  return parsed.toString();
}

function normalizedHostname(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/^www\./u, '').replace(/\.$/u, '');
}

/**
 * The corpus already fixes the site boundary. A destination is site-owned only when it uses an
 * observed host, its bare/www spelling, or a direct parent/child host relation. Sibling domains
 * are deliberately not inferred here; an unobserved ownership claim would inflate page counts.
 */
function belongsToObservedSite(hostname: string, observedHosts: ReadonlySet<string>): boolean {
  const candidate = normalizedHostname(hostname);
  return [...observedHosts].some((observedValue) => {
    const observed = normalizedHostname(observedValue);
    return candidate === observed
      || candidate.endsWith(`.${observed}`)
      || observed.endsWith(`.${candidate}`);
  });
}

function siteIdFor(file: string): string {
  return file.split('/')[1] ?? '';
}

async function readGzipJson<T>(file: string): Promise<T> {
  return JSON.parse(gunzipSync(await readFile(file)).toString('utf8')) as T;
}

async function readDocuments(
  record: CorpusSiteRecord,
  excludedPages: ReadonlySet<string>,
): Promise<RobustClinicDocument[]> {
  const documents: RobustClinicDocument[] = [];
  for (const document of record.documents) {
    if (
      excludedPages.has(normalizedUrl(document.sourceUrl))
      || excludedPages.has(normalizedUrl(document.finalUrl))
    ) continue;
    documents.push({
      sourceUrl: document.sourceUrl,
      finalUrl: document.finalUrl,
      html: gunzipSync(
        await readFile(path.join(CORPUS_ROOT, document.postModalDomFile)),
      ).toString('utf8'),
    });
  }
  return documents;
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

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, 'en'));
}

async function main(): Promise<void> {
  const writeManifest = process.argv.includes('--write-manifest');
  const manifestPath = path.join(CORPUS_ROOT, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as CorpusManifest;
  const excludedSites = new Set(manifest.excluded
    .filter((entry) => entry.scope === 'site')
    .map((entry) => entry.siteId));
  const excludedPagesBySite = new Map<string, Set<string>>();
  for (const entry of manifest.excluded.filter((candidate) => candidate.scope === 'page')) {
    const values = excludedPagesBySite.get(entry.siteId) ?? new Set<string>();
    values.add(normalizedUrl(entry.sourceUrl));
    excludedPagesBySite.set(entry.siteId, values);
  }

  const sites = [];
  const uncrawledByKey = new Map<string, {
    siteId: string;
    url: string;
    labels: Set<string>;
    discoveredOn: Set<string>;
  }>();
  for (const file of manifest.siteFiles) {
    const siteId = siteIdFor(file);
    if (excludedSites.has(siteId)) continue;
    const record = await readGzipJson<CorpusSiteRecord>(path.join(CORPUS_ROOT, file));
    if (record.status !== 'success' || !record.artifact) continue;
    const excludedPages = excludedPagesBySite.get(siteId) ?? new Set<string>();
    const artifact = filteredArtifact(record.artifact, excludedPages);
    const documents = await readDocuments(record, excludedPages);
    const plan = extractRobustClinicSource({
      artifact,
      documents,
      profile: record.target.market === 'KR'
        ? KO_MEDICAL_IMPORT_PROFILE
        : US_MEDICAL_OUTREACH_PROFILE,
    });
    const crawledUrls = new Set<string>();
    const observedHosts = new Set<string>();
    for (const page of plan.pages) {
      for (const value of [page.sourceUrl, page.finalUrl, page.artifactPage.url]) {
        try {
          crawledUrls.add(normalizedUrl(value));
          observedHosts.add(new URL(value).hostname);
        } catch {
          // A malformed source URL cannot prove destination coverage.
        }
      }
    }

    let crawledDestinationLabelCount = 0;
    let uncrawledDestinationLabelCount = 0;
    let noInternalDestinationLabelCount = 0;
    let mixedDestinationLabelCount = 0;
    const crawledDestinations = new Set<string>();
    const uncrawledDestinations = new Set<string>();
    const navBlocks = plan.excludedBlocks.filter((block) => block.exclusion === 'navigation-label');
    for (const block of navBlocks) {
      const internalDestinations = (block.navigationDestinations ?? []).filter((destination) => {
        try {
          return belongsToObservedSite(new URL(destination.url).hostname, observedHosts);
        } catch {
          return false;
        }
      });
      if (internalDestinations.length === 0) {
        noInternalDestinationLabelCount += 1;
        continue;
      }
      const missing = internalDestinations.filter((destination) => (
        !crawledUrls.has(normalizedUrl(destination.url))
      ));
      const present = internalDestinations.filter((destination) => (
        crawledUrls.has(normalizedUrl(destination.url))
      ));
      present.forEach((destination) => crawledDestinations.add(normalizedUrl(destination.url)));
      if (missing.length === 0) {
        crawledDestinationLabelCount += 1;
        continue;
      }
      uncrawledDestinationLabelCount += 1;
      if (present.length > 0) mixedDestinationLabelCount += 1;
      for (const destination of missing) {
        const url = normalizedUrl(destination.url);
        uncrawledDestinations.add(url);
        const key = `${siteId}\u0000${url}`;
        const audit = uncrawledByKey.get(key) ?? {
          siteId,
          url,
          labels: new Set<string>(),
          discoveredOn: new Set<string>(),
        };
        if (destination.label) audit.labels.add(destination.label);
        audit.discoveredOn.add(block.sourceUrl);
        uncrawledByKey.set(key, audit);
      }
    }
    sites.push({
      siteId,
      market: record.target.market,
      seedUrl: record.target.url,
      navigationLabelCount: navBlocks.length,
      crawledDestinationLabelCount,
      uncrawledDestinationLabelCount,
      noInternalDestinationLabelCount,
      mixedDestinationLabelCount,
      crawledPageCount: plan.pages.length,
      estimatedOriginalPageCount: plan.pages.length + uncrawledDestinations.size,
      crawledDestinationCount: crawledDestinations.size,
      uncrawledDestinationCount: uncrawledDestinations.size,
      uncrawledDestinations: sorted(uncrawledDestinations),
    });
  }

  const uncrawledDestinations: UncrawledDestination[] = [...uncrawledByKey.values()]
    .map((entry) => ({
      siteId: entry.siteId,
      url: entry.url,
      labels: sorted(entry.labels),
      discoveredOn: sorted(entry.discoveredOn),
    }))
    .sort((left, right) => (
      left.siteId.localeCompare(right.siteId, 'en') || left.url.localeCompare(right.url, 'en')
    ));
  const totals = {
    siteCount: sites.length,
    navigationLabelCount: sites.reduce((sum, site) => sum + site.navigationLabelCount, 0),
    crawledDestinationLabelCount: sites.reduce(
      (sum, site) => sum + site.crawledDestinationLabelCount,
      0,
    ),
    uncrawledDestinationLabelCount: sites.reduce(
      (sum, site) => sum + site.uncrawledDestinationLabelCount,
      0,
    ),
    noInternalDestinationLabelCount: sites.reduce(
      (sum, site) => sum + site.noInternalDestinationLabelCount,
      0,
    ),
    mixedDestinationLabelCount: sites.reduce(
      (sum, site) => sum + site.mixedDestinationLabelCount,
      0,
    ),
    crawledPageCount: sites.reduce((sum, site) => sum + site.crawledPageCount, 0),
    estimatedOriginalPageCount: sites.reduce(
      (sum, site) => sum + site.estimatedOriginalPageCount,
      0,
    ),
    uncrawledDestinationCount: uncrawledDestinations.length,
  };
  const generatedAt = new Date().toISOString();
  await mkdir(OUTPUT_ROOT, { recursive: true });
  await writeFile(
    path.join(OUTPUT_ROOT, 'navigation-analysis.json'),
    `${JSON.stringify({ generatedAt, totals, sites, uncrawledDestinations }, null, 2)}\n`,
  );
  if (writeManifest) {
    manifest.generatedAt = generatedAt;
    manifest.uncrawledDestinations = uncrawledDestinations;
    manifest.navigationAudit = {
      generatedAt,
      navigationLabelCount: totals.navigationLabelCount,
      crawledDestinationLabelCount: totals.crawledDestinationLabelCount,
      uncrawledDestinationLabelCount: totals.uncrawledDestinationLabelCount,
      noInternalDestinationLabelCount: totals.noInternalDestinationLabelCount,
      uncrawledDestinationCount: totals.uncrawledDestinationCount,
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify({ generatedAt, totals }, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
