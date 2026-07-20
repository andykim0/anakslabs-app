/**
 * [motion 4단계] 히어로 영상 크기 게이트 상수·분류기 — 목표 초과=warning / 상한 초과=blocker.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyVideoBytes,
  classifyVideoEncodingQuality,
  videoCoverScale,
  VIDEO_HARD_MAX_BYTES,
  VIDEO_MAX_COVER_UPSCALE_RATIO,
  VIDEO_MIN_AVERAGE_BITRATE_BPS,
  VIDEO_TARGET_BYTES,
} from '@/lib/motion/asset-limits';

describe('classifyVideoBytes', () => {
  test('상수: 목표 3MB, 상한 8MB', () => {
    assert.equal(VIDEO_TARGET_BYTES, 3 * 1024 * 1024);
    assert.equal(VIDEO_HARD_MAX_BYTES, 8 * 1024 * 1024);
  });

  test('bytes 미상(undefined/0) → 빈 결과(게이트 통과, 후처리 전 정상)', () => {
    assert.deepEqual(classifyVideoBytes(undefined), {});
    assert.deepEqual(classifyVideoBytes(0), {});
  });

  test('목표 이하 → ok(빈 결과)', () => {
    assert.deepEqual(classifyVideoBytes(2 * 1024 * 1024), {});
    assert.deepEqual(classifyVideoBytes(VIDEO_TARGET_BYTES), {}); // 경계=목표 자체는 통과
  });

  test('목표 초과·상한 이하 → warning (blocker 아님)', () => {
    const r = classifyVideoBytes(5_253_838); // 실측 hero-video-1080-1
    assert.ok(r.warning, 'warning 없음');
    assert.equal(r.blocker, undefined);
    assert.match(r.warning!, /목표/);
  });

  test('상한 초과 → blocker', () => {
    const r = classifyVideoBytes(9 * 1024 * 1024);
    assert.ok(r.blocker, 'blocker 없음');
    assert.equal(r.warning, undefined);
    assert.match(r.blocker!, /상한/);
  });

  test('신규 발행은 1080p·4Mbps 화질 하한과 1.15배 cover 상한을 쓴다', () => {
    assert.equal(VIDEO_MIN_AVERAGE_BITRATE_BPS, 4_000_000);
    assert.equal(VIDEO_MAX_COVER_UPSCALE_RATIO, 1.15);
    assert.deepEqual(classifyVideoEncodingQuality({
      bytes: 5 * 1024 * 1024,
      durationSeconds: 8,
      width: 1920,
      height: 1080,
    }), { averageBitrateBps: 5_242_880 });
    assert.match(classifyVideoEncodingQuality({
      bytes: 2 * 1024 * 1024,
      durationSeconds: 8,
      width: 1920,
      height: 1080,
    }).blocker ?? '', /비트레이트/);
    assert.match(classifyVideoEncodingQuality({
      bytes: 5 * 1024 * 1024,
      durationSeconds: 8,
      width: 1280,
      height: 720,
    }).blocker ?? '', /확대 재생/);
    assert.equal(videoCoverScale({
      mediaWidth: 1920,
      mediaHeight: 1080,
      viewportWidth: 1440,
      viewportHeight: 900,
    }).toFixed(3), '0.833');
  });
});
