import type { AssetRecord } from '@/lib/assets/provenance';
import {
  VIDEO_HARD_MAX_BYTES,
  classifyVideoBytes,
} from '@/lib/motion/asset-limits';

export const FULFILLMENT_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm'] as const;
export type FulfillmentVideoMimeType = (typeof FULFILLMENT_VIDEO_MIME_TYPES)[number];

export type FulfillmentVideoSource =
  | { kind: 'file'; value: string }
  | { kind: 'url'; value: string };

export interface RegisterFulfillmentVideoArgs {
  siteId: string;
  source: FulfillmentVideoSource;
  dryRun: boolean;
}

export interface FulfillmentVideoProbe {
  streams?: Array<{
    codec_type?: unknown;
    width?: unknown;
    height?: unknown;
    duration?: unknown;
    nb_frames?: unknown;
  }>;
  frames?: Array<{ key_frame?: unknown }>;
}

export interface VerifiedFulfillmentVideoProbe {
  width: number;
  height: number;
  durationSeconds?: number;
  frameCount: number;
  keyframeCount: number;
}

export class FulfillmentVideoRegistrationError extends Error {
  constructor(readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'FulfillmentVideoRegistrationError';
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredFlagValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1]?.trim();
  if (!value || value.startsWith('--')) {
    throw new FulfillmentVideoRegistrationError(
      'OPS_VIDEO_ARGUMENT_INVALID',
      `${flag} 값이 필요합니다.`,
    );
  }
  return value;
}

/** Parse a deliberately narrow CLI contract. Owner/origin/storage claims are never accepted. */
export function parseRegisterFulfillmentVideoArgs(
  argv: readonly string[],
): RegisterFulfillmentVideoArgs {
  const values = new Map<string, string>();
  let dryRun = false;
  const allowed = new Set(['--site-id', '--file', '--url', '--dry-run']);

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!allowed.has(flag)) {
      throw new FulfillmentVideoRegistrationError(
        'OPS_VIDEO_ARGUMENT_INVALID',
        `지원하지 않는 인자입니다: ${flag}`,
      );
    }
    if (flag === '--dry-run') {
      if (dryRun) {
        throw new FulfillmentVideoRegistrationError(
          'OPS_VIDEO_ARGUMENT_INVALID',
          '--dry-run은 한 번만 지정할 수 있습니다.',
        );
      }
      dryRun = true;
      continue;
    }
    if (values.has(flag)) {
      throw new FulfillmentVideoRegistrationError(
        'OPS_VIDEO_ARGUMENT_INVALID',
        `${flag}는 한 번만 지정할 수 있습니다.`,
      );
    }
    values.set(flag, requiredFlagValue(argv, index, flag));
    index += 1;
  }

  const siteId = values.get('--site-id') ?? '';
  if (!UUID_PATTERN.test(siteId)) {
    throw new FulfillmentVideoRegistrationError(
      'OPS_VIDEO_SITE_ID_INVALID',
      '--site-id에는 사이트 UUID를 지정해야 합니다.',
    );
  }

  const file = values.get('--file');
  const url = values.get('--url');
  if ((file ? 1 : 0) + (url ? 1 : 0) !== 1) {
    throw new FulfillmentVideoRegistrationError(
      'OPS_VIDEO_SOURCE_INVALID',
      '--file과 --url 중 정확히 하나를 지정해야 합니다.',
    );
  }
  if (url) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new FulfillmentVideoRegistrationError(
        'OPS_VIDEO_URL_INVALID',
        '--url은 유효한 HTTPS URL이어야 합니다.',
      );
    }
    if (parsed.protocol !== 'https:') {
      throw new FulfillmentVideoRegistrationError(
        'OPS_VIDEO_URL_INVALID',
        '--url은 HTTPS만 허용합니다.',
      );
    }
  }

  return {
    siteId,
    source: file ? { kind: 'file', value: file } : { kind: 'url', value: url! },
    dryRun,
  };
}

export function assertFulfillmentVideoRegistrationEnvironment(input: {
  mockMode: boolean;
  provenanceWrite: boolean;
}): void {
  if (input.mockMode) {
    throw new FulfillmentVideoRegistrationError(
      'OPS_VIDEO_REAL_MODE_REQUIRED',
      '운영 registry UUID는 NEXT_PUBLIC_MOCK_MODE=0에서만 발급할 수 있습니다.',
    );
  }
  if (!input.provenanceWrite) {
    throw new FulfillmentVideoRegistrationError(
      'OPS_VIDEO_PROVENANCE_WRITE_REQUIRED',
      'ASSET_PROVENANCE_V2_WRITE=1이 아니면 URL-only 결과가 생길 수 있어 등록을 중단합니다.',
    );
  }
}

export function classifyFulfillmentVideoBytes(bytes: number): { warning?: string } {
  if (!Number.isSafeInteger(bytes) || bytes <= 0) {
    throw new FulfillmentVideoRegistrationError(
      'OPS_VIDEO_EMPTY',
      '비어 있거나 크기를 확인할 수 없는 영상은 등록할 수 없습니다.',
    );
  }
  const classification = classifyVideoBytes(bytes);
  if (classification.blocker || bytes > VIDEO_HARD_MAX_BYTES) {
    throw new FulfillmentVideoRegistrationError(
      'OPS_VIDEO_SIZE_BLOCKED',
      classification.blocker ?? '히어로 영상이 8MB 하드 상한을 초과했습니다.',
    );
  }
  return classification.warning ? { warning: classification.warning } : {};
}

/** Container magic is checked so a renamed arbitrary file cannot pass by extension alone. */
export function detectFulfillmentVideoMime(bytes: Uint8Array): FulfillmentVideoMimeType | null {
  if (
    bytes.byteLength >= 12
    && String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]) === 'ftyp'
  ) {
    return 'video/mp4';
  }
  if (
    bytes.byteLength >= 4
    && bytes[0] === 0x1a
    && bytes[1] === 0x45
    && bytes[2] === 0xdf
    && bytes[3] === 0xa3
  ) {
    return 'video/webm';
  }
  return null;
}

export function normalizeFulfillmentVideoMime(
  bytes: Uint8Array,
  declaredMime?: string | null,
): FulfillmentVideoMimeType {
  const detected = detectFulfillmentVideoMime(bytes);
  if (!detected) {
    throw new FulfillmentVideoRegistrationError(
      'OPS_VIDEO_CONTAINER_UNSUPPORTED',
      'MP4 또는 WebM 컨테이너만 등록할 수 있습니다.',
    );
  }
  if (declaredMime) {
    const normalized = declaredMime.split(';', 1)[0].trim().toLowerCase();
    if (!(FULFILLMENT_VIDEO_MIME_TYPES as readonly string[]).includes(normalized)) {
      throw new FulfillmentVideoRegistrationError(
        'OPS_VIDEO_MIME_UNSUPPORTED',
        `지원하지 않는 영상 MIME입니다: ${normalized || '(없음)'}`,
      );
    }
    if (normalized !== detected) {
      throw new FulfillmentVideoRegistrationError(
        'OPS_VIDEO_MIME_MISMATCH',
        `선언 MIME(${normalized})과 실제 컨테이너(${detected})가 다릅니다.`,
      );
    }
  }
  return detected;
}

function positiveInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

/** Require a single silent video stream and an actual all-intra (-g 1) frame table. */
export function verifyFulfillmentVideoProbe(
  probe: FulfillmentVideoProbe,
): VerifiedFulfillmentVideoProbe {
  const streams = Array.isArray(probe.streams) ? probe.streams : [];
  const videos = streams.filter((stream) => stream.codec_type === 'video');
  const audios = streams.filter((stream) => stream.codec_type === 'audio');
  if (videos.length !== 1) {
    throw new FulfillmentVideoRegistrationError(
      'OPS_VIDEO_STREAM_INVALID',
      '영상 스트림은 정확히 1개여야 합니다.',
    );
  }
  if (audios.length !== 0) {
    throw new FulfillmentVideoRegistrationError(
      'OPS_VIDEO_AUDIO_FORBIDDEN',
      '히어로 영상은 무음(-an)이어야 합니다.',
    );
  }

  const width = positiveInteger(videos[0].width);
  const height = positiveInteger(videos[0].height);
  if (!width || !height) {
    throw new FulfillmentVideoRegistrationError(
      'OPS_VIDEO_GEOMETRY_INVALID',
      '영상 해상도를 확인할 수 없습니다.',
    );
  }

  const frames = Array.isArray(probe.frames) ? probe.frames : [];
  if (frames.length === 0) {
    throw new FulfillmentVideoRegistrationError(
      'OPS_VIDEO_FRAMES_MISSING',
      'ffprobe가 영상 프레임을 확인하지 못했습니다.',
    );
  }
  const keyframeCount = frames.filter((frame) => Number(frame.key_frame) === 1).length;
  if (keyframeCount !== frames.length) {
    throw new FulfillmentVideoRegistrationError(
      'OPS_VIDEO_GOP_INVALID',
      `모든 프레임이 키프레임이어야 합니다(-g 1): ${keyframeCount}/${frames.length}`,
    );
  }

  const duration = Number(videos[0].duration);
  return {
    width,
    height,
    durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : undefined,
    frameCount: frames.length,
    keyframeCount,
  };
}

export function assertRegisteredFulfillmentVideo(input: {
  record: AssetRecord | null | undefined;
  assetId: string;
  clientId: string;
  siteId: string;
  canonicalUrl: string;
}): AssetRecord {
  const { record } = input;
  if (
    !record
    || record.id !== input.assetId
    || record.ownerId !== input.clientId
    || record.siteId !== input.siteId
    || record.canonicalUrl !== input.canonicalUrl
    || record.origin !== 'ai_generated'
    || record.mediaType !== 'video'
    || !record.storageBucket
    || !record.storageKey
  ) {
    throw new FulfillmentVideoRegistrationError(
      'OPS_VIDEO_REGISTRY_VERIFICATION_FAILED',
      '등록 후 registry의 소유·사이트·AI 영상·Storage identity를 재검증하지 못했습니다.',
    );
  }
  return record;
}

export function formatFulfillmentVideoAssetId(assetId: string): string {
  if (!UUID_PATTERN.test(assetId)) {
    throw new FulfillmentVideoRegistrationError(
      'OPS_VIDEO_ASSET_ID_INVALID',
      'registry가 유효한 영상 자산 UUID를 반환하지 않았습니다.',
    );
  }
  return `VIDEO_ASSET_ID=${assetId}`;
}
