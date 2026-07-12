/**
 * [v4 Phase 7] "받으면 쓴다" 배선 불변식 (UI 파생 + 미소비 확인).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig } from '@/lib/types/site';
import { deriveColors } from '@/components/dashboard/onboarding/steps/shared';
import { REFERENCE_SAMPLES } from '@/lib/design/reference-samples';
import { buildCandidateBlueprints } from '@/lib/data/design-candidates';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';

describe('deriveColors — 무드 시드 → colorPreference', () => {
  test('첫 무드의 paletteSeed가 colorPreference/secondaryColor로', () => {
    const seed = REFERENCE_SAMPLES[0].paletteSeed;
    const r = deriveColors({ moodIds: [REFERENCE_SAMPLES[0].id], colorOverride: '', secondaryColor: '' });
    assert.equal(r.colorPreference, seed.primary);
    assert.equal(r.secondaryColor, seed.secondary);
  });
  test('직접 지정색(colorOverride)이 시드를 이김', () => {
    const r = deriveColors({ moodIds: [REFERENCE_SAMPLES[0].id], colorOverride: '#123456', secondaryColor: '' });
    assert.equal(r.colorPreference, '#123456');
  });
  test('수동 보조색이 시드 보조색을 이김', () => {
    const r = deriveColors({ moodIds: [REFERENCE_SAMPLES[0].id], colorOverride: '', secondaryColor: '#abcdef' });
    assert.equal(r.secondaryColor, '#abcdef');
  });
  test('무드·직접색 모두 없으면 colorPreference 빈 문자열(게이트가 잡음)', () => {
    assert.equal(deriveColors({ moodIds: [], colorOverride: '', secondaryColor: '' }).colorPreference, '');
  });
});

describe('referenceImageUrls — 생성 경로 미소비(@deprecated)', () => {
  const candidate: DesignCandidate = {
    id: 'c',
    label: 'x',
    style: 'photo',
    heroImageUrl: '/mock/h.svg',
    theme: emptySiteConfig('t').theme,
    description: '',
  };
  function survey(): SurveyInput {
    const t = resolveTemplate('local_store', '카페');
    return {
      businessName: '테스트',
      purposeId: 'local_store',
      purpose: '음식점',
      industry: '카페',
      tone: ['친근한'],
      colorPreference: '아이보리',
      referenceImageUrls: ['https://sentinel-ref.example/x.jpg'],
      sectionPlan: planFromTemplate(t),
      pagePlan: pagePlanFromTemplate(t),
      templateId: t.id,
    } as SurveyInput;
  }
  test('buildSiteConfigFromSurvey 출력에 referenceImageUrls sentinel 미포함', () => {
    const cfg = buildSiteConfigFromSurvey(survey(), candidate, { heroImageUrl: '/mock/h.svg', imagePool: ['/mock/a.svg'] });
    assert.ok(!JSON.stringify(cfg).includes('sentinel-ref'));
  });
  test('buildCandidateBlueprints도 referenceImageUrls 미참조', () => {
    const bps = buildCandidateBlueprints(survey());
    assert.ok(!JSON.stringify(bps).includes('sentinel-ref'));
  });
});
