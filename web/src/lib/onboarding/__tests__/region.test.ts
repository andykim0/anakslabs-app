/**
 * [v4.5] region — 정규화(1급 필드 ∪ 레거시 [지역] extraNotes) + SEO 메타 배선.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig } from '@/lib/types/site';
import { regionOf } from '@/lib/onboarding/region';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';

describe('regionOf', () => {
  test('1급 필드 우선', () => {
    assert.equal(regionOf({ region: '서울 연희동' }), '서울 연희동');
    assert.equal(regionOf({ region: '  부산 해운대  ' }), '부산 해운대');
  });
  test('레거시 extraNotes [지역] 폴백', () => {
    assert.equal(regionOf({ extraNotes: '[지역] 대구 수성구\n메뉴판 강조' }), '대구 수성구');
    assert.equal(regionOf({ extraNotes: '그냥 메모' }), undefined);
    assert.equal(regionOf({}), undefined);
  });
  test('1급 필드가 extraNotes보다 우선', () => {
    assert.equal(regionOf({ region: '서울', extraNotes: '[지역] 부산' }), '서울');
  });
});

describe('region → SEO 메타', () => {
  const candidate: DesignCandidate = {
    id: 'c',
    label: 'x',
    style: 'photo',
    heroImageUrl: '/mock/h.svg',
    theme: emptySiteConfig('t').theme,
    description: '',
  };
  function survey(over: Partial<SurveyInput> = {}): SurveyInput {
    const t = resolveTemplate('local_store', '카페');
    return {
      businessName: '소소한자리',
      purposeId: 'local_store',
      purpose: '음식점',
      industry: '카페',
      tone: ['친근한'],
      colorPreference: '아이보리',
      referenceImageUrls: [],
      sectionPlan: planFromTemplate(t),
      pagePlan: pagePlanFromTemplate(t),
      templateId: t.id,
      ...over,
    } as SurveyInput;
  }
  const opts = { heroImageUrl: '/mock/h.svg', imagePool: ['/mock/a.svg'] };

  test('region 설정 시 meta.title·description에 지역 문자열 포함', () => {
    const cfg = buildSiteConfigFromSurvey(survey({ region: '서울 연희동' }), candidate, opts);
    assert.ok(cfg.meta.title.includes('서울 연희동'), `title=${cfg.meta.title}`);
    assert.ok((cfg.meta.description ?? '').includes('서울 연희동'), `desc=${cfg.meta.description}`);
  });
  test('레거시 [지역] extraNotes도 메타에 반영', () => {
    const cfg = buildSiteConfigFromSurvey(survey({ extraNotes: '[지역] 부산 해운대' }), candidate, opts);
    assert.ok(cfg.meta.title.includes('부산 해운대'));
  });
  test('region 없으면 지역 미포함(무회귀)', () => {
    const cfg = buildSiteConfigFromSurvey(survey(), candidate, opts);
    assert.equal(cfg.meta.title, '소소한자리 — 카페');
  });
});
