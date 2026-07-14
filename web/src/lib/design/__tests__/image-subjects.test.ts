import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FAITHFUL_PHOTO_MOTION_DIRECTIVE,
  MOOD_SUBJECTS,
  PRODUCT_AVOID,
  PRODUCT_SAFETY_DIRECTIVE,
  ambientSubjectFor,
  hasFaithfulPhotoDirective,
  hasProductSafetyDirective,
  moodPromptForTone,
  productSafetyDirective,
  resolveMoodSubjectId,
  type MoodSubjectId,
} from '@/lib/design/image-subjects';

const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;

describe('H2 — MOOD_SUBJECTS 레지스트리', () => {
  test('6개 무드군이 제품 아닌 영어 ambient를 3개씩 가진다', () => {
    assert.deepEqual(Object.keys(MOOD_SUBJECTS).sort(), [
      'calm',
      'elegant',
      'energetic',
      'modern',
      'natural',
      'warm',
    ] satisfies MoodSubjectId[]);
    for (const [id, rule] of Object.entries(MOOD_SUBJECTS)) {
      assert.equal(rule.ambient.length, 3, id);
      for (const subject of rule.ambient) {
        assert.doesNotMatch(subject, HANGUL, `${id}: 한글 descriptor`);
        assert.doesNotMatch(subject, /#/, `${id}: hex descriptor`);
        assert.doesNotMatch(subject, /\b(?:steak|pasta|latte|cake|hairstyle|manicure|product)\b/i, `${id}: 제품 피사체`);
      }
    }
  });

  test('실제 7개 tone 칩이 결정적인 무드군으로 매핑된다', () => {
    const cases: Array<[string, MoodSubjectId]> = [
      ['고급스러운', 'elegant'],
      ['미니멀', 'modern'],
      ['친근한', 'warm'],
      ['대담한', 'energetic'],
      ['차분한', 'calm'],
      ['러스틱', 'warm'],
      ['모던', 'modern'],
    ];
    for (const [tone, expected] of cases) assert.equal(resolveMoodSubjectId([tone]), expected, tone);
    assert.equal(resolveMoodSubjectId(['알 수 없는 톤']), 'calm');
  });

  test('ambient 선택은 결정적이며 해당 무드 레지스트리 안에 있다', () => {
    const first = ambientSubjectFor({ tone: ['고급스러운'], seed: 'hero:dark-luxury' });
    const second = ambientSubjectFor({ tone: ['고급스러운'], seed: 'hero:dark-luxury' });
    assert.equal(first, second);
    assert.ok(MOOD_SUBJECTS.elegant.ambient.includes(first as (typeof MOOD_SUBJECTS.elegant.ambient)[number]));
    assert.match(moodPromptForTone(['고급스러운']), /elegant/i);
  });
});

describe('H2 — 소비자기만 방지 지시', () => {
  test('PRODUCT_AVOID는 영어·무-hex 전역 금지 목록이다', () => {
    assert.ok(PRODUCT_AVOID.length >= 5);
    for (const item of PRODUCT_AVOID) {
      assert.doesNotMatch(item, HANGUL);
      assert.doesNotMatch(item, /#/);
    }
  });

  test('photo는 구체 금지 목록까지 붙고 illustration/3d는 무드 중심 양식화로 완화된다', () => {
    const photo = productSafetyDirective('photo');
    const illustration = productSafetyDirective('illustration');
    const render3d = productSafetyDirective('3d_render');
    assert.ok(photo.includes(PRODUCT_SAFETY_DIRECTIVE));
    assert.ok(photo.includes(PRODUCT_AVOID[0]));
    assert.ok(photo.length > illustration.length);
    assert.match(illustration, /clearly illustrated/);
    assert.match(render3d, /constructed and stylized/);
    assert.ok(hasProductSafetyDirective(photo));
  });

  test('대표 실사 모션 지시는 원본 보존과 추가·삭제·변형 금지를 명시한다', () => {
    assert.match(FAITHFUL_PHOTO_MOTION_DIRECTIVE, /preserve the source photograph and every subject exactly/i);
    assert.match(FAITHFUL_PHOTO_MOTION_DIRECTIVE, /do NOT add, remove, replace, restyle, or alter objects/);
    assert.ok(hasFaithfulPhotoDirective(FAITHFUL_PHOTO_MOTION_DIRECTIVE));
  });
});
