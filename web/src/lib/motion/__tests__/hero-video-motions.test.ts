import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  HERO_VIDEO_MOTION_IDS,
  HERO_VIDEO_MOTIONS,
  heroVideoMotionById,
  isHeroVideoMotionId,
} from '@/lib/motion/hero-video-motions';

describe('W3 — 히어로 영상 연출 레지스트리', () => {
  test('정확히 5개의 고유 ID를 등록한다', () => {
    assert.deepEqual(HERO_VIDEO_MOTION_IDS, [
      'cinematic-scrub',
      'boomerang-loop',
      'slow-zoom',
      'parallax-depth',
      'scrollytelling-manifesto',
    ]);
    assert.equal(new Set(HERO_VIDEO_MOTION_IDS).size, 5);
    assert.deepEqual(Object.keys(HERO_VIDEO_MOTIONS), [...HERO_VIDEO_MOTION_IDS]);
  });

  test('모든 연출은 video-hero + cinematic-hero 하나의 검증된 렌더 경로를 쓴다', () => {
    for (const id of HERO_VIDEO_MOTION_IDS) {
      const motion = HERO_VIDEO_MOTIONS[id];
      assert.equal(motion.heroTechnique, 'video-hero', id);
      assert.equal(motion.rendererPresetId, 'cinematic-hero', id);
      assert.ok(motion.label.length > 0 && motion.description.length > 0 && motion.previewClass.length > 0, id);
    }
  });

  test('Veo promptSeed는 등록된 영문 모션 방향만 제공한다', () => {
    for (const [id, motion] of Object.entries(HERO_VIDEO_MOTIONS)) {
      assert.doesNotMatch(motion.promptSeed, /[\u3131-\u318e\uac00-\ud7a3]/, id);
      assert.doesNotMatch(motion.promptSeed, /#|\b(?:dish|meal|steak|product|service result)\b/i, id);
      assert.match(motion.promptSeed, /camera|depth|composition|loop/i, id);
    }
  });

  test('미등록 ID는 fail-closed로 거부한다', () => {
    assert.equal(isHeroVideoMotionId('slow-zoom'), true);
    assert.equal(isHeroVideoMotionId('webgl-shader'), false);
    assert.equal(heroVideoMotionById('cinematic-scrub')?.label, '시네마틱 스크럽');
    assert.equal(heroVideoMotionById('unknown'), undefined);
  });
});
