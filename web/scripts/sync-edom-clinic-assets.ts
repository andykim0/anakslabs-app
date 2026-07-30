import { createHash } from 'node:crypto';
import {
  mkdir,
  readdir,
  readFile,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { readLimitedBytes, safeFetch } from '@/lib/import/extract';
import { extractKoClinicPage } from '@/lib/ko-clinic/source-extraction';
import type {
  KoClinicOptimizedImage,
  KoClinicUnavailableImage,
} from '@/lib/ko-clinic/contracts';

const ROOT = process.cwd();
const CRAWL_REPORT = process.env.EDOM_CRAWL_REPORT
  ?? '/private/tmp/edom-fixed-crawl/crawl-report.json';
const OUTPUT_DIR = path.join(ROOT, 'public/clinic/edom');
const MANIFEST_PATH = path.join(
  ROOT,
  'src/lib/ko-clinic/edom-image-manifest.generated.json',
);
const REPORT_PATH = '/private/tmp/edom-image-sync-report.json';
const MIN_REQUEST_INTERVAL_MS = 1_000;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_EDGE = 1_920;
const MAX_FETCH_ATTEMPTS = 4;
const VERIFIED_SOURCE_404 = new Set([
  'https://edomclinic.com/n_images/sub/joint/sub8/tab_img16.jpg',
  'https://edomclinic.com/n_images/sub/joint/sub8/tab_img17.jpg',
]);

interface CrawlAttempt {
  url: string;
  ok: boolean;
  rawPath: string;
}

interface CrawlReport {
  expectedManifestSha256: string;
  attempts: CrawlAttempt[];
}

interface StoredManifest {
  version: 1;
  expectedManifestSha256: string;
  generatedAt: string;
  assets: KoClinicOptimizedImage[];
  unavailable?: KoClinicUnavailableImage[];
}

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizedImageUrl(raw: string): string {
  const url = new URL(raw);
  url.protocol = 'https:';
  url.hostname = 'edomclinic.com';
  url.port = '';
  url.hash = '';
  return url.toString();
}

function suspectReason(url: string, alt: string): string | undefined {
  const value = `${url} ${alt}`.normalize('NFKC').toLocaleLowerCase('ko-KR');
  if (/(before|after|전후|치료\s*전|치료\s*후|결과|수술\s*전|수술\s*후)/u.test(value)) {
    return 'before-after-or-treatment-result';
  }
  if (/(patient|환자|얼굴|face|인물|portrait|스타|celebrity)/u.test(value)) {
    return 'identifiable-person-candidate';
  }
  return undefined;
}

async function existingManifest(): Promise<StoredManifest | null> {
  try {
    const parsed = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as StoredManifest;
    return parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

async function main() {
  const crawl = JSON.parse(await readFile(CRAWL_REPORT, 'utf8')) as CrawlReport;
  const extracted = await Promise.all(crawl.attempts.filter((attempt) => attempt.ok).map(
    async (attempt) => extractKoClinicPage({
      html: await readFile(attempt.rawPath, 'utf8'),
      sourceUrl: attempt.url,
    }),
  ));
  const excluded = extracted.flatMap((page) => page.images.filter(
    (image) => image.classification === 'ui-chrome',
  ));
  const byUrl = new Map<string, {
    sourceUrl: string;
    alt: string;
    sourcePages: Set<string>;
  }>();
  for (const page of extracted) {
    for (const image of page.images) {
      if (image.classification !== 'content') continue;
      const sourceUrl = normalizedImageUrl(image.sourceUrl);
      const current = byUrl.get(sourceUrl);
      if (current) {
        current.sourcePages.add(page.sourceUrl);
        if (!current.alt && image.alt) current.alt = image.alt;
      } else {
        byUrl.set(sourceUrl, {
          sourceUrl,
          alt: image.alt,
          sourcePages: new Set([page.sourceUrl]),
        });
      }
    }
  }
  const sources = [...byUrl.values()].sort((left, right) => (
    left.sourceUrl.localeCompare(right.sourceUrl)
  ));
  const sourceUrls = new Set(sources.map((source) => source.sourceUrl));
  const previous = await existingManifest();
  const completed = new Map(
    previous?.expectedManifestSha256 === crawl.expectedManifestSha256
      ? previous.assets
          .filter((asset) => sourceUrls.has(asset.sourceUrl))
          .map((asset) => [asset.sourceUrl, asset])
      : [],
  );
  await mkdir(OUTPUT_DIR, { recursive: true });
  const unavailable = sources
    .filter((source) => VERIFIED_SOURCE_404.has(source.sourceUrl))
    .map((source): KoClinicUnavailableImage => ({
      sourceUrl: source.sourceUrl,
      sourceReferenceSha256: sha256(source.sourceUrl),
      status: 404,
      reason: 'source-http-404',
    }));
  const unavailableUrls = new Set(unavailable.map((asset) => asset.sourceUrl));
  let lastRequestAt = 0;
  const failures: { sourceUrl: string; reason: string }[] = [];
  for (const [index, source] of sources.entries()) {
    if (unavailableUrls.has(source.sourceUrl)) continue;
    const cached = completed.get(source.sourceUrl);
    if (cached) {
      try {
        const bytes = await readFile(path.join(ROOT, 'public', cached.publicPath.replace(/^\//u, '')));
        if (sha256(bytes) === cached.optimizedSha256) continue;
      } catch {
        // A partial/missing local asset is fetched again.
      }
    }
    let lastError: unknown;
    for (let fetchAttempt = 1; fetchAttempt <= MAX_FETCH_ATTEMPTS; fetchAttempt += 1) {
      const elapsed = Date.now() - lastRequestAt;
      if (elapsed < MIN_REQUEST_INTERVAL_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
      }
      lastRequestAt = Date.now();
      try {
        const { res } = await safeFetch(source.sourceUrl, {
          timeoutMs: 12_000,
          maxRedirects: 3,
          accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.5',
        });
        const contentType = res.headers.get('content-type') ?? '';
        if (!/^image\/(?:jpeg|png|webp|gif|avif)\b/iu.test(contentType)) {
          throw new Error(`NOT_SUPPORTED_IMAGE:${contentType}`);
        }
        const original = await readLimitedBytes(res, MAX_SOURCE_BYTES);
        const sourceSha256 = sha256(original);
        const encoded = await sharp(original, {
          failOn: 'error',
          limitInputPixels: 100_000_000,
        })
          .rotate()
          .resize({
            width: MAX_EDGE,
            height: MAX_EDGE,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality: 82, effort: 4, smartSubsample: true })
          .toBuffer({ resolveWithObject: true });
        const optimizedSha256 = sha256(encoded.data);
        const fileName = `${sourceSha256.slice(0, 24)}.webp`;
        const publicPath = `/clinic/edom/${fileName}`;
        await writeFile(path.join(OUTPUT_DIR, fileName), encoded.data);
        completed.set(source.sourceUrl, {
          sourceUrl: source.sourceUrl,
          publicPath,
          sourceSha256,
          optimizedSha256,
          sourceBytes: original.byteLength,
          optimizedBytes: encoded.data.byteLength,
          width: encoded.info.width,
          height: encoded.info.height,
          alt: source.alt,
        });
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        if (fetchAttempt < MAX_FETCH_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, fetchAttempt * 750));
        }
      }
    }
    if (lastError) {
      failures.push({
        sourceUrl: source.sourceUrl,
        reason: lastError instanceof Error ? lastError.message : String(lastError),
      });
    }
    if ((index + 1) % 25 === 0 || index + 1 === sources.length) {
      const assets = [...completed.values()].sort((left, right) => (
        left.sourceUrl.localeCompare(right.sourceUrl)
      ));
      await writeFile(MANIFEST_PATH, `${JSON.stringify({
        version: 1,
        expectedManifestSha256: crawl.expectedManifestSha256,
        generatedAt: new Date().toISOString(),
        assets,
        unavailable,
      } satisfies StoredManifest, null, 2)}\n`);
      process.stdout.write(
        `[edom-assets] ${index + 1}/${sources.length} complete=${assets.length} failures=${failures.length}\n`,
      );
    }
  }
  const assets = [...completed.values()].sort((left, right) => (
    left.sourceUrl.localeCompare(right.sourceUrl)
  ));
  await writeFile(MANIFEST_PATH, `${JSON.stringify({
    version: 1,
    expectedManifestSha256: crawl.expectedManifestSha256,
    generatedAt: new Date().toISOString(),
    assets,
    unavailable,
  } satisfies StoredManifest, null, 2)}\n`);
  const retainedFiles = new Set(assets.map((asset) => path.basename(asset.publicPath)));
  const prunedFiles: string[] = [];
  for (const fileName of await readdir(OUTPUT_DIR)) {
    if (!fileName.endsWith('.webp') || retainedFiles.has(fileName)) continue;
    await unlink(path.join(OUTPUT_DIR, fileName));
    prunedFiles.push(fileName);
  }
  const suspects = sources.flatMap((source) => {
    const reason = suspectReason(source.sourceUrl, source.alt);
    return reason ? [{
      sourceUrl: source.sourceUrl,
      alt: source.alt,
      reason,
      sourcePages: [...source.sourcePages].sort(),
    }] : [];
  });
  const report = {
    version: 1,
    expectedManifestSha256: crawl.expectedManifestSha256,
    sourcePages: extracted.length,
    rawImageReferences: extracted.reduce((sum, page) => sum + page.images.length, 0),
    uniqueContentImages: sources.length,
    excludedUiChrome: excluded,
    converted: assets.length,
    unavailable,
    prunedFiles,
    failures,
    suspects,
    sourceBytes: assets.reduce((sum, asset) => sum + asset.sourceBytes, 0),
    optimizedBytes: assets.reduce((sum, asset) => sum + asset.optimizedBytes, 0),
  };
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  if (
    failures.length > 0
    || assets.length + unavailable.length !== sources.length
  ) {
    throw new Error(
      `EDOM_IMAGE_SYNC_INCOMPLETE:${assets.length}+${unavailable.length}/${sources.length}:failures=${failures.length}`,
    );
  }
  process.stdout.write(`[edom-assets] report=${REPORT_PATH}\n`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
