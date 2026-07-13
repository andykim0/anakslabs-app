/**
 * [I4] 진단 문제 해결 대조 — 해결 방식 분류 완전성 + 정직한 전후 대조(과장 금지).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { allScanCodes, computeResolution, resolutionOf } from '@/lib/scan/issue-resolution';

describe('resolutionOf 분류', () => {
  test('전 scan 코드가 auto/content/manual 중 하나로 분류', () => {
    for (const code of allScanCodes()) {
      const kind = resolutionOf(code);
      assert.ok(['auto', 'content', 'manual'].includes(kind), `${code}: ${kind}`);
    }
  });
  test('구조화 자동 항목 = auto, 콘텐츠 필요 = content', () => {
    assert.equal(resolutionOf('aeo_jsonld_type'), 'auto');
    assert.equal(resolutionOf('seo_meta_description'), 'auto');
    assert.equal(resolutionOf('geo_no_text'), 'auto');
    assert.equal(resolutionOf('geo_business_info'), 'content');
    assert.equal(resolutionOf('seo_img_alt'), 'content');
    assert.equal(resolutionOf('seo_speed_very_slow'), 'manual');
  });
  test("system 앵커(canonical 등) 기본 auto", () => {
    assert.equal(resolutionOf('seo_canonical'), 'auto');
    assert.equal(resolutionOf('geo_llms_txt'), 'auto');
  });
});

describe('computeResolution — 정직성(after에도 있으면 해결 아님)', () => {
  test('resolved = before ∖ after, remaining = before ∩ after', () => {
    const cmp = computeResolution(
      ['aeo_jsonld_missing', 'geo_no_text', 'geo_business_info', 'seo_h1'], // 전(원본)
      ['geo_business_info'], // 후(재생성) — jsonld·no_text·h1은 해결, business_info는 남음
      44,
      66,
    );
    assert.deepEqual(cmp.resolved.sort(), ['aeo_jsonld_missing', 'geo_no_text', 'seo_h1']);
    assert.deepEqual(cmp.remaining, ['geo_business_info']);
    assert.equal(cmp.beforeTotal, 44);
    assert.equal(cmp.afterTotal, 66);
  });
  test('after에 새로 생긴 코드는 대조에 안 들어감(전 기준만)', () => {
    const cmp = computeResolution(['geo_no_text'], ['seo_favicon', 'geo_no_text'], 40, 50);
    assert.deepEqual(cmp.resolved, []); // geo_no_text가 after에도 있어 해결 아님
    assert.deepEqual(cmp.remaining, ['geo_no_text']);
  });
  test('중복 코드 제거 + 전부 해결 시 remaining 빈 배열', () => {
    const cmp = computeResolution(['seo_h1', 'seo_h1', 'geo_no_text'], [], 30, 80);
    assert.deepEqual(cmp.resolved.sort(), ['geo_no_text', 'seo_h1']);
    assert.deepEqual(cmp.remaining, []);
  });
});
