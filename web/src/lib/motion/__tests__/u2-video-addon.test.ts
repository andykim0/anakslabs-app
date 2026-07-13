/**
 * [U2] 영상 애드온 전 사용자 노출 — ALL_HERO_CHOICES에 video-hero 포함 + applyGeneratedMotion이
 * video-hero 선택 시 videoRequested 표식을 남기고, 애드온 미보유(basic)면 정적 폴백으로 강등.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_HERO_CHOICES, heroChoicesForTier } from '@/lib/motion/hero-choice';
import { applyGeneratedMotion } from '@/lib/motion/validate';
import { emptySiteConfig } from '@/lib/types/site';

describe('U2 — 영상 애드온 노출/배선', () => {
  test('ALL_HERO_CHOICES는 누구에게나 video-hero를 포함(표시용)', () => {
    assert.ok(ALL_HERO_CHOICES.some((c) => c.id === 'video-hero'), '전체 선택지에 video-hero 없음');
    // 능력 게이팅(sanitize)용 basic 목록엔 여전히 없음
    assert.ok(!heroChoicesForTier('basic').some((c) => c.id === 'video-hero'), 'basic 능력 목록에 video-hero 유입');
  });

  const choice = { heroTechnique: 'video-hero', intensity: 'normal' as const, videoConceptId: 'signature-closeup' };

  test('basic이 video-hero 선택 → videoRequested 표식 남고, 능력은 정적 폴백으로 강등', () => {
    const cfg = applyGeneratedMotion(emptySiteConfig('t'), 'local_store', 'basic', choice);
    assert.equal(cfg.motion?.videoRequested, true, '애드온 요청 표식 없음');
    assert.equal(cfg.motion?.heroTechnique, undefined, 'basic인데 video-hero 유지(정적 폴백 실패)');
    assert.equal(cfg.motion?.videoConceptId, undefined, 'basic인데 영상 컨셉 유지');
  });

  test('premium(애드온 보유)이 video-hero 선택 → 표식 + 능력 유지', () => {
    const cfg = applyGeneratedMotion(emptySiteConfig('t'), 'local_store', 'premium', choice);
    assert.equal(cfg.motion?.videoRequested, true);
    assert.equal(cfg.motion?.heroTechnique, 'video-hero');
    assert.equal(cfg.motion?.videoConceptId, 'signature-closeup');
  });

  test('video-hero 미선택이면 videoRequested 미방출(무회귀)', () => {
    const cfg = applyGeneratedMotion(emptySiteConfig('t'), 'local_store', 'basic', { heroTechnique: 'ken-burns', intensity: 'normal' });
    assert.equal('videoRequested' in (cfg.motion ?? {}), false);
  });
});
