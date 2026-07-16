import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { motionChoiceForVideoPreference } from '@/components/dashboard/onboarding/motion-choice-step';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const motion = source('src/components/dashboard/onboarding/motion-choice-step.tsx');
const immersive = source('src/components/dashboard/onboarding/motion-immersive-preview.tsx');
const wizard = source('src/components/dashboard/onboarding/wizard.tsx');

describe('W2/v2 — production 시그니처 미리보기·AI 영상 분리', () => {
  test('W1 이미지와 고른 디자인을 실제 production preview config에 함께 넣는다', () => {
    assert.match(wizard, /<MotionChoiceStep[\s\S]*heroImageUrl=\{heroImage\.url\}/);
    assert.match(wizard, /<MotionChoiceStep[\s\S]*candidate=\{candidate\}/);
    assert.match(motion, /heroImageUrl: string/);
    assert.match(motion, /buildMotionSignaturePreviewConfig\([\s\S]*candidate,[\s\S]*heroImageUrl/);
  });

  test('가짜 CSS 카드 대신 동일 scene·runtime의 SitePreview를 소형·대형으로 쓴다', () => {
    assert.ok((`${motion}\n${immersive}`.match(/<SitePreview/g) ?? []).length >= 2);
    assert.match(motion, /실제 렌더러 티저/);
    assert.match(motion, /동일한 scene 계약·런타임/);
    assert.match(immersive, /motion=\{!reducedMotion\}/);
    assert.doesNotMatch(motion, /@keyframes hvm-|HeroMotionDemo/);
  });

  test('AI 영상 홈페이지 가격은 pricing 단일 소스를 쓰고 기본·영상 선택은 접근 가능하다', () => {
    assert.match(motion, /PRICING\.videoHeroAddon\.toLocaleString/);
    assert.doesNotMatch(motion, /200_?000/);
    assert.match(motion, /이미지 \+ 기본 모션/);
    assert.match(motion, /포함·무료/);
    assert.match(motion, /AI 영상 홈페이지/);
    assert.match(motion, /선택만으로 생성되거나 권한이 부여되지 않습니다/);
    assert.ok((motion.match(/aria-pressed=/g) ?? []).length >= 2);
  });

  test('프리뷰에서 원가 API를 호출하지 않고 reduced-motion은 공용 production runtime이 담당한다', () => {
    for (const banned of ['fetch(', '/api/sites/', 'generateVeoVideo', 'generateHeroVideo']) {
      assert.ok(!motion.includes(banned), `미리보기에 금지된 영상 호출: ${banned}`);
    }
    assert.match(immersive, /<SitePreview[\s\S]*motion=\{!reducedMotion\}/);
    assert.match(motion, /mobileFallback/);
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
