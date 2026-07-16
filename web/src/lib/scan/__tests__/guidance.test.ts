/**
 * [G4] 발행 전 진단 가이드 — 전 scan 코드가 guidance 매핑을 가짐(누락 0) + 앵커 유효.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { SCAN_GUIDANCE, allScanCodes, guidanceFor, type GuidanceAnchor } from '@/lib/scan/guidance';

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
});
