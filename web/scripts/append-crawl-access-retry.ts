import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';

const CORPUS_ROOT = path.resolve(process.cwd(), '../docs/research/corpus-2026-08');
const STAGE_ROOT = path.resolve('/private/tmp/crawl-access-retry-corpus');
const FORBIDDEN_SUCCESS_HOSTS = new Set([
  'leegajeong.com',
  'gwgclinic.co.kr',
  'ysfirst.com',
  'kingsdental.co.kr',
  'reandyoung.co.kr',
  'sproposeps.com',
  'meclinicbeauty.com',
  'gangnamhifu.com',
  'rubyps.co.kr',
]);

interface CorpusTarget {
  market: 'KR' | 'US';
  url: string;
}

interface CorpusDocumentRecord {
  sourceUrl: string;
  finalUrl: string;
  postModalDomFile: string;
  postModalDomSha256: string;
  removedDetails?: unknown[];
}

interface CorpusSiteRecord {
  version: 1;
  target: CorpusTarget;
  crawlStartedAt: string;
  crawlCompletedAt: string;
  status: 'success' | 'failure';
  failureReason?: string;
  artifact?: CrawlArtifactPayload;
  documents: CorpusDocumentRecord[];
}

interface CorpusExclusion {
  scope: 'page' | 'site';
  siteId: string;
  sourceUrl: string;
  reasonCode: string;
  reason: string;
}

interface CorpusManifest {
  version: 1;
  generatedAt: string;
  targetCount: number;
  siteFiles: string[];
  excluded: CorpusExclusion[];
  retryHistory?: Array<{
    targetUrl: string;
    attemptedAt: string;
    priorSiteFile: string;
    appendedSiteFile: string;
    priorFailureReason?: string;
  }>;
  [key: string]: unknown;
}

function normalizeHost(raw: string): string {
  return new URL(raw).hostname.toLocaleLowerCase('en-US').replace(/^www\./u, '');
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

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function readGzipJson<T>(root: string, file: string): Promise<T> {
  return JSON.parse(gunzipSync(await readFile(path.join(root, file))).toString('utf8')) as T;
}

async function listFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else result.push(absolute);
    }
  };
  await visit(root);
  return result;
}

async function writeIntegrityReport(manifest: CorpusManifest): Promise<void> {
  const records = await Promise.all(manifest.siteFiles.map(async (file) => ({
    file,
    siteId: siteIdFor(file),
    record: await readGzipJson<CorpusSiteRecord>(CORPUS_ROOT, file),
  })));
  const errors: string[] = [];
  let artifactRowCount = 0;
  let duplicateArtifactRowCount = 0;
  let uniqueArtifactFinalUrlCount = 0;
  let postModalDomCount = 0;
  let eligibleUniqueFinalUrlCount = 0;
  let eligiblePostModalDomCount = 0;
  const excludedSites = new Set(manifest.excluded
    .filter((entry) => entry.scope === 'site')
    .map((entry) => entry.siteId));
  const excludedPagesBySite = new Map<string, Set<string>>();
  for (const entry of manifest.excluded.filter((candidate) => candidate.scope === 'page')) {
    const values = excludedPagesBySite.get(entry.siteId) ?? new Set<string>();
    values.add(normalizedUrl(entry.sourceUrl));
    excludedPagesBySite.set(entry.siteId, values);
  }
  for (const { siteId, record } of records) {
    if (record.status !== 'success' || !record.artifact) continue;
    const pageUrls = record.artifact.pages.map((page) => normalizedUrl(page.url));
    const uniqueUrls = new Set(pageUrls);
    artifactRowCount += pageUrls.length;
    duplicateArtifactRowCount += pageUrls.length - uniqueUrls.size;
    uniqueArtifactFinalUrlCount += uniqueUrls.size;
    postModalDomCount += record.documents.length;
    const excludedPages = excludedPagesBySite.get(siteId) ?? new Set<string>();
    if (!excludedSites.has(siteId)) {
      eligibleUniqueFinalUrlCount += [...uniqueUrls]
        .filter((url) => !excludedPages.has(url)).length;
      eligiblePostModalDomCount += record.documents.filter((document) => (
        !excludedPages.has(normalizedUrl(document.sourceUrl))
        && !excludedPages.has(normalizedUrl(document.finalUrl))
      )).length;
    }
    for (const document of record.documents) {
      const absolute = path.join(CORPUS_ROOT, document.postModalDomFile);
      let body: Buffer;
      try {
        body = gunzipSync(await readFile(absolute));
      } catch {
        errors.push(`missing_or_invalid_document:${siteId}:${document.postModalDomFile}`);
        continue;
      }
      if (sha256(body) !== document.postModalDomSha256) {
        errors.push(`document_sha_mismatch:${siteId}:${document.postModalDomFile}`);
      }
    }
  }
  const corpusFiles = (await listFiles(CORPUS_ROOT))
    .filter((file) => path.basename(file) !== 'integrity-report.json');
  const fileSizes = await Promise.all(corpusFiles.map(async (file) => (await stat(file)).size));
  const started = records.map(({ record }) => record.crawlStartedAt).filter(Boolean).sort();
  const completed = records.map(({ record }) => record.crawlCompletedAt).filter(Boolean).sort();
  const successSiteCount = records.filter(({ record }) => record.status === 'success').length;
  const report = {
    version: 2,
    manifestGeneratedAt: manifest.generatedAt,
    targetCount: manifest.targetCount,
    siteRecordCount: records.length,
    successSiteCount,
    failureSiteCount: records.length - successSiteCount,
    artifactRowCount,
    duplicateArtifactRowCount,
    uniqueArtifactFinalUrlCount,
    postModalDomCount,
    explicitlyExcludedSiteCount: excludedSites.size,
    explicitlyExcludedPageCount: manifest.excluded.filter((entry) => entry.scope === 'page').length,
    eligibleSiteCount: successSiteCount - excludedSites.size,
    eligibleUniqueFinalUrlCount,
    eligiblePostModalDomCount,
    fileCountExcludingIntegrityReport: corpusFiles.length,
    compressedBytesExcludingIntegrityReport: fileSizes.reduce((sum, value) => sum + value, 0),
    crawlStartedAtMin: started.at(0),
    crawlStartedAtMax: started.at(-1),
    crawlCompletedAtMin: completed.at(0),
    crawlCompletedAtMax: completed.at(-1),
    excluded: manifest.excluded,
    errors,
    losslessForEligibleCorpus: errors.length === 0
      && eligibleUniqueFinalUrlCount === eligiblePostModalDomCount,
  };
  await writeFile(
    path.join(CORPUS_ROOT, 'integrity-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}

async function main(): Promise<void> {
  const manifestPath = path.join(CORPUS_ROOT, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as CorpusManifest;
  if (process.argv.includes('--integrity-only')) {
    await writeIntegrityReport(manifest);
    process.stdout.write('{"integrityOnly":true}\n');
    return;
  }
  const stageManifest = JSON.parse(
    await readFile(path.join(STAGE_ROOT, 'manifest.json'), 'utf8'),
  ) as CorpusManifest;
  const activeByHost = new Map<string, { index: number; file: string; record: CorpusSiteRecord }>();
  for (const [index, file] of manifest.siteFiles.entries()) {
    const record = await readGzipJson<CorpusSiteRecord>(CORPUS_ROOT, file);
    activeByHost.set(normalizeHost(record.target.url), { index, file, record });
  }

  const stageSuccesses = [];
  for (const file of stageManifest.siteFiles) {
    const record = await readGzipJson<CorpusSiteRecord>(STAGE_ROOT, file);
    if (record.status === 'success' && record.artifact) stageSuccesses.push({ file, record });
  }
  const forbidden = stageSuccesses.filter(({ record }) => (
    FORBIDDEN_SUCCESS_HOSTS.has(normalizeHost(record.target.url))
  ));
  if (forbidden.length > 0) {
    throw new Error(`FORBIDDEN_REGRESSION_SUCCESS:${forbidden.map(({ record }) => record.target.url).join(',')}`);
  }

  const appended = [];
  for (const { file: stageFile, record } of stageSuccesses) {
    const host = normalizeHost(record.target.url);
    const active = activeByHost.get(host);
    if (!active) throw new Error(`CORPUS_TARGET_NOT_FOUND:${record.target.url}`);
    if (active.record.status === 'success') throw new Error(`CORPUS_TARGET_ALREADY_SUCCESS:${record.target.url}`);
    const attemptId = record.crawlCompletedAt.replace(/[:.]/gu, '-');
    const attemptRelativeDir = path.join('sites', siteIdFor(active.file), 'attempts', attemptId);
    const attemptAbsoluteDir = path.join(CORPUS_ROOT, attemptRelativeDir);
    const documentDir = path.join(attemptAbsoluteDir, 'documents');
    await mkdir(documentDir, { recursive: true });
    const rewrittenDocuments: CorpusDocumentRecord[] = [];
    for (const document of record.documents) {
      const fileName = path.basename(document.postModalDomFile);
      const destination = path.join(documentDir, fileName);
      await copyFile(path.join(STAGE_ROOT, document.postModalDomFile), destination);
      rewrittenDocuments.push({
        ...document,
        postModalDomFile: path.join(attemptRelativeDir, 'documents', fileName),
      });
    }
    const appendedRecord: CorpusSiteRecord = {
      ...record,
      documents: rewrittenDocuments,
    };
    const appendedSiteFile = path.join(attemptRelativeDir, 'crawl-artifact.json.gz');
    await writeFile(
      path.join(CORPUS_ROOT, appendedSiteFile),
      gzipSync(Buffer.from(JSON.stringify(appendedRecord), 'utf8')),
    );
    manifest.siteFiles[active.index] = appendedSiteFile;
    manifest.retryHistory = [
      ...(manifest.retryHistory ?? []),
      {
        targetUrl: record.target.url,
        attemptedAt: record.crawlCompletedAt,
        priorSiteFile: active.file,
        appendedSiteFile,
        ...(active.record.failureReason ? { priorFailureReason: active.record.failureReason } : {}),
      },
    ];
    appended.push({ targetUrl: record.target.url, priorSiteFile: active.file, appendedSiteFile });
  }
  manifest.generatedAt = new Date().toISOString();
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeIntegrityReport(manifest);
  process.stdout.write(`${JSON.stringify({ appended }, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
