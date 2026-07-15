/** 최소 헤더만 읽어 PNG/JPEG/WebP의 실제 형식과 픽셀 크기를 검증한다. */

export const BEFORE_AFTER_RASTER_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type BeforeAfterRasterMime = (typeof BEFORE_AFTER_RASTER_MIME)[number];

export interface RasterDimensions {
  width: number;
  height: number;
}

export class RasterImageError extends Error {
  constructor(
    public readonly code: 'UNSUPPORTED_RASTER_TYPE' | 'INVALID_RASTER' | 'RASTER_DIMENSIONS_TOO_LARGE',
    message: string,
  ) {
    super(message);
    this.name = 'RasterImageError';
  }
}

const MAX_DIMENSION = 20_000;
const MAX_PIXELS = 80_000_000;

function validDimensions(value: RasterDimensions | null): RasterDimensions | null {
  if (!value || !Number.isInteger(value.width) || !Number.isInteger(value.height)) return null;
  if (value.width <= 0 || value.height <= 0) return null;
  return value;
}

function pngDimensions(bytes: Buffer): RasterDimensions | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((byte, index) => bytes[index] !== byte)) return null;
  if (bytes.toString('ascii', 12, 16) !== 'IHDR') return null;
  return validDimensions({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });
}

const JPEG_SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function jpegDimensions(bytes: Buffer): RasterDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 3 < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) return null;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if (JPEG_SOF_MARKERS.has(marker)) {
      if (segmentLength < 7) return null;
      return validDimensions({
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      });
    }
    offset += segmentLength;
  }
  return null;
}

function uint24LE(bytes: Buffer, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function webpDimensions(bytes: Buffer): RasterDimensions | null {
  if (
    bytes.length < 30
    || bytes.toString('ascii', 0, 4) !== 'RIFF'
    || bytes.toString('ascii', 8, 12) !== 'WEBP'
  ) return null;

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const kind = bytes.toString('ascii', offset, offset + 4);
    const chunkLength = bytes.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (data + chunkLength > bytes.length) return null;

    if (kind === 'VP8X' && chunkLength >= 10) {
      return validDimensions({
        width: uint24LE(bytes, data + 4) + 1,
        height: uint24LE(bytes, data + 7) + 1,
      });
    }
    if (kind === 'VP8L' && chunkLength >= 5 && bytes[data] === 0x2f) {
      const b1 = bytes[data + 1];
      const b2 = bytes[data + 2];
      const b3 = bytes[data + 3];
      const b4 = bytes[data + 4];
      return validDimensions({
        width: 1 + (b1 | ((b2 & 0x3f) << 8)),
        height: 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)),
      });
    }
    if (
      kind === 'VP8 '
      && chunkLength >= 10
      && bytes[data + 3] === 0x9d
      && bytes[data + 4] === 0x01
      && bytes[data + 5] === 0x2a
    ) {
      return validDimensions({
        width: bytes.readUInt16LE(data + 6) & 0x3fff,
        height: bytes.readUInt16LE(data + 8) & 0x3fff,
      });
    }
    offset = data + chunkLength + (chunkLength % 2);
  }
  return null;
}

export function readRasterDimensions(bytes: Buffer, mimeType: string): RasterDimensions {
  let dimensions: RasterDimensions | null = null;
  if (mimeType === 'image/png') dimensions = pngDimensions(bytes);
  else if (mimeType === 'image/jpeg') dimensions = jpegDimensions(bytes);
  else if (mimeType === 'image/webp') dimensions = webpDimensions(bytes);
  else {
    throw new RasterImageError(
      'UNSUPPORTED_RASTER_TYPE',
      '전후 사진은 PNG·JPG·WEBP 래스터 이미지만 업로드할 수 있습니다.',
    );
  }
  if (!dimensions) {
    throw new RasterImageError('INVALID_RASTER', '파일 확장자와 실제 이미지 형식이 일치하지 않습니다.');
  }
  if (
    dimensions.width > MAX_DIMENSION
    || dimensions.height > MAX_DIMENSION
    || dimensions.width * dimensions.height > MAX_PIXELS
  ) {
    throw new RasterImageError('RASTER_DIMENSIONS_TOO_LARGE', '이미지 픽셀 크기가 너무 큽니다.');
  }
  return dimensions;
}
