import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { evaluateAssetTruthPolicy } from '@/lib/assets/truth-policy';
import type { AssetRecord } from '@/lib/assets/provenance';
import {
  FulfillmentVideoRegistrationError,
  assertFulfillmentVideoRegistrationEnvironment,
  assertRegisteredFulfillmentVideo,
  classifyFulfillmentVideoBytes,
  detectFulfillmentVideoMime,
  formatFulfillmentVideoAssetId,
  normalizeFulfillmentVideoMime,
  parseRegisterFulfillmentVideoArgs,
  selectPinnedFulfillmentVideoIpv4,
  verifyFulfillmentVideoProbe as verifyFulfillmentVideoProbeCore,
} from '../fulfillment-video-registration-core';

const SITE_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const ASSET_ID = '33333333-3333-4333-8333-333333333333';
const QUALITY_BYTES = 5 * 1024 * 1024;

function verifyFulfillmentVideoProbe(
  value: Parameters<typeof verifyFulfillmentVideoProbeCore>[0],
  bytes = QUALITY_BYTES,
) {
  return verifyFulfillmentVideoProbeCore(value, bytes);
}

function mp4Bytes(): Uint8Array {
  return Uint8Array.from([
    0x00, 0x00, 0x00, 0x18,
    0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d,
  ]);
}

function webmBytes(): Uint8Array {
  return Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f]);
}

function probe(overrides: Record<string, unknown> = {}) {
  return {
    streams: [{
      codec_type: 'video',
      codec_name: 'h264',
      pix_fmt: 'yuv420p',
      width: 1920,
      height: 1080,
      duration: '8.0',
    }],
    frames: Array.from({ length: 192 }, () => ({ key_frame: 1 })),
    ...overrides,
  };
}

function asset(overrides: Partial<AssetRecord> = {}): AssetRecord {
  return {
    id: ASSET_ID,
    origin: 'ai_generated',
    mediaType: 'video',
    storageBucket: 'ai-assets',
    storageKey: `manual-fulfillment/${SITE_ID}/video.mp4`,
    canonicalUrl: 'https://project.supabase.co/storage/v1/object/public/ai-assets/video.mp4',
    createdAt: '2026-07-17T00:00:00.000Z',
    ownerId: CLIENT_ID,
    siteId: SITE_ID,
    ...overrides,
  };
}

describe('O3 fulfillment video CLI contract', () => {
  test('site UUID + exactly one file/HTTPS URL is accepted; owner/provenance flags are rejected', () => {
    assert.deepEqual(
      parseRegisterFulfillmentVideoArgs(['--site-id', SITE_ID, '--file', '/tmp/video.mp4']),
      { siteId: SITE_ID, source: { kind: 'file', value: '/tmp/video.mp4' }, dryRun: false },
    );
    assert.deepEqual(
      parseRegisterFulfillmentVideoArgs(['--dry-run', '--url', 'https://cdn.example/video.webm', '--site-id', SITE_ID]),
      { siteId: SITE_ID, source: { kind: 'url', value: 'https://cdn.example/video.webm' }, dryRun: true },
    );
    assert.throws(
      () => parseRegisterFulfillmentVideoArgs(['--site-id', SITE_ID]),
      /OPS_VIDEO_SOURCE_INVALID/,
    );
    assert.throws(
      () => parseRegisterFulfillmentVideoArgs([
        '--site-id', SITE_ID, '--file', '/tmp/a.mp4', '--url', 'https://cdn.example/a.mp4',
      ]),
      /OPS_VIDEO_SOURCE_INVALID/,
    );
    assert.throws(
      () => parseRegisterFulfillmentVideoArgs(['--site-id', SITE_ID, '--url', 'http://cdn.example/a.mp4']),
      /OPS_VIDEO_URL_INVALID/,
    );
    assert.throws(
      () => parseRegisterFulfillmentVideoArgs(['--site-id', SITE_ID, '--file', '/tmp/a.mp4', '--client-id', CLIENT_ID]),
      /OPS_VIDEO_ARGUMENT_INVALID/,
    );
  });

  test('real mode and provenance WRITE are required before any upload', () => {
    assert.doesNotThrow(() => assertFulfillmentVideoRegistrationEnvironment({
      mockMode: false,
      provenanceWrite: true,
    }));
    assert.throws(
      () => assertFulfillmentVideoRegistrationEnvironment({ mockMode: true, provenanceWrite: true }),
      /OPS_VIDEO_REAL_MODE_REQUIRED/,
    );
    assert.throws(
      () => assertFulfillmentVideoRegistrationEnvironment({ mockMode: false, provenanceWrite: false }),
      /OPS_VIDEO_PROVENANCE_WRITE_REQUIRED/,
    );
  });

  test('existing 3MiB warning and 8MiB hard blocker are reused', () => {
    assert.deepEqual(classifyFulfillmentVideoBytes(3 * 1024 * 1024), {});
    assert.match(classifyFulfillmentVideoBytes(3 * 1024 * 1024 + 1).warning ?? '', /목표/);
    assert.doesNotThrow(() => classifyFulfillmentVideoBytes(8 * 1024 * 1024));
    assert.throws(
      () => classifyFulfillmentVideoBytes(8 * 1024 * 1024 + 1),
      /OPS_VIDEO_SIZE_BLOCKED/,
    );
    assert.throws(() => classifyFulfillmentVideoBytes(0), /OPS_VIDEO_EMPTY/);
  });

  test('only an MP4 container with matching declared MIME is accepted', () => {
    assert.equal(detectFulfillmentVideoMime(mp4Bytes()), 'video/mp4');
    assert.equal(detectFulfillmentVideoMime(webmBytes()), null);
    assert.equal(detectFulfillmentVideoMime(Uint8Array.from([1, 2, 3, 4])), null);
    assert.equal(normalizeFulfillmentVideoMime(mp4Bytes(), 'video/mp4; charset=binary'), 'video/mp4');
    assert.throws(
      () => normalizeFulfillmentVideoMime(mp4Bytes(), 'video/webm'),
      /OPS_VIDEO_MIME_UNSUPPORTED/,
    );
    assert.throws(
      () => normalizeFulfillmentVideoMime(mp4Bytes(), 'application/octet-stream'),
      /OPS_VIDEO_MIME_UNSUPPORTED/,
    );
  });

  test('DNS pin selection accepts only public IPv4 and rejects mixed/private answers', () => {
    assert.equal(
      selectPinnedFulfillmentVideoIpv4(['93.184.216.34', '8.8.8.8']),
      '93.184.216.34',
    );
    for (const blocked of [
      [],
      ['127.0.0.1'],
      ['169.254.169.254'],
      ['10.0.0.1'],
      ['100.64.0.1'],
      ['172.16.0.1'],
      ['192.168.0.1'],
      ['198.18.0.1'],
      ['224.0.0.1'],
      ['::1'],
      ['93.184.216.34', '127.0.0.1'],
    ]) {
      assert.throws(() => selectPinnedFulfillmentVideoIpv4(blocked), /OPS_VIDEO_URL_/);
    }
  });

  test('ffprobe contract requires browser-compatible 1080p H.264 yuv420p and bounded duration', () => {
    const verified = verifyFulfillmentVideoProbe(probe());
    assert.deepEqual(verified, {
      width: 1920,
      height: 1080,
      durationSeconds: 8,
      frameCount: 192,
      keyframeCount: 192,
      averageBitrateBps: 5_242_880,
    });
    assert.throws(
      () => verifyFulfillmentVideoProbe(probe({ streams: [] })),
      /OPS_VIDEO_STREAM_INVALID/,
    );
    assert.throws(
      () => verifyFulfillmentVideoProbe(probe({
        streams: [
          { codec_type: 'video', width: 1920, height: 1080 },
          { codec_type: 'audio' },
        ],
      })),
      /OPS_VIDEO_AUDIO_FORBIDDEN/,
    );
    assert.throws(
      () => verifyFulfillmentVideoProbe(probe({
        streams: [{
          codec_type: 'video', codec_name: 'hevc', pix_fmt: 'yuv420p',
          width: 1920, height: 1080, duration: '8.0',
        }],
      })),
      /OPS_VIDEO_CODEC_INVALID/,
    );
    assert.throws(
      () => verifyFulfillmentVideoProbe(probe({
        streams: [{
          codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv444p',
          width: 1920, height: 1080, duration: '8.0',
        }],
      })),
      /OPS_VIDEO_CODEC_INVALID/,
    );
    assert.throws(
      () => verifyFulfillmentVideoProbe(probe({
        streams: [{
          codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p',
          width: 1280, height: 720, duration: '8.0',
        }],
      })),
      /OPS_VIDEO_GEOMETRY_INVALID/,
    );
    for (const duration of [undefined, '0', '5.49', '8.51', 'NaN']) {
      assert.throws(
        () => verifyFulfillmentVideoProbe(probe({
          streams: [{
            codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p',
            width: 1920, height: 1080, duration,
          }],
        })),
        /OPS_VIDEO_DURATION_INVALID/,
      );
    }
    assert.throws(
      () => verifyFulfillmentVideoProbe(probe({ frames: [{ key_frame: 1 }, { key_frame: 0 }] })),
      /OPS_VIDEO_GOP_INVALID/,
    );
    assert.throws(
      () => verifyFulfillmentVideoProbe(probe(), 2 * 1024 * 1024),
      /OPS_VIDEO_QUALITY_INVALID/,
    );
  });

  test('post-write verification requires owned, site-bound AI video with storage identity', () => {
    const record = asset();
    assert.equal(assertRegisteredFulfillmentVideo({
      record,
      assetId: ASSET_ID,
      clientId: CLIENT_ID,
      siteId: SITE_ID,
      canonicalUrl: record.canonicalUrl,
    }), record);
    for (const invalid of [
      asset({ origin: 'customer_upload' }),
      asset({ mediaType: 'image' }),
      asset({ ownerId: '44444444-4444-4444-8444-444444444444' }),
      asset({ siteId: null }),
      asset({ storageKey: null }),
    ]) {
      assert.throws(
        () => assertRegisteredFulfillmentVideo({
          record: invalid,
          assetId: ASSET_ID,
          clientId: CLIENT_ID,
          siteId: SITE_ID,
          canonicalUrl: record.canonicalUrl,
        }),
        /OPS_VIDEO_REGISTRY_VERIFICATION_FAILED/,
      );
    }
    assert.equal(formatFulfillmentVideoAssetId(ASSET_ID), `VIDEO_ASSET_ID=${ASSET_ID}`);
  });
});

describe('O3 provenance and ADM1 integration invariants', () => {
  test('ai_generated registration remains atmospheric and cannot become factual evidence', () => {
    const record = asset();
    const common = {
      clientId: CLIENT_ID,
      siteId: SITE_ID,
      industryClass: 'brand' as const,
      classificationSource: 'server' as const,
      assetPolicyVersion: 2 as const,
      flags: {
        enforceNewSites: true,
        enforceLegacy: false,
        beforeAfterEnabled: false,
        beforeAfterApprovedIndustries: [] as const,
      },
      asset: record,
    };
    assert.deepEqual(evaluateAssetTruthPolicy({
      ...common,
      slotKey: 'hero:actual',
      slotPurpose: 'actual_product',
      role: 'factual',
      subject: 'product',
    }), { allowed: false, reason: 'AI_NOT_ALLOWED_IN_FACTUAL_SLOT' });
    assert.deepEqual(evaluateAssetTruthPolicy({
      ...common,
      slotKey: 'hero:video',
      slotPurpose: 'brand_atmosphere',
      role: 'atmospheric',
      subject: 'abstract',
    }), { allowed: true });
  });

  test('script pins each HTTPS request, bounds the whole transfer, derives owner, and rechecks registry', () => {
    const source = readFileSync(
      join(process.cwd(), 'scripts/register-fulfillment-video.ts'),
      'utf8',
    );
    assert.match(source, /resolver\.resolve4\(hostname\)/);
    assert.match(source, /selectPinnedFulfillmentVideoIpv4/);
    assert.match(source, /lookup: pinnedLookup\(address\)/);
    assert.match(source, /host: url\.host/);
    assert.match(source, /servername: url\.hostname/);
    assert.match(source, /agent: false/);
    assert.match(source, /setTimeout\(\(\) => controller\.abort\(\), REMOTE_VIDEO_TIMEOUT_MS\)/);
    assert.match(source, /for await \(const chunk of response\)/);
    assert.match(source, /total > VIDEO_HARD_MAX_BYTES/);
    assert.doesNotMatch(source, /safeFetch|readLimitedBytes/);
    assert.match(source, /sites\.getById\(siteId\)/);
    assert.match(source, /clients\.getById\(site\.clientId\)/);
    assert.match(source, /siteVideoFulfillmentState\(\{ site, client, completion \}\)/);
    assert.match(source, /uploadAiVideoDetailed\(\{/);
    assert.match(source, /owner: \{ clientId: client\.id, siteId: site\.id \}/);
    assert.match(source, /resolveOwnedAssetRecords\(\{/);
    assert.match(source, /formatFulfillmentVideoAssetId\(assetId\)/);
    assert.doesNotMatch(source, /--client-id|--origin|--storage-bucket/);
  });

  test('ADM1 completion remains UUID-only and rejects URL-only completion', () => {
    const route = readFileSync(
      join(process.cwd(), 'src/app/api/admin/video-queue/[siteId]/complete/route.ts'),
      'utf8',
    );
    const schema = route.slice(
      route.indexOf('const completeBody'),
      route.indexOf('function heroPoster'),
    );
    assert.match(schema, /videoAssetId: z\.string\(\)\.uuid\(\)/);
    assert.doesNotMatch(schema, /url|origin|clientId/i);
    assert.match(route, /resolveOwnedAssetRecords\(\{/);
    assert.match(route, /videoRecord\.origin !== 'ai_generated'/);
    assert.match(route, /videoRecord\.mediaType !== 'video'/);
  });

  test('one-page runbook documents registration UUID, no URL provenance, and immutable completion', () => {
    const guide = readFileSync(
      join(process.cwd(), 'docs/OPS-video-fulfillment.md'),
      'utf8',
    );
    assert.match(guide, /VIDEO_ASSET_ID=/);
    assert.match(guide, /URL은 provenance가 아닙니다/);
    assert.match(guide, /-g 1/);
    assert.match(guide, /1920.?1080/);
    assert.match(guide, /H\.264/);
    assert.match(guide, /yuv420p/);
    assert.match(guide, /공개 IPv4/);
    assert.match(guide, /60초/);
    assert.match(guide, /3MiB/);
    assert.match(guide, /8MiB/);
    assert.match(guide, /append-only/);
  });
});

test('registration errors retain stable machine-readable prefixes', () => {
  const error = new FulfillmentVideoRegistrationError('OPS_VIDEO_TEST', 'message');
  assert.equal(error.code, 'OPS_VIDEO_TEST');
  assert.equal(error.message, 'OPS_VIDEO_TEST: message');
});
