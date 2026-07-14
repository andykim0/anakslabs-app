import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { motionChoiceForVideoPreference } from '@/components/dashboard/onboarding/motion-choice-step';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const motion = source('src/components/dashboard/onboarding/motion-choice-step.tsx');
const api = source('src/components/dashboard/api.ts');
const generate = source('src/components/dashboard/onboarding/generate-step.tsx');

describe('W3 — 영상 모션 라이브러리 UI', () => {
  test('레지스트리 4안을 고객이 고른 사진으로 라이브 렌더한다', () => {
    assert.match(motion, /HERO_VIDEO_MOTION_IDS\.map\(\(motionId\) =>/);
    assert.match(motion, /<HeroMotionDemo motionId=\{motionId\} heroImageUrl=\{heroImageUrl\}/);
    assert.match(motion, /className=\{cn\('h-full w-full object-cover will-change-transform', motion\.previewClass\)\}/);
    assert.match(motion, /원하는 영상 연출을 하나 골라주세요/);
    assert.doesNotMatch(motion, /concepts\.map/);
  });

  test('모든 카드는 대표 예시로 표시되고 4종 CSS가 실제 움직임을 만든다', () => {
    assert.match(motion, />\s*대표 예시\s*</);
    for (const keyframe of ['hvm-scrub', 'hvm-boomerang', 'hvm-zoom', 'hvm-parallax']) {
      assert.match(motion, new RegExp(`@keyframes ${keyframe}`), keyframe);
    }
    assert.match(motion, /prefers-reduced-motion: reduce[\s\S]*\.hvm-preview-scrub[\s\S]*animation: none; transform: none/);
  });

  test('부메랑을 정확한 역재생으로 과장하지 않고 최종본과 예시를 구분한다', () => {
    assert.match(motion, /CSS 대표 예시예요/);
    assert.match(motion, /최종 영상 미리보기가 아닙니다/);
    assert.doesNotMatch(motion, /정확한 역재생|반드시 부메랑/);
  });

  test('예 경로만 등록된 heroMotionId를 저장하고 스킵은 이를 버린다', () => {
    assert.deepEqual(
      motionChoiceForVideoPreference(true, 'space-mood', 'parallax-depth'),
      {
        heroTechnique: 'video-hero',
        intensity: 'normal',
        videoConceptId: 'space-mood',
        heroMotionId: 'parallax-depth',
      },
    );
    assert.deepEqual(motionChoiceForVideoPreference(false, 'space-mood', 'parallax-depth'), {
      heroTechnique: 'ken-burns',
      intensity: 'subtle',
    });
  });

  test('DTO와 생성 idempotency intent가 heroMotionId를 분리한다', () => {
    assert.match(api, /heroMotionId\?: HeroVideoMotionId/);
    assert.match(generate, /motionChoice\?\.heroMotionId \?\? ''/);
  });

  test('라이브 프리뷰 컴포넌트는 AI·영상 API를 호출하지 않는다', () => {
    for (const banned of ['fetch(', '/api/sites/', 'generateVeoVideo', 'generateHeroVideo']) {
      assert.ok(!motion.includes(banned), `프리뷰에 금지된 호출: ${banned}`);
    }
  });
});
