import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { toAssetRef } from '@/lib/assets/provenance';
import { createMemoryAssetRegistry, createServerAssetOriginStamper } from '@/lib/assets/registry-core';
import {
  automaticStockBucket,
  automatedStockReview,
  deterministicStockAssetId,
} from './curation';
import {
  clearPexelsCollectionCacheForTests,
  fetchInteriorMaterialsCollection,
  type PexelsPhoto,
} from './pexels-client';
import { workshopStockManifest } from './manifest';

const ROOT = process.cwd();

function photo(overrides: Partial<PexelsPhoto> = {}): PexelsPhoto {
  return {
    id: 101,
    width: 1800,
    height: 1200,
    url: 'https://www.pexels.com/photo/wood-texture-101/',
    photographer: 'Example',
    photographer_url: 'https://www.pexels.com/@example',
    avg_color: '#887766',
    alt: 'Wood texture',
    src: {
      original: 'https://images.pexels.com/photos/101/example.jpeg',
      large2x: 'https://images.pexels.com/photos/101/example.jpeg?w=940',
    },
    ...overrides,
  };
}

test('Pexels collection client caches one approved collection response for 24 hours', async () => {
  clearPexelsCollectionCacheForTests();
  let requests = 0;
  const fetchImpl: typeof fetch = async (_input, init) => {
    requests += 1;
    assert.equal((init?.headers as Record<string, string>).Authorization, 'secret');
    return new Response(JSON.stringify({ id: 'zmqu95c', media: [photo()] }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '199' },
    });
  };
  const first = await fetchInteriorMaterialsCollection({
    env: { ...process.env, PEXELS_API_KEY: 'secret' },
    now: 100,
    fetchImpl,
  });
  const second = await fetchInteriorMaterialsCollection({
    env: { ...process.env, PEXELS_API_KEY: 'secret' },
    now: 101,
    fetchImpl,
  });
  assert.deepEqual(first, second);
  assert.equal(requests, 1);
});

test('automatic curation and bucket mapping are deterministic and conservative', () => {
  assert.deepEqual(automatedStockReview(photo()), { passed: true, reasons: [] });
  assert.deepEqual(
    automatedStockReview(photo({ alt: 'People holding a branded poster' })),
    {
      passed: false,
      reasons: ['person-or-body-metadata', 'brand-or-text-metadata'],
    },
  );
  assert.equal(automaticStockBucket(photo({ width: 4000, height: 6000 })), 'MP');
  assert.equal(automaticStockBucket(photo({ width: 6000, height: 4000 })), 'ML');
  assert.equal(
    deterministicStockAssetId('stk.workshop.101'),
    deterministicStockAssetId('stk.workshop.101'),
  );
});

test('frozen manifest self-hosts every rendition and carries immutable attribution', () => {
  const manifest = workshopStockManifest();
  assert.ok(manifest.assets.length >= 37);
  assert.equal(new Set(manifest.assets.map((asset) => asset.assetId)).size, manifest.assets.length);
  assert.equal(new Set(manifest.assets.map((asset) => asset.stockKey)).size, manifest.assets.length);
  for (const asset of manifest.assets) {
    assert.ok(existsSync(path.join(ROOT, 'public', asset.renditionUrl)));
    assert.equal(asset.attribution.provider, 'pexels');
    assert.equal(asset.attribution.licenseUrl, 'https://www.pexels.com/license/');
    assert.ok(asset.width > 0 && asset.height > 0);
  }
});

test('licensed stock is global server availability, cannot bind, and projects dimensions', async () => {
  const registry = createMemoryAssetRegistry();
  const stamper = createServerAssetOriginStamper(registry);
  const assetId = deterministicStockAssetId('stk.workshop.101');
  const record = await stamper.registerLicensedStockAsset({
    assetId,
    storageBucket: 'web-public',
    storageKey: 'stock/pexels/interior-materials/101.webp',
    canonicalUrl: '/stock/pexels/interior-materials/101.webp',
    mediaType: 'image',
    width: 1440,
    height: 960,
    stockKey: 'stk.workshop.101',
    provider: 'pexels',
    providerAssetId: '101',
    attribution: {
      provider: 'pexels',
      photographer: 'Example',
      photographerUrl: 'https://www.pexels.com/@example',
      sourceUrl: 'https://www.pexels.com/photo/example-101/',
      licenseUrl: 'https://www.pexels.com/license/',
    },
  });
  assert.equal(record.ownerId, null);
  assert.deepEqual(await registry.resolveAvailable({
    assetIds: [assetId],
    clientId: crypto.randomUUID(),
  }), [record]);
  assert.deepEqual(toAssetRef(record), {
    assetId,
    url: record.canonicalUrl,
    width: 1440,
    height: 960,
    attribution: record.attribution,
  });
  await assert.rejects(
    registry.bindToSite({
      assetId,
      clientId: crypto.randomUUID(),
      siteId: crypto.randomUUID(),
    }),
    /another client/u,
  );
});

test('0048 keeps licensed stock server-owned and dimensions immutable after first set', () => {
  const sql = readFileSync(
    path.join(ROOT, '..', 'supabase', 'migrations', '0048_licensed_stock_and_asset_dimensions.sql'),
    'utf8',
  );
  assert.match(sql, /origin = 'licensed_stock'[\s\S]*client_id is null[\s\S]*site_id is null/u);
  assert.match(sql, /old\.width is not null and new\.width is distinct from old\.width/u);
  assert.match(sql, /image_quality -> 'metrics' ->> 'width'/u);
  assert.match(sql, /set_asset_raster_dimensions_once/u);
  assert.doesNotMatch(sql, /--[^\n]*\$/u);
  assert.doesNotMatch(sql, /if[\s\S]{0,180}\bcase\b/iu);
});

test('Pexels client remains an offline-only script dependency, not a renderer dependency', () => {
  const files = [
    'src/components/site-renderer/SiteRenderer.tsx',
    'src/lib/data/site-templates.ts',
    'src/lib/abstract/application.ts',
  ];
  for (const file of files) {
    const source = readFileSync(path.join(ROOT, file), 'utf8');
    assert.doesNotMatch(source, /pexels-client|api\.pexels\.com/u);
  }
});
