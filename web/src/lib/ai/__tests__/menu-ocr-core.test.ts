/**
 * [G3c] 메뉴판 OCR 순수 파트 — 추출 전용 프롬프트 불변식 + 응답 파싱(계약 위반 시 []).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MENU_OCR_PROMPT, parseOcrItems } from '@/lib/ai/menu-ocr-core';

describe('MENU_OCR_PROMPT — 추출 전용(생성 금지)', () => {
  test('생성/추측/번역 금지 + 빈 배열 폴백 명시', () => {
    const p = MENU_OCR_PROMPT.toLowerCase();
    assert.ok(p.includes('do not invent'), 'invent 금지 문구 없음');
    assert.ok(/guess|paraphrase|translate/.test(p), '추측/번역 금지 없음');
    assert.ok(p.includes('empty array') || p.includes('[]'), '빈 배열 폴백 없음');
    assert.ok(p.includes('json'), 'JSON 출력 지시 없음');
  });
});

describe('parseOcrItems', () => {
  test('정상 JSON 배열 → ContentItem[] (가격 통화기호 제거)', () => {
    const items = parseOcrItems('[{"name":"아메리카노","price":"4,500원"},{"name":"라떼","price":"5000"}]');
    assert.equal(items.length, 2);
    assert.deepEqual(items[0], { name: '아메리카노', price: '4,500' });
    assert.equal(items[1].price, '5000');
  });
  test('코드펜스·앞뒤 텍스트 섞여도 첫 배열 추출', () => {
    const items = parseOcrItems('```json\n[{"name":"소금빵","price":"3,800"}]\n```');
    assert.equal(items.length, 1);
    assert.equal(items[0].name, '소금빵');
  });
  test('price null / 없음 → price undefined', () => {
    const items = parseOcrItems('[{"name":"오늘의 수프","price":null},{"name":"샐러드"}]');
    assert.equal(items.length, 2);
    assert.equal(items[0].price, undefined);
    assert.equal(items[1].price, undefined);
  });
  test('계약 위반(배열 아님·파싱 실패·빈 name) → 안전 처리', () => {
    assert.deepEqual(parseOcrItems('메뉴를 못 읽었습니다'), []);
    assert.deepEqual(parseOcrItems('{"name":"x"}'), []); // 객체(배열 아님)
    assert.deepEqual(parseOcrItems(undefined), []);
    assert.deepEqual(parseOcrItems('[{"name":""},{"price":"1"}]'), []); // 빈 name·name 없음 제외
  });
  test('40개 상한', () => {
    const big = JSON.stringify(Array.from({ length: 60 }, (_, i) => ({ name: `m${i}`, price: '1000' })));
    assert.equal(parseOcrItems(big).length, 40);
  });
});
