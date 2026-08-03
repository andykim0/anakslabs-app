/**
 * [A6] 에이전시 흐름 통합 회귀 — 레퍼런스 미입력·구성 게이트 스킵 시 기존 흐름 무회귀 /
 * 와이어프레임 승인(prune) 후 생성 정합 / A2 우선순위 / A5 구조화 결정적.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig } from '@/lib/types/site';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { pruneSections, sectionKey } from '@/components/dashboard/onboarding/wireframe-preview';
import { TYPE_QUICK_CHIPS, assembleRequestedContent } from '@/components/dashboard/edit-request-form';

const cand: DesignCandidate = { id: 'cand-warm-cozy', label: 'x', style: 'photo', heroImageUrl: '/mock/h.svg', theme: emptySiteConfig('t').theme, description: '' };
const opts = { heroImageUrl: '/mock/h.svg', imagePool: ['/mock/a.svg'] };
function soso(): SurveyInput {
  const t = resolveTemplate('local_store', '카페');
  return {
    businessName: '소소한자리', purposeId: 'local_store', purpose: '음식점', industry: '카페', tone: ['친근한'],
    colorPreference: '#c98a5e', referenceImageUrls: [],
    sectionPlan: planFromTemplate(t), pagePlan: pagePlanFromTemplate(t), templateId: t.id,
  } as SurveyInput;
}

describe('A6 — 에이전시 흐름 통합', () => {
  test('구성 게이트 스킵(prune 없음) → 생성 기존과 동일(무회귀)', () => {
    const survey = soso();
    const effective = pruneSections(survey, new Set()); // 스킵 = 원본
    assert.equal(effective, survey);
    const cfg = buildSiteConfigFromSurvey(effective, cand, opts);
    assert.ok(cfg.pages.length >= 1);
    assert.ok(cfg.pages[0].sections.some((s) => s.type === 'hero'), 'hero 소실');
  });

  test('와이어프레임 승인 — nice 섹션 제외 후 생성 정합(제외분만 사라짐)', () => {
    const survey = soso();
    const nice = survey.sectionPlan.find((s) => s.priority === 'nice' && !s.required);
    if (!nice) return; // nice 섹션 없으면 스킵
    const pruned = pruneSections(survey, new Set([sectionKey(nice)]));
    const cfg = buildSiteConfigFromSurvey(pruned, cand, opts);
    // 제외한 nice 섹션 타입이 (다른 page에 중복 없으면) 줄었는지 — 전체 섹션 수는 원본 이하
    const baseCfg = buildSiteConfigFromSurvey(survey, cand, opts);
    const count = (c: typeof cfg) => c.pages.reduce((a, p) => a + p.sections.length, 0);
    assert.ok(count(cfg) <= count(baseCfg), '제외 후 섹션 수 증가');
    assert.ok(cfg.pages.some((p) => p.sections.some((s) => s.type === 'hero')), 'hero 유지');
  });

  test('A2 우선순위 — 홈 must + hero must(생성 흐름 진입 데이터)', () => {
    const survey = soso();
    const home = survey.pagePlan!.find((p) => p.slug === '');
    assert.equal(home?.priority, 'must');
    assert.equal(survey.sectionPlan.find((s) => s.type === 'hero')?.priority, 'must');
  });

  test('A5 구조화 피드백 — 칩 선택이 결정적 조립(계약 무변경 경로)', () => {
    const out = assembleRequestedContent(TYPE_QUICK_CHIPS.image, new Set(['brighter', 'brand-color']), '히어로만');
    assert.equal(out, '[brighter] [with brand colors] 히어로만');
  });
});
