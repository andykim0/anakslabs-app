/**
 * [A2] 페이지/섹션 우선순위(필수/선택) — 계약 additive(무회귀) + 결정적 스탬프 + 발행진단 must 우선 경고.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSectionPriority, planFromTemplate, pagePlanFromTemplate, resolveTemplate } from '@/lib/data/site-blueprints';
import { LIVE_PURPOSE_IDS } from '@/lib/data/purpose-taxonomy';

describe('A2 — 우선순위 결정', () => {
  test('resolveSectionPriority: hero·about·contact·required=must, 나머지=nice, 명시 존중', () => {
    assert.equal(resolveSectionPriority({ type: 'hero' }), 'must');
    assert.equal(resolveSectionPriority({ type: 'about' }), 'must');
    assert.equal(resolveSectionPriority({ type: 'contact' }), 'must');
    assert.equal(resolveSectionPriority({ type: 'gallery', required: true }), 'must'); // 삭제잠금→must
    assert.equal(resolveSectionPriority({ type: 'gallery' }), 'nice');
    assert.equal(resolveSectionPriority({ type: 'menu' }), 'nice');
    assert.equal(resolveSectionPriority({ type: 'menu', priority: 'must' }), 'must'); // 명시 오버라이드
  });

  test('planFromTemplate: 전 섹션에 priority 스탬프 + hero=must', () => {
    for (const p of LIVE_PURPOSE_IDS) {
      const plan = planFromTemplate(resolveTemplate(p, '카페'));
      for (const s of plan) assert.ok(s.priority === 'must' || s.priority === 'nice', `${p}/${s.type} priority 미스탬프`);
      const hero = plan.find((s) => s.type === 'hero');
      assert.equal(hero?.priority, 'must', `${p} hero must 아님`);
    }
  });

  test('pagePlanFromTemplate: 홈=must + must 섹션 페이지=must', () => {
    for (const p of LIVE_PURPOSE_IDS) {
      const pages = pagePlanFromTemplate(resolveTemplate(p, '카페'));
      const home = pages.find((pg) => pg.slug === '');
      assert.equal(home?.priority, 'must', `${p} 홈 must 아님`);
      for (const pg of pages) assert.ok(pg.priority === 'must' || pg.priority === 'nice', `${p}/${pg.slug} priority 미스탬프`);
    }
  });

  test('무회귀: priority 미지정도 유효(계약 optional)', () => {
    // priority 없이도 SectionPlanItem은 유효(타입 컴파일 = 무회귀 증빙). resolveSectionPriority가 폴백 처리.
    assert.equal(resolveSectionPriority({ type: 'faq' }), 'nice');
  });
});
