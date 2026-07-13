/**
 * [U3] 영상 애드온 서버 강제 불변식 — 애드온 미보유 사이트는 Veo를 호출할 수 없다.
 * 클라 표식(videoRequested)만으론 생성 불가: 서버 가드는 오직 애드온 보유(tier)로 판정한다.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { videoGuardError } from '@/lib/ai/video-pipeline-core';
import { hasVideoAddon } from '@/lib/services/entitlements';

const ON = { enabled: true, maxPerSite: 6, dailyCap: 20 };

describe('U3 — 영상 애드온 서버 강제', () => {
  test('애드온 미보유(basic)는 킬스위치 on·상한 여유여도 차단(VIDEO_GEN_ADDON)', () => {
    const err = videoGuardError(ON, 'basic', 0, 0);
    assert.match(err ?? '', /VIDEO_GEN_ADDON/, '애드온 미보유가 서버에서 안 막힘');
  });

  test('애드온 보유(premium)만 가드 통과(상한 내)', () => {
    assert.equal(videoGuardError(ON, 'premium', 0, 0), null, '애드온 보유가 막힘');
  });

  test('가드 판정은 애드온(tier)에 1:1 — 표식 무관', () => {
    for (const tier of ['basic', 'premium'] as const) {
      const blocked = videoGuardError(ON, tier, 0, 0) !== null;
      // 애드온 보유면 통과(blocked=false), 미보유면 차단(blocked=true)
      assert.equal(blocked, !hasVideoAddon(tier), `${tier}: 가드와 hasVideoAddon 불일치`);
    }
  });

  test('킬스위치가 애드온보다 우선(순서 보존)', () => {
    assert.match(videoGuardError({ ...ON, enabled: false }, 'premium', 0, 0) ?? '', /VIDEO_GEN_DISABLED/);
  });
});
