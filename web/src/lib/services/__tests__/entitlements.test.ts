/**
 * [U1] 영상 애드온 재정의 — hasVideoAddon 파생 + videoRequested 표식 보존.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { hasVideoAddon, VIDEO_ADDON_TIER, VIDEO_ADDON_PRICE_KRW } from '@/lib/services/entitlements';
import { LEGACY_PRICING } from '@/lib/pricing';
import { sanitizeMotion } from '@/lib/motion/validate';
import { emptySiteConfig } from '@/lib/types/site';

describe('PRICE-V6 — 승인 전 영상 런타임 권한', () => {
  test('basic은 승인 전 정적이고 premium 내부 권한만 기존 영상 런타임을 연다', () => {
    assert.equal(hasVideoAddon('premium'), true);
    assert.equal(hasVideoAddon('basic'), false);
    assert.equal(VIDEO_ADDON_TIER, 'premium');
    assert.equal(VIDEO_ADDON_PRICE_KRW, LEGACY_PRICING.videoHeroAddon);
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

  test('basic은 승인 전 정적으로 강등하되 요청 표식을 유지한다', () => {
    const { config } = sanitizeMotion(cfgWithVideoRequest(), 'basic');
    assert.equal(config.motion?.videoRequested, true, 'videoRequested 표식 소실(강등에 휩쓸림)');
    assert.equal(config.motion?.heroTechnique, undefined);
    assert.equal(config.motion?.videoConceptId, undefined);
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
