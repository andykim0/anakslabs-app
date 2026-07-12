/**
 * [motion 4단계 — V2] POV 이미지 프롬프트 빌더 — POV mood·업종·팔레트 반영 + 매장 장면 블렌드.
 * (실제 Gemini 호출 없음 — 순수 프롬프트 문자열만 검증)
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SurveyInput } from '@/lib/types/domain';
import type { CandidateBlueprint } from '@/lib/data/design-candidates';
import { povImagePrompt } from '@/lib/ai/image-prompt';
import { buildImagePrompt, describeColor } from '@/lib/design/quality-standards';

const bp = {
  brief: { style: { id: 'dark-luxury', candidateStyle: 'photo', name: '다크 럭셔리' } },
  theme: { palette: { primary: '#b08d57', background: '#0f0e0c' } },
} as unknown as CandidateBlueprint;

const survey = {
  industry: '파인다이닝',
  businessName: '화로담',
  tagline: '참숯 다이닝',
  tone: ['고요하고 묵직한'],
} as unknown as SurveyInput;

describe('povImagePrompt — POV 아트디렉션', () => {
  test('업종·POV mood·색상 기술어(hex 아님)·no-text 포함', () => {
    const p = povImagePrompt(bp, survey, 'hero section');
    assert.match(p, /파인다이닝/, '업종 없음');
    assert.match(p, /다크 럭셔리/, 'POV mood 없음'); // dark-luxury POV mood
    assert.match(p, /accent tone .+background tone/, '색상 기술어(accent/background tone) 없음');
    assert.doesNotMatch(p, /#/, 'hex 문자(#)가 남아 표면 각인 위험');
    assert.match(p, /no text|no words/i, 'no-text 지시 없음');
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

describe('describeColor + buildImagePrompt 불변식 — hex 미포함(표면 각인 방지)', () => {
  test('describeColor: 대표 색 → 이름', () => {
    assert.equal(describeColor('#141A3A'), 'deep navy');
    assert.equal(describeColor('#2D63F0'), 'vivid cobalt blue');
    assert.equal(describeColor('#F6F7F9'), 'cool white');
    assert.doesNotMatch(describeColor('#b08d57'), /#/); // 어떤 입력이든 산출에 '#' 없음
  });

  test('buildImagePrompt 산출 문자열에 # 문자 미포함 (불변식)', () => {
    const cases = [
      { p: '#141A3A', b: '#F6F7F9' },
      { p: '#b08d57', b: '#0f0e0c' },
      { p: '#2D63F0', b: '#EDF0F5' },
    ];
    for (const c of cases) {
      const out = buildImagePrompt('dark-luxury', '파인다이닝', 'hero', { palettePrimary: c.p, background: c.b });
      assert.doesNotMatch(out, /#/, `hex 잔존: ${c.p}/${c.b}`);
      assert.match(out, /Color mood: accent tone /);
    }
  });
});
