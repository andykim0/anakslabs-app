import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const wizard = source('src/components/dashboard/onboarding/wizard.tsx');
const heroStep = source('src/components/dashboard/onboarding/hero-image-step.tsx');
const candidateStep = source('src/components/dashboard/onboarding/candidate-step.tsx');
const dashboardApi = source('src/components/dashboard/api.ts');

describe('W1 — 히어로 사진 선택 플로우', () => {
  test('히어로 사진은 설문 뒤·움직임과 디자인 앞의 2단계 게이트다', () => {
    const heroAt = wizard.indexOf('<HeroImageStep');
    const motionAt = wizard.indexOf('<MotionChoiceStep');
    const candidateAt = wizard.indexOf('<CandidateStep');

    assert.ok(heroAt >= 0 && motionAt > heroAt && candidateAt > motionAt);
    assert.match(wizard, /\{ no: 2, label: '히어로 사진' \}/);
    assert.match(wizard, /heroImageUrl=\{heroImage\.url\}/);
  });

  test('히어로·디자인 단계는 같은 query key·requestKey로 AI 3안 한 배치를 공유한다', () => {
    for (const src of [heroStep, candidateStep]) {
      assert.match(src, /queryKey: \['onboarding', 'hero-images', candidateSurvey\]/);
      assert.match(src, /heroCandidateIntent\(candidateSurvey\)/);
      assert.match(src, /generateCandidates\(candidateSurvey, requestKey\)/);
      assert.match(src, /staleTime: Infinity/);
      assert.match(src, /retry: false/);
    }
    assert.match(dashboardApi, /requestKey\?: string/);
    assert.match(dashboardApi, /\.\.\.\(requestKey \? \{ requestKey \} : \{\}\)/);
  });

  test('업로드·AI 무드 선택을 구분하고 제품 날조 금지를 고지한다', () => {
    assert.match(heroStep, /내가 올린 대표 사진/);
    assert.match(heroStep, /무드 3안/);
    assert.match(heroStep, /특정 메뉴·상품·시술 결과를 만들지 않고/);
    assert.match(heroStep, /공간·빛·질감/);
  });

  test('디자인 3안은 새 히어로를 재생성하지 않고 선택 URL을 고정한다', () => {
    assert.match(candidateStep, /src=\{heroImageUrl\}/);
    assert.match(candidateStep, /applyHeroImageToCandidate\(selected, heroImageUrl\)/);
    assert.doesNotMatch(candidateStep, /다시 추천받기/);
    assert.doesNotMatch(candidateStep, /const regenerate/);
  });

  test('AI 안을 고르면 기존 heroPhotoUrl이 process에서 선택 이미지를 덮지 않는다', () => {
    assert.match(
      wizard,
      /survey=\{heroImage\.source === 'upload' \? survey : \{ \.\.\.survey, heroPhotoUrl: undefined \}\}/,
    );
  });
});
