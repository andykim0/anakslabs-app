import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { motionChoiceForVideoPreference } from '@/components/dashboard/onboarding/motion-choice-step';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const motion = source('src/components/dashboard/onboarding/motion-choice-step.tsx');
const wizard = source('src/components/dashboard/onboarding/wizard.tsx');

describe('W2 — 선택 이미지 모션 예시·영상 애드온 업셀', () => {
  test('업로드·AI와 무관하게 W1의 선택 이미지 하나를 미리보기한다', () => {
    assert.match(wizard, /<MotionChoiceStep[\s\S]*heroImageUrl=\{heroImage\.url\}/);
    assert.match(motion, /heroImageUrl: string/);
    assert.match(motion, /src=\{heroImageUrl\}/);
    assert.match(motion, /선택한 히어로 사진 모션 예시/);
  });

  test('미리보기는 대표 CSS 예시임을 명시하고 최종본으로 오인시키지 않는다', () => {
    assert.match(motion, /이런 느낌으로 움직여요 · 대표 예시/);
    assert.match(motion, /예시 움직임이에요\. 결제하시면 이 사진으로 실제 영상을 만들어드려요/);
    assert.match(motion, /최종 영상 미리보기가 아닙니다/);
  });

  test('애드온 가격은 단일 소스를 쓰고 예·아니오 선택은 접근 가능하다', () => {
    assert.match(motion, /VIDEO_ADDON_PRICE_KRW\.toLocaleString/);
    assert.doesNotMatch(motion, /200_?000/);
    assert.match(motion, /아니오, 사진으로 할게요/);
    assert.match(motion, /예, 영상으로 만들게요/);
    assert.ok((motion.match(/aria-pressed=/g) ?? []).length >= 2);
  });

  test('스킵은 영상을 요청하지 않고 reduced-motion에서 원본 사진을 정적 표시한다', () => {
    for (const banned of ['fetch(', '/api/sites/', 'generateVeoVideo', 'generateHeroVideo']) {
      assert.ok(!motion.includes(banned), `미리보기에 금지된 영상 호출: ${banned}`);
    }
    assert.match(motion, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(motion, /\.mcs-preview-image, \.mcs-preview-light,[\s\S]*animation: none; transform: none;/);
  });

  test('아니오는 켄번스 정지 소스, 예는 video-hero 요청 표식으로 결정적 분기한다', () => {
    assert.deepEqual(motionChoiceForVideoPreference(false, 'space-mood'), {
      heroTechnique: 'ken-burns',
      intensity: 'subtle',
    });
    assert.deepEqual(motionChoiceForVideoPreference(true, 'space-mood'), {
      heroTechnique: 'video-hero',
      intensity: 'normal',
      videoConceptId: 'space-mood',
    });
  });
});
