/**
 * Register a manually fulfilled hero video in the authoritative asset registry.
 *
 * This script never accepts owner/origin/storage claims. It derives the owner
 * from the persisted site, uploads bytes into Daboim Storage, stamps the fixed
 * ai_generated origin, verifies the registry row, then prints the UUID consumed
 * by /admin/video-queue.
 */
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { getHeroVideoFulfillmentRepository } from '@/lib/admin/video-fulfillment-repository';
import { siteVideoFulfillmentState } from '@/lib/admin/video-fulfillment-core';
import { assetProvenanceConfig } from '@/lib/assets/provenance-flags';
import { resolveOwnedAssetRecords } from '@/lib/assets/registry';
import { getDataServices } from '@/lib/data';
import { uploadAiVideoDetailed } from '@/lib/data/supabase/storage';
import { isMockMode } from '@/lib/env';
import { ImportError, readLimitedBytes, safeFetch } from '@/lib/import/extract';
import { VIDEO_HARD_MAX_BYTES } from '@/lib/motion/asset-limits';
import {
  FulfillmentVideoRegistrationError,
  assertFulfillmentVideoRegistrationEnvironment,
  assertRegisteredFulfillmentVideo,
  classifyFulfillmentVideoBytes,
  formatFulfillmentVideoAssetId,
  normalizeFulfillmentVideoMime,
  parseRegisterFulfillmentVideoArgs,
  verifyFulfillmentVideoProbe,
  type FulfillmentVideoMimeType,
  type FulfillmentVideoProbe,
} from '@/lib/ops/fulfillment-video-registration-core';

const USAGE = `사용법:
  node --env-file=.env.local ./node_modules/.bin/tsx --tsconfig scripts/tsconfig.json \\
    scripts/register-fulfillment-video.ts --site-id <UUID> --file </absolute/video.mp4>

  node --env-file=.env.local ./node_modules/.bin/tsx --tsconfig scripts/tsconfig.json \\
    scripts/register-fulfillment-video.ts --site-id <UUID> --url <HTTPS_URL>

옵션:
  --dry-run  큐·파일·크기·무음·-g 1을 검사하되 업로드/registry 쓰기는 하지 않음`;

function sourceMimeFromFileName(fileName: string): FulfillmentVideoMimeType {
  const extension = extname(fileName).toLowerCase();
  if (extension === '.mp4') return 'video/mp4';
  if (extension === '.webm') return 'video/webm';
  throw new FulfillmentVideoRegistrationError(
    'OPS_VIDEO_EXTENSION_UNSUPPORTED',
    '로컬 영상 확장자는 .mp4 또는 .webm이어야 합니다.',
  );
}

async function readLocalSource(fileName: string): Promise<{
  bytes: Buffer;
  declaredMime: FulfillmentVideoMimeType;
}> {
  const filePath = resolve(fileName);
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) {
    throw new FulfillmentVideoRegistrationError(
      'OPS_VIDEO_FILE_NOT_FOUND',
      '읽을 수 있는 일반 영상 파일을 지정해야 합니다.',
    );
  }
  classifyFulfillmentVideoBytes(info.size);
  const bytes = await readFile(filePath);
  classifyFulfillmentVideoBytes(bytes.byteLength);
  return { bytes, declaredMime: sourceMimeFromFileName(filePath) };
}

async function readRemoteSource(url: string): Promise<{
  bytes: Buffer;
  declaredMime: string;
}> {
  const { res, finalUrl } = await safeFetch(url, {
    accept: 'video/mp4,video/webm',
    maxRedirects: 3,
    timeoutMs: 60_000,
  });
  if (new URL(finalUrl).protocol !== 'https:') {
    throw new FulfillmentVideoRegistrationError(
      'OPS_VIDEO_URL_INVALID',
      '리다이렉트 뒤 최종 영상 주소도 HTTPS여야 합니다.',
    );
  }

  const declaredMime = res.headers.get('content-type');
  if (!declaredMime) {
    throw new FulfillmentVideoRegistrationError(
      'OPS_VIDEO_MIME_UNSUPPORTED',
      '원격 영상 응답에 Content-Type이 없습니다.',
    );
  }
  const contentLength = Number(res.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > VIDEO_HARD_MAX_BYTES) {
    throw new FulfillmentVideoRegistrationError(
      'OPS_VIDEO_SIZE_BLOCKED',
      '원격 영상이 8MB 하드 상한을 초과했습니다.',
    );
  }

  // URL itself is never registered. SSRF-safe, size-bounded bytes are copied
  // into Daboim Storage and receive a new authoritative storage identity.
  let bytes: Buffer;
  try {
    bytes = Buffer.from(await readLimitedBytes(res, VIDEO_HARD_MAX_BYTES));
  } catch (error) {
    if (error instanceof ImportError && error.code === 'TOO_LARGE') {
      throw new FulfillmentVideoRegistrationError(
        'OPS_VIDEO_SIZE_BLOCKED',
        '원격 영상이 8MB 하드 상한을 초과했습니다.',
      );
    }
    throw error;
  }
  classifyFulfillmentVideoBytes(bytes.byteLength);
  return { bytes, declaredMime };
}

function parseProbeJson(raw: string, stage: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
    return parsed as Record<string, unknown>;
  } catch {
    throw new FulfillmentVideoRegistrationError(
      'OPS_VIDEO_FFPROBE_INVALID',
      `ffprobe ${stage} 결과를 해석할 수 없습니다.`,
    );
  }
}

function ffprobe(filePath: string, args: readonly string[]): string {
  try {
    return execFileSync('ffprobe', [...args, filePath], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const detail = error instanceof Error && 'code' in error && error.code === 'ENOENT'
      ? 'ffprobe가 없습니다. ffmpeg를 먼저 설치해 주세요.'
      : 'ffprobe가 영상 파일을 검사하지 못했습니다.';
    throw new FulfillmentVideoRegistrationError('OPS_VIDEO_FFPROBE_FAILED', detail);
  }
}

function inspectWithFfprobe(filePath: string) {
  const streamPayload = parseProbeJson(ffprobe(filePath, [
    '-v', 'error',
    '-print_format', 'json',
    '-show_entries', 'stream=codec_type,width,height,duration,nb_frames',
    '-show_streams',
  ]), 'stream');
  const framePayload = parseProbeJson(ffprobe(filePath, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-print_format', 'json',
    '-show_entries', 'frame=key_frame',
    '-show_frames',
  ]), 'frame');
  return verifyFulfillmentVideoProbe({
    streams: Array.isArray(streamPayload.streams)
      ? streamPayload.streams as NonNullable<FulfillmentVideoProbe['streams']>
      : [],
    frames: Array.isArray(framePayload.frames)
      ? framePayload.frames as NonNullable<FulfillmentVideoProbe['frames']>
      : [],
  });
}

async function assertReadyQueueSite(siteId: string) {
  const { sites, clients } = getDataServices();
  const fulfillments = getHeroVideoFulfillmentRepository();
  const [site, completion] = await Promise.all([
    sites.getById(siteId),
    fulfillments.getBySite(siteId),
  ]);
  if (!site) {
    throw new FulfillmentVideoRegistrationError('OPS_VIDEO_SITE_NOT_FOUND', '사이트를 찾을 수 없습니다.');
  }
  const client = await clients.getById(site.clientId);
  if (!client) {
    throw new FulfillmentVideoRegistrationError('OPS_VIDEO_CLIENT_NOT_FOUND', '사이트 소유 고객을 찾을 수 없습니다.');
  }
  const state = siteVideoFulfillmentState({ site, client, completion });
  if (!state.pending) {
    throw new FulfillmentVideoRegistrationError(
      'OPS_VIDEO_QUEUE_NOT_PENDING',
      `현재 영상 이행 대기 상태가 아닙니다: ${state.reason}`,
    );
  }
  if (state.blockedReason) {
    throw new FulfillmentVideoRegistrationError(
      'OPS_VIDEO_QUEUE_BLOCKED',
      `영상 이행 큐가 차단되어 있습니다: ${state.blockedReason}`,
    );
  }
  return { site, client };
}

async function main(): Promise<void> {
  if (process.argv.slice(2).includes('--help')) {
    console.log(USAGE);
    return;
  }
  const args = parseRegisterFulfillmentVideoArgs(process.argv.slice(2));
  const provenance = assetProvenanceConfig();
  assertFulfillmentVideoRegistrationEnvironment({
    mockMode: isMockMode(),
    provenanceWrite: provenance.write,
  });

  // Entitlement, explicit request, policy v2, poster agreement, and immutable
  // completion state are checked before reading a remote URL or writing Storage.
  const { site, client } = await assertReadyQueueSite(args.siteId);
  const source = args.source.kind === 'file'
    ? await readLocalSource(args.source.value)
    : await readRemoteSource(args.source.value);
  const size = classifyFulfillmentVideoBytes(source.bytes.byteLength);
  const mimeType = normalizeFulfillmentVideoMime(source.bytes, source.declaredMime);
  if (size.warning) console.warn(`[video-register] 경고: ${size.warning}`);

  const tempDirectory = await mkdtemp(join(tmpdir(), 'daboim-video-register-'));
  let assetId: string | undefined;
  try {
    const probePath = join(tempDirectory, `candidate.${mimeType === 'video/webm' ? 'webm' : 'mp4'}`);
    await writeFile(probePath, source.bytes);
    const probe = inspectWithFfprobe(probePath);
    console.log(
      `[video-register] 검증 완료 · ${probe.width}x${probe.height} · `
      + `${probe.frameCount}프레임/키프레임 ${probe.keyframeCount} · `
      + `${(source.bytes.byteLength / 1024 / 1024).toFixed(2)}MB · 무음`,
    );

    if (args.dryRun) {
      console.log('DRY_RUN_OK=1');
      return;
    }

    const uploaded = await uploadAiVideoDetailed({
      bytes: source.bytes,
      mimeType,
      prefix: `manual-fulfillment/${site.id}`,
      owner: { clientId: client.id, siteId: site.id },
    });
    if (!uploaded.assetId) {
      throw new FulfillmentVideoRegistrationError(
        'OPS_VIDEO_REGISTRY_WRITE_MISSING',
        'Storage 업로드 뒤 registry UUID가 발급되지 않았습니다.',
      );
    }
    const [record] = await resolveOwnedAssetRecords({
      assetIds: [uploaded.assetId],
      clientId: client.id,
      siteId: site.id,
    });
    assertRegisteredFulfillmentVideo({
      record,
      assetId: uploaded.assetId,
      clientId: client.id,
      siteId: site.id,
      canonicalUrl: uploaded.url,
    });
    assetId = uploaded.assetId;
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }

  // Keep this as the final success line so operators can copy or parse it.
  if (!assetId) {
    throw new FulfillmentVideoRegistrationError(
      'OPS_VIDEO_REGISTRY_WRITE_MISSING',
      'registry UUID를 확인하지 못했습니다.',
    );
  }
  console.log(formatFulfillmentVideoAssetId(assetId));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error('\n' + USAGE);
  process.exitCode = 1;
});
