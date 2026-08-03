/**
 * [G4] 발행 전 진단 가이드 — 전 scan 코드가 guidance 매핑을 가짐(누락 0) + 앵커 유효.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { SCAN_GUIDANCE, allScanCodes, guidanceFor, type GuidanceAnchor } from '@/lib/scan/guidance';
import { scanRuleFor } from '@/lib/scan/rule-registry';

const VALID_ANCHORS: GuidanceAnchor[] = [
  'editor:content',
  'editor:business-info',
  'editor:meta',
  'editor:images',
  'system',
];

describe('SCAN_GUIDANCE 완전성', () => {
  test('전 scan 코드가 guidance를 가짐 — 누락 0', () => {
    const codes = allScanCodes();
    assert.ok(codes.length >= 20, `scan 코드 수 ${codes.length}`);
    const missing = codes.filter((c) => !guidanceFor(c));
    assert.deepEqual(missing, [], `guidance 누락: ${missing.join(', ')}`);
  });

  test('모든 guidance가 title·action·effect 채움 + 유효 앵커', () => {
    for (const [code, g] of Object.entries(SCAN_GUIDANCE)) {
      assert.ok(g.title.trim() && g.action.trim() && g.effect.trim(), `${code} 문구 누락`);
      assert.ok(VALID_ANCHORS.includes(g.anchor), `${code} 앵커 무효: ${g.anchor}`);
    }
  });

  test('guidance에 없는 잉여 코드 없음(레지스트리-규칙 정합)', () => {
    const codes = new Set(allScanCodes());
    const extra = Object.keys(SCAN_GUIDANCE).filter((c) => !codes.has(c));
    assert.deepEqual(extra, [], `규칙에 없는 잉여 guidance: ${extra.join(', ')}`);
  });

  test('입력하면 만점 안내는 단순 고객 입력 부재에만 쓰고 출처 없는 주장은 감점으로 유지한다', () => {
    const inputToPerfect = Object.entries(SCAN_GUIDANCE)
      .filter(([, guidance]) => guidance.presentation === 'input-to-perfect')
      .map(([code]) => code)
      .sort();

    assert.deepEqual(inputToPerfect, [
      'aeo_local_business_details',
      'geo_author',
      'geo_business_info',
      'geo_dates',
    ]);
    for (const code of inputToPerfect) {
      assert.equal(scanRuleFor(code)?.ownership, 'customer', `${code}는 고객 입력 규칙이어야 한다`);
      assert.match(guidanceFor(code)?.title ?? '', /complete this item$/);
    }

    const unsourcedClaims = scanRuleFor('geo_unsourced_claims');
    assert.equal(unsourcedClaims?.weight, 9);
    assert.equal(unsourcedClaims?.ownership, 'customer');
    assert.equal(guidanceFor('geo_unsourced_claims')?.presentation, undefined);
  });
});
