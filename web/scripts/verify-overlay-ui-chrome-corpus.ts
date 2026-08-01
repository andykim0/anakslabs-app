import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import {
  KO_MEDICAL_IMPORT_PROFILE,
  US_MEDICAL_OUTREACH_PROFILE,
} from '@/lib/clinic-engine/profiles';
import {
  extractRobustClinicSource,
  type RobustClinicDocument,
  type RobustClinicSourceBlock,
} from '@/lib/clinic-engine/robust-source';
import type { ClinicEngineProfile } from '@/lib/clinic-engine/contracts';

const CORPUS_ROOT = path.resolve(process.cwd(), '../docs/research/corpus-2026-08');
const SNAPSHOT_FILE = path.resolve(
  process.cwd(),
  'src/lib/clinic-engine/overlay-ui-chrome-exclusions.generated.json',
);
const REPORT_FILE = '/private/tmp/modal-guard/guard-report.json';
const REQUIRED_UI_COPY = new Set([
  'START WITH A FREE 3D SCAN',
  'Problem Areas',
]);
// Deliberately independent from the product veto implementation. Reusing the production helper
// would let one regression blind both the classifier and its build-breaking corpus gate.
const PROTECTED_CONTENT_PATTERN = /[₩$€¥£]|\d[\d,]*(?:\.\d+)?\s*원|\d(?:[\d,.]*\d)?\s*%/u;

interface RemovedDetail {
  selector: string;
  reason: 'explicit_close' | 'dim_backdrop';
}

interface CorpusDocumentRecord {
  sourceUrl: string;
  finalUrl: string;
  postModalDomFile: string;
  removedDetails?: RemovedDetail[];
}

interface CorpusSiteRecord {
  target: { market: 'KR' | 'US'; url: string };
  status: 'success' | 'failure';
  artifact?: CrawlArtifactPayload;
  documents: CorpusDocumentRecord[];
}

interface CorpusManifest {
  siteFiles: string[];
  excluded: Array<{
    scope: 'site' | 'page';
    siteId: string;
    sourceUrl: string;
  }>;
}

interface SnapshotBlock {
  siteId: string;
  blockId: string;
  sourceUrl: string;
  finalUrl: string;
  selector: string;
  text: string;
  classification: NonNullable<RobustClinicSourceBlock['overlayUiChromeEvidence']>;
}

interface VetoedSnapshotBlock extends Omit<SnapshotBlock, 'classification'> {
  classification: NonNullable<RobustClinicSourceBlock['overlayUiChromeCandidateEvidence']>;
  veto: NonNullable<RobustClinicSourceBlock['overlayContentVetoEvidence']>;
}

interface OverlayCorpusSnapshot {
  version: 1;
  corpus: {
    root: 'docs/research/corpus-2026-08';
    manifestSha256: string;
    siteFileCount: number;
    documentCount: number;
    recrawled: false;
  };
  preVetoClassificationCount: number;
  excludedCount: number;
  vetoedContentCount: number;
  excluded: SnapshotBlock[];
  vetoedContent: VetoedSnapshotBlock[];
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeText(value: string): string {
  return value.replace(/\u00a0/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function normalizedUrl(value: string): string {
  const parsed = new URL(value);
  parsed.hash = '';
  if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/u, '');
  return parsed.toString();
}

function siteIdFor(file: string): string {
  return file.split('/')[1] ?? '';
}

function profileFor(record: CorpusSiteRecord): ClinicEngineProfile {
  return record.target.market === 'KR'
    ? KO_MEDICAL_IMPORT_PROFILE
    : US_MEDICAL_OUTREACH_PROFILE;
}

async function readGzipJson<T>(file: string): Promise<T> {
  return JSON.parse(gunzipSync(await readFile(file)).toString('utf8')) as T;
}

function sorted<T extends SnapshotBlock | VetoedSnapshotBlock>(rows: T[]): T[] {
  return rows.sort((left, right) => (
    left.siteId.localeCompare(right.siteId)
    || left.sourceUrl.localeCompare(right.sourceUrl)
    || left.selector.localeCompare(right.selector)
    || left.blockId.localeCompare(right.blockId)
  ));
}

async function buildSnapshot(): Promise<OverlayCorpusSnapshot> {
  const manifestBytes = await readFile(path.join(CORPUS_ROOT, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as CorpusManifest;
  const excludedSites = new Set(manifest.excluded
    .filter((entry) => entry.scope === 'site')
    .map((entry) => entry.siteId));
  const excludedPages = new Map<string, Set<string>>();
  for (const entry of manifest.excluded.filter((candidate) => candidate.scope === 'page')) {
    const values = excludedPages.get(entry.siteId) ?? new Set<string>();
    values.add(normalizedUrl(entry.sourceUrl));
    excludedPages.set(entry.siteId, values);
  }

  const excluded: SnapshotBlock[] = [];
  const vetoedContent: VetoedSnapshotBlock[] = [];
  let documentCount = 0;
  for (const file of manifest.siteFiles) {
    const siteId = siteIdFor(file);
    if (excludedSites.has(siteId)) continue;
    const record = await readGzipJson<CorpusSiteRecord>(path.join(CORPUS_ROOT, file));
    if (record.status !== 'success' || !record.artifact) continue;
    const pageExclusions = excludedPages.get(siteId) ?? new Set<string>();
    const artifact = {
      ...record.artifact,
      pages: record.artifact.pages.filter((page) => !pageExclusions.has(normalizedUrl(page.url))),
    };
    const documents: RobustClinicDocument[] = [];
    for (const document of record.documents) {
      if (
        pageExclusions.has(normalizedUrl(document.sourceUrl))
        || pageExclusions.has(normalizedUrl(document.finalUrl))
      ) continue;
      const html = gunzipSync(
        await readFile(path.join(CORPUS_ROOT, document.postModalDomFile)),
      ).toString('utf8');
      documents.push({
        sourceUrl: document.sourceUrl,
        finalUrl: document.finalUrl,
        html,
        ...(document.removedDetails
          ? { overlayRemovalEvidence: document.removedDetails }
          : {}),
      });
    }
    documentCount += documents.length;
    const plan = extractRobustClinicSource({
      artifact,
      documents,
      profile: profileFor(record),
    });
    const finalUrlByBlockId = new Map(plan.pages.flatMap((page) => (
      page.blocks.map((block) => [block.id, page.finalUrl] as const)
    )));
    for (const block of plan.blocks) {
      const shared = {
        siteId,
        blockId: block.id,
        sourceUrl: block.sourceUrl,
        finalUrl: finalUrlByBlockId.get(block.id) ?? block.sourceUrl,
        selector: block.sourceElementPath,
        text: block.text,
      };
      if (block.exclusion === 'overlay-ui-chrome' && block.overlayUiChromeEvidence) {
        excluded.push({ ...shared, classification: block.overlayUiChromeEvidence });
      }
      if (
        block.overlayContentVetoEvidence
        && block.overlayUiChromeCandidateEvidence
      ) {
        vetoedContent.push({
          ...shared,
          classification: block.overlayUiChromeCandidateEvidence,
          veto: block.overlayContentVetoEvidence,
        });
      }
    }
  }
  return {
    version: 1,
    corpus: {
      root: 'docs/research/corpus-2026-08',
      manifestSha256: sha256(manifestBytes),
      siteFileCount: manifest.siteFiles.length,
      documentCount,
      recrawled: false,
    },
    preVetoClassificationCount: excluded.length + vetoedContent.length,
    excludedCount: excluded.length,
    vetoedContentCount: vetoedContent.length,
    excluded: sorted(excluded),
    vetoedContent: sorted(vetoedContent),
  };
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function main(): Promise<void> {
  const actual = await buildSnapshot();
  const protectedExclusions = actual.excluded.filter((block) => (
    PROTECTED_CONTENT_PATTERN.test(block.text)
  ));
  const missingRequiredUi = [...REQUIRED_UI_COPY].filter((copy) => (
    !actual.excluded.some((block) => normalizeText(block.text) === copy)
  ));
  const report = {
    version: 1,
    corpus: actual.corpus,
    preVetoClassificationCount: actual.preVetoClassificationCount,
    excludedCount: actual.excludedCount,
    vetoedContentCount: actual.vetoedContentCount,
    protectedExclusionCount: protectedExclusions.length,
    protectedExclusions,
    requiredUiCopy: [...REQUIRED_UI_COPY],
    missingRequiredUi,
    snapshotMatches: false,
  };
  await mkdir(path.dirname(REPORT_FILE), { recursive: true });

  if (process.argv.includes('--write')) {
    await writeFile(SNAPSHOT_FILE, json(actual));
    await writeFile(REPORT_FILE, json({ ...report, snapshotMatches: true }));
    process.stdout.write(json({ ...report, snapshotMatches: true, wrote: SNAPSHOT_FILE }));
    return;
  }

  const expected = JSON.parse(await readFile(SNAPSHOT_FILE, 'utf8')) as OverlayCorpusSnapshot;
  report.snapshotMatches = json(expected) === json(actual);
  await writeFile(REPORT_FILE, json(report));
  if (protectedExclusions.length > 0) {
    throw new Error(
      `OVERLAY_CONTENT_VETO_BREACH:${protectedExclusions.length}\n${json(protectedExclusions)}`,
    );
  }
  if (missingRequiredUi.length > 0) {
    throw new Error(`OVERLAY_REQUIRED_UI_RESTORED:${missingRequiredUi.join(',')}`);
  }
  if (!report.snapshotMatches) {
    throw new Error('OVERLAY_EXCLUSION_SNAPSHOT_DRIFT: run clinic:overlay:guard:update and review the full diff');
  }
  process.stdout.write(json(report));
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
