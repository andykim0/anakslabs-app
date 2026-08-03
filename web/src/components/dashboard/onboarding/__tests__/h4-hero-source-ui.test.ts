import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { heroVideoPhotoHint } from '@/lib/onboarding/hero-video-process';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('H4 — 히어로 영상 소스 UI·전달', () => {
  test('짧은 원격/경로 대표 사진만 이행 힌트로 전달한다', () => {
    assert.equal(heroVideoPhotoHint('https://assets.example.com/hero.webp'), 'https://assets.example.com/hero.webp');
    assert.equal(heroVideoPhotoHint('/uploads/hero.webp'), '/uploads/hero.webp');
  });

  test('긴 mock data URL과 비원격 스킴은 이행 힌트로 싣지 않는다', () => {
    for (const value of [
      `data:image/png;base64,${'A'.repeat(5000)}`,
    'blob:https://anakslabs.com/id',
      'javascript:alert(1)',
      '//evil.example/hero.jpg',
    ]) {
      assert.equal(heroVideoPhotoHint(value), undefined, value.slice(0, 40));
    }
  });

  test('위저드는 업로드 선택일 때만 대표 사진을 영상 출처로 전달하고 성공 화면은 이행 큐 상태만 읽는다', () => {
    const wizard = source('src/components/dashboard/onboarding/wizard.tsx');
    const generate = source('src/components/dashboard/onboarding/generate-step.tsx');
    assert.match(
      wizard,
      /<MotionChoiceStep[\s\S]*heroPhotoUrl=\{heroImage\.source === 'upload' \? heroImage\.url : undefined\}/,
    );
    assert.match(generate, /heroVideoResumePlan\(reviewConfig\)/);
    assert.doesNotMatch(generate, /generateHeroVideoDrafts|applyHeroVideoDraft|HeroVideoStudio/);
  });

  test('영상 선택 카피는 사진 보존/AI 무드 경로를 구분하고 음식 접시 이모지를 쓰지 않는다', () => {
    const motion = source('src/components/dashboard/onboarding/motion-choice-step.tsx');
    assert.match(motion, /Preserves the subject of the approved image while adding motion/);
    assert.match(motion, /approved mood, light, and space without inventing a product/);
    assert.doesNotMatch(motion, /🍽️|product-closeup|unboxing-detail/);
  });
});
