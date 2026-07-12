/**
 * [F3 #5] tone 헬퍼 — toneText(소비용 문자열), normalizeTone(레거시 string→배열).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { toneText, normalizeTone } from '@/lib/onboarding/tone';

describe('toneText', () => {
  test('배열 → ", " 조인', () => {
    assert.equal(toneText(['차분한', '모던']), '차분한, 모던');
    assert.equal(toneText(['친근한']), '친근한');
  });
  test('레거시 string/undefined 수용', () => {
    assert.equal(toneText('모던'), '모던');
    assert.equal(toneText(undefined), '');
    assert.equal(toneText(null), '');
  });
  test('빈 값 필터', () => {
    assert.equal(toneText(['차분한', '']), '차분한');
  });
});

describe('normalizeTone — read-time 마이그레이션', () => {
  test('string → [string]', () => {
    assert.deepEqual(normalizeTone('모던'), ['모던']);
    assert.deepEqual(normalizeTone(''), []);
  });
  test('배열은 최대 2개로 절제', () => {
    assert.deepEqual(normalizeTone(['a', 'b', 'c']), ['a', 'b']);
    assert.deepEqual(normalizeTone(['a']), ['a']);
  });
});
