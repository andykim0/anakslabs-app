import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import sharp from 'sharp';
import {
  HERO_PHOTO_QUALITY_LIMITS,
  assessHeroPhotoQuality,
  isHeroPhotoQualityStamp,
} from '@/lib/assets/hero-photo-quality';
import {
  createMemoryAssetRegistry,
  createServerAssetOriginStamper,
} from '@/lib/assets/registry-core';

function detailedSvg(
  width: number,
  height: number,
  colors: readonly [string, string] = ['#243147', '#d8b785'],
): Buffer {
  const cells: string[] = [];
  const size = 36;
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      const fill = colors[(x / size + y / size) % 2 === 0 ? 0 : 1];
      cells.push(`<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${fill}"/>`);
    }
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${cells.join('')}</svg>`,
  );
}

async function detailedPhoto(width = 1920, height = 1080): Promise<Buffer> {
  return sharp(detailedSvg(width, height)).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer();
}

async function exposedDetailedPhoto(colors: readonly [string, string]): Promise<Buffer> {
  return sharp(detailedSvg(1920, 1080, colors))
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer();
}

async function solidPhoto(
  value: number,
  width = 1920,
  height = 1080,
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: value, g: value, b: value },
    },
  }).jpeg({ quality: 92 }).toBuffer();
}

describe('IMG I2 deterministic hero-photo quality gate', () => {
  test('충분한 해상도·비율·초점·노출의 사진은 승격 가능하다', async () => {
    const bytes = await detailedPhoto();
    const result = await assessHeroPhotoQuality(bytes);
    assert.equal(result.passed, true, JSON.stringify(result));
    assert.deepEqual(result.reasons, []);
    assert.equal(result.metrics.width, 1920);
    assert.equal(result.metrics.height, 1080);
    assert.ok(result.metrics.focusScore >= HERO_PHOTO_QUALITY_LIMITS.minimumFocusScore);
    assert.equal(isHeroPhotoQualityStamp(result), true);
  });

  test('a 1920px photographic raster does not set an excessive focus floor', async () => {
    const bytes = await detailedPhoto();
    const result = await assessHeroPhotoQuality(bytes);
    assert.equal(result.passed, true, JSON.stringify(result));
    assert.equal(result.reasons.includes('focus_too_soft'), false);
  });

  test('같은 원본 바이트는 판정·사유·서버 stamp까지 바이트 동일하다', async () => {
    const bytes = await detailedPhoto();
    const first = await assessHeroPhotoQuality(bytes);
    const second = await assessHeroPhotoQuality(Buffer.from(bytes));
    assert.equal(JSON.stringify(second), JSON.stringify(first));
  });

  test('1440·768·390 실제 cover 크롭 4개 포커스 후보를 결정적으로 스탬프한다', async () => {
    const result = await assessHeroPhotoQuality(await detailedPhoto());
    assert.deepEqual(Object.keys(result.viewportCrops ?? {}), ['wide', 'compact', 'mobile']);
    for (const band of ['wide', 'compact', 'mobile'] as const) {
      const crops = result.viewportCrops?.[band] ?? [];
      assert.equal(crops.length, 4);
      assert.ok(crops.every((crop) =>
        crop.focalPoint.x >= 0.2
        && crop.focalPoint.x <= 0.8
        && crop.focalPoint.y >= 0.2
        && crop.focalPoint.y <= 0.8));
      assert.ok(crops.every((crop) => crop.metrics.sourceCoverage > 0));
    }
  });

  test('정보가 없는 크롭은 밴드별 승격 불가 사유와 비난 없는 안내를 남긴다', async () => {
    const result = await assessHeroPhotoQuality(await solidPhoto(128));
    const mobile = result.viewportCrops?.mobile ?? [];
    assert.ok(mobile.every((crop) => !crop.passed));
    assert.ok(mobile.every((crop) => crop.reasons.includes('crop_information_too_low')));
    assert.ok(mobile.every((crop) => /Anaks Labs fallback/u.test(crop.guidance)));
  });

  test('판정은 customer_upload provenance 레코드에 서버 전용 immutable stamp로 저장된다', async () => {
    const imageQuality = await assessHeroPhotoQuality(await detailedPhoto());
    const registry = createMemoryAssetRegistry({
      idFactory: () => '11111111-1111-4111-8111-111111111111',
      now: () => '2026-07-23T00:00:00.000Z',
    });
    const record = await createServerAssetOriginStamper(registry).registerCustomerUploadAsset({
      clientId: 'client-1',
      storageBucket: 'client-assets',
      storageKey: 'uploads/photo.jpg',
      canonicalUrl: '/uploads/photo.jpg',
      mediaType: 'image',
      imageQuality,
    });
    assert.equal(record.origin, 'customer_upload');
    assert.deepEqual(record.imageQuality, imageQuality);
    await assert.rejects(
      () => createServerAssetOriginStamper(registry).registerCustomerUploadAsset({
        clientId: 'client-1',
        storageBucket: 'client-assets',
        storageKey: 'uploads/photo.jpg',
        canonicalUrl: '/uploads/photo.jpg',
        mediaType: 'image',
        imageQuality: { ...imageQuality, stampSha256: '0'.repeat(64) },
      }),
      /conflicting immutable provenance/,
    );
  });

  test('작은 사진은 해상도 사유와 교체 안내를 남긴다', async () => {
    const result = await assessHeroPhotoQuality(await detailedPhoto(800, 450));
    assert.equal(result.passed, false);
    assert.ok(result.reasons.includes('resolution_too_small'));
    assert.match(result.guidance, /at least 1600 pixels wide/);
  });

  test('세로로 과도하게 긴 사진은 크롭 비율 사유를 남긴다', async () => {
    const result = await assessHeroPhotoQuality(await detailedPhoto(1800, 2700));
    assert.equal(result.passed, false);
    assert.ok(result.reasons.includes('aspect_ratio_unsupported'));
    assert.match(result.guidance, /wider landscape photo/);
  });

  test('초점 정보가 없는 평면 사진은 흐림 사유를 남긴다', async () => {
    const result = await assessHeroPhotoQuality(await solidPhoto(128));
    assert.equal(result.passed, false);
    assert.ok(result.reasons.includes('focus_too_soft'));
    assert.match(result.guidance, /too soft/);
  });

  test('과소·과다 노출을 별도 코드와 비난 없는 문구로 구분한다', async () => {
    const dark = await assessHeroPhotoQuality(await exposedDetailedPhoto(['#020304', '#202326']));
    const bright = await assessHeroPhotoQuality(await exposedDetailedPhoto(['#eef0f2', '#ffffff']));
    assert.ok(dark.reasons.includes('exposure_too_dark'));
    assert.ok(bright.reasons.includes('exposure_too_bright'));
    assert.match(dark.guidance, /too dark/);
    assert.match(bright.guidance, /clipped highlights/);
  });

  test('업로드 경계와 0042 migration이 판정을 서버 권위 필드로 고정한다', () => {
    const route = readFileSync('src/app/api/uploads/route.ts', 'utf8');
    const migration = readFileSync('../supabase/migrations/0042_asset_image_quality.sql', 'utf8');
    const assessAt = route.indexOf('imageQuality = await assessHeroPhotoQuality(bytes)');
    const registerAt = route.indexOf('registerCustomerUploadAsset({', assessAt);
    assert.ok(assessAt >= 0 && registerAt > assessAt);
    assert.equal((route.match(/imageQuality,\n/g) ?? []).length, 2);
    assert.match(migration, /add column if not exists image_quality jsonb/);
    assert.match(migration, /origin = 'customer_upload'[\s\S]*media_type = 'image'/);
    assert.match(migration, /new\.image_quality\s+is distinct from old\.image_quality/);
    const commentLines = migration.split('\n').filter((line) => /^\s*--/u.test(line));
    assert.ok(commentLines.every((line) => !line.includes('$')));
  });
});
