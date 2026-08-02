import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import { compileUsMedicalConsentedArtifact } from '@/lib/clinic-engine/consented';
import type { RobustClinicDocument } from '@/lib/clinic-engine/robust-source';
import { compileUsMedicalDemo } from '@/lib/us-demo/source-compiler';

const CORPUS_ROOT = path.resolve(process.cwd(), '../docs/research/corpus-2026-08');
const OUTPUT = process.env.US_CONSENTED_REPORT
  ?? '/private/tmp/us-consented/corpus-driver.json';
const OUTPUT_DIR = path.dirname(OUTPUT);

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
  uncrawledDestinations?: Record<string, unknown> | unknown[];
}

function sha(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function gzipJson<T>(file: string): Promise<T> {
  return JSON.parse(gunzipSync(await readFile(file)).toString('utf8')) as T;
}

async function documents(record: CorpusSiteRecord): Promise<RobustClinicDocument[]> {
  return Promise.all(record.documents.map(async (document) => ({
    sourceUrl: document.sourceUrl,
    finalUrl: document.finalUrl,
    html: gunzipSync(
      await readFile(path.join(CORPUS_ROOT, document.postModalDomFile)),
    ).toString('utf8'),
    ...(document.removedDetails
      ? { overlayRemovalEvidence: document.removedDetails }
      : {}),
  })));
}

async function main() {
  const manifest = JSON.parse(
    await readFile(path.join(CORPUS_ROOT, 'manifest.json'), 'utf8'),
  ) as Manifest;
  const attempts: Array<{ site: string; result: string }> = [];
  for (const file of manifest.siteFiles.filter((candidate) => candidate.includes('-us-'))) {
    const record = await gzipJson<CorpusSiteRecord>(path.join(CORPUS_ROOT, file));
    if (record.status !== 'success' || !record.artifact || record.documents.length === 0) continue;
    const consentedArtifact: CrawlArtifactPayload = {
      ...record.artifact,
      crawlPolicyId: 'us-medical-consented-v1',
      consentEvidence: {
        consentId: '00000000-0000-4000-8000-000000000001',
        prospectId: `corpus-${sha(record.target.url).slice(0, 12)}`,
        scope: 'demo-by-email',
        consentedAt: '2026-08-01T20:15:00.000Z',
      },
    };
    try {
      const consented = compileUsMedicalConsentedArtifact({
        artifact: consentedArtifact,
        documents: await documents(record),
      });
      let outreach: ReturnType<typeof compileUsMedicalDemo> | undefined;
      let outreachError: string | undefined;
      try {
        outreach = compileUsMedicalDemo(record.artifact, { renderMode: 'outreach-safe' });
      } catch (error) {
        outreachError = error instanceof Error ? error.message : String(error);
      }
      const report = {
        issuance: false,
        source: 'frozen-corpus',
        site: record.target.url,
        artifactPages: record.artifact.pages.length,
        consentedPages: consented.config.pages.length,
        totalSourceBlocks: consented.completeness.totalSourceBlockCount,
        eligibleSourceBlocks: consented.completeness.sourceBlockCount,
        placedBlocks: consented.completeness.placedBlockCount,
        policyExcludedBlocks: consented.completeness.policyExcludedBlockCount,
        policyExclusions: consented.medicalAdPolicyExcluded,
        medicalAdReviewBlocks: consented.medicalAdReview.length,
        bodyPlacementRate: consented.completeness.bodyPlacementRate,
        completenessFailures: consented.completeness.failingPages,
        renderBlockViolationCount: consented.audit.renderBlockViolationCount,
        consentedConfigSha256: sha(consented.config),
        outreachConfigSha256: outreach ? sha(outreach.config) : null,
        outputsDiffer: outreach ? sha(outreach.config) !== sha(consented.config) : null,
        outreachError: outreachError ?? null,
        imageRecords: record.artifact.pages.reduce(
          (total, page) => total + page.images.length,
          0,
        ),
        imageRecordsWithRenderedDimensions: record.artifact.pages.reduce(
          (total, page) => total + page.images.filter(
            (image) => Boolean(image.renderedDimensions),
          ).length,
          0,
        ),
        imageSelectionIndeterminate: consented.audit.imageSelection.rejected.filter(
          (decision) => decision.reason === 'indeterminate',
        ).length,
        attempts,
      };
      await mkdir(OUTPUT_DIR, { recursive: true });
      await writeFile(
        path.join(OUTPUT_DIR, 'consented-config.json'),
        `${JSON.stringify(consented.config, null, 2)}\n`,
      );
      await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return;
    } catch (error) {
      attempts.push({
        site: record.target.url,
        result: error instanceof Error ? error.message : String(error),
      });
    }
  }
  throw new Error(`No US corpus site passed consented compilation: ${JSON.stringify(attempts)}`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
