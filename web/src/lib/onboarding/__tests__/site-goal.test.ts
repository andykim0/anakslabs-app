/**
 * [v4 #2a] SITE_GOALS 레지스트리 + goalsForGroup 필터.
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
  purchase: true,
  trust: true,
};
const GROUPS: PurposeGroup[] = ['sell', 'serve', 'promote', 'content'];

describe('SITE_GOALS', () => {
  test('6개 목표 전부 label·ctaLabel·description·applicableGroups·sectionEmphasis 보유', () => {
    const ids = Object.keys(SITE_GOALS) as SiteGoalId[];
    assert.deepEqual([...ids].sort(), (Object.keys(ALL_GOALS) as SiteGoalId[]).sort());
    for (const id of ids) {
      const g = SITE_GOALS[id];
      assert.ok(g.label && g.ctaLabel && g.description, `${id} 문구`);
      assert.ok(g.applicableGroups.length >= 1, `${id} applicableGroups`);
      assert.ok(g.sectionEmphasis.length >= 1, `${id} sectionEmphasis`);
    }
  });

  test('purchase는 sell 그룹에서만 노출', () => {
    assert.deepEqual([...SITE_GOALS.purchase.applicableGroups], ['sell']);
    assert.ok(!goalsForGroup('serve').some((x) => x.id === 'purchase'));
    assert.ok(goalsForGroup('sell').some((x) => x.id === 'purchase'));
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
