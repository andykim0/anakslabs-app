import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { applyGeneratedMotion, sanitizeMotion } from '@/lib/motion/validate';
import { emptySiteConfig } from '@/lib/types/site';

describe('W4 — 히어로·영상 선택 저장과 애드온 강등', () => {
  test('승인된 영상 선택은 cinematic-hero와 등록 선택 3종을 모두 저장한다', () => {
    const config = applyGeneratedMotion(emptySiteConfig('승인'), 'local_store', 'premium', {
      heroTechnique: 'video-hero',
      videoConceptId: 'space-mood',
      heroImageChoice: 'ai-2',
      videoAddon: true,
      heroMotionId: 'slow-zoom',
    });

    assert.equal(config.motion?.presetId, 'cinematic-hero');
    assert.equal(config.motion?.heroTechnique, 'video-hero');
    assert.equal(config.motion?.heroImageChoice, 'ai-2');
    assert.equal(config.motion?.videoAddon, true);
    assert.equal(config.motion?.heroMotionId, 'slow-zoom');
    assert.equal(config.motion?.videoRequested, true);
  });

  test('미승인 영상 선택은 정적 ken-burns로 강등하되 관리자 승인용 의사는 보존한다', () => {
    const config = applyGeneratedMotion(emptySiteConfig('미승인'), 'local_store', 'basic', {
      heroTechnique: 'video-hero',
      videoConceptId: 'space-mood',
      heroImageChoice: 'upload',
      videoAddon: true,
      heroMotionId: 'parallax-depth',
    });

    assert.equal(config.motion?.presetId, 'cafe-basic');
    assert.equal(config.motion?.heroTechnique, undefined);
    assert.equal(config.motion?.videoConceptId, undefined);
    assert.equal(config.motion?.heroImageChoice, 'upload');
    assert.equal(config.motion?.videoAddon, true);
    assert.equal(config.motion?.heroMotionId, 'parallax-depth');
    assert.equal(config.motion?.videoRequested, true);
  });

  test('스킵은 video-hero·heroMotionId를 저장하지 않고 정지 소스 선택만 남긴다', () => {
    const config = applyGeneratedMotion(emptySiteConfig('스킵'), 'local_store', 'premium', {
      heroTechnique: 'video-hero',
      heroImageChoice: 'ai-1',
      videoAddon: false,
      heroMotionId: 'boomerang-loop',
    });

    assert.notEqual(config.motion?.presetId, 'cinematic-hero');
    assert.equal(config.motion?.heroTechnique, 'ken-burns');
    assert.equal(config.motion?.heroImageChoice, 'ai-1');
    assert.equal(config.motion?.videoAddon, false);
    assert.equal(config.motion?.heroMotionId, undefined);
    assert.equal(config.motion?.videoRequested, undefined);
  });

  test('미등록 연출·소스와 영상 미선택 연출은 fail-closed로 제거한다', () => {
    const dirty = {
      ...emptySiteConfig('오염'),
      motion: {
        presetId: 'cinematic-hero',
        intensity: 'normal' as const,
        heroImageChoice: 'ai-9',
        videoAddon: true,
        heroMotionId: 'webgl-shader',
        videoRequested: true,
      },
    };
    const sanitized = sanitizeMotion(dirty as never, 'premium');
    assert.equal(sanitized.config.motion?.heroImageChoice, undefined);
    assert.equal(sanitized.config.motion?.heroMotionId, undefined);
    assert.ok(sanitized.changes.some((change) => change.includes('unknown hero')));

    const noVideo = sanitizeMotion(
      {
        ...emptySiteConfig('미선택'),
        motion: {
          presetId: 'cafe-basic',
          intensity: 'subtle',
          videoAddon: false,
          heroMotionId: 'slow-zoom',
        },
      },
      'basic',
    );
    assert.equal(noVideo.config.motion?.heroMotionId, undefined);
  });
});
