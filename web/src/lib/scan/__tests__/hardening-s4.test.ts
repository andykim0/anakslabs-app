import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScanResultPanel } from '@/components/landing/LandingScanner';
import type { ScanIssue, ScanResult } from '@/lib/data/types';
import { comparisonEngineSummary, toComparisonResult } from '@/lib/scan/comparison';

function crawlerIssue(code: string, scoreDeducted: boolean): ScanIssue {
  return {
    code,
    severity: scoreDeducted ? 'critical' : 'info',
    label: `${code} 상태`,
    detail: '같은 robots 정책의 크롤러별 상세',
    pillar: code.startsWith('geo_') ? 'geo' : 'seo',
    rootCause: 'robots-crawler-access',
    scoreDeducted,
  };
}

const groupedIssues = [
  crawlerIssue('seo_googlebot_blocked', true),
  crawlerIssue('seo_naver_yeti_blocked', false),
  crawlerIssue('geo_oai_search_blocked', false),
];

function primary(): ScanResult {
  return {
    id: 'scan-s4',
    url: 'https://mine.example/',
    scores: { seo: 61, aeo: 82, geo: 74, total: 72 },
    grade: 'C',
    issues: groupedIssues,
    comparisons: [{
      url: 'https://nearby.example/',
      scores: { seo: 88, aeo: 91, geo: 85, total: 88 },
      grade: 'B',
      issues: groupedIssues,
    }],
    clientId: null,
    createdAt: '2026-07-21T00:00:00.000Z',
  };
}

describe('SE$ S4 비교 모드 정합', () => {
  test('비교 결과는 엔진 점수·등급·이슈를 재계산 없이 그대로 보존한다', () => {
    const source = primary();
    const projected = toComparisonResult(source);
    assert.strictEqual(projected.scores, source.scores);
    assert.strictEqual(projected.issues, source.issues);
    assert.equal(projected.grade, source.grade);
  });

  test('크롤러별 상세 여러 건도 공용 루트 원인 집계에서는 한 건이다', () => {
    assert.deepEqual(comparisonEngineSummary(primary()), {
      scores: { seo: 61, aeo: 82, geo: 74, total: 72 },
      grade: 'C',
      actionableRootCauses: 1,
    });
  });

  test('비교표는 양쪽 엔진 점수와 루트 원인 1개를 그대로 표시한다', () => {
    const html = renderToStaticMarkup(createElement(ScanResultPanel, { scan: primary(), shared: true }));
    assert.match(html, /72 points · Grade C/u);
    assert.match(html, /88 points · Grade B/u);
    assert.equal((html.match(/1 causes/gu) ?? []).length, 2);
    assert.doesNotMatch(html, /3 causes/u);
  });
});
