/**
 * [I1] 개선 모드 계약 + 진단 컨텍스트 핸드오프 — mode/sourceUrl/sourceScanId → meta.sourceScanId 저장.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig } from '@/lib/types/site';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';

const candidate: DesignCandidate = {
  id: 'c', label: 'x', style: 'photo', heroImageUrl: '/mock/h.svg', theme: emptySiteConfig('t').theme, description: '',
};
const opts = { heroImageUrl: '/mock/h.svg', imagePool: ['/mock/a.svg'] };

function survey(over: Partial<SurveyInput> = {}): SurveyInput {
  const t = resolveTemplate('local_store', '카페');
  return {
    businessName: '소소한자리', purposeId: 'local_store', purpose: '음식점', industry: '카페',
    tone: ['친근한'], colorPreference: '#c98a5e', referenceImageUrls: [],
    contentItems: [{ name: '커피', price: '4,000' }],
    sectionPlan: planFromTemplate(t), pagePlan: pagePlanFromTemplate(t), templateId: t.id, ...over,
  } as SurveyInput;
}

describe('I1 — 개선 모드 계약', () => {
  test('improve 모드 + sourceScanId → meta.sourceScanId 저장', () => {
    const cfg = buildSiteConfigFromSurvey(
      survey({ mode: 'improve', sourceUrl: 'https://old.example.com', sourceScanId: 'scan-123' }),
      candidate,
      opts,
    );
    assert.equal(cfg.meta.sourceScanId, 'scan-123');
  });

  test('fresh 모드(기본) → meta.sourceScanId 미저장(무회귀)', () => {
    const cfg = buildSiteConfigFromSurvey(survey(), candidate, opts);
    assert.equal(cfg.meta.sourceScanId, undefined);
  });

  test('improve지만 sourceScanId 없으면 미저장(부분 컨텍스트 안전)', () => {
    const cfg = buildSiteConfigFromSurvey(survey({ mode: 'improve', sourceUrl: 'https://x.com' }), candidate, opts);
    assert.equal(cfg.meta.sourceScanId, undefined);
  });
});
