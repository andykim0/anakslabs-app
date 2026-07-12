/**
 * [Q3] 섹션 밀도 — 레지스트리 완전성 + 원문 메뉴 전항목 반영(빈약한 "PPT 1장" 방지).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import type { Section, SectionType } from '@/lib/types/site';
import { emptySiteConfig } from '@/lib/types/site';
import { SECTION_DENSITY, contentElementCount, isThinSection } from '@/lib/design/section-density';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';

const ALL_TYPES: Record<SectionType, true> = {
  hero: true, about: true, features: true, menu: true, gallery: true, testimonials: true,
  pricing: true, contact: true, cta: true, custom: true, team: true, cases: true, faq: true,
};

describe('SECTION_DENSITY 레지스트리', () => {
  test('모든 SectionType이 minElements 보유', () => {
    for (const t of Object.keys(ALL_TYPES) as SectionType[]) {
      assert.ok(SECTION_DENSITY[t].minElements >= 1, t);
    }
  });
  test('isThinSection — 제목+버튼만은 빈약, 채워지면 아님', () => {
    const thin: Section = {
      id: 's', type: 'menu', name: '메뉴', height: 200, background: {},
      elements: [
        { id: 'el-title-1', kind: 'text', frame: { x: 0, y: 0, w: 100, h: 20 }, z: 1, text: '메뉴', style: { fontSize: 24 } },
        { id: 'el-btn', kind: 'button', frame: { x: 0, y: 40, w: 100, h: 40 }, z: 1, label: '보기', href: '#', style: { variant: 'solid' } },
      ],
    };
    assert.ok(isThinSection(thin), `content=${contentElementCount(thin)}`);
  });
});

describe('buildMenu — 원문 메뉴 전항목 반영', () => {
  test('메뉴 7종 원문 → 메뉴 섹션에 7 항목 전부(빈약 아님)', () => {
    const soso = `[메뉴]\n아메리카노 4,500 / 카페라떼 5,000\n크루아상 4,200 / 앙버터 5,500 / 소금빵 3,800 / 딸기 타르트 7,000 / 계절 6,500`;
    const t = resolveTemplate('local_store', '카페');
    const survey = {
      businessName: '소소한자리', purposeId: 'local_store', purpose: '음식점', industry: '카페',
      tone: ['친근한'], colorPreference: '아이보리', referenceImageUrls: [], providedContent: soso,
      sectionPlan: planFromTemplate(t), pagePlan: pagePlanFromTemplate(t), templateId: t.id,
    } as SurveyInput;
    const candidate: DesignCandidate = { id: 'c', label: 'x', style: 'photo', heroImageUrl: '/mock/h.svg', theme: emptySiteConfig('t').theme, description: '' };
    const cfg = buildSiteConfigFromSurvey(survey, candidate, { heroImageUrl: '/mock/h.svg', imagePool: ['/mock/a.svg'] });
    const menu = cfg.pages.flatMap((p) => p.sections).find((s) => s.type === 'menu')!;
    const names = menu.elements.filter((el) => el.id.includes('menu-name'));
    assert.equal(names.length, 7, `메뉴 항목 ${names.length}개 (7 기대)`);
    assert.ok(!isThinSection(menu), '메뉴 섹션이 빈약으로 판정됨');
    assert.ok(JSON.stringify(menu).includes('아메리카노'));
  });
});
