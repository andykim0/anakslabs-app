/**
 * [G3a] 필수 콘텐츠 게이트 레지스트리 + 구조화 소스(contentItems) 우선 소비.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DesignCandidate, LivePurposeId, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig } from '@/lib/types/site';
import { LIVE_PURPOSE_IDS } from '@/lib/data/purpose-taxonomy';
import { CONTENT_REQUIREMENTS, contentGateStatus, requirementOf } from '@/lib/onboarding/content-requirements';
import { resolveContentItems } from '@/lib/data/content-parse';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';

describe('CONTENT_REQUIREMENTS', () => {
  test('LIVE 6종 전부 항목 존재 + itemLabel/min/recommended 유효', () => {
    for (const id of LIVE_PURPOSE_IDS) {
      const r = requirementOf(id);
      assert.ok(r.itemLabel.length > 0, id);
      assert.ok(r.minItems >= 1, id);
      assert.ok(r.recommendedItems >= r.minItems, id);
    }
    assert.equal(Object.keys(CONTENT_REQUIREMENTS).length, 6);
  });
  test('serve 계열 목적별 라벨(메뉴/시술·서비스/수업·과정)', () => {
    assert.equal(requirementOf('local_store').itemLabel, '메뉴');
    assert.equal(requirementOf('booking_service').itemLabel, '시술·서비스');
    assert.equal(requirementOf('edu_membership').itemLabel, '수업·과정');
  });
  test('contentGateStatus — 하드 게이트 + 권장 부족분', () => {
    const zero = contentGateStatus('local_store', 0);
    assert.equal(zero.ok, false);
    assert.equal(zero.needMore, 1);
    const one = contentGateStatus('local_store', 1);
    assert.equal(one.ok, true);
    assert.equal(one.recommendedShort, 4); // recommended 5 - 1
    assert.equal(contentGateStatus('local_store', 5).recommendedShort, 0);
  });
});

describe('resolveContentItems — 구조화 우선', () => {
  test('contentItems 있으면 원문 파싱보다 우선', () => {
    const items = resolveContentItems(
      [{ name: '아메리카노', price: '4,500' }, { name: '' }, { name: '라떼', price: '5,000' }],
      '[메뉴]\n무시될메뉴 9,999',
    );
    assert.equal(items.length, 2, '빈 name 제외');
    assert.equal(items[0].name, '아메리카노');
    assert.ok(!items.some((i) => i.name === '무시될메뉴'), '원문이 구조화를 덮음');
  });
  test('contentItems 없으면 원문 파싱 폴백', () => {
    const items = resolveContentItems(undefined, '[메뉴]\n소금빵 3,800 / 크루아상 4,200');
    assert.equal(items.length, 2);
  });
});

describe('생성 — contentItems 1급 소스가 메뉴 섹션 채움', () => {
  test('구조화 항목 3개 → 메뉴 섹션에 3항목', () => {
    const t = resolveTemplate('local_store', '카페');
    const survey = {
      businessName: '테스트', purposeId: 'local_store', purpose: '음식점', industry: '카페',
      tone: ['친근한'], colorPreference: '#c98a5e', referenceImageUrls: [],
      contentItems: [
        { name: '드립커피', price: '5,000' },
        { name: '플랫화이트', price: '5,500' },
        { name: '스콘', price: '3,500' },
      ],
      sectionPlan: planFromTemplate(t), pagePlan: pagePlanFromTemplate(t), templateId: t.id,
    } as SurveyInput;
    const candidate: DesignCandidate = { id: 'c', label: 'x', style: 'photo', heroImageUrl: '/mock/h.svg', theme: emptySiteConfig('t').theme, description: '' };
    const cfg = buildSiteConfigFromSurvey(survey, candidate, { heroImageUrl: '/mock/h.svg', imagePool: ['/mock/a.svg'] });
    const menu = cfg.pages.flatMap((p) => p.sections).find((s) => s.type === 'menu')!;
    const names = menu.elements.filter((el) => el.id.includes('menu-name'));
    assert.equal(names.length, 3);
    assert.ok(JSON.stringify(menu).includes('드립커피'));
  });
});
