/**
 * [U1] 영상 애드온 재정의 — hasVideoAddon 파생 + videoRequested 표식 보존.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { hasVideoAddon, VIDEO_ADDON_TIER, VIDEO_ADDON_PRICE_KRW } from '@/lib/services/entitlements';
import { PRICING } from '@/lib/pricing';
import { sanitizeMotion } from '@/lib/motion/validate';
import { emptySiteConfig } from '@/lib/types/site';

describe('U1 — hasVideoAddon 파생', () => {
  test("premium=애드온 보유, basic=미보유", () => {
    assert.equal(hasVideoAddon('premium'), true);
    assert.equal(hasVideoAddon('basic'), false);
    assert.equal(VIDEO_ADDON_TIER, 'premium');
    assert.equal(VIDEO_ADDON_PRICE_KRW, PRICING.videoHeroAddon);
  });
});

describe('U1 — videoRequested 표식이 sanitizeMotion 강등을 견딘다', () => {
  function cfgWithVideoRequest() {
    const base = emptySiteConfig('t');
    return {
      ...base,
      motion: { presetId: 'cafe-basic', intensity: 'normal' as const, heroTechnique: 'video-hero', videoConceptId: 'signature-closeup', videoRequested: true },
    };
  }

  test('basic(애드온 미보유): 능력(heroTechnique/videoConceptId)은 강등되지만 표식은 보존', () => {
    const { config } = sanitizeMotion(cfgWithVideoRequest(), 'basic');
    // 표식은 남아 관리자가 애드온 판매 대상 식별
    assert.equal(config.motion?.videoRequested, true, 'videoRequested 표식 소실(강등에 휩쓸림)');
    // 실제 영상 능력은 강등 — 정적 폴백(video-hero 미허용)
    assert.equal(config.motion?.heroTechnique, undefined, 'basic에서 video-hero 미강등');
    assert.equal(config.motion?.videoConceptId, undefined, 'basic에서 영상 컨셉 미제거');
  });

  test('premium(애드온 보유): 능력·표식 모두 유지', () => {
    const { config } = sanitizeMotion(cfgWithVideoRequest(), 'premium');
    assert.equal(config.motion?.videoRequested, true);
    assert.equal(config.motion?.heroTechnique, 'video-hero');
    assert.equal(config.motion?.videoConceptId, 'signature-closeup');
  });

  test('표식 없으면 필드 미방출(무회귀)', () => {
    const base = emptySiteConfig('t');
    const cfg = { ...base, motion: { presetId: 'cafe-basic', intensity: 'normal' as const } };
    const { config } = sanitizeMotion(cfg, 'basic');
    assert.equal('videoRequested' in (config.motion ?? {}), false);
  });
});
