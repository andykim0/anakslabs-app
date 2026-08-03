/**
 * Register a manually fulfilled hero video in the authoritative asset registry.
 *
 * This script never accepts owner/origin/storage claims. It derives the owner
 * from the persisted site, uploads bytes into Anaks Labs Storage, stamps the fixed
 * ai_generated origin, verifies the registry row, then prints the UUID consumed
 * by /admin/video-queue.
 */
import { execFileSync } from 'node:child_process';
import { Resolver } from 'node:dns/promises';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { getHeroVideoFulfillmentRepository } from '@/lib/admin/video-fulfillment-repository';
import { siteVideoFulfillmentState } from '@/lib/admin/video-fulfillment-core';
import { assetProvenanceConfig } from '@/lib/assets/provenance-flags';
import { resolveOwnedAssetRecords } from '@/lib/assets/registry';
import { getDataServices } from '@/lib/data';
import { uploadAiVideoDetailed } from '@/lib/data/supabase/storage';
import { isMockMode } from '@/lib/env';
import { VIDEO_HARD_MAX_BYTES } from '@/lib/motion/asset-limits';
import {
  FulfillmentVideoRegistrationError,
  assertFulfillmentVideoRegistrationEnvironment,
  assertRegisteredFulfillmentVideo,
  classifyFulfillmentVideoBytes,
  formatFulfillmentVideoAssetId,
  normalizeFulfillmentVideoMime,
  parseRegisterFulfillmentVideoArgs,
  selectPinnedFulfillmentVideoIpv4,
  verifyFulfillmentVideoProbe,
  type FulfillmentVideoMimeType,
  type FulfillmentVideoProbe,
} from '@/lib/ops/fulfillment-video-registration-core';

const REMOTE_VIDEO_TIMEOUT_MS = 60_000;
const REMOTE_VIDEO_MAX_REDIRECTS = 3;
const REMOTE_VIDEO_USER_AGENT = 'Anaks LabsFulfillmentVideo/1.0';

const USAGE = `사용법:
  node --env-file=.env.local ./node_modules/.bin/tsx --tsconfig scripts/tsconfig.json \\
    scripts/register-fulfillment-video.ts --site-id <UUID> --file </absolute/video.mp4>

  node --env-file=.env.local ./node_modules/.bin/tsx --tsconfig scripts/tsconfig.json \\
    scripts/register-fulfillment-video.ts --site-id <UUID> --url <HTTPS_URL>

옵션:
  --dry-run  큐·파일·크기·1080p H.264·길이·무음·-g 1을 검사하되 업로드/registry 쓰기는 하지 않음`;

function sourceMimeFromFileName(fileName: string): FulfillmentVideoMimeType {
  const extension = extname(fileName).toLowerCase();
  if (extension === '.mp4') return 'video/mp4';
  throw new FulfillmentVideoRegistrationError(
    'OPS_VIDEO_EXTENSION_UNSUPPORTED',
    '로컬 영상 확장자는 .mp4여야 합니다.',
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

function remoteTimeoutError(): FulfillmentVideoRegistrationError {
  return new FulfillmentVideoRegistrationError(
    'OPS_VIDEO_URL_TIMEOUT',
    '원격 영상 DNS·리다이렉트·본문 수신이 60초 제한을 초과했습니다.',
  );
}

async function resolvePinnedPublicAddress(hostname: string, signal: AbortSignal): Promise<string> {
  if (isIP(hostname) !== 0) return selectPinnedFulfillmentVideoIpv4([hostname]);
  const resolver = new Resolver();
  const cancel = () => resolver.cancel();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    if (signal.aborted) throw remoteTimeoutError();
    return selectPinnedFulfillmentVideoIpv4(await resolver.resolve4(hostname));
  } catch (error) {
    if (signal.aborted) throw remoteTimeoutError();
    if (error instanceof FulfillmentVideoRegistrationError) throw error;
    throw new FulfillmentVideoRegistrationError(
      'OPS_VIDEO_URL_DNS_FAILED',
      '원격 영상 호스트의 공개 IPv4 주소를 찾을 수 없습니다.',
    );
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}

function pinnedLookup(address: string): LookupFunction {
  return (_hostname, options, callback) => {
    const result = { address, family: 4 };
    if (options.all) callback(null, [result]);
    else callback(null, address, 4);
  };
}

function openPinnedHttpsResponse(
  url: URL,
  address: string,
  signal: AbortSignal,
): Promise<IncomingMessage> {
  return new Promise((resolveResponse, rejectResponse) => {
    let responseReceived = false;
    const request = httpsRequest(url, {
      method: 'GET',
      headers: {
        accept: 'video/mp4',
        host: url.host,
        'user-agent': REMOTE_VIDEO_USER_AGENT,
      },
      lookup: pinnedLookup(address),
      // Preserve the original hostname for TLS SNI/certificate verification;
      // only the TCP destination is replaced by the validated pinned address.
      ...(isIP(url.hostname) === 0 ? { servername: url.hostname } : {}),
      agent: false,
      signal,
    }, (response) => {
      responseReceived = true;
      resolveResponse(response);
    });
    request.once('error', () => {
      if (responseReceived) return;
      rejectResponse(signal.aborted
        ? remoteTimeoutError()
        : new FulfillmentVideoRegistrationError(
          'OPS_VIDEO_URL_FETCH_FAILED',
          '원격 영상 주소를 안전하게 불러오지 못했습니다.',
        ));
    });
    request.end();
  });
}

async function readBoundedRemoteBody(
  response: IncomingMessage,
  signal: AbortSignal,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  const onAbort = () => response.destroy(remoteTimeoutError());
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    for await (const chunk of response) {
      if (signal.aborted) throw remoteTimeoutError();
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += bytes.byteLength;
      if (total > VIDEO_HARD_MAX_BYTES) {
        response.destroy();
        throw new FulfillmentVideoRegistrationError(
          'OPS_VIDEO_SIZE_BLOCKED',
          '원격 영상이 8MB 하드 상한을 초과했습니다.',
        );
      }
      chunks.push(bytes);
    }
  } catch (error) {
    if (signal.aborted) throw remoteTimeoutError();
    if (error instanceof FulfillmentVideoRegistrationError) throw error;
    throw new FulfillmentVideoRegistrationError(
      'OPS_VIDEO_URL_FETCH_FAILED',
      '원격 영상 본문을 안전하게 읽지 못했습니다.',
    );
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
  return Buffer.concat(chunks, total);
}

async function readPinnedRemoteSource(url: string, signal: AbortSignal): Promise<{
  bytes: Buffer;
  declaredMime: string;
}> {
  let currentUrl = new URL(url);
  for (let hop = 0; hop <= REMOTE_VIDEO_MAX_REDIRECTS; hop += 1) {
    if (
      currentUrl.protocol !== 'https:'
      || currentUrl.username.length > 0
      || currentUrl.password.length > 0
    ) {
      throw new FulfillmentVideoRegistrationError(
        'OPS_VIDEO_URL_INVALID',
        '원격 영상과 모든 리다이렉트는 인증정보 없는 HTTPS URL이어야 합니다.',
      );
    }
    const address = await resolvePinnedPublicAddress(currentUrl.hostname, signal);
    const response = await openPinnedHttpsResponse(currentUrl, address, signal);
    const status = response.statusCode ?? 0;
    if (status >= 300 && status < 400) {
      const location = response.headers.location;
      response.destroy();
      if (!location || hop === REMOTE_VIDEO_MAX_REDIRECTS) {
        throw new FulfillmentVideoRegistrationError(
          'OPS_VIDEO_URL_REDIRECT_INVALID',
          '원격 영상 리다이렉트가 없거나 허용 횟수를 초과했습니다.',
        );
      }
      try {
        currentUrl = new URL(location, currentUrl);
      } catch {
        throw new FulfillmentVideoRegistrationError(
          'OPS_VIDEO_URL_REDIRECT_INVALID',
          '원격 영상 리다이렉트 주소가 올바르지 않습니다.',
        );
      }
      continue;
    }
    if (status < 200 || status >= 300) {
      response.destroy();
      throw new FulfillmentVideoRegistrationError(
        'OPS_VIDEO_URL_FETCH_FAILED',
        `원격 영상 서버가 성공 응답을 반환하지 않았습니다: HTTP ${status}`,
      );
    }

    const contentType = response.headers['content-type'];
    const declaredMime = Array.isArray(contentType) ? contentType[0] : contentType;
    if (!declaredMime || declaredMime.split(';', 1)[0].trim().toLowerCase() !== 'video/mp4') {
      response.destroy();
      throw new FulfillmentVideoRegistrationError(
        'OPS_VIDEO_MIME_UNSUPPORTED',
        '원격 영상 응답은 Content-Type: video/mp4여야 합니다.',
      );
    }
    const contentLengthHeader = response.headers['content-length'];
    const contentLength = Number(Array.isArray(contentLengthHeader)
      ? contentLengthHeader[0]
      : contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > VIDEO_HARD_MAX_BYTES) {
      response.destroy();
      throw new FulfillmentVideoRegistrationError(
        'OPS_VIDEO_SIZE_BLOCKED',
        '원격 영상이 8MB 하드 상한을 초과했습니다.',
      );
    }

    const bytes = await readBoundedRemoteBody(response, signal);
    classifyFulfillmentVideoBytes(bytes.byteLength);
    return { bytes, declaredMime };
  }
  throw new FulfillmentVideoRegistrationError(
    'OPS_VIDEO_URL_REDIRECT_INVALID',
    '원격 영상 리다이렉트가 허용 횟수를 초과했습니다.',
  );
}

async function readRemoteSource(url: string): Promise<{
  bytes: Buffer;
  declaredMime: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_VIDEO_TIMEOUT_MS);
  try {
    return await readPinnedRemoteSource(url, controller.signal);
  } catch (error) {
    if (controller.signal.aborted) throw remoteTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
  }
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

function inspectWithFfprobe(filePath: string, bytes: number) {
  const streamPayload = parseProbeJson(ffprobe(filePath, [
    '-v', 'error',
    '-print_format', 'json',
    '-show_entries', 'stream=codec_type,codec_name,pix_fmt,width,height,duration,nb_frames',
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
  }, bytes);
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

  const tempDirectory = await mkdtemp(join(tmpdir(), 'anakslabs-video-register-'));
  let assetId: string | undefined;
  try {
    const probePath = join(tempDirectory, 'candidate.mp4');
    await writeFile(probePath, source.bytes);
    const probe = inspectWithFfprobe(probePath, source.bytes.byteLength);
    console.log(
      `[video-register] 검증 완료 · ${probe.width}x${probe.height} · `
      + `H.264 yuv420p · ${probe.durationSeconds.toFixed(2)}초 · `
      + `${(probe.averageBitrateBps / 1_000_000).toFixed(2)}Mbps · `
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
