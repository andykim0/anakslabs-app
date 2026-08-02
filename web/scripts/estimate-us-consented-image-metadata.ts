import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'node-html-parser';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import { extractRobustClinicSource, type RobustClinicDocument } from '@/lib/clinic-engine/robust-source';
import { KO_MEDICAL_IMPORT_PROFILE, US_MEDICAL_CONSENTED_PROFILE } from '@/lib/clinic-engine/profiles';

const CORPUS_ROOT = path.resolve(process.cwd(), '../docs/research/corpus-2026-08');
const OUTPUT = process.env.US_CONSENTED_IMAGE_REPORT
  ?? '/private/tmp/us-consented/image-metadata-estimate.json';

interface CorpusSiteRecord {
  target: { market: 'KR' | 'US'; url: string };
  status: 'success' | 'failure';
  artifact?: CrawlArtifactPayload;
  documents: Array<{
    sourceUrl: string;
    finalUrl: string;
    postModalDomFile: string;
    removedDetails?: RobustClinicDocument['overlayRemovalEvidence'];
  }>;
}

interface Manifest {
  siteFiles: string[];
}

async function gzipJson<T>(file: string): Promise<T> {
  return JSON.parse(gunzipSync(await readFile(file)).toString('utf8')) as T;
}

function normalizedImageUrl(raw: string, base: string): string | null {
  try {
    return new URL(raw, base).toString();
  } catch {
    return null;
  }
}

async function loadDocuments(record: CorpusSiteRecord): Promise<Array<{
  document: RobustClinicDocument;
  imageUrls: Set<string>;
}>> {
  return Promise.all(record.documents.map(async (entry) => {
    const html = gunzipSync(
      await readFile(path.join(CORPUS_ROOT, entry.postModalDomFile)),
    ).toString('utf8');
    const root = parse(html);
    const imageUrls = new Set<string>();
    for (const image of root.querySelectorAll('img')) {
      for (const attribute of ['src', 'data-src']) {
        const raw = image.getAttribute(attribute)?.trim();
        const normalized = raw ? normalizedImageUrl(raw, entry.finalUrl) : null;
        if (normalized) imageUrls.add(normalized);
      }
    }
    return {
      document: {
        sourceUrl: entry.sourceUrl,
        finalUrl: entry.finalUrl,
        html,
        ...(entry.removedDetails
          ? { overlayRemovalEvidence: entry.removedDetails }
          : {}),
      },
      imageUrls,
    };
  }));
}

async function main(): Promise<void> {
  const manifest = JSON.parse(
    await readFile(path.join(CORPUS_ROOT, 'manifest.json'), 'utf8'),
  ) as Manifest;
  const rows: Array<{
    market: 'KR' | 'US';
    site: string;
    sourceImageRecords: number;
    indeterminate: number;
    alreadyMeasured: number;
    renderedElementUpperBound: number;
  }> = [];
  for (const file of manifest.siteFiles) {
    const record = await gzipJson<CorpusSiteRecord>(path.join(CORPUS_ROOT, file));
    if (record.status !== 'success' || !record.artifact || record.documents.length === 0) continue;
    const loaded = await loadDocuments(record);
    const documents = loaded.map((entry) => entry.document);
    const imageUrlsByPage = new Map(loaded.flatMap((entry) => [
      [entry.document.sourceUrl, entry.imageUrls] as const,
      [entry.document.finalUrl, entry.imageUrls] as const,
    ]));
    const plan = extractRobustClinicSource({
      artifact: record.artifact,
      documents,
      profile: record.target.market === 'US'
        ? US_MEDICAL_CONSENTED_PROFILE
        : KO_MEDICAL_IMPORT_PROFILE,
    });
    const decisions = plan.pages.flatMap((page) => page.imageDecisions);
    const indeterminate = decisions.filter((decision) => decision.reason === 'indeterminate');
    const alreadyMeasured = record.artifact.pages.reduce(
      (total, page) => total + page.images.filter((image) => image.renderedDimensions).length,
      0,
    );
    rows.push({
      market: record.target.market,
      site: record.target.url,
      sourceImageRecords: decisions.length,
      indeterminate: indeterminate.length,
      alreadyMeasured,
      renderedElementUpperBound: indeterminate.filter((decision) => (
        imageUrlsByPage.get(decision.sourcePageUrl)?.has(decision.url) === true
      )).length,
    });
  }
  const summarize = (market?: 'KR' | 'US') => {
    const selected = market ? rows.filter((row) => row.market === market) : rows;
    return {
      sites: selected.length,
      sourceImageRecords: selected.reduce((total, row) => total + row.sourceImageRecords, 0),
      indeterminate: selected.reduce((total, row) => total + row.indeterminate, 0),
      alreadyMeasured: selected.reduce((total, row) => total + row.alreadyMeasured, 0),
      potentiallyMeasurableFromRenderedImageElements: selected.reduce(
        (total, row) => total + row.renderedElementUpperBound,
        0,
      ),
    };
  };
  const report = {
    issuance: false,
    recrawl: false,
    selectorChanged: false,
    estimateKind: 'upper-bound-rendered-element-match',
    caveat: 'Natural dimensions can still be zero when an image fails to load; this is not a reclassification result.',
    all: summarize(),
    us: summarize('US'),
    ko: summarize('KR'),
    sites: rows,
  };
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
