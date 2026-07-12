/**
 * [motion 4단계] 히어로 영상 크기 게이트 상수·분류기 — 목표 초과=warning / 상한 초과=blocker.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyVideoBytes, VIDEO_TARGET_BYTES, VIDEO_HARD_MAX_BYTES } from '@/lib/motion/asset-limits';

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
});
