import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { RasterImageError, readRasterDimensions } from '../raster-dimensions';

function png(width: number, height: number): Buffer {
  const value = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(value);
  value.write('IHDR', 12, 'ascii');
  value.writeUInt32BE(width, 16);
  value.writeUInt32BE(height, 20);
  return value;
}

function jpeg(width: number, height: number): Buffer {
  const value = Buffer.alloc(15);
  Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08]).copy(value);
  value.writeUInt16BE(height, 7);
  value.writeUInt16BE(width, 9);
  return value;
}

function webpVp8x(width: number, height: number): Buffer {
  const value = Buffer.alloc(30);
  value.write('RIFF', 0, 'ascii');
  value.writeUInt32LE(22, 4);
  value.write('WEBP', 8, 'ascii');
  value.write('VP8X', 12, 'ascii');
  value.writeUInt32LE(10, 16);
  const w = width - 1;
  const h = height - 1;
  value[24] = w & 0xff;
  value[25] = (w >> 8) & 0xff;
  value[26] = (w >> 16) & 0xff;
  value[27] = h & 0xff;
  value[28] = (h >> 8) & 0xff;
  value[29] = (h >> 16) & 0xff;
  return value;
}

describe('before/after 래스터 헤더 검증', () => {
  test('PNG/JPEG/WebP 실제 픽셀 크기를 읽는다', () => {
    assert.deepEqual(readRasterDimensions(png(1600, 900), 'image/png'), { width: 1600, height: 900 });
    assert.deepEqual(readRasterDimensions(jpeg(1200, 800), 'image/jpeg'), { width: 1200, height: 800 });
    assert.deepEqual(readRasterDimensions(webpVp8x(1920, 1080), 'image/webp'), { width: 1920, height: 1080 });
  });

  test('MIME만 이미지인 위장 파일과 MIME 불일치를 거부한다', () => {
    assert.throws(
      () => readRasterDimensions(Buffer.from('not-an-image'), 'image/png'),
      (error) => error instanceof RasterImageError && error.code === 'INVALID_RASTER',
    );
    assert.throws(
      () => readRasterDimensions(png(100, 100), 'image/jpeg'),
      (error) => error instanceof RasterImageError && error.code === 'INVALID_RASTER',
    );
  });

  test('SVG와 과대 픽셀 이미지는 fail-closed', () => {
    assert.throws(
      () => readRasterDimensions(Buffer.from('<svg/>'), 'image/svg+xml'),
      (error) => error instanceof RasterImageError && error.code === 'UNSUPPORTED_RASTER_TYPE',
    );
    assert.throws(
      () => readRasterDimensions(png(20_001, 100), 'image/png'),
      (error) => error instanceof RasterImageError && error.code === 'RASTER_DIMENSIONS_TOO_LARGE',
    );
  });
});
