import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import { siteConfigSchema } from '@/app/api/_lib/schemas';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import {
  createPreviewBearerToken,
  IMPORT_PREVIEW_BEARER_WARNING,
} from '@/lib/crawl/preview-contract';
import {
  DECAY_SCORE_DISCLOSURE,
  type DecayScoreResult,
} from '@/lib/scan/decay-contract';

const ROOT = process.cwd();
const BUILD_DIR = process.env.EDOM_BUILD_OUTPUT ?? '/private/tmp/ko-clinic-p1';
const RECEIPT_PATH = '/private/tmp/ko-clinic-p1/preview-issuance-private.json';
const APPROVED_MANIFEST_SHA =
  '449a17f030ec5486d6c515dc4bba9d4ef6e413641e2820703781cfc1a5fc15c7';

async function main() {
  if (process.env.EDOM_CONTRACT_IMPORT_APPROVED !== '1') {
    throw new Error('EDOM_CONTRACT_IMPORT_APPROVAL_REQUIRED');
  }
  loadEnvConfig(ROOT);
  process.env.NEXT_PUBLIC_MOCK_MODE = '0';
  const [{ createCrawlArtifact, createSharedSitePreview }, { getServiceRoleClient }] =
    await Promise.all([
      import('@/lib/crawl/repository'),
      import('@/lib/data/supabase/client'),
    ]);
  const [artifactRaw, configRaw, buildReportRaw] = await Promise.all([
    readFile(path.join(BUILD_DIR, 'crawl-artifact.json'), 'utf8'),
    readFile(path.join(BUILD_DIR, 'site-config.json'), 'utf8'),
    readFile(path.join(BUILD_DIR, 'build-report.json'), 'utf8'),
  ]);
  const artifact = JSON.parse(artifactRaw) as CrawlArtifactPayload;
  const config = siteConfigSchema.parse(JSON.parse(configRaw));
  const buildReport = JSON.parse(buildReportRaw) as {
    fixedCrawl?: { expectedManifestSha256?: string };
    pages?: { extracted?: number; compiled?: number };
  };
  if (buildReport.fixedCrawl?.expectedManifestSha256 !== APPROVED_MANIFEST_SHA) {
    throw new Error('EDOM_CONTRACT_IMPORT_MANIFEST_NOT_APPROVED');
  }
  if (
    artifact.pages.length !== 283
    || config.pages.length !== 251
    || buildReport.pages?.extracted !== 283
  ) {
    throw new Error('EDOM_CONTRACT_IMPORT_SET_NOT_COMPLETE');
  }
  const supabase = getServiceRoleClient();
  const { data: users, error: usersError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 100,
  });
  if (usersError) throw new Error(`EDOM_ADMIN_LOOKUP_FAILED:${usersError.message}`);
  const actor = [...users.users]
    .filter((user) => user.app_metadata?.role === 'admin')
    .sort((left, right) => left.created_at.localeCompare(right.created_at))[0];
  if (!actor) throw new Error('EDOM_ADMIN_ACTOR_NOT_FOUND');
  const now = new Date();
  const decayResult: DecayScoreResult = {
    score: 100,
    signals: [],
    observedAt: artifact.observedAt,
    disclosure: DECAY_SCORE_DISCLOSURE,
  };
  const artifactRecord = await createCrawlArtifact({
    artifact,
    decayResult,
    createdBy: actor.id,
    now,
  });
  const token = createPreviewBearerToken();
  const preview = await createSharedSitePreview({
    crawlArtifactId: artifactRecord.id,
    sourceUrl: artifact.seedUrl,
    token,
    siteConfig: config,
    renderMode: 'standard',
    createdBy: actor.id,
    now,
  });
  const receipt = {
    version: 1,
    mode: 'real-supabase-contract-import',
    warning: IMPORT_PREVIEW_BEARER_WARNING,
    nonce: randomBytes(8).toString('hex'),
    artifactId: artifactRecord.id,
    artifactExpiresAt: artifactRecord.expiresAt,
    previewId: preview.id,
    previewExpiresAt: preview.expiresAt,
    token,
    relativeUrl: `/preview/${token}`,
    pageCount: config.pages.length,
    issuedAt: now.toISOString(),
  };
  await mkdir(path.dirname(RECEIPT_PATH), { recursive: true });
  await writeFile(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  await chmod(RECEIPT_PATH, 0o600);
  process.stdout.write(`${JSON.stringify({
    mode: receipt.mode,
    artifactId: receipt.artifactId,
    previewId: receipt.previewId,
    artifactExpiresAt: receipt.artifactExpiresAt,
    previewExpiresAt: receipt.previewExpiresAt,
    pageCount: receipt.pageCount,
    privateReceipt: RECEIPT_PATH,
  }, null, 2)}\n`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
