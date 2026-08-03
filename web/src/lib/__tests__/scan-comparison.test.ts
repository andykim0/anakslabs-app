import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import type { ScanIssue } from '@/lib/data/types';
import {
  comparisonHeadline,
  SCAN_COMPARISON_LIMIT,
  SCAN_REQUEST_URL_LIMIT,
  SCAN_STRUCTURE_SIGNALS,
  structureSignals,
} from '@/lib/scan/comparison';
import { isScanExpired, SCAN_RETENTION_DAYS } from '@/lib/scan/retention';

const issue = (code: string): ScanIssue => ({
  code,
  severity: 'warn',
  label: code,
  detail: code,
  pillar: code.startsWith('aeo_') ? 'aeo' : code.startsWith('geo_') ? 'geo' : 'seo',
});

describe('GT$ G2 경쟁 비교 진단', () => {
  test('한 요청은 본인 1곳과 경쟁 URL 2곳으로 제한한다', () => {
    assert.equal(SCAN_COMPARISON_LIMIT, 2);
    assert.equal(SCAN_REQUEST_URL_LIMIT, 3);
    const route = readFileSync(join(process.cwd(), 'src/app/api/scan/route.ts'), 'utf8');
    assert.match(route, /\.max\(SCAN_COMPARISON_LIMIT\)/);
    assert.match(route, /new Set\(normalizedUrls\)/);
  });

  test('동일 이슈 집합은 동일 구조 신호를 만들고 순위 데이터는 사용하지 않는다', () => {
    const issues = [issue('seo_noindex'), issue('aeo_jsonld_missing')];
    assert.deepEqual(structureSignals(issues), structureSignals(issues));
    assert.equal(structureSignals(issues).indexable, false);
    assert.equal(structureSignals(issues)['structured-data'], false);
    assert.equal(SCAN_STRUCTURE_SIGNALS.length, 6);
  });

  test('헤드라인은 구조 신호 차이만 쉬운 문장으로 설명한다', () => {
    const weak = { issues: SCAN_STRUCTURE_SIGNALS.map((signal) => issue(signal.failedBy[0])) };
    const strong = { issues: [] };
    assert.equal(comparisonHeadline(weak, [strong]), 'The other site exposes more readable structure to search engines.');
    assert.doesNotMatch(comparisonHeadline(weak, [strong]), /순위|1위|먼저 노출/);
  });

  test('기존 공유 결과 보관 기간 30일을 그대로 적용한다', () => {
    assert.equal(SCAN_RETENTION_DAYS, 30);
    const now = new Date('2026-07-20T00:00:00.000Z');
    assert.equal(isScanExpired('2026-06-21T00:00:00.000Z', now), false);
    assert.equal(isScanExpired('2026-06-19T23:59:59.999Z', now), true);
  });

  test('스캐너 구현에 검색 결과 페이지 스크래핑 주소가 없다', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/scan/route.ts'), 'utf8');
    const scanFiles = ['src/lib/scan/index.ts', 'src/lib/scan/fetch-target.ts']
      .map((file) => readFileSync(join(process.cwd(), file), 'utf8'))
      .join('\n');
    assert.doesNotMatch(`${route}\n${scanFiles}`, /search\.naver\.com|google\.com\/search/);
  });
});
