import sharp from 'sharp';
import { relLuminance } from '@/lib/design/quality-standards';
import type { ImageContrastProfile } from '@/lib/design/scrim';

function hex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** 원본 바이트만 소비하는 결정적 서버 분석. 브라우저 측정·랜덤·외부 호출이 없다. */
export async function assessImageContrastProfile(bytes: Buffer): Promise<ImageContrastProfile> {
  const sample = await sharp(bytes, { failOn: 'error', limitInputPixels: 80_000_000 })
    .rotate()
    .removeAlpha()
    .resize({ width: 192, height: 192, fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = sample.info.channels;
  const minimum = [255, 255, 255];
  const maximum = [0, 0, 0];
  let luminance = 0;
  let pixels = 0;
  for (let offset = 0; offset < sample.data.length; offset += channels) {
    const red = sample.data[offset]!;
    const green = sample.data[offset + 1]!;
    const blue = sample.data[offset + 2]!;
    minimum[0] = Math.min(minimum[0]!, red);
    minimum[1] = Math.min(minimum[1]!, green);
    minimum[2] = Math.min(minimum[2]!, blue);
    maximum[0] = Math.max(maximum[0]!, red);
    maximum[1] = Math.max(maximum[1]!, green);
    maximum[2] = Math.max(maximum[2]!, blue);
    luminance += relLuminance(hex(red, green, blue));
    pixels += 1;
  }
  if (!pixels) throw new Error('Image contrast profile sample is empty.');
  return {
    algorithmVersion: 'image-channel-range-v1',
    darkestColor: hex(minimum[0]!, minimum[1]!, minimum[2]!),
    brightestColor: hex(maximum[0]!, maximum[1]!, maximum[2]!),
    meanLuminance: Math.round((luminance / pixels) * 1_000_000) / 1_000_000,
  };
}
