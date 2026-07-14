import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { buildHeroVideoDraftBody } from '@/components/dashboard/onboarding/hero-video-studio';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('H4 — 히어로 영상 소스 UI·전달', () => {
  test('POST body는 tone과 짧은 원격/경로 대표 사진만 전달한다', () => {
    assert.deepEqual(buildHeroVideoDraftBody([' 따뜻한 ', '모던', '초과']), {
      count: 2,
      tone: ['따뜻한', '모던'],
    });
    assert.deepEqual(buildHeroVideoDraftBody(['차분한'], 'https://assets.example.com/hero.webp'), {
      count: 2,
      tone: ['차분한'],
      heroPhotoUrl: 'https://assets.example.com/hero.webp',
    });
    assert.equal(buildHeroVideoDraftBody([], '/uploads/hero.webp').heroPhotoUrl, '/uploads/hero.webp');
  });

  test('긴 mock data URL과 비원격 스킴은 POST에 싣지 않는다', () => {
    for (const value of [
      `data:image/png;base64,${'A'.repeat(5000)}`,
      'blob:https://daboim.kr/id',
      'javascript:alert(1)',
      '//evil.example/hero.jpg',
    ]) {
      assert.ok(!('heroPhotoUrl' in buildHeroVideoDraftBody(['차분한'], value)), value.slice(0, 40));
    }
  });

  test('위저드와 생성 성공 화면은 업로드 선택일 때만 대표 사진을 영상 출처로 전달한다', () => {
    const wizard = source('src/components/dashboard/onboarding/wizard.tsx');
    const generate = source('src/components/dashboard/onboarding/generate-step.tsx');
    assert.match(
      wizard,
      /<MotionChoiceStep[\s\S]*heroPhotoUrl=\{heroImage\.source === 'upload' \? heroImage\.url : undefined\}/,
    );
    assert.match(generate, /<HeroVideoStudio[\s\S]*tone=\{survey\.tone\}[\s\S]*heroPhotoUrl=\{survey\.heroImageChoice === 'upload' \? survey\.heroPhotoUrl : undefined\}/);
    assert.match(generate, /heroImageChoice: effectiveSurvey\.heroImageChoice/);
    assert.match(generate, /heroPhotoUrl: effectiveSurvey\.heroPhotoUrl/);
  });

  test('영상 선택 카피는 사진 보존/AI 무드 경로를 구분하고 음식 접시 이모지를 쓰지 않는다', () => {
    const motion = source('src/components/dashboard/onboarding/motion-choice-step.tsx');
    const studio = source('src/components/dashboard/onboarding/hero-video-studio.tsx');
    assert.match(motion, /이 대표 사진을 그대로 살려요/);
    assert.match(motion, /선택한 무드에 맞춘 AI 공간·빛 연출/);
    assert.match(studio, /피사체를 그대로 보존/);
    assert.match(studio, /AI 공간·빛·질감 연출/);
    assert.doesNotMatch(motion, /🍽️|product-closeup|unboxing-detail/);
    assert.doesNotMatch(studio, /businessName|industry/);
  });
});
