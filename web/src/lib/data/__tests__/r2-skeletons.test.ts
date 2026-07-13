/**
 * [R2] 뼈대 아키타입 — 6목적 ≥3 변형 + heroVariant가 히어로 정렬/앵커를 결정적으로 바꿈(무회귀).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import type { CanvasElement } from '@/lib/types/site';
import { emptySiteConfig } from '@/lib/types/site';
import { SKELETONS, skeletonsForPurpose, skeletonForCandidate, validateSkeletons } from '@/lib/data/skeletons';
import { LIVE_PURPOSE_IDS } from '@/lib/data/purpose-taxonomy';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';

const cand: DesignCandidate = { id: 'cand-warm-cozy', label: 'x', style: 'photo', heroImageUrl: '/mock/h.svg', theme: emptySiteConfig('t').theme, description: '' };
const opts = { heroImageUrl: '/mock/h.svg', imagePool: ['/mock/a.svg'] };

function heroTextEls(heroVariant?: 'fullbleed' | 'centered' | 'split'): CanvasElement[] {
  const t = resolveTemplate('local_store', '카페');
  const survey = {
    businessName: '소소한자리', purposeId: 'local_store', purpose: '음식점', industry: '카페', region: '서울',
    tone: ['친근한'], colorPreference: '#c98a5e', referenceImageUrls: [],
    sectionPlan: planFromTemplate(t), pagePlan: pagePlanFromTemplate(t), templateId: t.id,
  } as SurveyInput;
  const cfg = buildSiteConfigFromSurvey(survey, cand, { ...opts, heroVariant });
  const hero = cfg.pages[0].sections.find((s) => s.type === 'hero')!;
  return hero.elements.filter((e) => e.kind === 'text' && e.id.includes('hero-') && !e.id.includes('chip-label'));
}
const alignsOf = (els: CanvasElement[]) => new Set(els.map((e) => (e.kind === 'text' ? e.style.align : undefined)));

describe('R2 — 뼈대 레지스트리', () => {
  test('무결성: 6목적 ≥3 변형 + heroVariant 3종 + id 유일', () => {
    assert.deepEqual(validateSkeletons(), []);
    for (const p of LIVE_PURPOSE_IDS) assert.ok(skeletonsForPurpose(p).length >= 3, `${p} <3`);
    assert.ok(SKELETONS.length >= 18, `뼈대 ${SKELETONS.length}(<18)`);
  });

  test('skeletonForCandidate 결정적 + 유효 뼈대', () => {
    const a = skeletonForCandidate('local_store', 'cand-warm-cozy');
    const b = skeletonForCandidate('local_store', 'cand-warm-cozy');
    assert.equal(a.id, b.id, '비결정적');
    assert.ok(SKELETONS.includes(a));
  });
});

describe('R2 — heroVariant 히어로 정렬/앵커', () => {
  test('fullbleed(기본): 좌정렬 — 미지정과 동일(무회귀)', () => {
    const def = heroTextEls(undefined);
    const fb = heroTextEls('fullbleed');
    assert.deepEqual(alignsOf(def), new Set(['left']), '기본이 좌정렬 아님');
    // 미지정 == fullbleed (프레임 동일)
    assert.equal(def.length, fb.length);
    assert.deepEqual(def.map((e) => e.frame.x), fb.map((e) => e.frame.x), '미지정≠fullbleed(회귀)');
  });

  test('centered: 중앙 정렬 + 수평 중앙(x=120,w=1200)', () => {
    const els = heroTextEls('centered');
    assert.deepEqual(alignsOf(els), new Set(['center']), '중앙 정렬 아님');
    for (const e of els) {
      assert.equal(e.frame.x, 120, `${e.id} 수평 중앙 아님`);
      assert.equal(e.frame.w, 1200);
    }
  });

  test('split: 우측 앵커(우정렬 + 우측 여백 120)', () => {
    const els = heroTextEls('split');
    assert.deepEqual(alignsOf(els), new Set(['right']), '우정렬 아님');
    for (const e of els) {
      assert.equal(e.frame.x + e.frame.w, 1440 - 120, `${e.id} 우측 앵커 아님`);
    }
  });

  test('전 변형 요소가 히어로 높이(820) 안에 유지', () => {
    for (const v of ['fullbleed', 'centered', 'split'] as const) {
      const t = resolveTemplate('local_store', '카페');
      const survey = { businessName: 'x', purposeId: 'local_store', purpose: '음식점', industry: '카페', tone: ['친근한'], colorPreference: '#c98a5e', referenceImageUrls: [], sectionPlan: planFromTemplate(t), pagePlan: pagePlanFromTemplate(t), templateId: t.id } as SurveyInput;
      const cfg = buildSiteConfigFromSurvey(survey, cand, { ...opts, heroVariant: v });
      const hero = cfg.pages[0].sections.find((s) => s.type === 'hero')!;
      for (const e of hero.elements) assert.ok(e.frame.y + e.frame.h <= hero.height, `${v}/${e.id} 히어로 초과`);
    }
  });
});
