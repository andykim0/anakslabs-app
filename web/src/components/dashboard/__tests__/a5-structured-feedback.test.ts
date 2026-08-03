/**
 * [A5] 구조화 피드백 — 칩 선택이 requestedContent로 결정적 조립(칩 배열 순서 고정), 모호 입력 패턴.
 * 계약 무변경(스키마·API 그대로) — 구조화는 requestedContent에 접어넣는 additive 레이어.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPE_QUICK_CHIPS, VAGUE_TEXT_PATTERN, assembleRequestedContent } from '@/components/dashboard/edit-request-form';

describe('A5 — 구조화 피드백 조립', () => {
  test('4 EditType 전부 빠른선택 칩 보유', () => {
    for (const t of ['text', 'image', 'video', 'structure'] as const) {
      assert.ok(TYPE_QUICK_CHIPS[t].length >= 3, `${t} 칩 부족`);
    }
  });

  test('선택 칩 → "[라벨]" 프리픽스(배열 순서 고정, 클릭 순서 무관)', () => {
    const chips = TYPE_QUICK_CHIPS.image; // [다른 분위기, 더 밝게, 더 차분하게, 브랜드 색으로, 다시 생성]
    // 클릭 순서를 뒤섞어도 배열 순서로 조립
    const sel = new Set(['calmer', 'brighter']);
    const out = assembleRequestedContent(chips, sel, '');
    assert.equal(out, '[brighter] [more calmly]', `조립 순서/형식: ${out}`);
  });

  test('칩 + 자유텍스트 결합', () => {
    const chips = TYPE_QUICK_CHIPS.text;
    const out = assembleRequestedContent(chips, new Set(['professional']), '로고 옆 문구도요');
    assert.equal(out, '[more professionally] 로고 옆 문구도요');
  });

  test('freeform(직접 설명) 칩은 프리픽스에서 제외', () => {
    const chips = TYPE_QUICK_CHIPS.text;
    const out = assembleRequestedContent(chips, new Set(['explain']), '이렇게 바꿔주세요');
    assert.equal(out, '이렇게 바꿔주세요', 'freeform 칩이 프리픽스에 유입');
  });

  test('칩만 선택(자유텍스트 없음)도 유효 조립', () => {
    const out = assembleRequestedContent(TYPE_QUICK_CHIPS.structure, new Set(['add-section']), '');
    assert.equal(out, '[Add section]');
  });

  test('모호 입력 패턴 — 별로/이상/싫 감지', () => {
    assert.ok(VAGUE_TEXT_PATTERN.test('그냥 별로예요'));
    assert.ok(VAGUE_TEXT_PATTERN.test('좀 이상해요'));
    assert.ok(!VAGUE_TEXT_PATTERN.test('히어로 문구를 더 짧게'));
  });
});
