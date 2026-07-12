/**
 * [motion 4단계 — V2] POV 이미지 프롬프트 빌더 — POV mood·업종·팔레트 반영 + 매장 장면 블렌드.
 * (실제 Gemini 호출 없음 — 순수 프롬프트 문자열만 검증)
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SurveyInput } from '@/lib/types/domain';
import type { CandidateBlueprint } from '@/lib/data/design-candidates';
import { povImagePrompt } from '@/lib/ai/image-prompt';

const bp = {
  brief: { style: { id: 'dark-luxury', candidateStyle: 'photo', name: '다크 럭셔리' } },
  theme: { palette: { primary: '#b08d57', background: '#0f0e0c' } },
} as unknown as CandidateBlueprint;

const survey = {
  industry: '파인다이닝',
  businessName: '화로담',
  tagline: '참숯 다이닝',
  tone: '고요하고 묵직한',
} as unknown as SurveyInput;

describe('povImagePrompt — POV 아트디렉션', () => {
  test('업종·POV mood·팔레트 hex·no-text 포함', () => {
    const p = povImagePrompt(bp, survey, 'hero section');
    assert.match(p, /파인다이닝/, '업종 없음');
    assert.match(p, /다크 럭셔리/, 'POV mood 없음'); // dark-luxury POV mood
    assert.match(p, /#b08d57/, '팔레트 primary hex 없음');
    assert.match(p, /#0f0e0c/, '팔레트 background hex 없음');
    assert.match(p, /no text|no words/i, 'no-text 지시 없음');
    assert.match(p, /16:10/, '비율 지시 없음');
  });

  test('매장 장면 블렌드 — refinedScene(충분히 길면) 우선', () => {
    const long = 'A quiet charcoal dining room with warm low light and a single flame at the center of the table';
    const p = povImagePrompt(bp, survey, 'hero section', long);
    assert.match(p, /Scene:/);
    assert.ok(p.includes(long), 'refinedScene 미반영');
  });

  test('refinedScene 없으면 설문(상호·태그라인) 결정적 사용', () => {
    const p = povImagePrompt(bp, survey, 'hero section');
    assert.match(p, /화로담/, '상호 없음');
    assert.match(p, /참숯 다이닝/, '태그라인 없음');
  });

  test('짧은 refinedScene은 무시하고 설문 사용 (자유서술 방지)', () => {
    const p = povImagePrompt(bp, survey, 'hero section', 'short');
    assert.doesNotMatch(p, /Scene: short/);
    assert.match(p, /화로담/);
  });
});
