/**
 * [U5] 단일 제품 정합 통합 회귀 — 가입→생성→(영상 선택)→서버 게이트→승인→생성 전 플로우.
 * 애드온 없는 신규 가입은 base 정상 / 영상 선택했으나 미승인은 정적 폴백 + 생성 차단 /
 * 승인(premium) 후 영상 생성 허용 / 기존 sanitize·downgrade 무회귀.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGeneratedMotion, sanitizeMotion } from '@/lib/motion/validate';
import { videoGuardError } from '@/lib/ai/video-pipeline-core';
import { hasVideoAddon } from '@/lib/services/entitlements';
import { emptySiteConfig } from '@/lib/types/site';

const GUARD_ON = { enabled: true, maxPerSite: 6, dailyCap: 20 };
const videoChoice = { heroTechnique: 'video-hero', intensity: 'normal' as const, videoConceptId: 'signature-closeup' };

describe('U5 — 단일 제품 정합 플로우', () => {
  test('① 애드온 없는 신규 가입(basic): base 생성 정상 — 유효 프리셋·영상 없음', () => {
    const cfg = applyGeneratedMotion(emptySiteConfig('t'), 'local_store', 'basic', { heroTechnique: 'ken-burns', intensity: 'normal' });
    assert.ok(cfg.motion?.presetId, '프리셋 없음(생성 실패)');
    assert.equal(cfg.motion?.heroTechnique, 'ken-burns');
    assert.equal('videoRequested' in (cfg.motion ?? {}), false, '영상 미선택인데 표식');
    assert.equal(hasVideoAddon('basic'), false);
  });

  test('② 영상 선택했으나 미승인(basic): 표식 남고 정적 폴백 + Veo 서버 차단', () => {
    const cfg = applyGeneratedMotion(emptySiteConfig('t'), 'local_store', 'basic', videoChoice);
    assert.equal(cfg.motion?.videoRequested, true, '애드온 요청 표식 없음');
    assert.equal(cfg.motion?.heroTechnique, undefined, '정적 폴백 실패(video-hero 잔존)');
    assert.equal(cfg.motion?.videoConceptId, undefined);
    // 서버 강제: 애드온 미보유는 Veo 호출 불가
    assert.match(videoGuardError(GUARD_ON, 'basic', 0, 0) ?? '', /VIDEO_GEN_ADDON/);
  });

  test('③ 승인 후(premium): 영상 능력 유지 + Veo 게이트 통과', () => {
    const cfg = applyGeneratedMotion(emptySiteConfig('t'), 'local_store', 'premium', videoChoice);
    assert.equal(cfg.motion?.videoRequested, true);
    assert.equal(cfg.motion?.heroTechnique, 'video-hero');
    assert.equal(videoGuardError(GUARD_ON, 'premium', 0, 0), null, '애드온 보유가 게이트에 막힘');
  });

  test('④ 기존 sanitize·downgrade 무회귀 — basic + premium 프리셋 → 강등', () => {
    const base = emptySiteConfig('t');
    const cfg = { ...base, motion: { presetId: 'dining-premium', intensity: 'normal' as const } };
    const { config, changes } = sanitizeMotion(cfg, 'basic');
    assert.notEqual(config.motion?.presetId, 'dining-premium', 'premium 프리셋 미강등');
    assert.ok(changes.some((c) => c.includes('강등')), '강등 안내 없음');
  });
});
