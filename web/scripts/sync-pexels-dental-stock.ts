import { loadEnvConfig } from '@next/env';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { deterministicStockAssetId } from '../src/lib/stock/curation';
import type { PexelsPhoto } from '../src/lib/stock/pexels-client';
import type {
  DentalStockCategory,
  DentalStockManifest,
  FrozenDentalStockAsset,
} from '../src/lib/clinic-master/dental-stock-types';

loadEnvConfig(process.cwd());

const OUTPUT_DIR = path.join(process.cwd(), 'public/stock/pexels/dental-atmosphere');
const MANIFEST_PATH = path.join(
  process.cwd(),
  'src/lib/clinic-master/dental-stock-manifest.generated.ts',
);
const LICENSE_URL = 'https://www.pexels.com/license/' as const;
const TARGET_PER_CATEGORY = 20;
const UNSAFE_METADATA_RE =
  /\b(?:patient|patients|person|people|woman|women|man|men|girl|girls|boy|boys|child|children|face|mouth|smil(?:e|es|ing)|before|after|result|results|receiving|undergoing|performing|examining|portrait)\b/iu;
const HUMAN_TREATMENT_RE =
  /\b(?:dentist|doctor|orthodontist|hygienist)\b.{0,36}\b(?:patient|person|woman|man|girl|boy|child|treating|working)\b/iu;

const CATEGORY_QUERIES = {
  implant: [
    'dental implant model',
    'dental implant tools',
    'implant dentistry equipment',
  ],
  orthodontic: [
    'orthodontic aligners',
    'braces dental model',
    'orthodontic instruments',
  ],
  'preventive-general': [
    'dental instruments cleaning',
    'dental care equipment',
    'dental hygiene tools',
  ],
  'cosmetic-restorative': [
    'dental shade guide',
    'dental veneers model',
    'dental crown model',
    'dental laboratory equipment',
    'dental ceramic crowns',
    'dental prosthetics model',
    'dental restoration tools',
  ],
  'bright-interior': [
    'modern dental clinic interior',
    'dental office interior',
    'bright dental chair room',
  ],
} as const satisfies Record<DentalStockCategory, readonly string[]>;

interface PexelsSearchResponse {
  photos: PexelsPhoto[];
}

function requiredApiKey(): string {
  const value = process.env.PEXELS_API_KEY?.trim();
  if (!value) throw new Error('PEXELS_API_KEY is required for the offline dental stock sync.');
  return value;
}

function metadataText(photo: PexelsPhoto): string {
  const slug = decodeURIComponent(new URL(photo.url).pathname.replaceAll('-', ' '));
  return `${photo.alt ?? ''} ${slug}`;
}

function atmosphereCandidate(photo: PexelsPhoto): boolean {
  const metadata = metadataText(photo);
  return (
    photo.width / photo.height >= 1.2
    && !UNSAFE_METADATA_RE.test(metadata)
    && !HUMAN_TREATMENT_RE.test(metadata)
  );
}

async function search(query: string): Promise<readonly PexelsPhoto[]> {
  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', '80');
  url.searchParams.set('orientation', 'landscape');
  url.searchParams.set('size', 'large');
  url.searchParams.set('locale', 'en-US');
  const response = await fetch(url, {
    headers: { Authorization: requiredApiKey() },
  });
  if (!response.ok) {
    throw new Error(`Pexels dental search failed (${query}): ${response.status}`);
  }
  const payload = await response.json() as PexelsSearchResponse;
  if (!Array.isArray(payload.photos)) {
    throw new Error(`Pexels dental search payload is invalid (${query}).`);
  }
  return payload.photos
    .filter((photo): photo is PexelsPhoto => Boolean(photo && typeof photo.id === 'number'))
    .sort((left, right) => left.id - right.id);
}

async function categoryCandidates(
  category: DentalStockCategory,
  globallyUsed: ReadonlySet<number>,
): Promise<readonly PexelsPhoto[]> {
  const byId = new Map<number, PexelsPhoto>();
  for (const query of CATEGORY_QUERIES[category]) {
    const photos = await search(query);
    for (const photo of photos) {
      if (
        !globallyUsed.has(photo.id)
        && atmosphereCandidate(photo)
        && !byId.has(photo.id)
      ) {
        byId.set(photo.id, photo);
      }
    }
    if (byId.size >= TARGET_PER_CATEGORY) break;
  }
  const selected = [...byId.values()]
    .sort((left, right) => left.id - right.id)
    .slice(0, TARGET_PER_CATEGORY);
  if (selected.length !== TARGET_PER_CATEGORY) {
    throw new Error(
      `${category} produced ${selected.length}/${TARGET_PER_CATEGORY} safe atmosphere assets.`,
    );
  }
  return selected;
}

async function rendition(photo: PexelsPhoto) {
  const url = new URL(photo.src.original);
  url.searchParams.set('auto', 'compress');
  url.searchParams.set('cs', 'tinysrgb');
  url.searchParams.set('w', '1600');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Pexels rendition ${photo.id} failed with ${response.status}`);
  const source = Buffer.from(await response.arrayBuffer());
  return sharp(source)
    .rotate()
    .resize({ width: 1600, height: 1200, fit: 'cover', position: 'attention' })
    .webp({ quality: 80, effort: 5 })
    .toBuffer({ resolveWithObject: true });
}

async function mapLimit<Input, Output>(
  values: readonly Input[],
  limit: number,
  task: (value: Input) => Promise<Output>,
): Promise<Output[]> {
  const output = new Array<Output>(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (next < values.length) {
      const index = next;
      next += 1;
      output[index] = await task(values[index]!);
    }
  }));
  return output;
}

function manifestSource(manifest: DentalStockManifest): string {
  return [
    "import type { DentalStockManifest } from './dental-stock-types';",
    '',
    '/** Generated by scripts/sync-pexels-dental-stock.ts; public rendering never calls Pexels. */',
    `export const DENTAL_STOCK_MANIFEST = ${JSON.stringify(manifest, null, 2)} as const satisfies DentalStockManifest;`,
    '',
  ].join('\n');
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const globallyUsed = new Set<number>();
  const selected: { category: DentalStockCategory; photo: PexelsPhoto }[] = [];
  for (const category of Object.keys(CATEGORY_QUERIES) as DentalStockCategory[]) {
    const photos = await categoryCandidates(category, globallyUsed);
    for (const photo of photos) {
      globallyUsed.add(photo.id);
      selected.push({ category, photo });
    }
  }
  const assets = await mapLimit(selected, 5, async ({ category, photo }) => {
    const encoded = await rendition(photo);
    const stockKey = `stk.clinic.dental.${category}.${photo.id}`;
    await writeFile(path.join(OUTPUT_DIR, `${photo.id}.webp`), encoded.data);
    const asset: FrozenDentalStockAsset = {
      assetId: deterministicStockAssetId(stockKey),
      stockKey,
      origin: 'licensed_stock',
      providerAssetId: String(photo.id),
      category,
      width: encoded.info.width,
      height: encoded.info.height,
      renditionUrl: `/stock/pexels/dental-atmosphere/${photo.id}.webp`,
      alt: photo.alt?.trim() ?? '',
      attribution: {
        provider: 'pexels',
        photographer: photo.photographer,
        photographerUrl: photo.photographer_url,
        sourceUrl: photo.url,
        licenseUrl: LICENSE_URL,
      },
      review: {
        algorithmVersion: 'clinic-dental-atmosphere-v1',
        passed: true,
        metadataSha256: createHash('sha256').update(metadataText(photo)).digest('hex'),
      },
    };
    return asset;
  });
  const manifest: DentalStockManifest = {
    version: 1,
    syncedAt: new Date().toISOString(),
    assets,
  };
  await writeFile(MANIFEST_PATH, manifestSource(manifest));
  process.stdout.write(`${JSON.stringify({
    categories: Object.fromEntries(
      Object.keys(CATEGORY_QUERIES).map((category) => [
        category,
        assets.filter((asset) => asset.category === category).length,
      ]),
    ),
    assetCount: assets.length,
    publicRuntimePexelsRequests: 0,
  }, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
