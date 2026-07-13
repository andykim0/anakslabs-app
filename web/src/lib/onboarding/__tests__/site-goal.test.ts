/**
 * [v4 · 제품 확정] SITE_GOALS 레지스트리 + goalsForGroup 필터. 소개형 5목표 / 2그룹(serve·promote).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SiteGoalId } from '@/lib/types/domain';
import type { PurposeGroup } from '@/lib/data/purpose-taxonomy';
import { SITE_GOALS, goalsForGroup, ctaLabelForGoal } from '@/lib/onboarding/site-goal';

const ALL_GOALS: Record<SiteGoalId, true> = {
  call: true,
  reserve: true,
  directions: true,
  kakao_inquiry: true,
  trust: true,
};
const GROUPS: PurposeGroup[] = ['serve', 'promote'];

describe('SITE_GOALS (소개형)', () => {
  test('5개 목표 전부 label·ctaLabel·description·applicableGroups·sectionEmphasis 보유', () => {
    const ids = Object.keys(SITE_GOALS) as SiteGoalId[];
    assert.deepEqual([...ids].sort(), (Object.keys(ALL_GOALS) as SiteGoalId[]).sort());
    for (const id of ids) {
      const g = SITE_GOALS[id];
      assert.ok(g.label && g.ctaLabel && g.description, `${id} 문구`);
      assert.ok(g.applicableGroups.length >= 1, `${id} applicableGroups`);
      assert.ok(g.sectionEmphasis.length >= 1, `${id} sectionEmphasis`);
      // 제거된 dead 그룹(sell/content)을 참조하지 않음
      for (const grp of g.applicableGroups) assert.ok(GROUPS.includes(grp), `${id}: dead 그룹 '${grp}'`);
    }
  });

  test("'바로 구매' 목표(purchase)는 제거됨 — 소개형은 판매 약속 안 함", () => {
    assert.ok(!('purchase' in SITE_GOALS));
  });

  test('모든 그룹이 최소 1개 목표를 가짐 (선택 과부하/공백 방지)', () => {
    for (const g of GROUPS) {
      const goals = goalsForGroup(g);
      assert.ok(goals.length >= 1, `${g} 목표 없음`);
      for (const x of goals) assert.ok(x.def.applicableGroups.includes(g));
    }
  });

  test('ctaLabelForGoal — 목표 → CTA 문구', () => {
    assert.equal(ctaLabelForGoal('reserve'), '예약하기');
    assert.equal(ctaLabelForGoal(undefined), undefined);
  });
});
