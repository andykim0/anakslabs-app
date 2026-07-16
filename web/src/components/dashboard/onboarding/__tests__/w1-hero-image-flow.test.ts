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
  test('히어로 사진 뒤 디자인을 확정한 다음 고객 팔레트로 실제 모션을 미리본다', () => {
    const heroAt = wizard.indexOf('<HeroImageStep');
    const motionAt = wizard.indexOf('<MotionChoiceStep');
    const candidateAt = wizard.indexOf('<CandidateStep');

    assert.ok(heroAt >= 0 && candidateAt > heroAt && motionAt > candidateAt);
    assert.match(wizard, /\{ no: 2, label: '히어로 사진' \}/);
    assert.match(wizard, /\{ no: 3, label: '디자인 방향' \}/);
    assert.match(wizard, /\{ no: 4, label: '움직임' \}/);
    assert.match(wizard, /heroImageUrl=\{heroImage\.url\}/);
    assert.match(wizard, /heroImageAssetRef=\{heroImage\.assetRef\}/);
    assert.match(wizard, /candidate=\{candidate\}/);
  });

  test('히어로·디자인 단계는 같은 query key·requestKey로 AI 3안 한 배치를 공유한다', () => {
    for (const src of [heroStep, candidateStep]) {
      assert.match(src, /queryKey: \['onboarding', 'hero-images', existingSiteId \?\? 'new', candidateSurvey\]/);
      assert.match(src, /heroCandidateIntent\(candidateSurvey\)/);
      assert.match(src, /generateCandidates\(candidateSurvey, requestKey, existingSiteId\)/);
      assert.match(src, /staleTime: Infinity/);
      assert.match(src, /retry: false/);
    }
    assert.match(dashboardApi, /requestKey\?: string/);
    assert.match(dashboardApi, /siteId\?: string/);
    assert.match(dashboardApi, /\.\.\.\(requestKey \? \{ requestKey \} : \{\}\)/);
    assert.match(dashboardApi, /\.\.\.\(siteId \? \{ siteId \} : \{\}\)/);
  });

  test('업로드·AI 무드 선택을 구분하고 제품 날조 금지를 고지한다', () => {
    assert.match(heroStep, /내가 올린 대표 사진/);
    assert.match(heroStep, /무드 3안/);
    assert.match(heroStep, /특정 메뉴·상품·시술 결과를 만들지 않고/);
    assert.match(heroStep, /공간·빛·질감/);
  });

  test('디자인 3안은 새 히어로를 재생성하지 않고 선택 URL을 고정한다', () => {
    assert.match(candidateStep, /src=\{heroImageUrl\}/);
    assert.match(candidateStep, /applyHeroImageToCandidate\(selected, heroImageUrl, heroImageAssetRef\)/);
    assert.doesNotMatch(candidateStep, /다시 추천받기/);
    assert.doesNotMatch(candidateStep, /const regenerate/);
  });

  test('W4에서 AI 안을 고라도 heroPhotoUrl은 보존하고 명시적 선택 id로 덮어쓰기를 막는다', () => {
    const selection = source('src/lib/onboarding/hero-video-selection.ts');
    assert.match(wizard, /surveyWithHeroVideoSelection\(survey, heroImage, motionChoice\)/);
    assert.match(selection, /heroImageChoice: heroImage\.id/);
    assert.match(selection, /\.\.\.survey/);
    assert.doesNotMatch(wizard, /heroPhotoUrl: undefined/);
  });
});
